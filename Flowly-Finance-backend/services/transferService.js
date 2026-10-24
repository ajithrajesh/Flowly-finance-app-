import crypto from "crypto";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import Account from "../models/Account.js";
import User from "../models/User.js";
import Transaction from "../models/Transaction.js";
import TransactionBucket from "../models/TransactionBucket.js";
import Notification from "../models/Notification.js";
import { notifyUser, notifyAdmins } from "./notificationService.js";
import OTP from "../models/OTP.js";
import Payment from "../models/Payment.js";
import paymentGateway from "./paymentGateway.js";
import {
  SUPPORTED_BRANCHES,
  resolveBranch,
  isSupportedBranch,
} from "../utils/branchConstants.js";
import {
  sendTransferOTPEmail,
  sendTransferReceiptEmail,
  sendAccountLockoutEmail,
} from "../utils/mailer.js";
import { generateTransferReceiptPDF } from "../utils/transferReceiptGenerator.js";

export const TRANSFER_LIMITS = {
  min: 1,
  max: 200000,
  otpThreshold: 2000,
  currency: "inr",
};

const err = (status, message, code) =>
  Object.assign(new Error(message), { status, statusCode: status, code });

const round2 = (n) => Math.round(Number(n || 0) * 100) / 100;

export const maskAccountNumber = (n = "") => {
  const s = String(n || "");
  return s.length > 4 ? `${"X".repeat(Math.max(s.length - 4, 3))}${s.slice(-4)}` : s;
};

const maskEmail = (email = "") => {
  const [local, domain] = String(email).split("@");
  if (!domain) return email;
  const maskedLocal =
    local.length <= 2 ? `${local[0]}*` : `${local[0]}${"*".repeat(local.length - 2)}${local.slice(-1)}`;
  return `${maskedLocal}@${domain}`;
};

const generateReceiptNumber = () => {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const randomHex = crypto.randomBytes(4).toString("hex").toUpperCase();
  return `FLWTR-${date}-${randomHex}`;
};

const isNoTransactionSupport = (e) =>
  e?.code === 20 || /replica set|Transaction numbers are only allowed/i.test(e?.message || "");

/**
 * Returns configuration for frontend UI
 */
export const getTransferConfig = async () => {
  return {
    branches: SUPPORTED_BRANCHES,
    limits: TRANSFER_LIMITS,
    paymentMethods: [
      {
        id: "STRIPE",
        name: "Stripe Secure Transfer",
        description: "Instant customer-to-customer money transfer processed securely via Stripe with MPIN & OTP verification.",
      },
    ],
    rules: {
      mpinRequired: true,
      otpRequiredAbove: TRANSFER_LIMITS.otpThreshold,
      description: `Transfers up to ₹${TRANSFER_LIMITS.otpThreshold.toLocaleString(
        "en-IN"
      )} require MPIN. Transfers exceeding ₹${TRANSFER_LIMITS.otpThreshold.toLocaleString(
        "en-IN"
      )} require MPIN + Email OTP. All customer transfers are processed securely using Stripe.`,
    },
  };
};

/**
 * Validates a beneficiary account number and returns details for confirmation preview
 */
export const validateBeneficiaryAccount = async ({
  senderUser,
  sourceAccountId,
  destinationAccountNumber,
}) => {
  if (senderUser?.status === "suspended") {
    throw err(403, "Account temporarily suspended.", "ACCOUNT_SUSPENDED");
  }

  const cleanDestAccNum = String(destinationAccountNumber || "").trim();

  if (!cleanDestAccNum) {
    throw err(400, "Beneficiary account number is required", "ACCOUNT_NUMBER_REQUIRED");
  }

  // Find source account
  let sourceAccount = null;
  if (sourceAccountId) {
    sourceAccount = await Account.findOne({ _id: sourceAccountId, user: senderUser._id });
  } else {
    sourceAccount = await Account.findOne({ user: senderUser._id });
  }

  if (!sourceAccount) {
    throw err(404, "Your bank account was not found. Please complete KYC verification first.", "SOURCE_ACCOUNT_NOT_FOUND");
  }

  if (sourceAccount.status === "suspended" || senderUser?.status === "suspended") {
    throw err(403, "Account temporarily suspended.", "ACCOUNT_SUSPENDED");
  }

  if (sourceAccount.status !== "active") {
    throw err(403, `Source account is currently ${sourceAccount.status}`, "SOURCE_ACCOUNT_INACTIVE");
  }

  // Destination account lookup
  const destAccount = await Account.findOne({ accountNumber: cleanDestAccNum }).populate(
    "user",
    "name email phone role status kycStatus"
  );

  if (!destAccount) {
    throw err(404, `No bank account exists with account number '${cleanDestAccNum}'`, "BENEFICIARY_NOT_FOUND");
  }

  if (String(destAccount._id) === String(sourceAccount._id)) {
    throw err(400, "Cannot transfer funds to the same source account", "SELF_TRANSFER_PROHIBITED");
  }

  if (destAccount.status !== "active") {
    throw err(400, `Beneficiary account is currently ${destAccount.status}`, "BENEFICIARY_ACCOUNT_INACTIVE");
  }

  if (!destAccount.user || destAccount.user.status !== "active") {
    throw err(400, "Beneficiary account holder profile is inactive", "BENEFICIARY_USER_INACTIVE");
  }

  // Resolve branch metadata
  const srcBranch = resolveBranch(sourceAccount.branch, sourceAccount.ifscCode);
  const destBranch = resolveBranch(destAccount.branch, destAccount.ifscCode);

  const isSameBranch = srcBranch.code === destBranch.code;

  return {
    valid: true,
    beneficiary: {
      accountId: destAccount._id,
      accountNumber: destAccount.accountNumber,
      maskedAccountNumber: maskAccountNumber(destAccount.accountNumber),
      accountType: destAccount.accountType,
      name: destAccount.user.name,
      branch: destBranch.name,
      branchCode: destBranch.code,
      ifscCode: destAccount.ifscCode || destBranch.ifscCode,
      city: destBranch.city,
    },
    sender: {
      accountId: sourceAccount._id,
      accountNumber: sourceAccount.accountNumber,
      maskedAccountNumber: maskAccountNumber(sourceAccount.accountNumber),
      accountType: sourceAccount.accountType,
      balance: sourceAccount.balance,
      branch: srcBranch.name,
      branchCode: srcBranch.code,
      ifscCode: sourceAccount.ifscCode || srcBranch.ifscCode,
    },
    transferType: isSameBranch ? "INTRA_BRANCH" : "INTER_BRANCH",
    isSameBranch,
  };
};

/**
 * Requests an OTP for transfers > ₹2,000 (or optional for smaller transfers)
 */
export const requestTransferOTP = async ({
  senderUser,
  sourceAccountId,
  destinationAccountNumber,
  amount: rawAmount,
  paymentMethod = "STRIPE",
}) => {
  const amount = Number(rawAmount);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw err(400, "Please enter a valid transfer amount greater than 0", "INVALID_AMOUNT");
  }
  if (round2(amount) !== amount) {
    throw err(400, "Amount can have at most 2 decimal places", "INVALID_AMOUNT_PRECISION");
  }
  if (amount < TRANSFER_LIMITS.min || amount > TRANSFER_LIMITS.max) {
    throw err(
      400,
      `Transfer amount must be between ₹${TRANSFER_LIMITS.min} and ₹${TRANSFER_LIMITS.max.toLocaleString("en-IN")}`,
      "AMOUNT_OUT_OF_RANGE"
    );
  }

  // Validate beneficiary
  const preview = await validateBeneficiaryAccount({
    senderUser,
    sourceAccountId,
    destinationAccountNumber,
  });

  // Balance Check
  if (preview.sender.balance < amount) {
    throw err(
      400,
      `Insufficient available balance (₹${preview.sender.balance.toFixed(2)}) for transfer of ₹${amount.toFixed(2)}`,
      "INSUFFICIENT_BALANCE"
    );
  }

  const cleanEmail = senderUser.email.toLowerCase().trim();

  // Generate 6-digit numeric OTP
  const otpCode = Math.floor(100000 + Math.random() * 900000).toString();

  // Invalidate any active transfer OTPs for this user
  await OTP.deleteMany({ email: cleanEmail, purpose: "transfer" });

  // Create new OTP record with 5-minute expiry
  await OTP.create({
    email: cleanEmail,
    otp: otpCode,
    purpose: "transfer",
    expiresAt: new Date(Date.now() + 5 * 60 * 1000),
  });

  // Send transfer authorization email
  await sendTransferOTPEmail(cleanEmail, otpCode, {
    amount,
    destinationAccountNumber: preview.beneficiary.accountNumber,
    beneficiaryName: preview.beneficiary.name,
    branch: preview.beneficiary.branch,
  });

  return {
    success: true,
    message: `A 6-digit verification code has been sent to ${maskEmail(cleanEmail)}`,
    maskedEmail: maskEmail(cleanEmail),
    amount,
    expiresInSeconds: 300,
    purpose: "transfer",
  };
};

/**
 * Builds standard transfer receipt object
 */
export const buildTransferReceipt = ({
  debitTxn,
  creditTxn,
  sourceAccount,
  destAccount,
  senderUser,
  destUser,
  securityTier,
  paymentMethod,
  cardDetails,
}) => {
  const srcBranch = resolveBranch(sourceAccount.branch, sourceAccount.ifscCode);
  const destBranch = resolveBranch(destAccount.branch, destAccount.ifscCode);
  const isInterBranch = srcBranch.code !== destBranch.code;
  const isCard = debitTxn.paymentMethod === "CARD" || paymentMethod === "CARD";

  const defaultSecurityTier = isCard
    ? debitTxn.amount > TRANSFER_LIMITS.otpThreshold
      ? "Stripe 3D Secure + MPIN + OTP Verified"
      : "Stripe 3D Secure + MPIN Verified"
    : debitTxn.amount > TRANSFER_LIMITS.otpThreshold
    ? "MPIN + OTP (Dual-Factor)"
    : "MPIN Verified";

  return {
    receiptNumber: debitTxn.receiptNumber,
    transactionId: debitTxn._id,
    creditTransactionId: creditTxn?._id || null,
    transactionType: "TRANSFER",
    transferType: isInterBranch ? "INTER_BRANCH" : "INTRA_BRANCH",
    category: isInterBranch ? "inter_branch_transfer" : "intra_branch_transfer",
    status: debitTxn.status,
    amount: debitTxn.amount,
    currency: debitTxn.currency || "inr",
    paymentMethod: isCard ? "CARD" : (debitTxn.paymentMethod || "INTERNAL"),
    cardDetails: cardDetails || debitTxn.cardDetails || null,
    description: debitTxn.remarks || (isCard ? `Card transfer to ${destAccount.accountNumber}` : `Transfer to ${destAccount.accountNumber}`),
    securityTier: securityTier || defaultSecurityTier,
    sourceAccount: {
      id: sourceAccount._id,
      accountNumber: sourceAccount.accountNumber,
      maskedAccountNumber: maskAccountNumber(sourceAccount.accountNumber),
      accountType: sourceAccount.accountType,
      branch: srcBranch.name,
      branchCode: srcBranch.code,
      ifscCode: sourceAccount.ifscCode || srcBranch.ifscCode,
      city: srcBranch.city,
      customerName: senderUser?.name || "Sender",
      customerEmail: senderUser?.email || null,
    },
    destinationAccount: {
      id: destAccount._id,
      accountNumber: destAccount.accountNumber,
      maskedAccountNumber: maskAccountNumber(destAccount.accountNumber),
      accountType: destAccount.accountType,
      branch: destBranch.name,
      branchCode: destBranch.code,
      ifscCode: destAccount.ifscCode || destBranch.ifscCode,
      city: destBranch.city,
      customerName: destUser?.name || "Beneficiary",
      customerEmail: destUser?.email || null,
    },
    previousBalance: debitTxn.previousBalance ?? null,
    updatedBalance: debitTxn.updatedBalance ?? null,
    remarks: debitTxn.remarks || null,
    timestamp: debitTxn.completedAt || debitTxn.createdAt,
    completedAt: debitTxn.completedAt || null,
  };
};

/**
 * Executes atomic transfer between accounts across the 3 branches
 */
export const executeInternalTransfer = async () => {
  throw err(
    400,
    "Direct internal transfers are disabled. Customer-to-customer money transfers must be processed using Stripe only.",
    "STRIPE_TRANSFER_ONLY"
  );
};

/**
 * Retrieves a transfer receipt by receipt number
 */
export const getTransferReceiptByNumber = async (receiptNumber, user) => {
  const cleanReceipt = String(receiptNumber || "").trim();

  // Find either debit or credit transaction matching receiptNumber
  const txn = await Transaction.findOne({
    $or: [{ receiptNumber: cleanReceipt }, { receiptNumber: `${cleanReceipt}-CR` }],
  });

  if (!txn) {
    throw err(404, `Transfer receipt '${cleanReceipt}' not found`, "RECEIPT_NOT_FOUND");
  }

  const isDebit = !txn.receiptNumber.endsWith("-CR");
  const baseReceiptNumber = isDebit ? txn.receiptNumber : txn.receiptNumber.replace(/-CR$/, "");

  const [debitTxn, creditTxn] = await Promise.all([
    Transaction.findOne({ receiptNumber: baseReceiptNumber }),
    Transaction.findOne({ receiptNumber: `${baseReceiptNumber}-CR` }),
  ]);

  if (!debitTxn) {
    throw err(404, "Transaction record not found", "TRANSACTION_NOT_FOUND");
  }

  // Auth check: user must be sender, recipient, or admin
  const isSender = String(debitTxn.user) === String(user._id);
  const isRecipient = creditTxn && String(creditTxn.user) === String(user._id);
  const isAdmin = ["worker", "admin"].includes(user.role);

  if (!isSender && !isRecipient && !isAdmin) {
    throw err(403, "You do not have permission to view this receipt", "UNAUTHORIZED");
  }

  const [sourceAcc, destAcc, senderUser, destUser, paymentRecord] = await Promise.all([
    Account.findById(debitTxn.account),
    creditTxn ? Account.findById(creditTxn.account) : null,
    User.findById(debitTxn.user),
    creditTxn ? User.findById(creditTxn.user) : null,
    debitTxn.paymentMethod === "CARD"
      ? Payment.findOne({ receiptNumber: baseReceiptNumber, purpose: "transfer" })
      : null,
  ]);

  return buildTransferReceipt({
    debitTxn,
    creditTxn,
    sourceAccount: sourceAcc || { accountNumber: "N/A", branch: debitTxn.branch },
    destAccount: destAcc || { accountNumber: "N/A", branch: creditTxn?.branch },
    senderUser,
    destUser,
    paymentMethod: debitTxn.paymentMethod,
    cardDetails: paymentRecord?.paymentMethod || null,
  });
};

/**
 * Returns PDF receipt buffer for download
 */
export const getTransferReceiptPDFBuffer = async (receiptNumber, user) => {
  const receipt = await getTransferReceiptByNumber(receiptNumber, user);
  const pdfBuffer = await generateTransferReceiptPDF(receipt);
  return { receipt, pdfBuffer };
};

/**
 * Lists user's transfer history
 */
export const listTransferHistory = async ({ user, page = 1, limit = 20 }) => {
  const p = Math.max(parseInt(page, 10) || 1, 1);
  const l = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);

  const filter = {
    user: user._id,
    transactionType: "TRANSFER",
  };

  const [txns, total] = await Promise.all([
    Transaction.find(filter)
      .sort({ createdAt: -1 })
      .skip((p - 1) * l)
      .limit(l)
      .populate("account", "accountNumber accountType branch"),
    Transaction.countDocuments(filter),
  ]);

  const items = txns.map((t) => {
    const isCredit = t.receiptNumber.endsWith("-CR");
    const baseReceiptNumber = isCredit ? t.receiptNumber.replace(/-CR$/, "") : t.receiptNumber;
    return {
      receiptNumber: baseReceiptNumber,
      fullReceiptNumber: t.receiptNumber,
      transactionId: t._id,
      type: isCredit ? "credit" : "debit",
      amount: t.amount,
      currency: t.currency,
      paymentMethod: t.paymentMethod || "INTERNAL",
      accountNumber: t.account?.accountNumber,
      branch: t.branch || t.account?.branch,
      previousBalance: t.previousBalance,
      updatedBalance: t.updatedBalance,
      remarks: t.remarks,
      timestamp: t.completedAt || t.createdAt,
      status: t.status,
      failureReason: t.failureReason || null,
    };
  });

  return {
    total,
    page: p,
    limit: l,
    transfers: items,
  };
};

/**
 * Creates a Stripe PaymentIntent for customer-to-customer transfer.
 */
export const createStripeTransferIntent = async ({
  senderUser: initialSender,
  sourceAccountId,
  destinationAccountNumber,
  amount: rawAmount,
  remarks,
  mpin,
  otp,
  idempotencyKey,
}) => {
  if (initialSender?.status === "suspended") {
    throw err(403, "Account temporarily suspended.", "ACCOUNT_SUSPENDED");
  }

  // 1. Amount validation
  const amount = Number(rawAmount);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw err(400, "Please provide a valid transfer amount greater than 0", "INVALID_AMOUNT");
  }
  if (round2(amount) !== amount) {
    throw err(400, "Amount can have at most 2 decimal places", "INVALID_AMOUNT_PRECISION");
  }
  if (amount < TRANSFER_LIMITS.min || amount > TRANSFER_LIMITS.max) {
    throw err(
      400,
      `Transfer amount must be between ₹${TRANSFER_LIMITS.min} and ₹${TRANSFER_LIMITS.max.toLocaleString("en-IN")}`,
      "AMOUNT_OUT_OF_RANGE"
    );
  }

  // 2. Duplicate-Payment Prevention: Check idempotency key if provided
  if (idempotencyKey) {
    const existingTxn = await Transaction.findOne({ idempotencyKey });
    if (existingTxn) {
      if (existingTxn.status === "completed") {
        const receipt = await getTransferReceiptByNumber(existingTxn.receiptNumber, initialSender);
        return {
          alreadyProcessed: true,
          message: "This transfer was already processed successfully",
          receipt,
        };
      }
      const existingPayment = await Payment.findOne({ receiptNumber: existingTxn.receiptNumber });
      if (existingPayment && existingPayment.paymentStatus === "pending") {
        const existingIntent = await paymentGateway.retrievePaymentIntent(existingPayment.transactionReference);
        const preview = await validateBeneficiaryAccount({
          senderUser: initialSender,
          sourceAccountId,
          destinationAccountNumber,
        });
        return {
          clientSecret: existingIntent.client_secret,
          paymentIntentId: existingPayment.transactionReference,
          paymentId: existingPayment._id,
          receiptNumber: existingPayment.receiptNumber,
          amount: existingPayment.amount,
          currency: existingPayment.currency || TRANSFER_LIMITS.currency,
          beneficiary: preview.beneficiary,
          sender: preview.sender,
          securityTier: existingIntent.metadata?.securityTier || "Stripe 3D Secure + MPIN Verified",
        };
      }
    }
  }

  // 3. Sender User Validation
  const senderUser = await User.findById(initialSender._id).select(
    "+mpinHash +failedLoginAttempts +lockUntil +isMpinSet"
  );
  if (!senderUser || senderUser.role !== "customer") {
    throw err(403, "Only active customers can perform transfers", "UNAUTHORIZED");
  }
  if (senderUser.status === "suspended") {
    throw err(403, "Account temporarily suspended.", "ACCOUNT_SUSPENDED");
  }
  if (senderUser.status !== "active") {
    throw err(403, `Your profile status is '${senderUser.status}'. Transfers are disabled.`, "PROFILE_INACTIVE");
  }
  if (senderUser.kycStatus !== "verified") {
    throw err(403, "KYC verification is required before initiating transfers", "KYC_NOT_VERIFIED");
  }

  // 4. Check MPIN lock
  if (senderUser.lockUntil && senderUser.lockUntil > new Date()) {
    const remainingMs = senderUser.lockUntil.getTime() - Date.now();
    const remainingHours = Math.ceil(remainingMs / (1000 * 60 * 60));
    throw err(
      403,
      `Account is temporarily suspended due to consecutive failed attempts. Please try again after ${remainingHours} hour(s).`,
      "ACCOUNT_LOCKED"
    );
  }

  // Reset lock if expired
  if (senderUser.lockUntil && senderUser.lockUntil <= new Date()) {
    senderUser.failedLoginAttempts = 0;
    senderUser.lockUntil = null;
  }

  // 5. Validate MPIN presence and correctness (Mandatory for ALL amounts)
  if (!senderUser.isMpinSet || !senderUser.mpinHash) {
    throw err(
      400,
      "Security MPIN is not configured. Please generate your MPIN in the dashboard before transferring funds.",
      "MPIN_NOT_SET"
    );
  }

  const cleanMpin = String(mpin || "").trim();
  if (!cleanMpin) {
    throw err(400, "Security MPIN is required to authorize transfer", "MPIN_REQUIRED");
  }

  const isMpinCorrect = await bcrypt.compare(cleanMpin, senderUser.mpinHash);
  if (!isMpinCorrect) {
    senderUser.failedLoginAttempts = (senderUser.failedLoginAttempts || 0) + 1;
    if (senderUser.failedLoginAttempts >= 4) {
      senderUser.lockUntil = new Date(Date.now() + 24 * 60 * 60 * 1000);
      await senderUser.save();
      sendAccountLockoutEmail(senderUser.email, senderUser.name).catch(() => {});
      throw err(
        403,
        "Account suspended for 24 hours due to 4 incorrect MPIN attempts. A security alert email has been sent.",
        "ACCOUNT_LOCKED"
      );
    }
    await senderUser.save();
    const remaining = 4 - senderUser.failedLoginAttempts;
    throw err(
      401,
      `Incorrect MPIN. ${remaining} attempt(s) remaining before 24-hour account suspension.`,
      "INVALID_MPIN"
    );
  }

  // Reset failed attempts on valid MPIN
  if (senderUser.failedLoginAttempts > 0) {
    senderUser.failedLoginAttempts = 0;
    await senderUser.save();
  }

  // 6. Validate Beneficiary and Source Account
  const preview = await validateBeneficiaryAccount({
    senderUser,
    sourceAccountId,
    destinationAccountNumber,
  });

  // 7. Balance Check (Mandatory: Sender must have sufficient available balance)
  if (preview.sender.balance < amount) {
    throw err(
      400,
      `Insufficient available balance (₹${preview.sender.balance.toFixed(2)}) for transfer of ₹${amount.toFixed(2)}`,
      "INSUFFICIENT_BALANCE"
    );
  }

  // 8. Tier Check: transfers > ₹2,000 require MPIN + OTP
  const requiresOtp = amount > TRANSFER_LIMITS.otpThreshold;
  if (requiresOtp) {
    const cleanOtp = String(otp || "").trim();
    if (!cleanOtp) {
      throw err(
        400,
        `Transfers above ₹${TRANSFER_LIMITS.otpThreshold.toLocaleString(
          "en-IN"
        )} require a 6-digit email OTP in addition to your MPIN. Please request and enter the verification code.`,
        "OTP_REQUIRED"
      );
    }

    const cleanEmail = senderUser.email.toLowerCase().trim();
    const otpRecord = await OTP.findOne({
      email: cleanEmail,
      otp: cleanOtp,
      purpose: "transfer",
      expiresAt: { $gt: new Date() },
    });

    if (!otpRecord) {
      throw err(
        400,
        "Invalid or expired transfer OTP verification code. Please request a new code.",
        "INVALID_OTP"
      );
    }

    // Clean up used OTP so it cannot be reused
    await OTP.deleteMany({ email: cleanEmail, purpose: "transfer" });
  }

  const securityTier = requiresOtp
    ? "Stripe 3D Secure + MPIN + OTP Verified"
    : "Stripe 3D Secure + MPIN Verified";

  const receiptNumber = generateReceiptNumber();
  const paymentId = new mongoose.Types.ObjectId();

  const transferRemarks =
    remarks && String(remarks).trim()
      ? String(remarks).trim().slice(0, 150)
      : preview.isSameBranch
      ? `Stripe transfer to ${preview.beneficiary.accountNumber} (${preview.beneficiary.branch})`
      : `Inter-branch Stripe transfer to ${preview.beneficiary.accountNumber} (${preview.beneficiary.branch})`;

  // 9. Create Stripe PaymentIntent with Stripe Idempotency Key
  const intent = await paymentGateway.createPaymentIntent({
    amountInRupees: amount,
    currency: TRANSFER_LIMITS.currency,
    description: `Flowly Transfer to ${preview.beneficiary.name} (${preview.beneficiary.accountNumber})`,
    idempotencyKey: idempotencyKey ? `flowly_stripe_tr_${senderUser._id}_${idempotencyKey}` : undefined,
    metadata: {
      purpose: "transfer",
      paymentId: paymentId.toString(),
      senderUserId: senderUser._id.toString(),
      sourceAccountId: preview.sender.accountId.toString(),
      destinationAccountId: preview.beneficiary.accountId.toString(),
      destinationAccountNumber: preview.beneficiary.accountNumber,
      amount: String(amount),
      receiptNumber,
      remarks: transferRemarks,
      securityTier,
      idempotencyKey: idempotencyKey || "",
    },
  });

  // 10. Create initial Payment and Transaction records
  await Payment.create({
    _id: paymentId,
    user: senderUser._id,
    account: preview.sender.accountId,
    destinationAccount: preview.beneficiary.accountId,
    destinationUser: preview.beneficiary.accountId ? (await Account.findById(preview.beneficiary.accountId))?.user : undefined,
    purpose: "transfer",
    amount,
    currency: TRANSFER_LIMITS.currency,
    paymentStatus: "pending",
    transactionReference: intent.transactionId,
    receiptNumber,
    remarks: transferRemarks,
  });

  await Transaction.create({
    transactionType: "TRANSFER",
    receiptNumber,
    account: preview.sender.accountId,
    user: senderUser._id,
    amount,
    currency: TRANSFER_LIMITS.currency,
    previousBalance: preview.sender.balance,
    updatedBalance: preview.sender.balance,
    paymentMethod: "CARD",
    status: "pending",
    branch: preview.sender.branch,
    remarks: transferRemarks,
    ...(idempotencyKey ? { idempotencyKey } : {}),
  });

  return {
    clientSecret: intent.clientSecret,
    paymentIntentId: intent.transactionId,
    paymentId,
    receiptNumber,
    amount,
    currency: TRANSFER_LIMITS.currency,
    beneficiary: preview.beneficiary,
    sender: preview.sender,
    securityTier,
  };
};

/**
 * Validates Stripe intent metadata against stored Payment record.
 */
const verifyTransferIntent = (intent, payment) => {
  if (!intent || intent.id !== payment.transactionReference) return "PaymentIntent ID mismatch";
  const expectedMinor = Math.round(payment.amount * 100);
  const paidMinor = intent.amount_received ?? intent.amount;
  if (paidMinor !== expectedMinor) return `Amount mismatch (expected ${expectedMinor}, Stripe has ${paidMinor})`;
  const expectedCurrency = (payment.currency || TRANSFER_LIMITS.currency).toLowerCase();
  if ((intent.currency || expectedCurrency).toLowerCase() !== expectedCurrency) return "Currency mismatch";
  const md = intent.metadata || {};
  if (md.paymentId && md.paymentId !== payment._id.toString()) return "Payment ID metadata mismatch";
  if (md.senderUserId && md.senderUserId !== payment.user.toString()) return "Sender metadata mismatch";
  if (md.destinationAccountId && payment.destinationAccount && md.destinationAccountId !== payment.destinationAccount.toString()) {
    return "Destination account metadata mismatch";
  }
  return null;
};

/**
 * Confirms and executes customer-to-customer transfer upon Stripe card payment verification.
 */
export const confirmStripeTransfer = async (paymentIdOrOptions, maybeIntent) => {
  let paymentId = null;
  let intent = maybeIntent;

  if (paymentIdOrOptions && typeof paymentIdOrOptions === "object" && !mongoose.Types.ObjectId.isValid(paymentIdOrOptions)) {
    if (paymentIdOrOptions.id && paymentIdOrOptions.status) {
      intent = paymentIdOrOptions;
    } else {
      paymentId = paymentIdOrOptions.paymentId || null;
      intent = paymentIdOrOptions.intent || intent;
      if (!intent && paymentIdOrOptions.paymentIntentId) {
        intent = await paymentGateway.retrievePaymentIntent(paymentIdOrOptions.paymentIntentId);
      }
    }
  } else {
    paymentId = paymentIdOrOptions;
  }

  let payment = null;
  if (paymentId && mongoose.Types.ObjectId.isValid(paymentId)) {
    payment = await Payment.findById(paymentId);
  }
  if (!payment && intent?.id) {
    payment = await Payment.findOne({ transactionReference: intent.id, purpose: "transfer" });
  }
  if (!payment && paymentIdOrOptions?.receiptNumber) {
    payment = await Payment.findOne({ receiptNumber: paymentIdOrOptions.receiptNumber, purpose: "transfer" });
  }

  if (!payment || payment.purpose !== "transfer") {
    throw err(404, "Customer-to-customer transfer payment not found", "TRANSFER_NOT_FOUND");
  }

  if (!intent && payment.transactionReference) {
    intent = await paymentGateway.retrievePaymentIntent(payment.transactionReference);
  }

  if (payment.paymentStatus === "success") {
    const receipt = await getTransferReceiptByNumber(payment.receiptNumber, { _id: payment.user, role: "customer" });
    return { alreadyProcessed: true, receipt };
  }

  if (!intent || intent.status !== "succeeded") {
    throw err(400, `Payment has not succeeded (status: ${intent?.status || "unknown"})`, "NOT_SUCCEEDED");
  }

  const problem = verifyTransferIntent(intent, payment);
  if (problem) {
    await Payment.updateOne(
      { _id: payment._id, paymentStatus: { $ne: "success" } },
      { $set: { paymentStatus: "failed", failureReason: `Verification failed: ${problem}` } }
    );
    await Transaction.updateOne(
      { receiptNumber: payment.receiptNumber, status: { $ne: "completed" } },
      { $set: { status: "failed", failureReason: `Verification failed: ${problem}` } }
    );
    throw err(400, problem, "VERIFY_FAILED");
  }

  let cardInfo = { type: "card" };
  try {
    const full = await paymentGateway.retrievePaymentIntent(intent.id, { expand: ["latest_charge"] });
    const card = full?.latest_charge?.payment_method_details?.card;
    if (card) {
      cardInfo = { type: "card", brand: card.brand, last4: card.last4 };
    }
  } catch {
    // Non-blocking card lookup fallback
  }

  const [sourceAccount, destAccount, senderUser] = await Promise.all([
    Account.findById(payment.account),
    Account.findById(payment.destinationAccount),
    User.findById(payment.user),
  ]);

  if (!sourceAccount) throw err(404, "Source account not found", "SOURCE_ACCOUNT_NOT_FOUND");
  if (!destAccount) throw err(404, "Beneficiary account not found", "BENEFICIARY_NOT_FOUND");

  if (sourceAccount.status === "suspended" || senderUser?.status === "suspended") {
    throw err(403, "Account temporarily suspended.", "ACCOUNT_SUSPENDED");
  }

  const destUser = await User.findById(destAccount.user);

  const srcBranch = resolveBranch(sourceAccount.branch, sourceAccount.ifscCode);
  const destBranch = resolveBranch(destAccount.branch, destAccount.ifscCode);
  const isInterBranch = srcBranch.code !== destBranch.code;

  const creditReceiptNumber = `${payment.receiptNumber}-CR`;

  const creditRemarks =
    payment.remarks && String(payment.remarks).trim()
      ? `${String(payment.remarks).trim().slice(0, 150)} (from ${sourceAccount.accountNumber} via Card)`
      : isInterBranch
      ? `Inter-branch card transfer from ${sourceAccount.accountNumber} (${srcBranch.name})`
      : `Card transfer from ${sourceAccount.accountNumber} (${srcBranch.name})`;

  const executeSteps = async (session) => {
    const opts = session ? { session } : {};

    // 1. Claim payment record atomically to prevent concurrent double-processing
    const claimed = await Payment.findOneAndUpdate(
      { _id: payment._id, paymentStatus: { $in: ["pending", "failed"] } },
      {
        $set: {
          paymentStatus: "processing",
          paymentMethod: cardInfo,
        },
      },
      { returnDocument: "after", ...opts }
    );

    if (!claimed) return null; // Already processed by concurrent thread

    let debitedSource = false;
    try {
      // 2. Guarded atomic debit on source account (balance check at settlement time)
      const updatedSource = await Account.findOneAndUpdate(
        {
          _id: sourceAccount._id,
          status: "active",
          balance: { $gte: payment.amount },
        },
        { $inc: { balance: -payment.amount } },
        { returnDocument: "after", ...opts }
      );

      if (!updatedSource) {
        throw err(400, "Insufficient available balance in sender account to settle transfer", "INSUFFICIENT_BALANCE");
      }
      debitedSource = true;

      // 3. Atomic credit on destination account
      const updatedDest = await Account.findOneAndUpdate(
        { _id: destAccount._id, status: "active" },
        { $inc: { balance: payment.amount } },
        { returnDocument: "after", ...opts }
      );

      if (!updatedDest) {
        throw err(409, "Beneficiary account is inactive or unable to receive funds", "CREDIT_FAILED");
      }

      const prevSourceBal = round2(updatedSource.balance + payment.amount);
      const newSourceBal = round2(updatedSource.balance);
      const prevDestBal = round2(updatedDest.balance - payment.amount);
      const newDestBal = round2(updatedDest.balance);

      // 4. Mark Payment record as success
      await Payment.updateOne(
        { _id: payment._id },
        {
          $set: {
            paymentStatus: "success",
            completedAt: new Date(),
            balanceAfter: newSourceBal,
          },
          $unset: { failureReason: "" },
        },
        opts
      );

      // 5. Update sender Transaction to completed
      const updatedSenderTxn = await Transaction.findOneAndUpdate(
        { receiptNumber: payment.receiptNumber },
        {
          $set: {
            status: "completed",
            completedAt: new Date(),
            paymentMethod: "CARD",
            previousBalance: prevSourceBal,
            updatedBalance: newSourceBal,
          },
          $unset: { failureReason: "" },
        },
        { returnDocument: "after", ...opts }
      );

      // 6. Create recipient Transaction (credit)
      const [recipientTxn] = await Transaction.create(
        [
          {
            transactionType: "TRANSFER",
            receiptNumber: creditReceiptNumber,
            account: destAccount._id,
            user: destUser?._id || destAccount.user,
            amount: payment.amount,
            currency: payment.currency || TRANSFER_LIMITS.currency,
            previousBalance: prevDestBal,
            updatedBalance: newDestBal,
            paymentMethod: "CARD",
            status: "completed",
            branch: destBranch.name,
            remarks: creditRemarks,
            completedAt: new Date(),
          },
        ],
        opts
      );

      // 7. Post ledger entry for sender
      const senderEntryId = new mongoose.Types.ObjectId();
      await TransactionBucket.postEntry({
        accountId: sourceAccount._id,
        userId: senderUser._id,
        type: "debit",
        amount: payment.amount,
        description: `Sent to ${destUser?.name || "Beneficiary"} (${maskAccountNumber(
          destAccount.accountNumber
        )}) via Stripe - ${destBranch.name}`,
        refType: "Account",
        refId: destAccount._id,
        entryId: senderEntryId,
        session,
        meta: {
          category: "transfer_debit",
          transactionType: "TRANSFER",
          transferType: isInterBranch ? "INTER_BRANCH" : "INTRA_BRANCH",
          paymentMethod: "CARD",
          receiptNumber: payment.receiptNumber,
          transactionId: updatedSenderTxn?._id,
          balanceAfter: newSourceBal,
          previousBalance: prevSourceBal,
          destinationAccountNumber: destAccount.accountNumber,
          destinationBranch: destBranch.name,
          beneficiaryName: destUser?.name || "Beneficiary",
          card: cardInfo,
        },
      });

      // 8. Post ledger entry for beneficiary
      const recipientEntryId = new mongoose.Types.ObjectId();
      await TransactionBucket.postEntry({
        accountId: destAccount._id,
        userId: destUser?._id || destAccount.user,
        type: "credit",
        amount: payment.amount,
        description: `Received from ${senderUser.name} (${maskAccountNumber(
          sourceAccount.accountNumber
        )}) via Stripe - ${srcBranch.name}`,
        refType: "Account",
        refId: sourceAccount._id,
        entryId: recipientEntryId,
        session,
        meta: {
          category: "transfer_credit",
          transactionType: "TRANSFER",
          transferType: isInterBranch ? "INTER_BRANCH" : "INTRA_BRANCH",
          paymentMethod: "CARD",
          receiptNumber: creditReceiptNumber,
          parentReceiptNumber: payment.receiptNumber,
          transactionId: recipientTxn._id,
          balanceAfter: newDestBal,
          previousBalance: prevDestBal,
          sourceAccountNumber: sourceAccount.accountNumber,
          sourceBranch: srcBranch.name,
          senderName: senderUser.name,
          card: cardInfo,
        },
      });

      return {
        claimed,
        updatedSource,
        updatedDest,
        updatedSenderTxn,
        recipientTxn,
      };
    } catch (e) {
      if (!session) {
        if (debitedSource) {
          await Account.updateOne(
            { _id: sourceAccount._id },
            { $inc: { balance: payment.amount } }
          ).catch(() => {});
        }
        await Payment.updateOne(
          { _id: payment._id },
          { $set: { paymentStatus: "failed", failureReason: e.message } }
        ).catch(() => {});
        await Transaction.updateOne(
          { receiptNumber: payment.receiptNumber },
          { $set: { status: "failed", failureReason: e.message } }
        ).catch(() => {});
      }
      throw e;
    }
  };

  const session = await mongoose.startSession().catch(() => null);
  let transferResult;

  if (session) {
    try {
      await session.withTransaction(async () => {
        transferResult = await executeSteps(session);
      });
    } catch (e) {
      if (isNoTransactionSupport(e)) {
        transferResult = await executeSteps(null);
      } else {
        throw e;
      }
    } finally {
      await session.endSession();
    }
  } else {
    transferResult = await executeSteps(null);
  }

  if (!transferResult) {
    const freshReceipt = await getTransferReceiptByNumber(payment.receiptNumber, senderUser);
    return { alreadyProcessed: true, receipt: freshReceipt };
  }

  // Notifications
  try {
    await notifyUser(senderUser._id, {
      type: "transfer",
      title: isInterBranch ? "Inter-Branch Transfer Sent via Card" : "Card Transfer Sent",
      message: `₹${payment.amount.toFixed(2)} sent to ${destUser?.name || "Beneficiary"} (${maskAccountNumber(
        destAccount.accountNumber
      )}) at ${destBranch.name} using Card payment. Ref: ${payment.receiptNumber}.`,
      meta: {
        receiptNumber: payment.receiptNumber,
        amount: payment.amount,
        transferType: isInterBranch ? "INTER_BRANCH" : "INTRA_BRANCH",
        paymentMethod: "CARD",
      },
    });

    await notifyUser(destUser?._id || destAccount.user, {
      type: "transfer",
      title: isInterBranch ? "Inter-Branch Transfer Received" : "Fund Transfer Received",
      message: `₹${payment.amount.toFixed(2)} received from ${senderUser.name} (${maskAccountNumber(
        sourceAccount.accountNumber
      )}) at ${srcBranch.name}. Updated balance: ₹${transferResult.updatedDest.balance.toFixed(2)}. Ref: ${creditReceiptNumber}.`,
      meta: {
        receiptNumber: creditReceiptNumber,
        amount: payment.amount,
        transferType: isInterBranch ? "INTER_BRANCH" : "INTRA_BRANCH",
        paymentMethod: "CARD",
        balanceAfter: transferResult.updatedDest.balance,
      },
    });

    if (payment.amount >= 25000) {
      await notifyAdmins({
        type: "transfer",
        title: "High-Value Transfer Alert",
        message: `High-value transfer of ₹${payment.amount.toLocaleString("en-IN")} completed from ${senderUser.name} to ${destUser?.name || "Beneficiary"}. Ref: ${payment.receiptNumber}.`,
        meta: {
          receiptNumber: payment.receiptNumber,
          amount: payment.amount,
          transferType: isInterBranch ? "INTER_BRANCH" : "INTRA_BRANCH",
        },
      });
    }
  } catch (notifErr) {
    console.error("Card transfer notification error:", notifErr.message);
  }

  const receipt = buildTransferReceipt({
    debitTxn: transferResult.updatedSenderTxn,
    creditTxn: transferResult.recipientTxn,
    sourceAccount: transferResult.updatedSource,
    destAccount: transferResult.updatedDest,
    senderUser,
    destUser,
    securityTier:
      intent.metadata?.securityTier ||
      (payment.amount > TRANSFER_LIMITS.otpThreshold
        ? "Stripe 3D Secure + MPIN + OTP Verified"
        : "Stripe 3D Secure + MPIN Verified"),
    paymentMethod: "CARD",
    cardDetails: cardInfo,
  });

  // Background PDF & email
  generateTransferReceiptPDF(receipt)
    .then(async (pdfBuffer) => {
      if (senderUser.email) {
        await sendTransferReceiptEmail(senderUser.email, receipt, pdfBuffer);
      }
    })
    .catch((err) => {
      console.error("Failed to generate PDF/send card transfer email:", err.message);
    });

  return {
    success: true,
    message: isInterBranch
      ? `Inter-branch card transfer of ₹${payment.amount.toFixed(2)} verified and completed successfully across ${srcBranch.shortName} and ${destBranch.shortName} branches.`
      : `Card transfer of ₹${payment.amount.toFixed(2)} verified and completed successfully.`,
    receipt,
  };
};

/**
 * Webhook handler helper: confirms card transfer from PaymentIntent.
 */
export const confirmStripeTransferFromIntent = async (intent) => {
  const payment = await Payment.findOne({ transactionReference: intent.id, purpose: "transfer" });
  if (!payment) {
    throw err(404, `No transfer payment found for PaymentIntent ${intent.id}`, "TRANSFER_NOT_FOUND");
  }
  return confirmStripeTransfer(payment._id, intent);
};

/**
 * Webhook handler helper: marks card transfer failed from PaymentIntent.
 */
export const markStripeTransferFailed = async (intent, fallbackReason = "Payment failed") => {
  const reason = intent.last_payment_error?.message || fallbackReason;
  const payment = await Payment.findOneAndUpdate(
    { transactionReference: intent.id, purpose: "transfer", paymentStatus: { $ne: "success" } },
    { $set: { paymentStatus: "failed", failureReason: reason } },
    { returnDocument: "after" }
  );

  if (!payment) return null;

  await Transaction.updateOne(
    { receiptNumber: payment.receiptNumber, status: { $ne: "completed" } },
    { $set: { status: "failed", failureReason: reason } }
  ).catch(() => {});

  try {
    await notifyUser(payment.user, {
      type: "transfer",
      title: "Card Transfer Failed",
      message: `Your card transfer of ₹${payment.amount.toFixed(2)} could not be processed (${reason}). No funds were debited or transferred.`,
      meta: { paymentId: payment._id, amount: payment.amount },
    });
  } catch (e) {
    console.error("Card transfer failure notification failed:", e.message);
  }

  return payment;
};

/**
 * Retrieves transfer status and auto-verifies with Stripe if pending.
 */
export const getStripeTransferStatus = async (paymentIntentId, user) => {
  let payment = await Payment.findOne({
    transactionReference: paymentIntentId,
    user: user._id,
    purpose: "transfer",
  });

  if (!payment) {
    throw err(404, "Transfer payment not found", "PAYMENT_NOT_FOUND");
  }

  if (payment.paymentStatus === "pending" || payment.paymentStatus === "failed") {
    try {
      const intent = await paymentGateway.retrievePaymentIntent(paymentIntentId);
      if (intent.status === "succeeded") {
        await confirmStripeTransfer(payment._id, intent);
        payment = await Payment.findById(payment._id);
      }
    } catch (e) {
      if (e.code === "VERIFY_FAILED") {
        console.error(`Transfer verification failed for ${paymentIntentId}: ${e.message}`);
        payment = await Payment.findById(payment._id);
      } else {
        console.warn("Could not verify transfer with Stripe yet:", e.message);
      }
    }
  }

  const receipt = await getTransferReceiptByNumber(payment.receiptNumber, user).catch(() => null);

  return {
    status: payment.paymentStatus,
    receipt,
    failureReason: payment.failureReason || null,
  };
};

export default {
  TRANSFER_LIMITS,
  getTransferConfig,
  validateBeneficiaryAccount,
  requestTransferOTP,
  executeInternalTransfer,
  createStripeTransferIntent,
  confirmStripeTransfer,
  confirmStripeTransferFromIntent,
  markStripeTransferFailed,
  getStripeTransferStatus,
  getTransferReceiptByNumber,
  getTransferReceiptPDFBuffer,
  listTransferHistory,
};
