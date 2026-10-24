import mongoose from "mongoose";
import User from "../models/User.js";
import Account from "../models/Account.js";
import TransactionBucket from "../models/TransactionBucket.js";
import Transaction from "../models/Transaction.js";
import MonthlyStatement from "../models/MonthlyStatement.js";
import Notification from "../models/Notification.js";
import { generateStatementPDF } from "../utils/statementPdfGenerator.js";
import { sendMonthlyStatementEmail } from "../utils/mailer.js";

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

export const maskAccountNumber = (n = "") => {
  const s = String(n || "");
  return s.length > 4 ? `${"X".repeat(Math.max(s.length - 4, 3))}${s.slice(-4)}` : s;
};

/**
 * Calculates previous month's start, end, periodKey ("YYYY-MM") and formatted name.
 * e.g., if referenceDate is in November 2026, returns October 2026 (2026-10).
 *
 * @param {Date} [referenceDate=new Date()]
 * @returns {{ startDate: Date, endDate: Date, periodKey: string, monthName: string, year: number, month: number }}
 */
export function getPreviousMonthRange(referenceDate = new Date()) {
  const ref = new Date(referenceDate);
  const currentYear = ref.getFullYear();
  const currentMonth = ref.getMonth(); // 0-indexed: 0 = Jan, 11 = Dec

  const prevMonthIndex = currentMonth === 0 ? 11 : currentMonth - 1;
  const prevYear = currentMonth === 0 ? currentYear - 1 : currentYear;

  const startDate = new Date(prevYear, prevMonthIndex, 1, 0, 0, 0, 0);
  const endDate = new Date(currentYear, currentMonth, 0, 23, 59, 59, 999);

  const monthString = String(prevMonthIndex + 1).padStart(2, "0");
  const periodKey = `${prevYear}-${monthString}`;
  const monthName = startDate.toLocaleString("en-IN", { month: "long", year: "numeric" });

  return {
    startDate,
    endDate,
    periodKey,
    monthName,
    year: prevYear,
    month: prevMonthIndex + 1,
  };
}

/**
 * Calculates start and end date range for a specific "YYYY-MM" periodKey.
 *
 * @param {string} periodKey - e.g. "2026-10"
 * @returns {{ startDate: Date, endDate: Date, periodKey: string, monthName: string, year: number, month: number }}
 */
export function getMonthRangeFromPeriodKey(periodKey) {
  if (!periodKey || !/^\d{4}-\d{2}$/.test(periodKey)) {
    throw new Error(`Invalid periodKey format '${periodKey}'. Expected 'YYYY-MM' (e.g. '2026-10')`);
  }

  const [yearStr, monthStr] = periodKey.split("-");
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10); // 1-indexed

  const startDate = new Date(year, month - 1, 1, 0, 0, 0, 0);
  const endDate = new Date(year, month, 0, 23, 59, 59, 999);
  const monthName = startDate.toLocaleString("en-IN", { month: "long", year: "numeric" });

  return {
    startDate,
    endDate,
    periodKey,
    monthName,
    year,
    month,
  };
}

/**
 * Returns range for all-time statement encompassing all existing transactions.
 */
export function getAllTimeRange() {
  const now = new Date();
  return {
    startDate: new Date(0),
    endDate: now,
    periodKey: "ALL",
    monthName: "All Recorded Transactions (Complete Account History)",
    isAllTime: true,
  };
}

/**
 * Checks if a transaction type is considered a credit/incoming funds.
 */
const isCreditType = (type) => {
  const t = String(type || "").toLowerCase();
  return ["credit", "deposit", "online_deposit", "cash_deposit", "interest_credit", "fd_closure", "fd_maturity"].includes(t);
};

/**
 * Formats raw transaction types into clean, human-readable labels.
 */
export const formatTransactionType = (raw) => {
  const t = String(raw || "").toUpperCase().replace(/[\s-]+/g, "_");
  switch (t) {
    case "CASH_DEPOSIT":
      return "CASH DEPOSIT";
    case "ONLINE_DEPOSIT":
    case "DEPOSIT":
      return "ONLINE DEPOSIT";
    case "WITHDRAWAL":
    case "CASH_WITHDRAWAL":
      return "WITHDRAWAL";
    case "TRANSFER":
    case "TRANSFER_DEBIT":
    case "TRANSFER_CREDIT":
      return "TRANSFER";
    case "FD_CREATION":
      return "FD CREATION";
    case "FD_CLOSURE":
      return "FD CLOSURE";
    case "FD_MATURITY":
      return "FD MATURITY";
    case "LOAN_DISBURSEMENT":
    case "LOAN_DISBURSED":
      return "LOAN DISBURSED";
    case "EMI_REPAYMENT":
    case "EMI_PAYMENT":
    case "EMI":
      return "EMI REPAYMENT";
    case "INTEREST_CREDIT":
      return "INTEREST CREDIT";
    case "CREDIT":
      return "CREDIT";
    case "DEBIT":
      return "DEBIT";
    default:
      return t.replace(/_/g, " ") || "TRANSACTION";
  }
};

/**
 * Gathers and compiles all data for an account's statement for a given period or all-time.
 *
 * @param {string|ObjectId} accountId
 * @param {Object} [periodRange] - { startDate, endDate, periodKey, monthName, isAllTime }
 * @returns {Promise<Object>} Formatted statement data ready for PDF and email
 */
export async function compileStatementData(accountId, periodRange = {}) {
  const account = await Account.findById(accountId).populate("user").lean();
  if (!account) {
    throw new Error(`Account not found for ID: ${accountId}`);
  }

  const user = account.user || {};
  if (!user._id) {
    throw new Error(`Linked user not found for Account ID: ${accountId}`);
  }

  const isAllTime = Boolean(
    periodRange.isAllTime ||
    periodRange.periodKey === "ALL" ||
    !periodRange.startDate
  );

  const now = new Date();
  const startDate = isAllTime
    ? (account.createdAt ? new Date(account.createdAt) : new Date(0))
    : periodRange.startDate;
  const endDate = isAllTime ? now : (periodRange.endDate || now);
  const periodKey = isAllTime ? "ALL" : (periodRange.periodKey || "ALL");
  const monthName = isAllTime
    ? "All Recorded Transactions (Complete Account History)"
    : (periodRange.monthName || "Monthly Statement");

  // 1. Fetch TransactionBucket documents
  const buckets = await TransactionBucket.find({
    account: account._id,
  }).lean();

  // 2. Fetch standalone / relational Transaction records (all statuses)
  const standaloneTxns = await Transaction.find({
    account: account._id,
  }).lean();

  // Collect all entries across all buckets
  const allBucketEntries = [];
  buckets.forEach((b) => {
    (b.entries || []).forEach((entry) => {
      allBucketEntries.push({
        ...entry,
        bucketPeriodKey: b.periodKey,
      });
    });
  });

  // Calculate movements that occurred AFTER endDate (to discount from current balance if bounded)
  let futureCredits = 0;
  let futureDebits = 0;

  if (!isAllTime) {
    allBucketEntries.forEach((entry) => {
      const entryDate = new Date(entry.postedAt || entry.createdAt);
      if (entryDate > endDate) {
        if (isCreditType(entry.type)) {
          futureCredits += Number(entry.amount || 0);
        } else {
          futureDebits += Number(entry.amount || 0);
        }
      }
    });
  }

  let closingBalance = isAllTime
    ? round2(account.balance || 0)
    : round2((account.balance || 0) - futureCredits + futureDebits);

  // Collect entries within the target period
  const periodEntries = [];
  const seenReceipts = new Set();
  const seenEntryIds = new Set();

  allBucketEntries.forEach((entry) => {
    const entryDate = new Date(entry.postedAt || entry.createdAt);
    const inPeriod = isAllTime || (entryDate >= startDate && entryDate <= endDate) || entry.bucketPeriodKey === periodKey;

    if (inPeriod) {
      const receiptNo = entry.meta?.receiptNumber || null;
      if (receiptNo) seenReceipts.add(receiptNo);
      if (entry._id) seenEntryIds.add(String(entry._id));

      const rawType = entry.meta?.transactionType || entry.type;
      const formattedType = formatTransactionType(rawType);
      const isCred = isCreditType(entry.type);

      periodEntries.push({
        id: entry._id,
        date: entry.postedAt || entry.createdAt || startDate,
        description: entry.description || "Account Transaction",
        receiptNumber:
          receiptNo ||
          (entry.refId
            ? `REF-${String(entry.refId).slice(-8).toUpperCase()}`
            : `REF-${String(entry._id).slice(-8).toUpperCase()}`),
        refType: entry.refType,
        refId: entry.refId ? String(entry.refId) : null,
        type: formattedType,
        isCredit: isCred,
        amount: Number(entry.amount || 0),
        status: (entry.meta?.status || "completed").toUpperCase(),
        meta: entry.meta || {},
        balanceAfterRecorded: entry.meta?.balanceAfter ?? null,
      });
    }
  });

  // Merge standalone transactions if any were not in TransactionBucket
  standaloneTxns.forEach((st) => {
    const stDate = new Date(st.completedAt || st.createdAt);
    const inPeriod = isAllTime || (stDate >= startDate && stDate <= endDate);

    if (inPeriod) {
      if (!seenReceipts.has(st.receiptNumber) && (!st.ledgerEntryId || !seenEntryIds.has(String(st.ledgerEntryId)))) {
        const isCred =
          isCreditType(st.transactionType) ||
          (st.updatedBalance != null && st.previousBalance != null && st.updatedBalance > st.previousBalance);

        const formattedType = formatTransactionType(st.transactionType);

        periodEntries.push({
          id: st._id,
          date: stDate,
          description: st.remarks || `${formattedType} at ${st.branch || "Branch"}`,
          receiptNumber: st.receiptNumber || `REF-${String(st._id).slice(-8).toUpperCase()}`,
          refType: "Transaction",
          refId: String(st._id),
          type: formattedType,
          isCredit: isCred,
          amount: Number(st.amount || 0),
          status: (st.status || "completed").toUpperCase(),
          meta: {
            paymentMethod: st.paymentMethod,
            branch: st.branch,
          },
          balanceAfterRecorded: st.updatedBalance ?? null,
        });
      }
    }
  });

  // Sort transactions chronologically ascending
  periodEntries.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  // Calculate Total Credits and Total Debits for the period
  let totalCredits = 0;
  let creditCount = 0;
  let totalDebits = 0;
  let debitCount = 0;

  periodEntries.forEach((txn) => {
    if (txn.isCredit) {
      totalCredits += txn.amount;
      creditCount++;
    } else {
      totalDebits += txn.amount;
      debitCount++;
    }
  });

  totalCredits = round2(totalCredits);
  totalDebits = round2(totalDebits);

  let openingBalance = round2(closingBalance - totalCredits + totalDebits);

  if (openingBalance < 0 || isNaN(openingBalance)) {
    if (periodEntries.length > 0 && periodEntries[0].balanceAfterRecorded != null) {
      const firstTxn = periodEntries[0];
      openingBalance = round2(
        firstTxn.isCredit
          ? firstTxn.balanceAfterRecorded - firstTxn.amount
          : firstTxn.balanceAfterRecorded + firstTxn.amount
      );
    } else {
      openingBalance = 0;
    }
    closingBalance = round2(openingBalance + totalCredits - totalDebits);
  }

  // Calculate running balance for each line item
  let runningBalance = openingBalance;
  const processedTransactions = periodEntries.map((txn) => {
    if (txn.isCredit) {
      runningBalance = round2(runningBalance + txn.amount);
    } else {
      runningBalance = round2(runningBalance - txn.amount);
    }

    const finalBal = txn.balanceAfterRecorded != null ? round2(txn.balanceAfterRecorded) : runningBalance;

    return {
      date: txn.date,
      description: txn.description,
      receiptNumber: txn.receiptNumber,
      type: txn.type,
      status: txn.status || "COMPLETED",
      isCredit: txn.isCredit,
      amount: txn.amount,
      balance: finalBal,
    };
  });

  const netChange = round2(totalCredits - totalDebits);
  const statementId = `FLWSTM-${periodKey.replace("-", "")}-${account.accountNumber}`;

  return {
    customer: {
      id: user._id,
      name: user.name || "Customer",
      email: user.email || "-",
      phone: user.phone || "-",
      address:
        user.address ||
        (user.contactDetails?.address ? `${user.contactDetails.address}` : "Registered Branch Address, Kerala, India"),
      kycStatus: user.kycStatus || "verified",
      cifNumber: `CIF-${String(user._id).slice(-8).toUpperCase()}`,
    },
    account: {
      id: account._id,
      accountNumber: account.accountNumber,
      maskedAccountNumber: maskAccountNumber(account.accountNumber),
      accountType:
        account.accountType === "savings"
          ? "Savings Account"
          : account.accountType === "current"
          ? "Current Account"
          : account.accountType || "Savings Account",
      branch: account.branch || "Kochi Main Branch",
      ifscCode: account.ifscCode || "FLOW0001001",
      micrCode: "682001005",
      currency: "INR (₹)",
      status: (account.status || "active").toUpperCase(),
      currentBalance: round2(account.balance || 0),
    },
    statement: {
      statementId,
      periodKey,
      monthName,
      startDate: isAllTime && processedTransactions.length > 0 ? processedTransactions[0].date : startDate,
      endDate: isAllTime ? now : endDate,
      generatedAt: now,
      isAllTime,
    },
    financials: {
      openingBalance,
      closingBalance,
      totalCredits,
      creditCount,
      totalDebits,
      debitCount,
      netChange,
      transactionCount: processedTransactions.length,
    },
    transactions: processedTransactions,
  };
}

/**
 * Generates statement data, compiles PDF, sends email, and records in database for a single account.
 *
 * @param {Object} account - Account document or Account ID
 * @param {Object} periodRange - { startDate, endDate, periodKey, monthName }
 * @param {Object} [options]
 * @param {boolean} [options.sendEmail=true]
 * @param {boolean} [options.force=false]
 * @returns {Promise<Object>} Execution result
 */
export async function processAccountMonthlyStatement(account, periodRange, options = {}) {
  const { sendEmail = true, force = false } = options;
  const accountId = account._id || account;

  const targetAccount = await Account.findById(accountId).populate("user");
  if (!targetAccount) {
    throw new Error(`Account not found: ${accountId}`);
  }

  const user = targetAccount.user;
  if (!user || !user.email) {
    throw new Error(`Account ${targetAccount.accountNumber} has no registered email`);
  }

  const { periodKey, monthName } = periodRange;

  // Idempotency check: don't duplicate if already sent, unless force=true
  if (!force) {
    const existing = await MonthlyStatement.findOne({
      account: targetAccount._id,
      periodKey,
      status: "sent",
    });
    if (existing) {
      return {
        skipped: true,
        reason: "Statement already sent for this period",
        accountNumber: targetAccount.accountNumber,
        periodKey,
        existingStatementId: existing._id,
      };
    }
  }

  // 1. Compile Statement Data
  const statementData = await compileStatementData(targetAccount._id, periodRange);

  // 2. Generate PDF Buffer
  const pdfBuffer = await generateStatementPDF(statementData);

  // 3. Send Email if requested
  let emailResult = { success: true };
  if (sendEmail) {
    emailResult = await sendMonthlyStatementEmail(user.email, statementData, pdfBuffer);

    // 4. Send in-app notification to customer
    try {
      await Notification.create({
        user: user._id,
        type: "system",
        title: `Monthly Bank Statement - ${monthName}`,
        message: `Your monthly account statement for ${monthName} (Account ending in ${statementData.account.maskedAccountNumber}) has been generated and sent to ${user.email}. Closing Balance: ₹${statementData.financials.closingBalance.toLocaleString("en-IN")}.`,
        meta: {
          category: "monthly_statement",
          periodKey,
          accountId: targetAccount._id,
          closingBalance: statementData.financials.closingBalance,
          statementId: statementData.statement.statementId,
        },
      });
    } catch (notifErr) {
      console.warn(`[Statement Notification] Could not create in-app notification: ${notifErr.message}`);
    }
  }

  // 5. Save or update MonthlyStatement record
  const statementRecord = await MonthlyStatement.findOneAndUpdate(
    { account: targetAccount._id, periodKey },
    {
      $set: {
        user: user._id,
        account: targetAccount._id,
        accountNumber: targetAccount.accountNumber,
        periodKey,
        monthName,
        startDate: periodRange.startDate,
        endDate: periodRange.endDate,
        openingBalance: statementData.financials.openingBalance,
        closingBalance: statementData.financials.closingBalance,
        totalCredits: statementData.financials.totalCredits,
        creditCount: statementData.financials.creditCount,
        totalDebits: statementData.financials.totalDebits,
        debitCount: statementData.financials.debitCount,
        netChange: statementData.financials.netChange,
        transactionCount: statementData.financials.transactionCount,
        emailSentTo: user.email,
        status: emailResult.success ? "sent" : "failed",
        failureReason: emailResult.error || null,
        sentAt: sendEmail && emailResult.success ? new Date() : null,
      },
    },
    { upsert: true, new: true }
  );

  return {
    success: true,
    accountNumber: targetAccount.accountNumber,
    customerName: user.name,
    customerEmail: user.email,
    periodKey,
    monthName,
    closingBalance: statementData.financials.closingBalance,
    transactionCount: statementData.financials.transactionCount,
    statementRecordId: statementRecord._id,
    pdfBuffer,
    statementData,
  };
}

/**
 * Iterates through all active customer accounts and generates + emails previous-month statements.
 *
 * @param {Object} [options]
 * @param {Date} [options.referenceDate] - Defaults to new Date()
 * @param {string} [options.periodKey] - Optional override, e.g. "2026-09"
 * @param {boolean} [options.sendEmail=true]
 * @param {boolean} [options.force=false]
 * @param {string|ObjectId} [options.accountId] - Filter to single account
 * @param {string|ObjectId} [options.userId] - Filter to single user
 * @returns {Promise<Object>} Summary of batch processing
 */
export async function generateAndEmailAllMonthlyStatements(options = {}) {
  const {
    referenceDate = new Date(),
    periodKey: customPeriodKey,
    sendEmail = true,
    force = false,
    accountId,
    userId,
  } = options;

  const periodRange = customPeriodKey
    ? getMonthRangeFromPeriodKey(customPeriodKey)
    : getPreviousMonthRange(referenceDate);

  console.log(
    `[StatementService] Starting Monthly Bank Statements generation for period: ${periodRange.monthName} (${periodRange.periodKey})`
  );

  // Build account query: active accounts with customers
  const query = { status: "active" };
  if (accountId) query._id = accountId;
  if (userId) query.user = userId;

  const accounts = await Account.find(query).populate("user").lean();

  // Filter accounts where user is customer role (or has valid email)
  const validAccounts = accounts.filter(
    (acc) => acc.user && acc.user.email && (acc.user.role === "customer" || !acc.user.role || acc.user.role === "user")
  );

  console.log(`[StatementService] Found ${validAccounts.length} eligible account(s) to process.`);

  let processedCount = 0;
  let sentCount = 0;
  let skippedCount = 0;
  let failedCount = 0;
  const errors = [];
  const results = [];

  for (const acc of validAccounts) {
    try {
      const res = await processAccountMonthlyStatement(acc, periodRange, { sendEmail, force });

      if (res.skipped) {
        skippedCount++;
        console.log(`[-] Skipped A/C ${acc.accountNumber}: ${res.reason}`);
      } else {
        sentCount++;
        console.log(
          `[+] Processed & Emailed statement for A/C ${acc.accountNumber} (${acc.user?.name} - ${acc.user?.email}) - Closing Bal: ₹${res.closingBalance}`
        );
      }
      processedCount++;
      results.push({
        accountNumber: acc.accountNumber,
        email: acc.user?.email,
        status: res.skipped ? "skipped" : "sent",
        closingBalance: res.closingBalance,
      });
    } catch (err) {
      failedCount++;
      errors.push({
        accountNumber: acc.accountNumber,
        email: acc.user?.email,
        error: err.message,
      });
      console.error(`[!] Failed for A/C ${acc.accountNumber}:`, err.message);
    }
  }

  const summary = {
    periodKey: periodRange.periodKey,
    monthName: periodRange.monthName,
    dateRange: `${periodRange.startDate.toISOString().slice(0, 10)} to ${periodRange.endDate.toISOString().slice(0, 10)}`,
    totalEligible: validAccounts.length,
    processedCount,
    sentCount,
    skippedCount,
    failedCount,
    errors,
    results,
  };

  console.log(
    `[StatementService] Completed Monthly Statements batch. Sent: ${sentCount}, Skipped: ${skippedCount}, Failed: ${failedCount}`
  );

  return summary;
}

export default {
  getPreviousMonthRange,
  getMonthRangeFromPeriodKey,
  getAllTimeRange,
  formatTransactionType,
  compileStatementData,
  processAccountMonthlyStatement,
  generateAndEmailAllMonthlyStatements,
};
