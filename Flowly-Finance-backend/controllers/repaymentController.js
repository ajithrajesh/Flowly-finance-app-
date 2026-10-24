import crypto from "crypto";
import mongoose from "mongoose";
import LoanApplication from "../models/LoanApplication.js";
import TransactionBucket from "../models/TransactionBucket.js";
import Notification from "../models/Notification.js";
import { notifyUser, notifyWorkers, notifyRole } from "../services/notificationService.js";
import Account from "../models/Account.js";
import User from "../models/User.js";
import Payment from "../models/Payment.js";
import { generateSchedule, round2, calculateLateFeePenalty } from "../utils/emiCalculator.js";
import paymentGateway from "../services/paymentGateway.js";
import { creditTopUpFromIntent, markTopUpFailed } from "../services/walletService.js";
import { confirmStripeTransferFromIntent, markStripeTransferFailed } from "../services/transferService.js";
import { generateNOCCertificatePDF } from "../utils/nocCertificateGenerator.js";

/**
 * Check and dynamically apply Late Fee Penalty to any installments whose due date has exceeded
 */
export async function checkAndApplyOverduePenalty(loan) {
  if (!loan || !loan.repayments || loan.repayments.length === 0) return loan;
  if (!["disbursed", "active", "approved"].includes(loan.status)) return loan;

  const now = new Date();
  let changed = false;

  for (const installment of loan.repayments) {
    if (installment.status === "paid") continue;

    const penaltyInfo = calculateLateFeePenalty({
      emiAmount: installment.emiAmount,
      dueDate: installment.dueDate,
      asOfDate: now,
    });

    if (penaltyInfo.isOverdue) {
      if (installment.status !== "overdue") {
        installment.status = "overdue";
        changed = true;
      }
      if (installment.lateFee !== penaltyInfo.lateFee) {
        installment.lateFee = penaltyInfo.lateFee;
        changed = true;
      }
      if (installment.daysOverdue !== penaltyInfo.daysOverdue) {
        installment.daysOverdue = penaltyInfo.daysOverdue;
        changed = true;
      }
    }
  }

  if (changed) {
    loan.overdueInstallments = loan.repayments.filter((r) => r.status === "overdue").length;
    loan.outstandingAmount = round2(
      loan.repayments
        .filter((r) => r.status !== "paid")
        .reduce((sum, r) => sum + (r.emiAmount + (r.lateFee || 0) - (r.paidAmount || 0)), 0)
    );
    await loan.save();
  }

  return loan;
}

export async function generateScheduleOnDisbursal(loanId) {
  const loan = await LoanApplication.findById(loanId);
  if (!loan) throw new Error("Loan not found");

  const principal = loan.principal || loan.requestedAmount || 0;
  const { emi, totalInterest, totalRepayment, schedule } = generateSchedule({
    principal,
    annualRatePercent: loan.interestRate || 12,
    tenureMonths: loan.tenureMonths || 12,
    startDate: loan.disbursedAt || new Date(),
    interestType: loan.interestType || "diminishing",
  });

  loan.repayments = schedule.map((s) => ({
    ...s,
    status: s.status.toLowerCase(),
    lateFee: 0,
    daysOverdue: 0,
  }));
  loan.emiAmount = emi;
  loan.monthlyEMI = emi;
  loan.totalInterest = totalInterest;
  loan.totalRepayment = totalRepayment;
  loan.totalPayable = totalRepayment;
  loan.outstandingAmount = principal;
  loan.nextDueDate = schedule[0]?.dueDate || null;

  await loan.save();
  return loan;
}

export async function getSchedule(req, res) {
  try {
    const loanId = req.params.loanId || req.params.id;
    let loan = await LoanApplication.findById(loanId).select(
      "user principal requestedAmount interestRate interestType tenureMonths emiAmount monthlyEMI totalInterest totalRepayment totalPayable outstandingAmount overdueInstallments nextDueDate repayments status nocCertificate recoveryLogs applicationNumber productName"
    );
    if (!loan) return res.status(404).json({ message: "Loan not found" });

    const userId = (req.user.id || req.user._id).toString();
    const isOwner = loan.user.toString() === userId;
    const isStaff = ["worker", "admin"].includes(req.user.role?.toLowerCase());
    if (!isOwner && !isStaff) return res.status(403).json({ message: "Not authorized" });

    if (!loan.repayments || loan.repayments.length === 0) {
      try {
        await generateScheduleOnDisbursal(loan._id);
        loan = await LoanApplication.findById(loanId).select(
          "user principal requestedAmount interestRate interestType tenureMonths emiAmount monthlyEMI totalInterest totalRepayment totalPayable outstandingAmount overdueInstallments nextDueDate repayments status nocCertificate recoveryLogs applicationNumber productName"
        );
      } catch (e) {}
    }

    // Dynamically check and apply late fee penalties for any exceeded due dates
    await checkAndApplyOverduePenalty(loan);

    return res.json({ loan });
  } catch (err) {
    return res.status(500).json({ message: "Failed to fetch schedule", error: err.message });
  }
}

export async function initiateRepayment(req, res) {
  try {
    const { loanId, installmentNo } = req.params;
    let loan = await LoanApplication.findById(loanId);
    if (!loan) return res.status(404).json({ message: "Loan not found" });

    const userId = (req.user.id || req.user._id).toString();
    if (loan.user.toString() !== userId) {
      return res.status(403).json({ message: "Not authorized" });
    }

    if (!loan.repayments || loan.repayments.length === 0) {
      try {
        await generateScheduleOnDisbursal(loan._id);
        loan = await LoanApplication.findById(loanId);
      } catch (e) {}
    }

    // Ensure overdue status and penalties are dynamically up-to-date
    await checkAndApplyOverduePenalty(loan);

    const repayments = loan.repayments || [];
    const installment = repayments.find((r) => r.installmentNo === Number(installmentNo));
    if (!installment) return res.status(404).json({ message: "Installment not found" });
    if (installment.status === "paid") {
      return res.status(400).json({ message: "Installment already paid" });
    }

    const amountDue = round2(installment.emiAmount + (installment.lateFee || 0) - (installment.paidAmount || 0));

    // Generate unique receipt number and Payment tracking ID up front
    const paymentId = new mongoose.Types.ObjectId();
    const receiptNumber = `FLWRP-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;

    const intent = await paymentGateway.createPaymentIntent({
      amountInRupees: amountDue,
      currency: "inr",
      description: `Flowly EMI installment #${installmentNo} for loan ${loan.applicationNumber || loan._id}`,
      metadata: {
        purpose: "loan_repayment",
        loanId: loan._id.toString(),
        installmentNo: String(installmentNo),
        userId: userId.toString(),
        paymentId: paymentId.toString(),
        receiptNumber,
      },
    });

    // Create pending Payment audit record
    await Payment.create({
      _id: paymentId,
      user: userId,
      loan: loan._id,
      account: loan.account,
      purpose: "loan_repayment",
      amount: amountDue,
      currency: "inr",
      paymentStatus: "pending",
      transactionReference: intent.transactionId,
      receiptNumber,
    });

    installment.gateway = {
      provider: "stripe",
      transactionId: intent.transactionId,
      status: "initiated",
      receiptNumber,
    };
    await loan.save();

    return res.json({
      clientSecret: intent.clientSecret,
      transactionId: intent.transactionId,
      receiptNumber,
      amountDue,
    });
  } catch (err) {
    return res.status(500).json({ message: "Failed to initiate payment", error: err.message });
  }
}

/**
 * Confirm and verify Stripe digital card repayment on the server.
 * Verifies PaymentIntent status with Stripe directly before marking EMI as paid.
 */
export async function confirmRepayment(req, res) {
  try {
    const { loanId, installmentNo } = req.params;
    const { transactionId } = req.body;
    const userId = req.user.id || req.user._id;

    if (!transactionId) {
      return res.status(400).json({ message: "transactionId is required" });
    }

    const loan = await LoanApplication.findById(loanId);
    if (!loan) return res.status(404).json({ message: "Loan not found" });

    if (loan.user.toString() !== userId.toString() && !["worker", "admin"].includes(req.user.role)) {
      return res.status(403).json({ message: "Not authorized for this loan" });
    }

    const installment = (loan.repayments || []).find((r) => r.installmentNo === Number(installmentNo));
    if (!installment) return res.status(404).json({ message: "Installment not found" });

    // Idempotency check: if already verified and marked paid with this transaction
    if (installment.status === "paid" && installment.gateway?.transactionId === transactionId) {
      const payment = await Payment.findOne({ transactionReference: transactionId });
      return res.json({
        message: `Installment #${installmentNo} has already been verified and paid`,
        loan,
        payment,
      });
    }

    // 1. Verify with Stripe directly
    let intent;
    try {
      intent = await paymentGateway.retrievePaymentIntent(transactionId, { expand: ["latest_charge"] });
    } catch (err) {
      console.error("[confirmRepayment] Stripe retrieve failed:", err.message);
      return res.status(502).json({
        message: "Could not verify payment with Stripe. Please try again shortly.",
      });
    }

    if (!intent || intent.status !== "succeeded") {
      return res.status(400).json({
        message: `Payment has not completed yet (status: ${intent?.status || "unknown"}). Try again once payment succeeds.`,
      });
    }

    // 2. Validate metadata
    const md = intent.metadata || {};
    if (md.loanId && md.loanId !== loan._id.toString()) {
      return res.status(400).json({ message: "Payment metadata mismatch (loanId)" });
    }
    if (md.installmentNo && Number(md.installmentNo) !== Number(installmentNo)) {
      return res.status(400).json({ message: "Payment metadata mismatch (installmentNo)" });
    }

    const paidInRupees = (intent.amount_received ?? intent.amount) / 100;
    const cardDetails = intent.latest_charge?.payment_method_details?.card;
    const cardInfo = cardDetails
      ? { type: "card", brand: cardDetails.brand, last4: cardDetails.last4 }
      : { type: "card" };

    const receiptNumber = md.receiptNumber || installment.gateway?.receiptNumber || `FLWRP-${Date.now()}`;

    // 3. Mark installment as paid atomically
    const updatedLoan = await markInstallmentPaid({
      loanId,
      installmentNo: Number(installmentNo),
      amountPaid: paidInRupees,
      transactionId,
      paymentMethod: "card",
      provider: "stripe",
      note: `Verified Stripe digital payment (${(cardInfo.brand || "Card").toUpperCase()} •••• ${cardInfo.last4 || ""})`,
      receiptNumber,
    });

    // 4. Update Payment record to success
    const payment = await Payment.findOneAndUpdate(
      { transactionReference: transactionId },
      {
        $set: {
          user: userId,
          loan: loan._id,
          account: loan.account,
          purpose: "loan_repayment",
          amount: paidInRupees,
          currency: intent.currency || "inr",
          paymentStatus: "success",
          receiptNumber,
          paymentMethod: cardInfo,
          completedAt: new Date(),
        },
      },
      { upsert: true, returnDocument: "after" }
    );

    return res.json({
      message: `Digital payment of ₹${paidInRupees.toLocaleString("en-IN")} verified successfully via Stripe! Installment #${installmentNo} is marked as paid.`,
      loan: updatedLoan,
      payment,
      receipt: {
        receiptNumber,
        transactionId,
        amount: paidInRupees,
        paymentMethod: cardInfo,
        completedAt: payment.completedAt,
        status: "success",
      },
    });
  } catch (err) {
    console.error("confirmRepayment error:", err);
    return res.status(500).json({ message: "Failed to confirm repayment", error: err.message });
  }
}

/**
 * Auto-Debit EMI payment directly from customer's Flowly bank account balance
 */
export async function payAutoDebit(req, res) {
  try {
    const { loanId, installmentNo } = req.params;
    let loan = await LoanApplication.findById(loanId);
    // Ensure any overdue penalties are up-to-date before processing payment
    await checkAndApplyOverduePenalty(loan);
    if (!loan) return res.status(404).json({ message: "Loan not found" });

    const account = await Account.findOne({ user: req.user._id });
    if (!account) return res.status(404).json({ message: "Customer bank account not found for auto-debit" });

    if (!loan.repayments || loan.repayments.length === 0) {
      try {
        await generateScheduleOnDisbursal(loan._id);
        loan = await LoanApplication.findById(loanId);
      } catch (e) {}
    }

    const repayments = loan.repayments || [];
    const installment = repayments.find((r) => r.installmentNo === Number(installmentNo));
    if (!installment) return res.status(404).json({ message: "Installment not found" });
    if (installment.status === "paid") return res.status(400).json({ message: "Installment already paid" });

    const totalAmountDue = round2(installment.emiAmount + (installment.lateFee || 0) - (installment.paidAmount || 0));

    if (account.balance < totalAmountDue) {
      return res.status(400).json({
        message: `Insufficient bank balance for Auto-Debit. Required: ₹${totalAmountDue}, Available Balance: ₹${account.balance}`,
      });
    }

    account.balance -= totalAmountDue;
    await account.save();

    const updatedLoan = await markInstallmentPaid({
      loanId,
      installmentNo: Number(installmentNo),
      amountPaid: totalAmountDue,
      transactionId: `AUTODEBIT-${Date.now()}`,
      paymentMethod: "auto_debit",
      provider: "bank_account",
      note: "Auto-debit from customer Flowly bank balance",
    });

    return res.json({
      message: `Auto-Debit of ₹${totalAmountDue} successful! Installment #${installmentNo} marked as paid.`,
      loan: updatedLoan,
      accountBalance: account.balance,
    });
  } catch (err) {
    return res.status(500).json({ message: "Auto-debit payment failed", error: err.message });
  }
}

/**
 * Close all pending EMIs in a single payment via Bank Auto-Debit
 */
export async function payAutoDebitAll(req, res) {
  try {
    const { loanId } = req.params;
    let loan = await LoanApplication.findById(loanId);
    // Ensure overdue penalties are up-to-date before processing all payments
    await checkAndApplyOverduePenalty(loan);
    if (!loan) return res.status(404).json({ message: "Loan not found" });

    const userId = (req.user.id || req.user._id).toString();
    if (loan.user.toString() !== userId) {
      return res.status(403).json({ message: "Not authorized" });
    }

    if (!loan.repayments || loan.repayments.length === 0) {
      try {
        await generateScheduleOnDisbursal(loan._id);
        loan = await LoanApplication.findById(loanId);
      } catch (e) {}
    }

    const unpaid = (loan.repayments || []).filter((r) => r.status !== "paid");
    if (unpaid.length === 0) {
      return res.status(400).json({ message: "All installments are already paid." });
    }

    const totalAmountDue = round2(
      unpaid.reduce((sum, r) => sum + (r.emiAmount + (r.lateFee || 0) - (r.paidAmount || 0)), 0)
    );

    const account = await Account.findOne({ user: req.user._id });
    if (!account) return res.status(404).json({ message: "Customer bank account not found for auto-debit" });

    if (account.balance < totalAmountDue) {
      return res.status(400).json({
        message: `Insufficient bank balance to close loan. Required: ₹${totalAmountDue.toLocaleString("en-IN")}, Available Balance: ₹${account.balance.toLocaleString("en-IN")}`,
      });
    }

    account.balance = round2(account.balance - totalAmountDue);
    await account.save();

    const updatedLoan = await markAllInstallmentsPaid({
      loanId,
      amountPaid: totalAmountDue,
      transactionId: `AUTODEBIT-CLOSE-${Date.now()}`,
      paymentMethod: "auto_debit",
      provider: "bank_account",
      note: "Full loan foreclosure auto-debit",
    });

    return res.json({
      message: `Full loan closure payment of ₹${totalAmountDue.toLocaleString("en-IN")} successful! Loan is now fully closed.`,
      loan: updatedLoan,
      accountBalance: account.balance,
      noc: updatedLoan.nocCertificate,
    });
  } catch (err) {
    return res.status(500).json({ message: "Auto-debit full loan payment failed", error: err.message });
  }
}

/**
 * Initiate Stripe PaymentIntent to pay all pending EMIs in a single card transaction
 */
export async function initiateRepaymentAll(req, res) {
  try {
    const { loanId } = req.params;
    let loan = await LoanApplication.findById(loanId);
    if (!loan) return res.status(404).json({ message: "Loan not found" });

    const userId = (req.user.id || req.user._id).toString();
    if (loan.user.toString() !== userId) {
      return res.status(403).json({ message: "Not authorized" });
    }

    const unpaid = (loan.repayments || []).filter((r) => r.status !== "paid");
    if (unpaid.length === 0) {
      return res.status(400).json({ message: "All installments are already paid." });
    }

    const totalAmountDue = round2(
      unpaid.reduce((sum, r) => sum + (r.emiAmount + (r.lateFee || 0) - (r.paidAmount || 0)), 0)
    );

    const intent = await paymentGateway.createPaymentIntent({
      amountInRupees: totalAmountDue,
      metadata: {
        loanId: loan._id.toString(),
        installmentNo: "all",
        userId,
      },
    });

    return res.json({
      clientSecret: intent.clientSecret,
      transactionId: intent.transactionId,
      amountDue: totalAmountDue,
      pendingCount: unpaid.length,
    });
  } catch (err) {
    return res.status(500).json({ message: "Failed to initiate full loan payment", error: err.message });
  }
}

/**
 * Confirm card payment for all pending EMIs (immediate completion after Stripe succeeds in UI)
 */
export async function confirmCardRepaymentAll(req, res) {
  try {
    const { loanId } = req.params;
    const { transactionId, amount } = req.body;

    let loan = await LoanApplication.findById(loanId);
    if (!loan) return res.status(404).json({ message: "Loan not found" });

    const userId = (req.user.id || req.user._id).toString();
    if (loan.user.toString() !== userId) {
      return res.status(403).json({ message: "Not authorized" });
    }

    const unpaid = (loan.repayments || []).filter((r) => r.status !== "paid");
    if (unpaid.length === 0) {
      return res.json({ message: "Loan is already closed", loan });
    }

    const totalAmountDue = amount || round2(
      unpaid.reduce((sum, r) => sum + (r.emiAmount + (r.lateFee || 0) - (r.paidAmount || 0)), 0)
    );

    const updatedLoan = await markAllInstallmentsPaid({
      loanId,
      amountPaid: totalAmountDue,
      transactionId: transactionId || `CARD-CLOSE-${Date.now()}`,
      paymentMethod: "card",
      provider: "stripe",
      note: "Full loan foreclosure card payment",
    });

    return res.json({
      message: `Card payment of ₹${totalAmountDue.toLocaleString("en-IN")} successful! Loan is fully closed.`,
      loan: updatedLoan,
      noc: updatedLoan.nocCertificate,
    });
  } catch (err) {
    return res.status(500).json({ message: "Failed to confirm card payment", error: err.message });
  }
}

export async function handlePaymentWebhook(req, res) {
  let event;
  try {
    event = await paymentGateway.constructWebhookEvent(req.body, req.headers["stripe-signature"]);
  } catch (err) {
    return res.status(400).json({ message: `Webhook signature verification failed: ${err.message}` });
  }

  const intent = event.data ? event.data.object : event;

  // ---- Add Money (account top-up) events ----
  if (intent?.metadata?.purpose === "account_topup") {
    try {
      switch (event.type) {
        case undefined: // mock gateway sends the bare intent
        case "payment_intent.succeeded":
          await creditTopUpFromIntent(intent);
          break;
        case "payment_intent.payment_failed":
          await markTopUpFailed(intent, "Payment failed");
          break;
        case "payment_intent.canceled":
          await markTopUpFailed(intent, "Payment was cancelled");
          break;
        default:
          break;
      }
      return res.status(200).json({ received: true });
    } catch (err) {
      if (err.code === "VERIFY_FAILED") {
        console.error(`[STRIPE WEBHOOK] Top-up verification failed for ${intent.id}: ${err.message}`);
        return res.status(200).json({ received: true, verified: false });
      }
      console.error(`[STRIPE WEBHOOK] Top-up handling error for ${intent.id}:`, err.message);
      return res.status(err.code === "TOPUP_NOT_FOUND" ? 404 : 500).json({ message: err.message });
    }
  }

  // ---- Customer-to-Customer Money Transfer events ----
  if (intent?.metadata?.purpose === "transfer") {
    try {
      switch (event.type) {
        case undefined: // mock gateway sends the bare intent
        case "payment_intent.succeeded":
          await confirmStripeTransferFromIntent(intent);
          break;
        case "payment_intent.payment_failed":
          await markStripeTransferFailed(intent, "Payment failed");
          break;
        case "payment_intent.canceled":
          await markStripeTransferFailed(intent, "Payment was cancelled");
          break;
        default:
          break;
      }
      return res.status(200).json({ received: true });
    } catch (err) {
      if (err.code === "VERIFY_FAILED") {
        console.error(`[STRIPE WEBHOOK] Transfer verification failed for ${intent.id}: ${err.message}`);
        return res.status(200).json({ received: true, verified: false });
      }
      console.error(`[STRIPE WEBHOOK] Transfer handling error for ${intent.id}:`, err.message);
      return res.status(err.code === "TRANSFER_NOT_FOUND" ? 404 : 500).json({ message: err.message });
    }
  }

  // ---- Loan EMI repayments ----
  if (event.type && event.type !== "payment_intent.succeeded") {
    if (["payment_intent.payment_failed", "payment_intent.canceled"].includes(event.type)) {
      if (intent?.id) {
        await Payment.updateOne(
          { transactionReference: intent.id },
          { $set: { paymentStatus: "failed", failureReason: "Stripe payment failed or cancelled" } }
        ).catch(() => {});
      }
    }
    return res.status(200).json({ received: true });
  }

  const { loanId, installmentNo, receiptNumber } = intent.metadata || {};
  if (!loanId || !installmentNo) {
    return res.status(400).json({ message: "Missing loan metadata on payment intent" });
  }

  try {
    const paidInRupees = (intent.amount_received ?? intent.amount) / 100;
    const cardDetails = intent.latest_charge?.payment_method_details?.card;
    const cardInfo = cardDetails
      ? { type: "card", brand: cardDetails.brand, last4: cardDetails.last4 }
      : { type: "card" };

    const rcptNo = receiptNumber || `FLWRP-${Date.now()}`;

    // Full-loan foreclosure payments (installmentNo === "all")
    if (installmentNo === "all") {
      await markAllInstallmentsPaid({
        loanId,
        amountPaid: paidInRupees,
        transactionId: intent.id || intent.transactionId,
        paymentMethod: intent.payment_method_types?.[0] || "card",
        provider: "stripe",
      });
      return res.status(200).json({ received: true });
    }

    await markInstallmentPaid({
      loanId,
      installmentNo: Number(installmentNo),
      amountPaid: paidInRupees,
      transactionId: intent.id || intent.transactionId,
      paymentMethod: intent.payment_method_types?.[0] || "card",
      provider: "stripe",
      note: `Webhook verified Stripe card payment (${(cardInfo.brand || "Card").toUpperCase()} •••• ${cardInfo.last4 || ""})`,
      receiptNumber: rcptNo,
    });

    await Payment.findOneAndUpdate(
      { transactionReference: intent.id },
      {
        $set: {
          paymentStatus: "success",
          amount: paidInRupees,
          receiptNumber: rcptNo,
          paymentMethod: cardInfo,
          completedAt: new Date(),
        },
      },
      { upsert: true }
    );

    return res.status(200).json({ received: true });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
}

export async function markPaidManually(req, res) {
  try {
    const { loanId, installmentNo } = req.params;
    const { amountPaid, note, paymentMethod, receiptNumber } = req.body;

    const loan = await markInstallmentPaid({
      loanId,
      installmentNo: Number(installmentNo),
      amountPaid: Number(amountPaid),
      transactionId: receiptNumber || `COUNTER-${Date.now()}`,
      paymentMethod: paymentMethod || "offline",
      provider: "manual",
      note: note || "Counter collection by staff",
      receiptNumber: receiptNumber || `RCPT-${Date.now().toString().slice(-6)}`,
    });

    return res.json({ message: "Installment marked paid", loan });
  } catch (err) {
    return res.status(400).json({ message: err.message });
  }
}

/**
 * GET /api/repayments/collections
 * Comprehensive EMI Collections Desk portfolio overview for staff & workers
 */
export async function getCollectionsOverview(req, res) {
  try {
    const { status, search } = req.query;

    const baseFilter = {
      $or: [
        { status: { $in: ["disbursed", "active", "closed", "approved"] } },
        { "repayments.0": { $exists: true } },
      ],
    };

    let loans = await LoanApplication.find(baseFilter)
      .populate("user", "name email phone kycStatus")
      .populate("assignedTo", "name email")
      .populate("recoveryLogs.loggedBy", "name email")
      .sort({ updatedAt: -1 });

    // Check & apply any overdue penalties on active loans
    for (const loan of loans) {
      if (["disbursed", "active"].includes(loan.status)) {
        await checkAndApplyOverduePenalty(loan);
      }
    }

    // Filter by search term if provided
    if (search) {
      const term = search.toLowerCase();
      loans = loans.filter(
        (l) =>
          l.applicationNumber?.toLowerCase().includes(term) ||
          l.user?.name?.toLowerCase().includes(term) ||
          l.user?.phone?.includes(term) ||
          l.user?.email?.toLowerCase().includes(term) ||
          l.productName?.toLowerCase().includes(term) ||
          l.loanType?.toLowerCase().includes(term)
      );
    }

    let totalDisbursed = 0;
    let totalCollected = 0;
    let totalOutstanding = 0;
    let totalOverdueAmount = 0;
    let totalOverdueLoans = 0;
    let totalClosedLoans = 0;
    let totalActiveLoans = 0;

    const enrichedLoans = loans.map((loan) => {
      const repayments = loan.repayments || [];
      const principal = loan.principal || loan.requestedAmount || 0;
      totalDisbursed += principal;

      let paidCount = 0;
      let overdueCount = 0;
      let pendingCount = 0;
      let loanCollected = 0;
      let loanOverdue = 0;

      for (const inst of repayments) {
        if (inst.status === "paid") {
          paidCount++;
          loanCollected += (inst.paidAmount || inst.emiAmount);
        } else if (inst.status === "overdue") {
          overdueCount++;
          loanOverdue += (inst.emiAmount + (inst.lateFee || 0) - (inst.paidAmount || 0));
        } else {
          pendingCount++;
        }
      }

      totalCollected += loanCollected;
      totalOutstanding += (loan.outstandingAmount || 0);

      const isOverdue = overdueCount > 0 || (loan.overdueInstallments || 0) > 0;
      if (isOverdue) {
        totalOverdueLoans++;
        totalOverdueAmount += loanOverdue;
      }

      if (loan.status === "closed") {
        totalClosedLoans++;
      } else {
        totalActiveLoans++;
      }

      const totalInstallments = repayments.length;
      const progressPercent = totalInstallments > 0 ? Math.round((paidCount / totalInstallments) * 100) : 0;

      return {
        ...loan.toObject(),
        summary: {
          totalInstallments,
          paidCount,
          overdueCount,
          pendingCount,
          loanCollected: round2(loanCollected),
          loanOverdue: round2(loanOverdue),
          progressPercent,
          isOverdue,
        },
      };
    });

    let filteredList = enrichedLoans;
    if (status === "overdue") {
      filteredList = enrichedLoans.filter((l) => l.summary.isOverdue);
    } else if (status === "active") {
      filteredList = enrichedLoans.filter((l) => l.status !== "closed" && !l.summary.isOverdue);
    } else if (status === "closed") {
      filteredList = enrichedLoans.filter((l) => l.status === "closed");
    }

    const collectionRate = (totalCollected + totalOverdueAmount) > 0
      ? Math.round((totalCollected / (totalCollected + totalOverdueAmount)) * 100)
      : 100;

    return res.status(200).json({
      success: true,
      stats: {
        totalLoans: loans.length,
        totalActiveLoans,
        totalClosedLoans,
        totalOverdueLoans,
        totalDisbursed: round2(totalDisbursed),
        totalCollected: round2(totalCollected),
        totalOutstanding: round2(totalOutstanding),
        totalOverdueAmount: round2(totalOverdueAmount),
        collectionRate,
      },
      count: filteredList.length,
      loans: filteredList,
    });
  } catch (err) {
    console.error("getCollectionsOverview error:", err);
    return res.status(500).json({ message: "Failed to fetch collections overview", error: err.message });
  }
}

async function markInstallmentPaid({
  loanId,
  installmentNo,
  amountPaid,
  transactionId,
  paymentMethod,
  provider,
  note,
  receiptNumber,
}) {
  const loan = await LoanApplication.findById(loanId);
  if (!loan) throw new Error("Loan not found");

  const installment = loan.repayments.find((r) => r.installmentNo === installmentNo);
  if (!installment) throw new Error("Installment not found");
  if (installment.status === "paid") return loan;

  const totalPaid = round2((installment.paidAmount || 0) + amountPaid);
  installment.paidAmount = totalPaid;
  installment.paidDate = new Date();
  installment.status = totalPaid >= (installment.emiAmount + (installment.lateFee || 0)) ? "paid" : "partially_paid";
  installment.gateway = {
    provider,
    transactionId,
    paymentMethod,
    receiptNumber,
    status: "succeeded",
    rawResponse: note ? { note } : undefined,
  };

  loan.outstandingAmount = round2(
    loan.repayments
      .filter((r) => r.status !== "paid")
      .reduce((sum, r) => sum + (r.emiAmount + (r.lateFee || 0) - (r.paidAmount || 0)), 0)
  );

  const nextPending = loan.repayments.find((r) => ["pending", "partially_paid", "overdue"].includes(r.status));
  loan.nextDueDate = nextPending ? nextPending.dueDate : null;
  loan.overdueInstallments = loan.repayments.filter((r) => r.status === "overdue").length;

  // LOAN CLOSURE & NO DUE CERTIFICATE (NOC) WORKFLOW
  if (!nextPending) {
    loan.status = "closed";
    const userObj = await User.findById(loan.user);

    const existingNoc = loan.nocCertificate?.toObject?.() || loan.nocCertificate || {};
    loan.nocCertificate = {
      ...existingNoc,
      status: existingNoc.status && existingNoc.status !== "not_requested" ? existingNoc.status : "not_requested",
      customerName: userObj?.name || loan.personalInformation?.fullName || "Valued Customer",
      loanAmount: loan.principal || loan.requestedAmount || 0,
      fullyPaidAt: new Date(),
    };

    await notifyUser(loan.user, {
      type: "loan",
      title: "🎉 Loan Fully Closed — Apply for No Due Certificate (NOC)",
      message: `Congratulations! All EMIs for loan ${loan.applicationNumber || loan._id} have been fully paid. You can now apply for your official Bank No Due Certificate (NOC) from your dashboard.`,
      meta: { loanId: loan._id },
    }).catch(() => {});
  }

  await loan.save();

  if (loan.account) {
    await TransactionBucket.postEntry({
      accountId: loan.account,
      userId: loan.user,
      type: "emi",
      amount: amountPaid,
      description: `EMI installment #${installmentNo} for loan ${loan.applicationNumber || loan._id}${receiptNumber ? ` (Receipt: ${receiptNumber})` : ""}`,
      refType: "LoanApplication",
      refId: loan._id,
      meta: { category: "emi", receiptNumber, transactionId, provider },
    }).catch(() => {});
  }

  // Notify customer
  await notifyUser(loan.user, {
    type: "emi",
    title: "EMI Payment Successful",
    message: `Your EMI payment of ₹${amountPaid} for installment #${installmentNo} was processed. Remaining outstanding balance: ₹${loan.outstandingAmount}.`,
    meta: { loanId: loan._id, installmentNo, receiptNumber, amount: amountPaid },
  }).catch(() => {});

  // Notify workers
  await notifyWorkers({
    type: "emi",
    title: "EMI Payment Received",
    message: `EMI installment #${installmentNo} of ₹${amountPaid} paid for loan ${loan.applicationNumber || loan._id}.`,
    meta: { loanId: loan._id, installmentNo, amount: amountPaid },
  }).catch(() => {});

  return loan;
}

/**
 * Mark all remaining unpaid installments as paid, close the loan, and issue NOC certificate
 */
export async function markAllInstallmentsPaid({
  loanId,
  amountPaid,
  transactionId,
  paymentMethod,
  provider,
  note,
}) {
  const loan = await LoanApplication.findById(loanId);
  if (!loan) throw new Error("Loan not found");

  const unpaid = (loan.repayments || []).filter((r) => r.status !== "paid");
  if (unpaid.length === 0) return loan;

  const now = new Date();
  for (const inst of unpaid) {
    const totalDue = round2(inst.emiAmount + (inst.lateFee || 0));
    inst.paidAmount = totalDue;
    inst.paidDate = now;
    inst.status = "paid";
    inst.gateway = {
      provider: provider || "bank_account",
      transactionId: transactionId || `PAY-ALL-${Date.now()}`,
      paymentMethod: paymentMethod || "auto_debit",
      status: "succeeded",
      rawResponse: note ? { note } : undefined,
    };
  }

  loan.outstandingAmount = 0;
  loan.nextDueDate = null;
  loan.overdueInstallments = 0;
  loan.status = "closed";

  const userObj = await User.findById(loan.user);

  const existingNoc = loan.nocCertificate?.toObject?.() || loan.nocCertificate || {};
  loan.nocCertificate = {
    ...existingNoc,
    status: existingNoc.status && existingNoc.status !== "not_requested" ? existingNoc.status : "not_requested",
    customerName: userObj?.name || loan.personalInformation?.fullName || "Valued Customer",
    loanAmount: loan.principal || loan.requestedAmount || 0,
    fullyPaidAt: now,
  };

  await loan.save();

  if (loan.account) {
    await TransactionBucket.postEntry({
      accountId: loan.account,
      userId: loan.user,
      type: "emi",
      amount: amountPaid,
      description: `Full loan closure (all remaining EMIs) for loan ${loan.applicationNumber || loan._id}`,
      refType: "LoanApplication",
      refId: loan._id,
      meta: { category: "emi", foreclosure: true },
    }).catch(() => {});
  }

  await Notification.create({
    user: loan.user,
    type: "loan",
    title: "🎉 Loan Fully Closed — Apply for No Due Certificate (NOC)",
    message: `Congratulations! All remaining EMIs for loan ${loan.applicationNumber || loan._id} have been fully cleared (₹${amountPaid}). You can now apply for your official Bank No Due Certificate (NOC).`,
    meta: { loanId: loan._id },
  }).catch(() => {});

  await Notification.create({
    user: loan.user,
    type: "emi",
    title: "Full Loan Foreclosure Successful",
    message: `Payment of ₹${amountPaid} for all remaining installments processed. Loan is fully closed with 0 balance.`,
    meta: { loanId: loan._id },
  }).catch(() => {});

  return loan;
}

export async function getRepaymentHistory(req, res) {
  try {
    const loanId = req.params.loanId || req.params.id;
    const loan = await LoanApplication.findById(loanId).select("user repayments");
    if (!loan) return res.status(404).json({ message: "Loan not found" });

    const userId = (req.user.id || req.user._id).toString();
    const isOwner = loan.user.toString() === userId;
    const isStaff = ["worker", "admin"].includes(req.user.role?.toLowerCase());
    if (!isOwner && !isStaff) return res.status(403).json({ message: "Not authorized" });

    const paidOnly = loan.repayments.filter((r) => ["paid", "partially_paid"].includes(r.status));
    return res.json({ repayments: paidOnly });
  } catch (err) {
    return res.status(500).json({ message: "Failed to fetch repayment history", error: err.message });
  }
}

/**
 * Fetch digital payment transactions (Stripe payments & receipts) for the logged-in user
 */
export async function getDigitalPaymentHistory(req, res) {
  try {
    const userId = req.user.id || req.user._id;
    const { loanId, purpose } = req.query;

    const filter = { user: userId };
    if (loanId) filter.loan = loanId;
    if (purpose) filter.purpose = purpose;

    const payments = await Payment.find(filter)
      .populate("loan", "applicationNumber loanType requestedAmount principal status repayments")
      .populate("account", "accountNumber")
      .sort({ createdAt: -1 });

    return res.json({ payments });
  } catch (err) {
    return res.status(500).json({ message: "Failed to fetch payment history", error: err.message });
  }
}

export async function getOverdueLoans(req, res) {
  try {
    const loans = await LoanApplication.find({
      $or: [{ overdueInstallments: { $gt: 0 } }, { "repayments.status": "overdue" }],
    })
      .populate("user", "name email phone")
      .populate("assignedTo", "name email")
      .sort({ updatedAt: -1 });

    return res.json({ count: loans.length, loans });
  } catch (err) {
    return res.status(500).json({ message: "Failed to fetch overdue loans", error: err.message });
  }
}

/**
 * Daily job to flag overdue EMIs and add Late Fee penalty
 */
export async function markOverdueInstallments() {
  const today = new Date();
  const loans = await LoanApplication.find({
    status: { $in: ["disbursed", "active"] },
    "repayments.status": { $in: ["pending", "partially_paid", "overdue"] },
    "repayments.dueDate": { $lt: today },
  });

  for (const loan of loans) {
    let changed = false;
    for (const installment of loan.repayments) {
      if (installment.status === "paid") continue;

      const penaltyInfo = calculateLateFeePenalty({
        emiAmount: installment.emiAmount,
        dueDate: installment.dueDate,
        asOfDate: today,
      });

      if (penaltyInfo.isOverdue) {
        const wasAlreadyOverdue = installment.status === "overdue";
        installment.status = "overdue";
        installment.lateFee = penaltyInfo.lateFee;
        installment.daysOverdue = penaltyInfo.daysOverdue;
        changed = true;

        // Only send notification if newly overdue (not already overdue)
        if (!wasAlreadyOverdue) {
          await Notification.create({
            user: loan.user,
            type: "emi",
            title: "🚨 Missed EMI — Penalty Applied",
            message: `Installment #${installment.installmentNo} of ₹${installment.emiAmount} is overdue by ${penaltyInfo.daysOverdue} day(s). A late fee penalty of ₹${penaltyInfo.lateFee} has been added (base: ₹${penaltyInfo.basePenalty} + daily: ₹${penaltyInfo.dailyFee}).`,
            meta: { loanId: loan._id, installmentNo: installment.installmentNo, lateFee: penaltyInfo.lateFee, daysOverdue: penaltyInfo.daysOverdue },
          }).catch(() => {});
        }
      }
    }

    if (changed) {
      loan.overdueInstallments = loan.repayments.filter((r) => r.status === "overdue").length;
      await loan.save();
    }
  }

  return { processed: loans.length };
}

/**
 * Retrieve No Due Certificate (NOC)
 */
/**
 * Retrieve No Due Certificate (NOC) — JSON metadata or Official Bank Document PDF
 * GET /api/repayments/noc/:loanId
 * Optional query: ?format=pdf or ?download=true
 */
export async function getNocCertificate(req, res) {
  try {
    const loanId = req.params.loanId || req.params.id;
    const loan = await LoanApplication.findById(loanId)
      .populate("user", "name email phone kycStatus")
      .populate("account", "accountNumber accountType branch ifscCode")
      .populate("nocCertificate.approvedBy", "name email");

    if (!loan) return res.status(404).json({ message: "Loan not found" });

    const userId = (req.user?.id || req.user?._id || "").toString();
    const isOwner = loan.user?._id ? loan.user._id.toString() === userId : loan.user?.toString() === userId;
    const isStaff = ["worker", "admin"].includes(req.user?.role?.toLowerCase());
    if (!isOwner && !isStaff) {
      return res.status(403).json({ message: "Not authorized to access this NOC certificate" });
    }

    const noc = loan.nocCertificate?.toObject?.() || loan.nocCertificate || {};
    const status = noc.status || (noc.certificateNumber ? "approved" : "not_requested");

    const wantsPdf =
      req.query.format === "pdf" ||
      req.query.download === "true" ||
      req.headers["accept"] === "application/pdf";

    if (wantsPdf) {
      if (status !== "approved" && !isStaff) {
        return res.status(400).json({ message: "NOC has not been approved and issued yet." });
      }

      const pdfBuffer = await generateNOCCertificatePDF(loan);
      const certNo = noc.certificateNumber || loan.applicationNumber || "CERT";
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `inline; filename="NOC_Certificate_${certNo}.pdf"`
      );
      res.setHeader("Content-Length", pdfBuffer.length);
      return res.send(pdfBuffer);
    }

    return res.json({
      success: true,
      noc: {
        ...noc,
        status,
        downloadUrl: `/api/repayments/noc/${loan._id}?format=pdf`,
      },
      loan,
    });
  } catch (err) {
    console.error("getNocCertificate error:", err);
    return res.status(500).json({ message: "Failed to fetch NOC certificate", error: err.message });
  }
}

/**
 * Customer applies for No Due Certificate (NOC) on a fully settled loan
 * POST /api/repayments/noc/:loanId/apply
 */
export async function applyForNoc(req, res) {
  try {
    const loanId = req.params.loanId || req.params.id;
    const { requestNote } = req.body;
    const userId = (req.user?.id || req.user?._id || "").toString();

    const loan = await LoanApplication.findById(loanId).populate("user", "name email phone");
    if (!loan) return res.status(404).json({ message: "Loan not found" });

    const loanUserId = loan.user?._id ? loan.user._id.toString() : loan.user?.toString();
    if (loanUserId !== userId && req.user?.role !== "admin") {
      return res.status(403).json({ message: "Not authorized to request NOC for this loan" });
    }

    const unpaid = (loan.repayments || []).filter((r) => r.status !== "paid");
    const hasOutstanding = Number(loan.outstandingAmount || 0) > 0;
    if (unpaid.length > 0 || hasOutstanding) {
      return res.status(400).json({
        message: "NOC can only be requested after all loan installments and balances are completely cleared.",
      });
    }

    if (loan.nocCertificate?.status === "approved" && loan.nocCertificate?.certificateNumber) {
      return res.status(400).json({
        message: "NOC is already approved and issued for this loan.",
        noc: loan.nocCertificate,
      });
    }

    // Ensure status is marked closed if not already
    if (loan.status !== "closed") {
      loan.status = "closed";
      loan.outstandingAmount = 0;
    }

    const now = new Date();
    const customerName = loan.user?.name || loan.personalInformation?.fullName || req.user?.name || "Valued Customer";

    loan.nocCertificate = {
      ...(loan.nocCertificate?.toObject?.() || loan.nocCertificate || {}),
      status: "requested",
      requestedAt: now,
      requestNote: requestNote || "Customer submitted request for No Due Certificate.",
      customerName,
      loanAmount: loan.principal || loan.requestedAmount || 0,
      fullyPaidAt: loan.nocCertificate?.fullyPaidAt || now,
    };

    await loan.save();

    // Notify user
    await Notification.create({
      user: loan.user._id || loan.user,
      type: "loan",
      title: "📝 NOC Application Submitted",
      message: `Your application for No Due Certificate on loan ${loan.applicationNumber || loan._id} has been submitted and is awaiting Admin review and issuance.`,
      meta: { loanId: loan._id },
    }).catch(() => {});

    // Notify Admins in real-time
    await notifyRole("admin", {
      title: "📝 New NOC Request Pending Verification",
      message: `${customerName} applied for No Due Certificate on Loan ${loan.applicationNumber || loan._id}. Admin verification and issuance required.`,
      type: "loan",
      meta: { loanId: loan._id, action: "noc_request" },
    }).catch(() => {});

    // Also notify workers
    await notifyWorkers({
      title: "📝 New NOC Request",
      message: `${customerName} applied for No Due Certificate on Loan ${loan.applicationNumber || loan._id}. Admin approval required.`,
      meta: { loanId: loan._id, type: "noc_request" },
    }).catch(() => {});

    return res.status(200).json({
      success: true,
      message: "NOC application submitted successfully. It is now awaiting Admin approval and official document issuance.",
      noc: loan.nocCertificate,
      loan,
    });
  } catch (err) {
    console.error("applyForNoc error:", err);
    return res.status(500).json({ message: "Failed to submit NOC application", error: err.message });
  }
}

/**
 * Admin / Staff lists NOC requests and closed loans
 * GET /api/repayments/noc-requests
 */
export async function getNocRequestsAdmin(req, res) {
  try {
    const { status, search } = req.query;

    const query = {
      $or: [
        { "nocCertificate.status": { $in: ["requested", "approved", "rejected"] } },
        { status: "closed" },
      ],
    };

    let loans = await LoanApplication.find(query)
      .populate("user", "name email phone kycStatus")
      .populate("account", "accountNumber accountType branch ifscCode")
      .populate("assignedTo", "name email")
      .populate("nocCertificate.approvedBy", "name email")
      .sort({ "nocCertificate.requestedAt": -1, updatedAt: -1 });

    if (search) {
      const term = search.toLowerCase();
      loans = loans.filter(
        (l) =>
          l.applicationNumber?.toLowerCase().includes(term) ||
          l.user?.name?.toLowerCase().includes(term) ||
          l.user?.phone?.includes(term) ||
          l.user?.email?.toLowerCase().includes(term) ||
          l.nocCertificate?.certificateNumber?.toLowerCase().includes(term)
      );
    }

    let pendingCount = 0;
    let approvedCount = 0;
    let rejectedCount = 0;
    let totalClosed = 0;

    const enriched = loans.map((l) => {
      const noc = l.nocCertificate || {};
      let nocStatus = noc.status || (noc.certificateNumber ? "approved" : "not_requested");

      if (nocStatus === "requested") pendingCount++;
      else if (nocStatus === "approved") approvedCount++;
      else if (nocStatus === "rejected") rejectedCount++;

      if (l.status === "closed") totalClosed++;

      return {
        ...l.toObject(),
        nocCertificate: {
          ...noc,
          status: nocStatus,
          downloadUrl: nocStatus === "approved" ? `/api/repayments/noc/${l._id}?format=pdf` : undefined,
        },
      };
    });

    let filtered = enriched;
    if (status && status !== "all") {
      filtered = enriched.filter((l) => l.nocCertificate.status === status);
    }

    return res.status(200).json({
      success: true,
      stats: {
        pendingCount,
        approvedCount,
        rejectedCount,
        totalClosed,
      },
      count: filtered.length,
      requests: filtered,
    });
  } catch (err) {
    console.error("getNocRequestsAdmin error:", err);
    return res.status(500).json({ message: "Failed to fetch NOC requests", error: err.message });
  }
}

/**
 * Admin verifies, approves No Due Certificate (NOC) and issues official bank document
 * POST /api/repayments/noc/:loanId/approve
 */
export async function approveNocAdmin(req, res) {
  try {
    const loanId = req.params.loanId || req.params.id;
    const { adminRemarks } = req.body;

    const loan = await LoanApplication.findById(loanId)
      .populate("user", "name email phone kycStatus")
      .populate("account", "accountNumber accountType branch ifscCode");
    if (!loan) return res.status(404).json({ message: "Loan not found" });

    const unpaid = (loan.repayments || []).filter((r) => r.status !== "paid");
    const hasOutstanding = Number(loan.outstandingAmount || 0) > 0;
    if (unpaid.length > 0 || hasOutstanding) {
      return res.status(400).json({
        message: "Cannot approve NOC: Loan still has unpaid installments or remaining balance.",
      });
    }

    const now = new Date();
    const certNumber =
      loan.nocCertificate?.certificateNumber ||
      `NOC-${now.toISOString().slice(0, 10).replace(/-/g, "")}-${Math.floor(1000 + Math.random() * 9000)}`;

    loan.status = "closed";
    loan.outstandingAmount = 0;
    loan.nocCertificate = {
      ...(loan.nocCertificate?.toObject?.() || loan.nocCertificate || {}),
      status: "approved",
      certificateNumber: certNumber,
      generatedAt: now,
      approvedAt: now,
      approvedBy: req.user._id,
      approvedByName: req.user.name || "Bank Administrator",
      adminRemarks: adminRemarks || "Loan fully settled, verified against core ledger, and authorized by Bank Administrator",
      customerName: loan.user?.name || loan.personalInformation?.fullName || "Valued Customer",
      loanAmount: loan.principal || loan.requestedAmount || 0,
      fullyPaidAt: loan.nocCertificate?.fullyPaidAt || now,
      downloadUrl: `/api/repayments/noc/${loan._id}?format=pdf`,
    };

    await loan.save();

    await Notification.create({
      user: loan.user._id || loan.user,
      type: "loan",
      title: "🎉 No Due Certificate (NOC) Approved & Issued!",
      message: `Your official No Due Certificate (${certNumber}) for Loan ${loan.applicationNumber || loan._id} has been verified and issued by the Bank Administrator. You can now view and download your official certificate.`,
      meta: { loanId: loan._id, nocCertificateNumber: certNumber },
    }).catch(() => {});

    return res.status(200).json({
      success: true,
      message: `NOC #${certNumber} approved and officially issued in bank document format.`,
      noc: loan.nocCertificate,
      loan,
    });
  } catch (err) {
    console.error("approveNocAdmin error:", err);
    return res.status(500).json({ message: "Failed to approve NOC", error: err.message });
  }
}

/**
 * Admin rejects No Due Certificate (NOC) request
 * POST /api/repayments/noc/:loanId/reject
 */
export async function rejectNocAdmin(req, res) {
  try {
    const loanId = req.params.loanId || req.params.id;
    const { rejectionReason } = req.body;

    const loan = await LoanApplication.findById(loanId).populate("user", "name email phone");
    if (!loan) return res.status(404).json({ message: "Loan not found" });

    const now = new Date();
    loan.nocCertificate = {
      ...(loan.nocCertificate?.toObject?.() || loan.nocCertificate || {}),
      status: "rejected",
      rejectedAt: now,
      rejectionReason: rejectionReason || "Dues reconciliation required or documentation pending.",
    };

    await loan.save();

    await Notification.create({
      user: loan.user._id || loan.user,
      type: "loan",
      title: "⚠️ NOC Application Not Approved",
      message: `Your NOC request for Loan ${loan.applicationNumber || loan._id} was not approved: ${loan.nocCertificate.rejectionReason}. Please contact the branch.`,
      meta: { loanId: loan._id },
    }).catch(() => {});

    return res.status(200).json({
      success: true,
      message: "NOC application rejected",
      noc: loan.nocCertificate,
      loan,
    });
  } catch (err) {
    console.error("rejectNocAdmin error:", err);
    return res.status(500).json({ message: "Failed to reject NOC", error: err.message });
  }
}

/**
 * Worker records Recovery Follow-Up log for overdue collections
 */
export async function recordRecoveryFollowup(req, res) {
  try {
    const loanId = req.params.loanId || req.params.id;
    const { followupType, notes, promisedPaymentDate } = req.body;

    const loan = await LoanApplication.findById(loanId);
    if (!loan) return res.status(404).json({ message: "Loan not found" });

    loan.recoveryLogs.push({
      loggedBy: req.user._id,
      loggedAt: new Date(),
      followupType: followupType || "call_made",
      notes: notes || "",
      promisedPaymentDate: promisedPaymentDate ? new Date(promisedPaymentDate) : null,
    });

    await loan.save();

    return res.json({
      message: "Recovery follow-up logged successfully",
      loan,
    });
  } catch (err) {
    return res.status(500).json({ message: "Failed to log recovery follow-up", error: err.message });
  }
}