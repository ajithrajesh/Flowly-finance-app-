import { describe, it } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import Transaction from "../models/Transaction.js";
import Payment from "../models/Payment.js";
import Account from "../models/Account.js";
import User from "../models/User.js";
import Notification from "../models/Notification.js";
import SupportTicket from "../models/SupportTicket.js";
import { reportTransfer } from "../controllers/transferController.js";

// Helper to mock response object
function createMockRes() {
  let statusCode = 200;
  let responseData = null;
  const res = {
    status: (code) => {
      statusCode = code;
      return {
        json: (data) => {
          responseData = data;
          return data;
        },
      };
    },
    json: (data) => {
      responseData = data;
      return data;
    },
  };
  return {
    res,
    getStatus: () => statusCode,
    getData: () => responseData,
  };
}

describe("Transfer Report Security & Ownership Verification", () => {
  // Prevent unhandled db calls during unit tests
  Notification.findOne = async () => null;
  Notification.create = async () => ({});
  Notification.insertMany = async () => [];
  Notification.countDocuments = async () => 0;
  Notification.find = () => ({ sort: () => ({ limit: async () => [] }) });
  Notification.findOneAndUpdate = async () => ({});

  const customerAId = new mongoose.Types.ObjectId();
  const customerBId = new mongoose.Types.ObjectId();
  const accountAId = new mongoose.Types.ObjectId();
  const accountBId = new mongoose.Types.ObjectId();

  it("SECURITY: Customer A attempting to report transfer belonging to Customer B must be rejected (403)", async () => {
    const originalTxnFind = Transaction.find;
    const originalTxnUpdateMany = Transaction.updateMany;
    const originalPaymentFind = Payment.find;
    const originalAccountFindOne = Account.findOne;
    const originalTicketCreate = SupportTicket.create;

    let transactionUpdated = false;
    let ticketCreated = false;

    // Customer B's transaction
    Transaction.find = async () => [
      {
        _id: new mongoose.Types.ObjectId(),
        receiptNumber: "FLWTR-20261027-B999",
        user: customerBId, // Belongs to Customer B
        account: accountBId,
        status: "completed",
      },
    ];
    Transaction.updateMany = async () => {
      transactionUpdated = true;
      return { modifiedCount: 1 };
    };

    Payment.find = async () => [
      {
        _id: new mongoose.Types.ObjectId(),
        receiptNumber: "FLWTR-20261027-B999",
        user: customerBId,
        account: accountBId,
        paymentStatus: "success",
      },
    ];

    Account.findOne = async () => ({
      _id: accountAId,
      user: customerAId,
      status: "active",
      save: async function () { return this; },
    });

    SupportTicket.create = async () => {
      ticketCreated = true;
      return { _id: new mongoose.Types.ObjectId(), ticketNumber: "TKT-000001" };
    };

    try {
      const req = {
        user: { _id: customerAId, name: "Customer A", role: "customer" },
        body: {
          receiptNumber: "FLWTR-20261027-B999",
          reason: "Not my transfer!",
        },
      };

      const { res, getStatus, getData } = createMockRes();
      await reportTransfer(req, res);

      assert.equal(getStatus(), 403, "Cross-customer receipt report must return HTTP 403");
      assert.equal(getData().success, false);
      assert.equal(getData().code, "RECEIPT_NOT_OWNED");
      assert.match(getData().message, /does not belong to your account/i);
      assert.equal(transactionUpdated, false, "Customer B's transaction must NOT be updated");
      assert.equal(ticketCreated, false, "Support ticket must NOT be created");
    } finally {
      Transaction.find = originalTxnFind;
      Transaction.updateMany = originalTxnUpdateMany;
      Payment.find = originalPaymentFind;
      Account.findOne = originalAccountFindOne;
      SupportTicket.create = originalTicketCreate;
    }
  });

  it("SECURITY: Customer A passing notificationId belonging to Customer B must be rejected (404)", async () => {
    const originalNotifFindOne = Notification.findOne;
    // Notification not found for customer A
    Notification.findOne = async () => null;

    try {
      const req = {
        user: { _id: customerAId, name: "Customer A", role: "customer" },
        body: {
          notificationId: new mongoose.Types.ObjectId().toString(),
          reason: "Suspicious",
        },
      };

      const { res, getStatus, getData } = createMockRes();
      await reportTransfer(req, res);

      assert.equal(getStatus(), 404, "Notification not owned by customer must return HTTP 404");
      assert.equal(getData().success, false);
      assert.equal(getData().code, "NOTIFICATION_NOT_FOUND");
    } finally {
      Notification.findOne = originalNotifFindOne;
    }
  });

  it("VALIDATION: Missing both receiptNumber and notificationId must return HTTP 400", async () => {
    const req = {
      user: { _id: customerAId, name: "Customer A", role: "customer" },
      body: {},
    };

    const { res, getStatus, getData } = createMockRes();
    await reportTransfer(req, res);

    assert.equal(getStatus(), 400, "Missing receipt or notification ID must return 400");
    assert.equal(getData().success, false);
    assert.equal(getData().code, "REPORT_PARAM_REQUIRED");
  });

  it("NOT FOUND: Reporting non-existent receipt with no transaction, payment, or notification returns 404", async () => {
    const originalTxnFind = Transaction.find;
    const originalPaymentFind = Payment.find;
    const originalNotifFindOne = Notification.findOne;
    const originalAccountFindOne = Account.findOne;

    Transaction.find = async () => [];
    Payment.find = async () => [];
    Notification.findOne = async () => null;
    Account.findOne = async () => ({ _id: accountAId, user: customerAId, status: "active" });

    try {
      const req = {
        user: { _id: customerAId, name: "Customer A", role: "customer" },
        body: { receiptNumber: "FLWTR-NONEXISTENT-999" },
      };

      const { res, getStatus, getData } = createMockRes();
      await reportTransfer(req, res);

      assert.equal(getStatus(), 404, "Non-existent receipt must return 404");
      assert.equal(getData().success, false);
      assert.equal(getData().code, "RECEIPT_NOT_FOUND");
    } finally {
      Transaction.find = originalTxnFind;
      Payment.find = originalPaymentFind;
      Notification.findOne = originalNotifFindOne;
      Account.findOne = originalAccountFindOne;
    }
  });

  it("STATUS VALIDATION: Transfer already in 'reported' status must be rejected (400)", async () => {
    const originalTxnFind = Transaction.find;
    const originalPaymentFind = Payment.find;
    const originalAccountFindOne = Account.findOne;
    const originalTicketCreate = SupportTicket.create;

    let ticketCreated = false;

    // Transaction owned by Customer A, but already in 'reported' status
    Transaction.find = async () => [
      {
        _id: new mongoose.Types.ObjectId(),
        receiptNumber: "FLWTR-20261027-A100",
        user: customerAId,
        account: accountAId,
        status: "reported", // Already reported
      },
    ];
    Payment.find = async () => [];
    Account.findOne = async () => ({ _id: accountAId, user: customerAId, status: "suspended" });
    SupportTicket.create = async () => {
      ticketCreated = true;
      return { _id: new mongoose.Types.ObjectId() };
    };

    try {
      const req = {
        user: { _id: customerAId, name: "Customer A", role: "customer" },
        body: { receiptNumber: "FLWTR-20261027-A100" },
      };

      const { res, getStatus, getData } = createMockRes();
      await reportTransfer(req, res);

      assert.equal(getStatus(), 400, "Already reported transfer must return 400");
      assert.equal(getData().success, false);
      assert.equal(getData().code, "ALREADY_REPORTED");
      assert.match(getData().message, /already been reported/i);
      assert.equal(ticketCreated, false, "Must not create duplicate support ticket");
    } finally {
      Transaction.find = originalTxnFind;
      Payment.find = originalPaymentFind;
      Account.findOne = originalAccountFindOne;
      SupportTicket.create = originalTicketCreate;
    }
  });

  it("STATUS VALIDATION: Transfer already in 'resolved' status must be rejected (400)", async () => {
    const originalTxnFind = Transaction.find;
    const originalPaymentFind = Payment.find;
    const originalAccountFindOne = Account.findOne;

    Transaction.find = async () => [
      {
        _id: new mongoose.Types.ObjectId(),
        receiptNumber: "FLWTR-20261027-A100",
        user: customerAId,
        account: accountAId,
        status: "resolved", // Already resolved by staff
      },
    ];
    Payment.find = async () => [];
    Account.findOne = async () => ({ _id: accountAId, user: customerAId, status: "active" });

    try {
      const req = {
        user: { _id: customerAId, name: "Customer A", role: "customer" },
        body: { receiptNumber: "FLWTR-20261027-A100" },
      };

      const { res, getStatus, getData } = createMockRes();
      await reportTransfer(req, res);

      assert.equal(getStatus(), 400, "Already resolved transfer must return 400");
      assert.equal(getData().success, false);
      assert.equal(getData().code, "ALREADY_RESOLVED");
      assert.match(getData().message, /already been resolved/i);
    } finally {
      Transaction.find = originalTxnFind;
      Payment.find = originalPaymentFind;
      Account.findOne = originalAccountFindOne;
    }
  });

  it("POSITIVE: Authorized customer reporting their own transfer succeeds, updates status, and suspends account", async () => {
    const originalTxnFind = Transaction.find;
    const originalTxnUpdateMany = Transaction.updateMany;
    const originalPaymentFind = Payment.find;
    const originalPaymentUpdateMany = Payment.updateMany;
    const originalAccountFindOne = Account.findOne;
    const originalUserFindById = User.findById;
    const originalUserFindByIdAndUpdate = User.findByIdAndUpdate;
    const originalTicketCreate = SupportTicket.create;
    const originalTicketCount = SupportTicket.countDocuments;
    const originalTicketExists = SupportTicket.exists;
    const originalNotifFindOne = User.find;

    let transactionUpdatedWith = null;
    let paymentUpdatedWith = null;
    let accountSuspended = false;
    let userSuspended = false;
    let ticketCreated = null;

    User.findById = () => ({ select: () => ({ lean: async () => ({ role: "customer" }) }) });
    const mockSupportStaff = Array.from({ length: 4 }, (_, i) => ({
      _id: new mongoose.Types.ObjectId(),
      name: `Support Officer ${i + 1}`,
      role: "support",
      workerRole: "support",
      status: "active",
      rotationOrder: i + 1,
    }));
    User.find = () => ({
      select: () => ({
        sort: () => ({ lean: async () => mockSupportStaff }),
        lean: async () => mockSupportStaff,
      }),
    });

    Transaction.find = async () => [
      {
        _id: new mongoose.Types.ObjectId(),
        receiptNumber: "FLWTR-20261027-OWNED",
        user: customerAId, // Owned by Customer A!
        account: accountAId,
        status: "completed",
      },
      {
        _id: new mongoose.Types.ObjectId(),
        receiptNumber: "FLWTR-20261027-OWNED-CR",
        user: customerBId,
        account: accountBId,
        status: "completed",
      },
    ];

    Transaction.updateMany = async (filter, update) => {
      transactionUpdatedWith = update.$set;
      return { modifiedCount: 2 };
    };

    Payment.find = async () => [
      {
        _id: new mongoose.Types.ObjectId(),
        receiptNumber: "FLWTR-20261027-OWNED",
        user: customerAId, // Owned by Customer A
        paymentStatus: "success",
      },
    ];

    Payment.updateMany = async (filter, update) => {
      paymentUpdatedWith = update.$set;
      return { modifiedCount: 1 };
    };

    const mockAccount = {
      _id: accountAId,
      user: customerAId,
      status: "active",
      suspensionReason: null,
      save: async function () {
        accountSuspended = this.status === "suspended";
        return this;
      },
    };
    Account.findOne = async () => mockAccount;

    User.findByIdAndUpdate = async (id, update) => {
      if (String(id) === String(customerAId) && update.$set?.status === "suspended") {
        userSuspended = true;
      }
      return {};
    };

    SupportTicket.countDocuments = async () => 10;
    SupportTicket.exists = async () => false;
    SupportTicket.create = async (doc) => {
      ticketCreated = doc;
      return { _id: new mongoose.Types.ObjectId(), ticketNumber: doc.ticketNumber };
    };

    User.find = () => ({ select: () => ({ lean: async () => [] }) });

    try {
      const req = {
        user: { _id: customerAId, name: "Customer A", role: "customer" },
        body: {
          receiptNumber: "FLWTR-20261027-OWNED",
          reason: "Did not recognize this card transfer",
        },
      };

      const { res, getStatus, getData } = createMockRes();
      await reportTransfer(req, res);

      assert.equal(getStatus(), 200, "Valid report must return HTTP 200");
      assert.equal(getData().success, true);
      assert.equal(getData().transactionStatus, "reported");
      assert.equal(getData().accountStatus, "suspended");
      assert.ok(getData().ticket?.ticketNumber, "Ticket number must be returned");

      assert.equal(transactionUpdatedWith?.status, "reported");
      assert.equal(paymentUpdatedWith?.paymentStatus, "reported");
      assert.equal(accountSuspended, true, "Customer account must be marked suspended");
      assert.equal(mockAccount.suspensionReason, "Account temporarily suspended.");
      assert.equal(userSuspended, true, "User status must be marked suspended");
      assert.ok(ticketCreated, "Support ticket must be created");
      assert.equal(ticketCreated.user, customerAId);
    } finally {
      Transaction.find = originalTxnFind;
      Transaction.updateMany = originalTxnUpdateMany;
      Payment.find = originalPaymentFind;
      Payment.updateMany = originalPaymentUpdateMany;
      Account.findOne = originalAccountFindOne;
      User.findById = originalUserFindById;
      User.findByIdAndUpdate = originalUserFindByIdAndUpdate;
      SupportTicket.create = originalTicketCreate;
      SupportTicket.countDocuments = originalTicketCount;
      SupportTicket.exists = originalTicketExists;
      User.find = originalNotifFindOne;
    }
  });
});
