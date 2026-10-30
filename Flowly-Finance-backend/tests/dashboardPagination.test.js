import { describe, it } from "node:test";
import assert from "node:assert/strict";
import CustomerDashboardService from "../services/customerDashboardService.js";
import CustomerDashboardController from "../controllers/customerDashboardController.js";
import Account from "../models/Account.js";
import TransactionBucket from "../models/TransactionBucket.js";
import mongoose from "mongoose";

describe("Customer Dashboard Recent Account Ledger Pagination", () => {
  it("should calculate pagination metadata correctly with MongoDB aggregation facet format", async () => {
    const fakeUserId = new mongoose.Types.ObjectId();
    const fakeAccountId = new mongoose.Types.ObjectId();

    // Mock Account.find
    const originalAccountFind = Account.find;
    Account.find = () => ({
      select: () => ({
        lean: async () => [{ _id: fakeAccountId }],
      }),
    });

    // Mock TransactionBucket.aggregate
    const originalAggregate = TransactionBucket.aggregate;
    let capturedPipeline = null;
    TransactionBucket.aggregate = async (pipeline) => {
      capturedPipeline = pipeline;
      return [
        {
          metadata: [{ total: 17 }],
          data: [
            {
              _id: new mongoose.Types.ObjectId(),
              type: "credit",
              amount: 5000,
              date: new Date(),
              description: "Cash Deposit",
              refType: "deposit",
              refId: new mongoose.Types.ObjectId(),
              meta: { category: "cash_deposit", receiptNumber: "FLWCD-12345" },
            },
          ],
        },
      ];
    };

    try {
      // Test page 2 with limit 5
      const result = await CustomerDashboardService.getRecentTransactions(fakeUserId, { page: 2, limit: 5 });

      assert.ok(result, "Result should be defined");
      assert.ok(Array.isArray(result.transactions), "transactions should be an array");
      assert.equal(result.transactions.length, 1);
      assert.equal(result.pagination.total, 17);
      assert.equal(result.pagination.page, 2);
      assert.equal(result.pagination.limit, 5);
      assert.equal(result.pagination.totalPages, 4);
      assert.equal(result.pagination.hasNextPage, true);
      assert.equal(result.pagination.hasPrevPage, true);

      // Verify the MongoDB pipeline used $facet with $skip and $limit
      assert.ok(capturedPipeline, "Pipeline should be captured");
      const facetStage = capturedPipeline.find((s) => s.$facet);
      assert.ok(facetStage, "Pipeline must contain $facet stage for pagination");
      assert.deepEqual(facetStage.$facet.metadata, [{ $count: "total" }]);

      const skipStage = facetStage.$facet.data.find((s) => s.$skip !== undefined);
      const limitStage = facetStage.$facet.data.find((s) => s.$limit !== undefined);

      assert.equal(skipStage.$skip, 5, "Skip stage must skip (page - 1) * limit = (2 - 1) * 5 = 5");
      assert.equal(limitStage.$limit, 5, "Limit stage must be 5 records per page");
    } finally {
      Account.find = originalAccountFind;
      TransactionBucket.aggregate = originalAggregate;
    }
  });

  it("should handle boundary conditions: page 1 (hasPrevPage: false) and last page (hasNextPage: false)", async () => {
    const fakeUserId = new mongoose.Types.ObjectId();
    const fakeAccountId = new mongoose.Types.ObjectId();

    const originalAccountFind = Account.find;
    Account.find = () => ({
      select: () => ({
        lean: async () => [{ _id: fakeAccountId }],
      }),
    });

    const originalAggregate = TransactionBucket.aggregate;
    TransactionBucket.aggregate = async () => [
      {
        metadata: [{ total: 10 }],
        data: [],
      },
    ];

    try {
      // Page 1 of 2
      const page1 = await CustomerDashboardService.getRecentTransactions(fakeUserId, { page: 1, limit: 5 });
      assert.equal(page1.pagination.page, 1);
      assert.equal(page1.pagination.hasPrevPage, false);
      assert.equal(page1.pagination.hasNextPage, true);

      // Page 2 of 2
      const page2 = await CustomerDashboardService.getRecentTransactions(fakeUserId, { page: 2, limit: 5 });
      assert.equal(page2.pagination.page, 2);
      assert.equal(page2.pagination.hasPrevPage, true);
      assert.equal(page2.pagination.hasNextPage, false);
    } finally {
      Account.find = originalAccountFind;
      TransactionBucket.aggregate = originalAggregate;
    }
  });

  it("should handle empty ledger with total: 0 and totalPages: 0", async () => {
    const fakeUserId = new mongoose.Types.ObjectId();

    const originalAccountFind = Account.find;
    Account.find = () => ({
      select: () => ({
        lean: async () => [],
      }),
    });

    const originalAggregate = TransactionBucket.aggregate;
    TransactionBucket.aggregate = async () => [
      {
        metadata: [],
        data: [],
      },
    ];

    try {
      const result = await CustomerDashboardService.getRecentTransactions(fakeUserId, { page: 1, limit: 5 });
      assert.equal(result.pagination.total, 0);
      assert.equal(result.pagination.totalPages, 0);
      assert.equal(result.pagination.hasNextPage, false);
      assert.equal(result.pagination.hasPrevPage, false);
      assert.deepEqual(result.transactions, []);
    } finally {
      Account.find = originalAccountFind;
      TransactionBucket.aggregate = originalAggregate;
    }
  });

  it("should parse query params and return structured pagination in CustomerDashboardController.getRecentTransactions", async () => {
    const fakeUserId = new mongoose.Types.ObjectId();
    const fakeAccountId = new mongoose.Types.ObjectId();

    const originalAccountFind = Account.find;
    Account.find = () => ({
      select: () => ({
        lean: async () => [{ _id: fakeAccountId }],
      }),
    });

    const originalAggregate = TransactionBucket.aggregate;
    TransactionBucket.aggregate = async () => [
      {
        metadata: [{ total: 12 }],
        data: [],
      },
    ];

    try {
      const req = {
        user: { id: fakeUserId },
        query: { page: "3", limit: "5" },
      };

      let responseStatusCode = null;
      let responseBody = null;
      const res = {
        status: (code) => {
          responseStatusCode = code;
          return {
            json: (body) => {
              responseBody = body;
              return body;
            },
          };
        },
      };

      await CustomerDashboardController.getRecentTransactions(req, res);

      assert.equal(responseStatusCode, 200);
      assert.equal(responseBody.success, true);
      assert.ok(responseBody.pagination);
      assert.equal(responseBody.pagination.page, 3);
      assert.equal(responseBody.pagination.limit, 5);
      assert.equal(responseBody.pagination.total, 12);
      assert.equal(responseBody.pagination.totalPages, 3);
      assert.equal(responseBody.pagination.hasPrevPage, true);
      assert.equal(responseBody.pagination.hasNextPage, false);
    } finally {
      Account.find = originalAccountFind;
      TransactionBucket.aggregate = originalAggregate;
    }
  });
});
