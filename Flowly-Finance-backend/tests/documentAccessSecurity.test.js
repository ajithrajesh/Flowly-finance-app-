process.env.NODE_ENV = "test";
import { describe, it, before, after, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import User from "../models/User.js";
import Document from "../models/Document.js";
import KYC from "../models/KYC.js";
import LoanApplication from "../models/LoanApplication.js";
import FixedDeposit from "../models/FixedDeposit.js";
import { protect } from "../middleware/authMiddleware.js";
import {
  serveSecureDocument,
  verifyCustomerDocumentOwnership,
} from "../controllers/documentController.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadsDir = path.resolve(__dirname, "..", "uploads");

// Helper to create a mock response object
function createMockRes() {
  let statusCode = 200;
  let responseData = null;
  const headers = {};
  let sentFilePath = null;

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
    setHeader: (name, value) => {
      headers[name.toLowerCase()] = value;
    },
    getHeader: (name) => headers[name.toLowerCase()],
    sendFile: (targetPath, cb) => {
      sentFilePath = targetPath;
      if (typeof cb === "function") cb(null);
      return res;
    },
    headersSent: false,
  };

  return {
    res,
    getStatus: () => statusCode,
    getData: () => responseData,
    getHeaders: () => headers,
    getSentFilePath: () => sentFilePath,
  };
}

describe("Document Access Security & Role-Based Authorization", () => {
  const TEST_STRONG_SECRET = "flowly_super_secure_test_jwt_secret_minimum_32_characters_12345";
  process.env.JWT_SECRET = process.env.JWT_SECRET || TEST_STRONG_SECRET;
  const JWT_SECRET = process.env.JWT_SECRET;

  const customerAId = new mongoose.Types.ObjectId();
  const customerBId = new mongoose.Types.ObjectId();
  const workerId = new mongoose.Types.ObjectId();
  const adminId = new mongoose.Types.ObjectId();

  const customerAUser = {
    _id: customerAId,
    name: "Customer A",
    email: "customera@example.com",
    role: "customer",
    status: "active",
  };

  const customerBUser = {
    _id: customerBId,
    name: "Customer B",
    email: "customerb@example.com",
    role: "customer",
    status: "active",
  };

  const workerUser = {
    _id: workerId,
    name: "Worker Alice",
    email: "worker@flowly.bank",
    role: "worker",
    status: "active",
  };

  const adminUser = {
    _id: adminId,
    name: "Admin Bob",
    email: "admin@flowly.bank",
    role: "admin",
    status: "active",
  };

  const tokenCustomerA = jwt.sign({ id: customerAId.toString(), role: "customer" }, JWT_SECRET, {
    expiresIn: "1h",
  });
  const tokenCustomerB = jwt.sign({ id: customerBId.toString(), role: "customer" }, JWT_SECRET, {
    expiresIn: "1h",
  });
  const tokenWorker = jwt.sign({ id: workerId.toString(), role: "worker" }, JWT_SECRET, {
    expiresIn: "1h",
  });
  const tokenAdmin = jwt.sign({ id: adminId.toString(), role: "admin" }, JWT_SECRET, {
    expiresIn: "1h",
  });

  // Ensure test uploads directory exists and create dummy test files
  const testDocCustomerA = `doc-${customerAId}-pan-test.pdf`;
  const testDocCustomerB = `doc-${customerBId}-aadhaar-test.pdf`;
  const testSampleDoc = `test-sample-doc.pdf`;

  before(() => {
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }
    fs.writeFileSync(path.join(uploadsDir, testDocCustomerA), "Customer A PAN content");
    fs.writeFileSync(path.join(uploadsDir, testDocCustomerB), "Customer B Aadhaar content");
    fs.writeFileSync(path.join(uploadsDir, testSampleDoc), "Sample PDF content");
  });

  after(() => {
    // Cleanup test files
    try {
      if (fs.existsSync(path.join(uploadsDir, testDocCustomerA))) {
        fs.unlinkSync(path.join(uploadsDir, testDocCustomerA));
      }
      if (fs.existsSync(path.join(uploadsDir, testDocCustomerB))) {
        fs.unlinkSync(path.join(uploadsDir, testDocCustomerB));
      }
      if (fs.existsSync(path.join(uploadsDir, testSampleDoc))) {
        fs.unlinkSync(path.join(uploadsDir, testSampleDoc));
      }
    } catch {}
  });

  // Mock models for protect middleware and ownership checks
  let originalUserFindById;
  let originalDocFindOne;
  let originalKycFindOne;
  let originalLoanFindOne;
  let originalFdFindOne;

  beforeEach(() => {
    originalUserFindById = User.findById;
    originalDocFindOne = Document.findOne;
    originalKycFindOne = KYC.findOne;
    originalLoanFindOne = LoanApplication.findOne;
    originalFdFindOne = FixedDeposit.findOne;

    User.findById = (id) => ({
      select: () => {
        const idStr = id ? id.toString() : "";
        if (idStr === customerAId.toString()) return Promise.resolve(customerAUser);
        if (idStr === customerBId.toString()) return Promise.resolve(customerBUser);
        if (idStr === workerId.toString()) return Promise.resolve(workerUser);
        if (idStr === adminId.toString()) return Promise.resolve(adminUser);
        return Promise.resolve(null);
      },
    });

    Document.findOne = () => ({ select: () => ({ lean: () => Promise.resolve(null) }) });
    KYC.findOne = () => ({ select: () => ({ lean: () => Promise.resolve(null) }) });
    LoanApplication.findOne = () => ({ select: () => ({ lean: () => Promise.resolve(null) }) });
    FixedDeposit.findOne = () => ({ select: () => ({ lean: () => Promise.resolve(null) }) });
  });

  afterEach(() => {
    User.findById = originalUserFindById;
    Document.findOne = originalDocFindOne;
    KYC.findOne = originalKycFindOne;
    LoanApplication.findOne = originalLoanFindOne;
    FixedDeposit.findOne = originalFdFindOne;
  });

  // =========================================================================
  // 1. Unauthenticated Requests (401)
  // =========================================================================
  describe("Authentication Enforcement on Document Access", () => {
    it("UNAUTHENTICATED: Request without any token must be rejected with 401", async () => {
      const { res, getStatus, getData } = createMockRes();
      const req = {
        headers: {},
        query: {},
        params: { filename: testDocCustomerA },
      };

      let nextCalled = false;
      await protect(req, res, () => {
        nextCalled = true;
      });

      assert.strictEqual(nextCalled, false, "next() must not be called without a token");
      assert.strictEqual(getStatus(), 401);
      assert.match(getData()?.message || "", /Access denied|No token provided/i);
    });

    it("UNAUTHENTICATED: Request with invalid/tampered token must be rejected with 401", async () => {
      const { res, getStatus, getData } = createMockRes();
      const req = {
        headers: { authorization: "Bearer invalid.jwt.signature" },
        query: {},
        params: { filename: testDocCustomerA },
      };

      let nextCalled = false;
      await protect(req, res, () => {
        nextCalled = true;
      });

      assert.strictEqual(nextCalled, false);
      assert.strictEqual(getStatus(), 401);
      assert.match(getData()?.message || "", /Invalid or expired token/i);
    });

    it("AUTHENTICATION: Query token authentication works for browser <img>/<iframe>/downloads", async () => {
      const { res } = createMockRes();
      const req = {
        headers: {},
        query: { token: tokenCustomerA },
        params: { filename: testDocCustomerA },
      };

      let nextCalled = false;
      await protect(req, res, () => {
        nextCalled = true;
      });

      assert.strictEqual(nextCalled, true, "next() must be called with valid ?token= query parameter");
      assert.strictEqual(req.user._id.toString(), customerAId.toString());
      assert.strictEqual(req.user.role, "customer");
    });
  });

  // =========================================================================
  // 2. Ownership Verification & IDOR Protection (403)
  // =========================================================================
  describe("Customer Ownership Verification (IDOR Protection)", () => {
    it("IDOR ATTACK: Customer A attempting to access Customer B's document must be rejected with 403 Forbidden", async () => {
      // Mock DB: Document/KYC/Loan records belong to Customer B, not Customer A
      const originalDocFindOne = Document.findOne;
      const originalKycFindOne = KYC.findOne;
      const originalLoanFindOne = LoanApplication.findOne;
      const originalFdFindOne = FixedDeposit.findOne;

      Document.findOne = () => ({ select: () => ({ lean: () => Promise.resolve(null) }) });
      KYC.findOne = () => ({ select: () => ({ lean: () => Promise.resolve(null) }) });
      LoanApplication.findOne = () => ({ select: () => ({ lean: () => Promise.resolve(null) }) });
      FixedDeposit.findOne = () => ({ select: () => ({ lean: () => Promise.resolve(null) }) });

      const { res, getStatus, getData } = createMockRes();
      const req = {
        user: customerAUser,
        params: { filename: testDocCustomerB },
        query: {},
      };

      await serveSecureDocument(req, res);

      Document.findOne = originalDocFindOne;
      KYC.findOne = originalKycFindOne;
      LoanApplication.findOne = originalLoanFindOne;
      FixedDeposit.findOne = originalFdFindOne;

      assert.strictEqual(getStatus(), 403);
      assert.strictEqual(getData()?.success, false);
      assert.strictEqual(getData()?.code, "UNAUTHORIZED_DOCUMENT_ACCESS");
      assert.match(getData()?.message || "", /Access denied.*permission/i);
    });

    it("LEGITIMATE CUSTOMER: Customer A accessing their own document succeeds with 200", async () => {
      const { res, getStatus, getSentFilePath, getHeaders } = createMockRes();
      const req = {
        user: customerAUser,
        params: { filename: testDocCustomerA },
        query: {},
      };

      await serveSecureDocument(req, res);

      assert.strictEqual(getStatus(), 200);
      assert.strictEqual(getSentFilePath(), path.resolve(uploadsDir, testDocCustomerA));
      assert.strictEqual(getHeaders()["x-content-type-options"], "nosniff");
      assert.match(getHeaders()["content-disposition"], /inline/i);
    });

    it("OWNERSHIP VIA KYC RECORD: Customer A accessing document registered in their KYC record succeeds", async () => {
      const originalKycFindOne = KYC.findOne;
      KYC.findOne = (query) => {
        if (query.user?.toString() === customerAId.toString()) {
          return { select: () => ({ lean: () => Promise.resolve({ _id: new mongoose.Types.ObjectId() }) }) };
        }
        return { select: () => ({ lean: () => Promise.resolve(null) }) };
      };

      const { res, getStatus, getSentFilePath } = createMockRes();
      const req = {
        user: customerAUser,
        params: { filename: testSampleDoc },
        query: {},
      };

      await serveSecureDocument(req, res);

      KYC.findOne = originalKycFindOne;

      assert.strictEqual(getStatus(), 200);
      assert.strictEqual(getSentFilePath(), path.resolve(uploadsDir, testSampleDoc));
    });

    it("OWNERSHIP VIA LOAN APPLICATION: Customer A accessing document registered in loan succeeds", async () => {
      const originalLoanFindOne = LoanApplication.findOne;
      LoanApplication.findOne = (query) => {
        if (query.user?.toString() === customerAId.toString()) {
          return { select: () => ({ lean: () => Promise.resolve({ _id: new mongoose.Types.ObjectId() }) }) };
        }
        return { select: () => ({ lean: () => Promise.resolve(null) }) };
      };

      const { res, getStatus, getSentFilePath } = createMockRes();
      const req = {
        user: customerAUser,
        params: { filename: testSampleDoc },
        query: {},
      };

      await serveSecureDocument(req, res);

      LoanApplication.findOne = originalLoanFindOne;

      assert.strictEqual(getStatus(), 200);
      assert.strictEqual(getSentFilePath(), path.resolve(uploadsDir, testSampleDoc));
    });
  });

  // =========================================================================
  // 3. Role-Based Authorization for Bank Staff (Worker / Admin)
  // =========================================================================
  describe("Role-Based Staff Access (Worker & Admin Review)", () => {
    it("STAFF ACCESS: Bank worker can view any customer document for KYC verification", async () => {
      const { res, getStatus, getSentFilePath } = createMockRes();
      const req = {
        user: workerUser,
        params: { filename: testDocCustomerB },
        query: {},
      };

      await serveSecureDocument(req, res);

      assert.strictEqual(getStatus(), 200);
      assert.strictEqual(getSentFilePath(), path.resolve(uploadsDir, testDocCustomerB));
    });

    it("STAFF ACCESS: Bank admin can view any customer document for audit/review", async () => {
      const { res, getStatus, getSentFilePath } = createMockRes();
      const req = {
        user: adminUser,
        params: { filename: testDocCustomerA },
        query: {},
      };

      await serveSecureDocument(req, res);

      assert.strictEqual(getStatus(), 200);
      assert.strictEqual(getSentFilePath(), path.resolve(uploadsDir, testDocCustomerA));
    });
  });

  // =========================================================================
  // 4. Path Traversal & Missing File Protections
  // =========================================================================
  describe("Path Traversal & Not Found Protections", () => {
    it("PATH TRAVERSAL: Relative path traversal attempts are rejected with 400 or 403", async () => {
      const { res, getStatus, getData } = createMockRes();
      const req = {
        user: customerAUser,
        params: { filename: "../../server.js" },
        query: {},
      };

      await serveSecureDocument(req, res);

      assert.ok(getStatus() === 400 || getStatus() === 403);
      assert.strictEqual(getData()?.success, false);
    });

    it("MISSING FILE: Authorized request for non-existent file returns 404", async () => {
      const { res, getStatus, getData } = createMockRes();
      const req = {
        user: workerUser,
        params: { filename: "non-existent-file-12345.pdf" },
        query: {},
      };

      await serveSecureDocument(req, res);

      assert.strictEqual(getStatus(), 404);
      assert.strictEqual(getData()?.success, false);
      assert.match(getData()?.message || "", /not found on storage server/i);
    });

    it("DOWNLOAD DISPOSITION: ?download=true sets Content-Disposition attachment", async () => {
      const { res, getStatus, getHeaders } = createMockRes();
      const req = {
        user: customerAUser,
        params: { filename: testDocCustomerA },
        query: { download: "true" },
      };

      await serveSecureDocument(req, res);

      assert.strictEqual(getStatus(), 200);
      assert.match(getHeaders()["content-disposition"], /attachment/i);
    });
  });
});
