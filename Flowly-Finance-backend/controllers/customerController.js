import mongoose from "mongoose";
import User from "../models/User.js";
import Account from "../models/Account.js";
import Transaction from "../models/Transaction.js";
import Payment from "../models/Payment.js";
import SupportTicket from "../models/SupportTicket.js";
import { notifyUser } from "../services/notificationService.js";

/**
 * @desc    Get all customers (paginated, searchable, filterable)
 * @route   GET /api/customers
 * @access  Private (worker, admin)
 *
 * Query params:
 *   page        - page number (default 1)
 *   limit       - records per page (default 10, max 100)
 *   search      - matches name / email / phone (case-insensitive)
 *   kycStatus   - pending | under_verification | verified | rejected
 *   status      - active | inactive | blocked
 *   sortBy      - createdAt | name | email | kycStatus (default createdAt)
 *   order       - asc | desc (default desc)
 */
export const getCustomers = async (req, res) => {
  try {
    const {
      search = "",
      kycStatus,
      status,
      sortBy = "createdAt",
      order = "desc",
    } = req.query;

    // ---------- Pagination ----------
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 100);
    const skip = (page - 1) * limit;

    // ---------- Filters ----------
    const filter = { role: "customer" };

    const allowedKycStatus = [
      "pending",
      "under_verification",
      "verified",
      "rejected",
    ];
    if (kycStatus) {
      if (!allowedKycStatus.includes(kycStatus)) {
        return res.status(400).json({
          message: `Invalid kycStatus. Allowed values: ${allowedKycStatus.join(", ")}`,
        });
      }
      filter.kycStatus = kycStatus;
    }

    const allowedStatus = ["active", "inactive", "blocked"];
    if (status) {
      if (!allowedStatus.includes(status)) {
        return res.status(400).json({
          message: `Invalid status. Allowed values: ${allowedStatus.join(", ")}`,
        });
      }
      filter.status = status;
    }

    const trimmedSearch = String(search).trim();
    if (trimmedSearch) {
      // Escape regex special characters so user input can't break the query
      const safe = trimmedSearch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regex = new RegExp(safe, "i");
      filter.$or = [{ name: regex }, { email: regex }, { phone: regex }];
    }

    // ---------- Sorting ----------
    const allowedSortFields = ["createdAt", "name", "email", "kycStatus", "status"];
    const sortField = allowedSortFields.includes(sortBy) ? sortBy : "createdAt";
    const sortOrder = order === "asc" ? 1 : -1;

    // ---------- Query ----------
    const [customers, total] = await Promise.all([
      User.find(filter)
        .select("name email phone role kycStatus status address isEmailVerified createdAt updatedAt")
        .sort({ [sortField]: sortOrder })
        .skip(skip)
        .limit(limit)
        .lean(),
      User.countDocuments(filter),
    ]);

    // ---------- Attach account summary (single extra query) ----------
    const customerIds = customers.map((c) => c._id);
    const accounts = await Account.find({ user: { $in: customerIds } })
      .select("user accountNumber accountType balance status")
      .lean();

    const accountMap = new Map();
    accounts.forEach((acc) => {
      accountMap.set(String(acc.user), {
        accountNumber: acc.accountNumber,
        accountType: acc.accountType,
        balance: acc.balance,
        status: acc.status,
      });
    });

    const data = customers.map((c) => ({
      ...c,
      account: accountMap.get(String(c._id)) || null,
    }));

    const totalPages = Math.ceil(total / limit) || 0;

    return res.status(200).json({
      message: "Customers fetched successfully",
      count: data.length,
      pagination: {
        total,
        page,
        limit,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
      customers: data,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to fetch customers",
      error: error.message,
    });
  }
};

/**
 * @desc    Get a single customer by id
 * @route   GET /api/customers/:id
 * @access  Private (worker, admin)
 */
export const getCustomerById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid customer id" });
    }

    const customer = await User.findOne({ _id: id, role: "customer" })
      .select("-password -mpinHash")
      .lean();

    if (!customer) {
      return res.status(404).json({ message: "Customer not found" });
    }

    const account = await Account.findOne({ user: id })
      .select("accountNumber accountType balance status branch ifscCode")
      .lean();

    return res.status(200).json({
      message: "Customer fetched successfully",
      customer: { ...customer, account: account || null },
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to fetch customer",
      error: error.message,
    });
  }
};

/**
 * @desc    Worker re-enables transactions for a suspended customer account
 * @route   PATCH /api/customers/:id/re-enable-transactions
 * @access  Private (worker, admin only)
 */
export const reEnableTransactions = async (req, res) => {
  try {
    const { id } = req.params;
    const { resolutionNotes } = req.body;
    const notes =
      (resolutionNotes && String(resolutionNotes).trim()) ||
      "Transactions re-enabled by authorized bank worker.";

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid customer id" });
    }

    const customer = await User.findById(id);
    if (!customer || customer.role !== "customer") {
      return res.status(404).json({ message: "Customer not found" });
    }

    // 1. Activate Account and User
    const account = await Account.findOne({ user: id });
    if (account) {
      account.status = "active";
      account.suspensionReason = null;
      await account.save();
    }

    customer.status = "active";
    await customer.save();

    // 2. Resolve any reported transactions
    await Transaction.updateMany(
      { user: id, status: "reported" },
      {
        $set: {
          status: "resolved",
          resolvedAt: new Date(),
          resolvedBy: req.user._id,
          remarks: `[RESOLVED by ${req.user.name}] ${notes}`.slice(0, 250),
        },
      }
    );

    await Payment.updateMany(
      { user: id, paymentStatus: "reported" },
      {
        $set: {
          paymentStatus: "resolved",
        },
      }
    );

    // 3. Mark related open support tickets as resolved
    await SupportTicket.updateMany(
      { user: id, status: { $in: ["open", "in_progress"] }, subject: /\[REPORT\]/i },
      {
        $set: {
          status: "resolved",
          resolvedAt: new Date(),
        },
        $push: {
          messages: {
            sender: req.user._id,
            senderRole: req.user.role || "worker",
            message: `[RESOLVED] Issue investigated and resolved by worker ${req.user.name}. Customer account active and transactions re-enabled. Notes: ${notes}`,
            sentAt: new Date(),
          },
        },
      }
    );

    // 4. Notify customer
    await notifyUser(id, {
      type: "account",
      title: "Account & Transactions Re-enabled",
      message: `A bank worker (${req.user.name}) has resolved the issue. Your account is now active and transactions have been safely re-enabled.`,
      meta: {
        accountStatus: "active",
        transactionStatus: "resolved",
      },
    });

    return res.status(200).json({
      success: true,
      message: "Customer transactions successfully re-enabled and account restored to active status.",
      customer: {
        _id: customer._id,
        name: customer.name,
        status: customer.status,
      },
      account: account
        ? {
            _id: account._id,
            accountNumber: account.accountNumber,
            status: account.status,
          }
        : null,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to re-enable transactions",
      error: error.message,
    });
  }
};

export const reenableCustomerTransactions = reEnableTransactions;

