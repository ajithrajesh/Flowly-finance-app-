import { describe, it } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { getFDWorkerQueue } from "../controllers/depositController.js";
import { getCollectionsOverview, getOverdueLoans } from "../controllers/repaymentController.js";
import { getAllApplications } from "../controllers/loanController.js";
import { listCashWithdrawals } from "../services/cashWithdrawalService.js";
import { listCashDeposits } from "../services/cashDepositService.js";
import FixedDeposit from "../models/FixedDeposit.js";
import LoanApplication from "../models/LoanApplication.js";
import Transaction from "../models/Transaction.js";

describe("Worker UI Backend-Driven Pagination Suite", () => {
  // 1. FD Worker Queue Pagination
  it("FD: should query FixedDeposit with skip/limit and return structured pagination metadata", async () => {
    const origFind = FixedDeposit.find;
    const origCount = FixedDeposit.countDocuments;

    let capturedSkip = null;
    let capturedLimit = null;

    FixedDeposit.find = (filter) => {
      const chain = {
        sort: () => chain,
        skip: (s) => {
          capturedSkip = s;
          return chain;
        },
        limit: (l) => {
          capturedLimit = l;
          return chain;
        },
        populate: () => chain,
        lean: async () => [{ _id: new mongoose.Types.ObjectId(), principalAmount: 50000 }],
      };
      return chain;
    };

    FixedDeposit.countDocuments = async () => 25;

    try {
      let responseBody = null;
      let statusCode = null;
      const req = {
        query: { page: "2", limit: "10", status: "pending" },
      };
      const res = {
        status: (code) => {
          statusCode = code;
          return {
            json: (data) => {
              responseBody = data;
              return data;
            },
          };
        },
      };

      await getFDWorkerQueue(req, res);

      assert.equal(statusCode, 200);
      assert.ok(responseBody);
      assert.equal(capturedSkip, 10, "Skip should be (2-1)*10 = 10");
      assert.equal(capturedLimit, 10, "Limit should be 10");
      assert.equal(responseBody.pagination.total, 25);
      assert.equal(responseBody.pagination.page, 2);
      assert.equal(responseBody.pagination.limit, 10);
      assert.equal(responseBody.pagination.totalPages, 3);
      assert.equal(responseBody.pagination.hasPrevPage, true);
      assert.equal(responseBody.pagination.hasNextPage, true);
    } finally {
      FixedDeposit.find = origFind;
      FixedDeposit.countDocuments = origCount;
    }
  });

  // 2. EMI Collections Overview Pagination
  it("EMI Collections: should return paginated loans and global portfolio stats", async () => {
    const origFind = LoanApplication.find;

    // Create 15 mock loans
    const mockLoans = Array.from({ length: 15 }, (_, i) => ({
      _id: new mongoose.Types.ObjectId(),
      applicationNumber: `LN-${1000 + i}`,
      principal: 100000,
      status: "disbursed",
      repayments: [
        { installmentNo: 1, status: "paid", emiAmount: 5000, paidAmount: 5000 },
        { installmentNo: 2, status: "pending", emiAmount: 5000 },
      ],
      save: async () => {},
      toObject() {
        return this;
      },
    }));

    LoanApplication.find = () => {
      const chain = {
        populate: () => chain,
        sort: () => chain,
        then: (resolve) => resolve(mockLoans),
      };
      // Allow awaiting chain directly
      return chain;
    };

    try {
      let responseBody = null;
      const req = {
        query: { page: "2", limit: "5", status: "all" },
      };
      const res = {
        status: (code) => ({
          json: (data) => {
            responseBody = data;
            return data;
          },
        }),
      };

      await getCollectionsOverview(req, res);

      assert.ok(responseBody);
      assert.equal(responseBody.success, true);
      assert.equal(responseBody.pagination.total, 15);
      assert.equal(responseBody.pagination.page, 2);
      assert.equal(responseBody.pagination.limit, 5);
      assert.equal(responseBody.pagination.totalPages, 3);
      assert.equal(responseBody.loans.length, 5);
      assert.equal(responseBody.pagination.hasPrevPage, true);
      assert.equal(responseBody.pagination.hasNextPage, true);
      assert.ok(responseBody.stats, "Stats must be provided for the portfolio metrics");
    } finally {
      LoanApplication.find = origFind;
    }
  });

  // 3. Loan Processing Pagination
  it("Loan Processing: should query LoanApplication with skip/limit and return total counts", async () => {
    const origFind = LoanApplication.find;
    const origCount = LoanApplication.countDocuments;

    let capturedSkip = null;
    let capturedLimit = null;

    LoanApplication.find = () => {
      const chain = {
        populate: () => chain,
        sort: () => chain,
        skip: (s) => {
          capturedSkip = s;
          return chain;
        },
        limit: (l) => {
          capturedLimit = l;
          return chain;
        },
        lean: async () => [
          { _id: new mongoose.Types.ObjectId(), applicationNumber: "LN-5001" },
          { _id: new mongoose.Types.ObjectId(), applicationNumber: "LN-5002" },
        ],
      };
      return chain;
    };

    LoanApplication.countDocuments = async () => 38;

    try {
      let responseBody = null;
      let statusCode = null;
      const req = {
        query: { page: "3", limit: "10", status: "submitted" },
      };
      const res = {
        status: (code) => {
          statusCode = code;
          return {
            json: (data) => {
              responseBody = data;
              return data;
            },
          };
        },
      };

      await getAllApplications(req, res);

      assert.equal(statusCode, 200);
      assert.equal(capturedSkip, 20, "Skip should be (3-1)*10 = 20");
      assert.equal(capturedLimit, 10, "Limit should be 10");
      assert.equal(responseBody.pagination.total, 38);
      assert.equal(responseBody.pagination.page, 3);
      assert.equal(responseBody.pagination.limit, 10);
      assert.equal(responseBody.pagination.totalPages, 4);
      assert.equal(responseBody.pagination.hasPrevPage, true);
      assert.equal(responseBody.pagination.hasNextPage, true);
    } finally {
      LoanApplication.find = origFind;
      LoanApplication.countDocuments = origCount;
    }
  });

  // 4. Cash Withdrawal Pagination
  it("Cash Withdrawal: should query Transaction with skip/limit and return pagination object", async () => {
    const origFind = Transaction.find;
    const origCount = Transaction.countDocuments;

    let capturedSkip = null;
    let capturedLimit = null;

    Transaction.find = () => {
      const chain = {
        sort: () => chain,
        skip: (s) => {
          capturedSkip = s;
          return chain;
        },
        limit: (l) => {
          capturedLimit = l;
          return chain;
        },
        populate: () => chain,
        then: (resolve) =>
          resolve([
            {
              _id: new mongoose.Types.ObjectId(),
              transactionId: "TXW-100",
              amount: 2500,
              createdAt: new Date(),
              account: { accountNumber: "ACC-12345", accountType: "SAVINGS", branch: "Main" },
              processedBy: { name: "Officer" },
            },
          ]),
      };
      return chain;
    };

    Transaction.countDocuments = async () => 42;

    try {
      const mockUser = { _id: new mongoose.Types.ObjectId(), role: "worker" };
      const result = await listCashWithdrawals({ user: mockUser, page: 2, limit: 10 });

      assert.equal(capturedSkip, 10);
      assert.equal(capturedLimit, 10);
      assert.equal(result.total, 42);
      assert.equal(result.pagination.total, 42);
      assert.equal(result.pagination.page, 2);
      assert.equal(result.pagination.limit, 10);
      assert.equal(result.pagination.totalPages, 5);
      assert.equal(result.pagination.hasPrevPage, true);
      assert.equal(result.pagination.hasNextPage, true);
    } finally {
      Transaction.find = origFind;
      Transaction.countDocuments = origCount;
    }
  });

  // 5. Cash Deposit Pagination
  it("Cash Deposit: should query Transaction with skip/limit and return pagination object", async () => {
    const origFind = Transaction.find;
    const origCount = Transaction.countDocuments;

    let capturedSkip = null;
    let capturedLimit = null;

    Transaction.find = () => {
      const chain = {
        sort: () => chain,
        skip: (s) => {
          capturedSkip = s;
          return chain;
        },
        limit: (l) => {
          capturedLimit = l;
          return chain;
        },
        populate: () => chain,
        then: (resolve) =>
          resolve([
            {
              _id: new mongoose.Types.ObjectId(),
              transactionId: "TXD-200",
              amount: 5000,
              createdAt: new Date(),
              account: { accountNumber: "ACC-67890", accountType: "SAVINGS", branch: "Main" },
              processedBy: { name: "Officer" },
            },
          ]),
      };
      return chain;
    };

    Transaction.countDocuments = async () => 50;

    try {
      const mockUser = { _id: new mongoose.Types.ObjectId(), role: "worker" };
      const result = await listCashDeposits({ user: mockUser, page: 3, limit: 10 });

      assert.equal(capturedSkip, 20);
      assert.equal(capturedLimit, 10);
      assert.equal(result.total, 50);
      assert.equal(result.pagination.total, 50);
      assert.equal(result.pagination.page, 3);
      assert.equal(result.pagination.limit, 10);
      assert.equal(result.pagination.totalPages, 5);
      assert.equal(result.pagination.hasPrevPage, true);
      assert.equal(result.pagination.hasNextPage, true);
    } finally {
      Transaction.find = origFind;
      Transaction.countDocuments = origCount;
    }
  });
});
