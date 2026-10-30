import mongoose from "mongoose";
import Transaction from "../models/Transaction.js";
import Account from "../models/Account.js";
import User from "../models/User.js";
import Payment from "../models/Payment.js";
import Notification from "../models/Notification.js";
import SupportTicket from "../models/SupportTicket.js";
import { notifyUser, notifyWorkers } from "../services/notificationService.js";
import { assignTicketRotational } from "../services/ticketAssignmentService.js";
import {
  getTransferConfig,
  validateBeneficiaryAccount,
  requestTransferOTP,
  executeInternalTransfer,
  createStripeTransferIntent,
  confirmStripeTransfer,
  getStripeTransferStatus,
  getTransferReceiptByNumber,
  getTransferReceiptPDFBuffer,
  listTransferHistory,
} from "../services/transferService.js";
import paymentGateway from "../services/paymentGateway.js";

const escapeRegex = (s) => String(s || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const fail = (res, error, defaultMsg) => {
  const status = error.statusCode || error.status || 500;
  return res.status(status).json({
    message: error.message || defaultMsg,
    code: error.code || "TRANSFER_ERROR",
  });
};

export const getConfig = async (req, res) => {
  try {
    const config = await getTransferConfig();
    return res.json(config);
  } catch (error) {
    return fail(res, error, "Failed to load transfer configuration");
  }
};

export const validateBeneficiary = async (req, res) => {
  try {
    const { destinationAccountNumber, sourceAccountId } = req.body;
    const result = await validateBeneficiaryAccount({
      senderUser: req.user,
      sourceAccountId,
      destinationAccountNumber,
    });
    return res.json(result);
  } catch (error) {
    return fail(res, error, "Failed to validate beneficiary account");
  }
};

export const requestOTP = async (req, res) => {
  try {
    const { destinationAccountNumber, sourceAccountId, amount, paymentMethod } = req.body;
    const result = await requestTransferOTP({
      senderUser: req.user,
      sourceAccountId,
      destinationAccountNumber,
      amount,
      paymentMethod,
    });
    return res.json(result);
  } catch (error) {
    return fail(res, error, "Failed to send transfer OTP code");
  }
};

export const executeTransfer = async (req, res) => {
  return res.status(400).json({
    message: "Direct internal transfers are disabled. Customer-to-customer money transfers must be processed using Stripe only.",
    code: "STRIPE_TRANSFER_ONLY",
  });
};

export const getReceipt = async (req, res) => {
  try {
    const { receiptNumber } = req.params;
    const receipt = await getTransferReceiptByNumber(receiptNumber, req.user);
    return res.json({ receipt });
  } catch (error) {
    return fail(res, error, "Failed to fetch transfer receipt");
  }
};

export const downloadReceiptPDF = async (req, res) => {
  try {
    const { receiptNumber } = req.params;
    const { receipt, pdfBuffer } = await getTransferReceiptPDFBuffer(receiptNumber, req.user);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="Transfer_Receipt_${receipt.receiptNumber}.pdf"`
    );
    res.setHeader("Content-Length", pdfBuffer.length);
    return res.send(pdfBuffer);
  } catch (error) {
    return fail(res, error, "Failed to download transfer receipt PDF");
  }
};

export const getHistory = async (req, res) => {
  try {
    const { page, limit } = req.query;
    const result = await listTransferHistory({
      user: req.user,
      page,
      limit,
    });
    return res.json(result);
  } catch (error) {
    return fail(res, error, "Failed to fetch transfer history");
  }
};

export const createStripeTransfer = async (req, res) => {
  try {
    const {
      sourceAccountId,
      destinationAccountNumber,
      amount,
      remarks,
      mpin,
      otp,
      idempotencyKey,
    } = req.body;
    const result = await createStripeTransferIntent({
      senderUser: req.user,
      sourceAccountId,
      destinationAccountNumber,
      amount,
      remarks,
      mpin,
      otp,
      idempotencyKey,
    });
    return res.status(result.alreadyProcessed ? 200 : 201).json(result);
  } catch (error) {
    return fail(res, error, "Failed to initiate Stripe transfer");
  }
};

export const getStripeStatus = async (req, res) => {
  try {
    const { paymentIntentId } = req.params;
    const result = await getStripeTransferStatus(paymentIntentId, req.user);
    return res.json(result);
  } catch (error) {
    return fail(res, error, "Failed to fetch card transfer status");
  }
};

export const confirmStripeTransferManual = async (req, res) => {
  try {
    const { paymentIntentId, paymentId } = req.body;
    const intent = await paymentGateway.retrievePaymentIntent(paymentIntentId);
    const result = await confirmStripeTransfer(paymentId, intent);
    return res.json(result);
  } catch (error) {
    return fail(res, error, "Failed to confirm card transfer");
  }
};

export const reportTransfer = async (req, res) => {
  try {
    const { receiptNumber, notificationId, reason } = req.body || {};
    const rawReceipt = receiptNumber || req.params?.receiptNumber;
    const cleanReason = (reason && String(reason).trim()) || "Unauthorized / suspicious transfer reported by customer";

    // 1. If notificationId provided, verify it exists and belongs to authenticated customer
    let notification = null;
    if (notificationId) {
      if (!mongoose.isValidObjectId(notificationId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid notification ID format.",
          code: "INVALID_NOTIFICATION_ID",
        });
      }
      notification = await Notification.findOne({ _id: notificationId, user: req.user._id });
      if (!notification) {
        return res.status(404).json({
          success: false,
          message: "Notification not found or does not belong to your account.",
          code: "NOTIFICATION_NOT_FOUND",
        });
      }
    }

    const effectiveReceipt = rawReceipt || notification?.meta?.receiptNumber;
    if (!effectiveReceipt && !notification) {
      return res.status(400).json({
        success: false,
        message: "Receipt number or valid notification ID is required to report a transfer.",
        code: "REPORT_PARAM_REQUIRED",
      });
    }

    const cleanReceipt = effectiveReceipt ? String(effectiveReceipt).trim() : null;
    const baseReceipt = cleanReceipt ? cleanReceipt.replace(/-CR$/, "") : null;

    if (!notification && baseReceipt) {
      notification = await Notification.findOne({
        user: req.user._id,
        $or: [
          { "meta.receiptNumber": baseReceipt },
          { "meta.receiptNumber": `${baseReceipt}-CR` },
          { message: new RegExp(escapeRegex(baseReceipt), "i") },
        ],
      });
    }

    // 2. Fetch authenticated customer's account
    const customerAccount = await Account.findOne({ user: req.user._id });

    // 3. Find matching transaction(s) and payment(s)
    let matchingTxns = [];
    let matchingPayments = [];

    if (baseReceipt) {
      [matchingTxns, matchingPayments] = await Promise.all([
        Transaction.find({
          $or: [
            { receiptNumber: baseReceipt },
            { receiptNumber: `${baseReceipt}-CR` },
            { receiptNumber: cleanReceipt },
          ],
        }),
        Payment.find({
          $or: [
            { receiptNumber: baseReceipt },
            { receiptNumber: cleanReceipt },
          ],
        }),
      ]);
    }

    // 4. Verify Ownership: Does the receipt belong to the authenticated customer?
    const hasTxns = matchingTxns.length > 0;
    const hasPayments = matchingPayments.length > 0;

    if (hasTxns || hasPayments) {
      const isOwnerOfTxn = matchingTxns.some(
        (t) =>
          String(t.user) === String(req.user._id) ||
          (customerAccount && String(t.account) === String(customerAccount._id))
      );

      const isOwnerOfPayment = matchingPayments.some(
        (p) =>
          String(p.user) === String(req.user._id) ||
          (p.destinationUser && String(p.destinationUser) === String(req.user._id)) ||
          (customerAccount && String(p.account) === String(customerAccount._id)) ||
          (customerAccount && p.destinationAccount && String(p.destinationAccount) === String(customerAccount._id))
      );

      if (!isOwnerOfTxn && !isOwnerOfPayment) {
        return res.status(403).json({
          success: false,
          message: "Unauthorized: Transfer receipt does not belong to your account.",
          code: "RECEIPT_NOT_OWNED",
        });
      }
    } else if (!notification) {
      // Receipt does not exist in transactions, payments, or customer notifications
      return res.status(404).json({
        success: false,
        message: `Transfer record for receipt '${cleanReceipt}' not found.`,
        code: "RECEIPT_NOT_FOUND",
      });
    }

    // 5. Status Validation: Prevent re-reporting or reporting already resolved transfers
    const alreadyReported =
      matchingTxns.some((t) => t.status === "reported") ||
      matchingPayments.some((p) => p.paymentStatus === "reported") ||
      Boolean(notification?.meta?.reported);

    if (alreadyReported) {
      return res.status(400).json({
        success: false,
        message: "This transaction has already been reported and is currently under investigation.",
        code: "ALREADY_REPORTED",
      });
    }

    const alreadyResolved =
      matchingTxns.some((t) => t.status === "resolved") ||
      matchingPayments.some((p) => p.paymentStatus === "resolved");

    if (alreadyResolved) {
      return res.status(400).json({
        success: false,
        message: "This transaction report has already been resolved by bank staff.",
        code: "ALREADY_RESOLVED",
      });
    }

    // 6. Ownership and status verified: Safely update matching transactions and payments
    if (baseReceipt) {
      await Transaction.updateMany(
        {
          $or: [
            { receiptNumber: baseReceipt },
            { receiptNumber: `${baseReceipt}-CR` },
          ],
        },
        {
          $set: {
            status: "reported",
            failureReason: `Reported by customer: ${cleanReason}`,
            reportedAt: new Date(),
            reportedReason: cleanReason,
            remarks: `[REPORTED] ${cleanReason}`.slice(0, 250),
          },
        }
      );

      await Payment.updateMany(
        { receiptNumber: baseReceipt },
        {
          $set: {
            paymentStatus: "reported",
            failureReason: `Reported by customer: ${cleanReason}`,
          },
        }
      );
    }

    // 7. Check if reported transaction is a DEBIT (money debited/withdrawn/transferred out)
    let isDebit = req.body?.isDebit;
    if (isDebit === undefined || isDebit === null) {
      if (matchingTxns.length > 0) {
        isDebit = matchingTxns.some((t) => t.type === "debit" || t.direction === "debit");
      } else if (matchingPayments.length > 0) {
        isDebit = matchingPayments.some((p) => String(p.user) === String(req.user._id));
      } else if (notification) {
        const text = `${notification.title || ''} ${notification.message || ''}`.toLowerCase();
        const type = String(notification.type || '').toLowerCase();
        if (type === 'withdrawal') isDebit = true;
        else if (type === 'deposit') isDebit = false;
        else {
          const debitKws = ['debited', 'sent to', 'transfer sent', 'withdrawn', 'paid ₹', 'deducted'];
          const creditKws = ['credited', 'received from', 'transfer received', 'deposited', 'money added'];
          const hasDebit = debitKws.some((k) => text.includes(k));
          const hasCredit = creditKws.some((k) => text.includes(k));
          if (hasDebit && !hasCredit) isDebit = true;
          else if (hasCredit && !hasDebit) isDebit = false;
          else isDebit = true;
        }
      } else {
        isDebit = true;
      }
    }

    // 8. If money is debited, BLOCK further money transactions immediately
    if (isDebit) {
      if (customerAccount) {
        customerAccount.status = "suspended";
        customerAccount.suspensionReason = "Account temporarily suspended due to reported debit transaction.";
        await customerAccount.save();
      }

      await User.findByIdAndUpdate(req.user._id, {
        $set: {
          status: "suspended",
        },
      });
    }

    // 9. Update notification if found
    if (notification) {
      notification.meta = {
        ...(notification.meta || {}),
        reported: true,
        reportedAt: new Date(),
        reportReason: cleanReason,
        isDebitReport: Boolean(isDebit),
      };
      await notification.save();
    }

    // 10. Create Support Ticket for worker investigation
    let count = await SupportTicket.countDocuments();
    let ticketNumber = `TKT-${String(count + 1).padStart(6, "0")}`;
    while (await SupportTicket.exists({ ticketNumber })) {
      count++;
      ticketNumber = `TKT-${String(count + 1).padStart(6, "0")}`;
    }

    const ticketSubject = isDebit
      ? `[REPORT] Suspicious Debit Report - ${baseReceipt || "Notification"}`
      : `[REPORT] Credited Transaction Inquiry - ${baseReceipt || "Notification"}`;

    const ticketDescription = isDebit
      ? `Customer ${req.user.name} reported an unauthorized/suspicious debit transaction.\nReference: ${baseReceipt || "N/A"}\nReason: ${cleanReason}\nAccount Status: Suspended ("Account temporarily suspended due to reported debit.")\nAction Required: Investigate reported debit. Only an authorized bank worker can re-enable transactions from the worker desk.`
      : `Customer ${req.user.name} reported an issue regarding a credited transaction.\nReference: ${baseReceipt || "N/A"}\nReason: ${cleanReason}\nAccount Status: Active\nAction Required: Review customer inquiry regarding credited funds.`;

    const ticket = await SupportTicket.create({
      ticketNumber,
      user: req.user._id,
      subject: ticketSubject,
      description: ticketDescription,
      category: "payment",
      priority: isDebit ? "urgent" : "high",
      status: "open",
      messages: [
        {
          sender: req.user._id,
          senderRole: "customer",
          message: isDebit
            ? `I have reported debit transaction ${baseReceipt || ""}: ${cleanReason}. My outgoing transactions have been locked for security. Please investigate and re-enable transactions.`
            : `I have an inquiry regarding credited transaction ${baseReceipt || ""}: ${cleanReason}. Please investigate.`,
          sentAt: new Date(),
        },
      ],
    });

    // Auto-assign to Support Team in rotational cycle
    try {
      await assignTicketRotational(ticket);
    } catch (assignErr) {
      console.error("Rotational ticket assignment error on transaction report:", assignErr.message);
    }

    // 11. Notifications
    if (isDebit) {
      await notifyUser(req.user._id, {
        type: "account",
        title: "Money Transactions Temporarily Blocked",
        message: `Account temporarily suspended. You reported a debit transaction ${baseReceipt ? `(${baseReceipt})` : ""}. For your protection, outgoing money transactions have been blocked. An authorized bank worker will review this report and re-enable transactions from the worker desk.`,
        meta: {
          receiptNumber: baseReceipt,
          ticketId: ticket._id,
          ticketNumber: ticket.ticketNumber,
          accountStatus: "suspended",
          transactionStatus: "reported",
        },
      });

      await notifyWorkers({
        type: "support",
        title: "URGENT: Debit Reported & Transactions Blocked",
        message: `Customer ${req.user.name} reported a debit transaction ${baseReceipt ? `(${baseReceipt})` : ""}. Account suspended and outgoing transactions locked. Worker review required to investigate and re-enable transactions.`,
        meta: {
          ticketId: ticket._id,
          ticketNumber: ticket.ticketNumber,
          receiptNumber: baseReceipt,
          customerId: req.user._id,
        },
      });
    } else {
      await notifyUser(req.user._id, {
        type: "account",
        title: "Transaction Inquiry Received",
        message: `Your report regarding credited transaction ${baseReceipt ? `(${baseReceipt})` : ""} has been submitted to support under Ticket #${ticket.ticketNumber}. Your account remains active.`,
        meta: {
          receiptNumber: baseReceipt,
          ticketId: ticket._id,
          ticketNumber: ticket.ticketNumber,
          accountStatus: "active",
        },
      });

      await notifyWorkers({
        type: "support",
        title: "Transaction Inquiry Submitted",
        message: `Customer ${req.user.name} submitted an inquiry for credited transaction ${baseReceipt ? `(${baseReceipt})` : ""}. Ticket #${ticket.ticketNumber} pending review.`,
        meta: {
          ticketId: ticket._id,
          ticketNumber: ticket.ticketNumber,
          receiptNumber: baseReceipt,
          customerId: req.user._id,
        },
      });
    }

    return res.status(200).json({
      success: true,
      message: isDebit
        ? "Debit transaction reported successfully. Outgoing money transactions have been blocked for your security. A bank worker will review and re-enable transactions."
        : "Transaction inquiry submitted successfully. Support team will investigate.",
      transactionStatus: "reported",
      accountStatus: isDebit ? "suspended" : (customerAccount?.status || "active"),
      ticket: {
        id: ticket._id,
        ticketNumber: ticket.ticketNumber,
      },
      receiptNumber: baseReceipt,
      isDebit: Boolean(isDebit),
    });
  } catch (error) {
    return fail(res, error, "Failed to report transfer");
  }
};

export const resolveTransferReport = async (req, res) => {
  try {
    const { receiptNumber, ticketId, customerId, resolutionNotes } = req.body;
    const cleanNotes = (resolutionNotes && String(resolutionNotes).trim()) || "Issue investigated and resolved by bank worker. Transactions re-enabled.";

    if (!receiptNumber && !ticketId && !customerId) {
      return res.status(400).json({
        message: "At least one of receiptNumber, ticketId, or customerId is required to resolve a reported transfer.",
      });
    }

    // Identify target user and ticket
    let targetUserId = customerId;
    let ticket = null;
    let baseReceipt = receiptNumber ? String(receiptNumber).trim().replace(/-CR$/, "") : null;

    if (ticketId && mongoose.isValidObjectId(ticketId)) {
      ticket = await SupportTicket.findById(ticketId);
      if (ticket) {
        targetUserId = targetUserId || ticket.user;
        if (!baseReceipt) {
          const match = ticket.subject.match(/(FLWTR|WDR|TXN|DEP|REC)-[A-Za-z0-9-]+/i) || ticket.description.match(/(FLWTR|WDR|TXN|DEP|REC)-[A-Za-z0-9-]+/i);
          if (match) baseReceipt = match[0].replace(/-CR$/, "");
        }
      }
    }

    if (!targetUserId && baseReceipt) {
      const txn = await Transaction.findOne({
        $or: [{ receiptNumber: baseReceipt }, { receiptNumber: `${baseReceipt}-CR` }],
      });
      if (txn) targetUserId = txn.user;
    }

    if (!targetUserId) {
      return res.status(404).json({ message: "Customer user associated with this report could not be found." });
    }

    // 1. Re-enable customer's account and profile
    const account = await Account.findOne({ user: targetUserId });
    if (account) {
      account.status = "active";
      account.suspensionReason = null;
      await account.save();
    }

    await User.findByIdAndUpdate(targetUserId, {
      $set: { status: "active" },
    });

    // 2. Update transaction status to "resolved"
    if (baseReceipt) {
      await Transaction.updateMany(
        {
          $or: [{ receiptNumber: baseReceipt }, { receiptNumber: `${baseReceipt}-CR` }],
        },
        {
          $set: {
            status: "resolved",
            resolvedAt: new Date(),
            resolvedBy: req.user._id,
            remarks: `[RESOLVED by ${req.user.name}] ${cleanNotes}`.slice(0, 250),
          },
        }
      );

      await Payment.updateMany(
        { receiptNumber: baseReceipt },
        {
          $set: {
            paymentStatus: "resolved",
          },
        }
      );
    } else {
      // Re-enable any reported transactions for this user
      await Transaction.updateMany(
        { user: targetUserId, status: "reported" },
        {
          $set: {
            status: "resolved",
            resolvedAt: new Date(),
            resolvedBy: req.user._id,
            remarks: `[RESOLVED by ${req.user.name}] ${cleanNotes}`.slice(0, 250),
          },
        }
      );
    }

    // 3. Resolve ticket if found
    if (ticket) {
      ticket.status = "resolved";
      ticket.resolvedAt = new Date();
      ticket.messages.push({
        sender: req.user._id,
        senderRole: req.user.role || "worker",
        message: `[RESOLVED] Issue investigated and resolved by worker ${req.user.name}. Customer account restored to active and transactions re-enabled. Notes: ${cleanNotes}`,
        sentAt: new Date(),
      });
      await ticket.save();
    } else {
      // Check if open ticket exists for this report
      const openTicket = await SupportTicket.findOne({
        user: targetUserId,
        category: "payment",
        status: { $in: ["open", "in_progress"] },
        subject: { $regex: baseReceipt ? escapeRegex(baseReceipt) : "Report", $options: "i" },
      });
      if (openTicket) {
        openTicket.status = "resolved";
        openTicket.resolvedAt = new Date();
        openTicket.messages.push({
          sender: req.user._id,
          senderRole: req.user.role || "worker",
          message: `[RESOLVED] Issue investigated and resolved by worker ${req.user.name}. Customer account restored and transactions re-enabled. Notes: ${cleanNotes}`,
          sentAt: new Date(),
        });
        await openTicket.save();
      }
    }

    // 4. Notify customer
    await notifyUser(targetUserId, {
      type: "account",
      title: "Account & Transactions Re-enabled",
      message: `A bank worker (${req.user.name}) has resolved the issue with your reported transfer${baseReceipt ? ` (${baseReceipt})` : ""}. Your account is now active and transactions have been safely re-enabled.`,
      meta: {
        receiptNumber: baseReceipt,
        accountStatus: "active",
        transactionStatus: "resolved",
      },
    });

    return res.status(200).json({
      success: true,
      message: "Issue resolved successfully and transactions re-enabled.",
      accountStatus: "active",
      transactionStatus: "resolved",
      customerId: targetUserId,
      receiptNumber: baseReceipt,
    });
  } catch (error) {
    return fail(res, error, "Failed to resolve transfer report");
  }
};

export default {
  getConfig,
  validateBeneficiary,
  requestOTP,
  executeTransfer,
  createStripeTransfer,
  getStripeStatus,
  confirmStripeTransferManual,
  getReceipt,
  downloadReceiptPDF,
  getHistory,
  reportTransfer,
  resolveTransferReport,
};
