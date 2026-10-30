import { describe, it } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import User from "../models/User.js";
import Notification from "../models/Notification.js";
import { registerWorker, loginWorker } from "../controllers/authController.js";
import { createWorkerAccount, updateWorkerStatus } from "../controllers/adminController.js";
import { authorize } from "../middleware/authMiddleware.js";

// Mock notification creation to prevent db buffer timeout in unit tests
Notification.create = async () => ({});
Notification.insertMany = async () => [];
Notification.countDocuments = async () => 0;
Notification.find = () => ({ sort: () => ({ limit: async () => [] }) });
Notification.findOneAndUpdate = async () => ({});

// Helper to mock mockable response object
function createMockRes() {
  let statusCode = null;
  let body = null;
  const res = {
    status: (code) => {
      statusCode = code;
      return {
        json: (data) => {
          body = data;
          return data;
        },
      };
    },
  };
  return {
    res,
    getStatus: () => statusCode,
    getBody: () => body,
  };
}

describe("Worker Registration Security & Role/Status Access Control", () => {
  // =========================================================================
  // NEGATIVE AUTHORIZATION TESTS: registerWorker
  // =========================================================================

  it("NEGATIVE AUTH: Public / unauthenticated user attempting to call registerWorker with role 'admin' must be rejected (403)", async () => {
    const originalFindOne = User.findOne;
    User.findOne = async () => null;

    try {
      const req = {
        user: null, // Public / unauthenticated
        body: {
          name: "Attacker",
          email: "attacker@flowly.fake",
          phone: "9998887771",
          password: "password123",
          role: "admin",
        },
      };

      const { res, getStatus, getBody } = createMockRes();
      await registerWorker(req, res);

      assert.equal(getStatus(), 403, "Public role escalation to 'admin' must return HTTP 403");
      assert.equal(getBody().success, false);
      assert.match(getBody().message, /Administrator access is required/i);
    } finally {
      User.findOne = originalFindOne;
    }
  });

  it("NEGATIVE AUTH: Public / unauthenticated user attempting to call registerWorker with role 'support' must be rejected (403)", async () => {
    const originalFindOne = User.findOne;
    User.findOne = async () => null;

    try {
      const req = {
        user: null,
        body: {
          name: "Support Attacker",
          email: "support_hacker@flowly.fake",
          phone: "9998887772",
          password: "password123",
          role: "support",
        },
      };

      const { res, getStatus, getBody } = createMockRes();
      await registerWorker(req, res);

      assert.equal(getStatus(), 403, "Public role escalation to 'support' must return HTTP 403");
      assert.equal(getBody().success, false);
      assert.match(getBody().message, /Administrator access is required/i);
    } finally {
      User.findOne = originalFindOne;
    }
  });

  it("NEGATIVE AUTH: Public / unauthenticated user attempting to register as 'worker' must be rejected (403)", async () => {
    const originalFindOne = User.findOne;
    User.findOne = async () => null;

    try {
      const req = {
        user: null, // Public user
        body: {
          name: "Public Worker Applicant",
          email: "applicant@flowly.fake",
          phone: "9998887773",
          password: "password123",
          role: "worker",
        },
      };

      const { res, getStatus, getBody } = createMockRes();
      await registerWorker(req, res);

      assert.equal(getStatus(), 403, "Public worker creation must be rejected with HTTP 403");
      assert.equal(getBody().success, false);
      assert.match(getBody().message, /Administrator access is required to register or create worker accounts/i);
    } finally {
      User.findOne = originalFindOne;
    }
  });

  it("NEGATIVE AUTH: Authenticated regular worker attempting to call registerWorker must be rejected (403)", async () => {
    try {
      const req = {
        user: { role: "worker", name: "Worker Bob" },
        body: {
          name: "Worker Friend",
          email: "friend@flowly.fake",
          phone: "9998887774",
          password: "password123",
          role: "worker",
        },
      };

      const { res, getStatus, getBody } = createMockRes();
      await registerWorker(req, res);

      assert.equal(getStatus(), 403, "Worker calling registerWorker must return HTTP 403");
      assert.equal(getBody().success, false);
      assert.match(getBody().message, /Administrator access is required to register or create worker accounts/i);
    } finally {
      // no cleanup needed
    }
  });

  it("NEGATIVE AUTH: Authenticated customer attempting to call registerWorker must be rejected (403)", async () => {
    try {
      const req = {
        user: { role: "customer", name: "Customer Alice" },
        body: {
          name: "Infiltrator",
          email: "infiltrator@flowly.fake",
          phone: "9998887775",
          password: "password123",
          role: "worker",
        },
      };

      const { res, getStatus, getBody } = createMockRes();
      await registerWorker(req, res);

      assert.equal(getStatus(), 403, "Customer calling registerWorker must return HTTP 403");
      assert.equal(getBody().success, false);
      assert.match(getBody().message, /Administrator access is required/i);
    } finally {
      // no cleanup needed
    }
  });

  // =========================================================================
  // BACKEND ROLE & STATUS VALIDATION: registerWorker
  // =========================================================================

  it("ROLE VALIDATION: registerWorker specifying invalid or arbitrary role must be rejected (400)", async () => {
    const originalFindOne = User.findOne;
    User.findOne = async () => null;

    try {
      const req = {
        user: { role: "admin", name: "Admin" },
        body: {
          name: "Bad Role User",
          email: "badrole@flowly.fake",
          phone: "9998887776",
          password: "password123",
          role: "superadmin_hacker",
        },
      };

      const { res, getStatus, getBody } = createMockRes();
      await registerWorker(req, res);

      assert.equal(getStatus(), 400, "Unknown role must be rejected with HTTP 400");
      assert.equal(getBody().success, false);
      assert.match(getBody().message, /Invalid role specified/i);
    } finally {
      User.findOne = originalFindOne;
    }
  });

  it("ROLE VALIDATION: registerWorker specifying invalid workerRole must be rejected (400)", async () => {
    try {
      const req = {
        user: { role: "admin", name: "Admin" },
        body: {
          name: "Bad SubRole User",
          email: "badsubrole@flowly.fake",
          phone: "9998887777",
          password: "password123",
          role: "worker",
          workerRole: "executive_director",
        },
      };

      const { res, getStatus, getBody } = createMockRes();
      await registerWorker(req, res);

      assert.equal(getStatus(), 400, "Unknown workerRole must be rejected with HTTP 400");
      assert.equal(getBody().success, false);
      assert.match(getBody().message, /Invalid workerRole specified/i);
    } finally {
      // no cleanup needed
    }
  });

  it("STATUS VALIDATION: registerWorker specifying invalid status must be rejected (400)", async () => {
    try {
      const req = {
        user: { role: "admin", name: "Admin" },
        body: {
          name: "Bad Status User",
          email: "badstatus@flowly.fake",
          phone: "9998887778",
          password: "password123",
          role: "worker",
          status: "destroyed_or_corrupt",
        },
      };

      const { res, getStatus, getBody } = createMockRes();
      await registerWorker(req, res);

      assert.equal(getStatus(), 400, "Unknown status must be rejected with HTTP 400");
      assert.equal(getBody().success, false);
      assert.match(getBody().message, /Invalid status specified/i);
    } finally {
      // no cleanup needed
    }
  });

  // =========================================================================
  // NEGATIVE AUTHORIZATION TESTS: createWorkerAccount (adminController)
  // =========================================================================

  it("NEGATIVE AUTH: Public / unauthenticated user attempting createWorkerAccount must be rejected (403)", async () => {
    const req = {
      user: null,
      body: {
        name: "Anonymous Caller",
        email: "anon@flowly.fake",
        phone: "9998887779",
        password: "password123",
        role: "worker",
      },
    };

    const { res, getStatus, getBody } = createMockRes();
    await createWorkerAccount(req, res);

    assert.equal(getStatus(), 403, "Public caller to createWorkerAccount must return HTTP 403");
    assert.equal(getBody().success, false);
    assert.match(getBody().message, /Administrator access is required/i);
  });

  it("NEGATIVE AUTH: Non-admin staff (worker) attempting createWorkerAccount with role 'worker' must be rejected (403)", async () => {
    const req = {
      user: { role: "worker", name: "Regular Worker" },
      body: {
        name: "Second Worker",
        email: "second@flowly.fake",
        phone: "9998887780",
        password: "password123",
        role: "worker",
      },
    };

    const { res, getStatus, getBody } = createMockRes();
    await createWorkerAccount(req, res);

    assert.equal(getStatus(), 403, "Non-admin creating worker account must return HTTP 403");
    assert.equal(getBody().success, false);
    assert.match(getBody().message, /Administrator access is required/i);
  });

  it("NEGATIVE AUTH: Non-admin staff attempting createWorkerAccount with role 'admin' must be rejected (403)", async () => {
    const req = {
      user: { role: "worker", name: "Regular Worker" },
      body: {
        name: "Escalated User",
        email: "escalated@flowly.bank",
        phone: "9998887781",
        password: "password123",
        role: "admin",
      },
    };

    const { res, getStatus, getBody } = createMockRes();
    await createWorkerAccount(req, res);

    assert.equal(getStatus(), 403, "Non-admin creating admin account must return HTTP 403");
    assert.equal(getBody().success, false);
    assert.match(getBody().message, /Administrator access is required|cannot assign or promote admin roles/i);
  });

  it("NEGATIVE AUTH: Non-admin staff attempting createWorkerAccount with role 'support' must be rejected (403)", async () => {
    const req = {
      user: { role: "worker", name: "Regular Worker" },
      body: {
        name: "Support Attempt",
        email: "suppattempt@flowly.bank",
        phone: "9998887782",
        password: "password123",
        role: "support",
      },
    };

    const { res, getStatus, getBody } = createMockRes();
    await createWorkerAccount(req, res);

    assert.equal(getStatus(), 403, "Non-admin creating support account must return HTTP 403");
    assert.equal(getBody().success, false);
    assert.match(getBody().message, /Administrator access is required/i);
  });

  it("NEGATIVE AUTH: Customer attempting createWorkerAccount must be rejected (403)", async () => {
    const req = {
      user: { role: "customer", name: "Customer Joe" },
      body: {
        name: "Infiltrator 2",
        email: "infil2@flowly.fake",
        phone: "9998887783",
        password: "password123",
        role: "worker",
      },
    };

    const { res, getStatus, getBody } = createMockRes();
    await createWorkerAccount(req, res);

    assert.equal(getStatus(), 403, "Customer caller to createWorkerAccount must return HTTP 403");
    assert.equal(getBody().success, false);
    assert.match(getBody().message, /Administrator access is required/i);
  });

  // =========================================================================
  // BACKEND ROLE & STATUS VALIDATION: createWorkerAccount
  // =========================================================================

  it("ROLE VALIDATION: Admin attempting createWorkerAccount with invalid role must be rejected (400)", async () => {
    const req = {
      user: { role: "admin", name: "Admin Officer" },
      body: {
        name: "Invalid Role Staff",
        email: "invalid_role_staff@flowly.fake",
        phone: "9998887784",
        password: "password123",
        role: "moderator",
      },
    };

    const { res, getStatus, getBody } = createMockRes();
    await createWorkerAccount(req, res);

    assert.equal(getStatus(), 400, "Invalid role must return HTTP 400");
    assert.equal(getBody().success, false);
    assert.match(getBody().message, /Invalid role specified/i);
  });

  it("ROLE VALIDATION: Admin attempting createWorkerAccount with invalid workerRole must be rejected (400)", async () => {
    const req = {
      user: { role: "admin", name: "Admin Officer" },
      body: {
        name: "Invalid SubRole Staff",
        email: "invalid_subrole_staff@flowly.fake",
        phone: "9998887785",
        password: "password123",
        role: "worker",
        workerRole: "chief_compliance",
      },
    };

    const { res, getStatus, getBody } = createMockRes();
    await createWorkerAccount(req, res);

    assert.equal(getStatus(), 400, "Invalid workerRole must return HTTP 400");
    assert.equal(getBody().success, false);
    assert.match(getBody().message, /Invalid workerRole specified/i);
  });

  it("STATUS VALIDATION: Admin attempting createWorkerAccount with invalid status must be rejected (400)", async () => {
    const req = {
      user: { role: "admin", name: "Admin Officer" },
      body: {
        name: "Invalid Status Staff",
        email: "invalid_status_staff@flowly.fake",
        phone: "9998887786",
        password: "password123",
        role: "worker",
        status: "banned_forever",
      },
    };

    const { res, getStatus, getBody } = createMockRes();
    await createWorkerAccount(req, res);

    assert.equal(getStatus(), 400, "Invalid status must return HTTP 400");
    assert.equal(getBody().success, false);
    assert.match(getBody().message, /Invalid status specified/i);
  });

  // =========================================================================
  // NEGATIVE AUTHORIZATION TESTS: updateWorkerStatus (adminController)
  // =========================================================================

  it("NEGATIVE AUTH: Public / unauthenticated user attempting updateWorkerStatus must be rejected (403)", async () => {
    const req = {
      user: null,
      params: { id: new mongoose.Types.ObjectId().toString() },
      body: { status: "active" },
    };

    const { res, getStatus, getBody } = createMockRes();
    await updateWorkerStatus(req, res);

    assert.equal(getStatus(), 403, "Public caller to updateWorkerStatus must return HTTP 403");
    assert.equal(getBody().success, false);
    assert.match(getBody().message, /Administrator access is required/i);
  });

  it("NEGATIVE AUTH: Non-admin staff attempting to update worker status must be rejected (403)", async () => {
    const req = {
      user: { role: "worker", name: "Worker Sam" },
      params: { id: new mongoose.Types.ObjectId().toString() },
      body: { status: "active" },
    };

    const { res, getStatus, getBody } = createMockRes();
    await updateWorkerStatus(req, res);

    assert.equal(getStatus(), 403, "Worker updating status must return HTTP 403");
    assert.equal(getBody().success, false);
    assert.match(getBody().message, /Administrator access is required/i);
  });

  it("NEGATIVE AUTH: Non-admin staff attempting to promote worker to 'admin' in updateWorkerStatus must be rejected (403)", async () => {
    const mockWorker = {
      _id: new mongoose.Types.ObjectId(),
      name: "Regular Staff",
      role: "worker",
      status: "active",
      save: async function () { return this; },
    };

    const originalFindById = User.findById;
    User.findById = async () => mockWorker;

    try {
      const req = {
        user: { role: "worker", name: "Non-Admin Officer" },
        params: { id: String(mockWorker._id) },
        body: { role: "admin" },
      };

      const { res, getStatus, getBody } = createMockRes();
      await updateWorkerStatus(req, res);

      assert.equal(getStatus(), 403, "Non-admin elevating role to admin must return 403");
      assert.equal(getBody().success, false);
      assert.match(getBody().message, /Administrator access is required|cannot assign or promote admin roles/i);
    } finally {
      User.findById = originalFindById;
    }
  });

  it("NEGATIVE AUTH: Customer attempting updateWorkerStatus must be rejected (403)", async () => {
    const req = {
      user: { role: "customer", name: "Customer Dan" },
      params: { id: new mongoose.Types.ObjectId().toString() },
      body: { status: "blocked" },
    };

    const { res, getStatus, getBody } = createMockRes();
    await updateWorkerStatus(req, res);

    assert.equal(getStatus(), 403, "Customer updating worker status must return HTTP 403");
    assert.equal(getBody().success, false);
    assert.match(getBody().message, /Administrator access is required/i);
  });

  // =========================================================================
  // BACKEND ROLE & STATUS VALIDATION: updateWorkerStatus
  // =========================================================================

  it("ROLE VALIDATION: Admin attempting updateWorkerStatus with invalid role must be rejected (400)", async () => {
    const req = {
      user: { role: "admin", name: "Admin Officer" },
      params: { id: new mongoose.Types.ObjectId().toString() },
      body: { role: "system_root" },
    };

    const { res, getStatus, getBody } = createMockRes();
    await updateWorkerStatus(req, res);

    assert.equal(getStatus(), 400, "Invalid role must return HTTP 400");
    assert.equal(getBody().success, false);
    assert.match(getBody().message, /Invalid role specified/i);
  });

  it("STATUS VALIDATION: Admin attempting updateWorkerStatus with invalid status must be rejected (400)", async () => {
    const req = {
      user: { role: "admin", name: "Admin Officer" },
      params: { id: new mongoose.Types.ObjectId().toString() },
      body: { status: "permanently_deleted" },
    };

    const { res, getStatus, getBody } = createMockRes();
    await updateWorkerStatus(req, res);

    assert.equal(getStatus(), 400, "Invalid status must return HTTP 400");
    assert.equal(getBody().success, false);
    assert.match(getBody().message, /Invalid status specified/i);
  });

  it("PAYLOAD VALIDATION: Admin attempting updateWorkerStatus without status or role must be rejected (400)", async () => {
    const req = {
      user: { role: "admin", name: "Admin Officer" },
      params: { id: new mongoose.Types.ObjectId().toString() },
      body: {}, // empty body
    };

    const { res, getStatus, getBody } = createMockRes();
    await updateWorkerStatus(req, res);

    assert.equal(getStatus(), 400, "Empty payload must return HTTP 400");
    assert.equal(getBody().success, false);
    assert.match(getBody().message, /Please provide a valid status or role to update/i);
  });

  // =========================================================================
  // ROUTE MIDDLEWARE AUTHORIZATION TESTS: authorize("admin")
  // =========================================================================

  it("ROUTE MIDDLEWARE: authorize('admin') rejects unauthenticated guest (403)", () => {
    const middleware = authorize("admin");
    const req = { user: null };
    const { res, getStatus, getBody } = createMockRes();
    let nextCalled = false;

    middleware(req, res, () => {
      nextCalled = true;
    });

    assert.equal(nextCalled, false);
    assert.equal(getStatus(), 403);
    assert.match(getBody().message, /Role \(guest\) is not authorized/i);
  });

  it("ROUTE MIDDLEWARE: authorize('admin') rejects worker role (403)", () => {
    const middleware = authorize("admin");
    const req = { user: { role: "worker", name: "Worker Jane" } };
    const { res, getStatus, getBody } = createMockRes();
    let nextCalled = false;

    middleware(req, res, () => {
      nextCalled = true;
    });

    assert.equal(nextCalled, false);
    assert.equal(getStatus(), 403);
    assert.match(getBody().message, /Role \(worker\) is not authorized/i);
  });

  it("ROUTE MIDDLEWARE: authorize('admin') rejects customer role (403)", () => {
    const middleware = authorize("admin");
    const req = { user: { role: "customer", name: "Customer Dan" } };
    const { res, getStatus, getBody } = createMockRes();
    let nextCalled = false;

    middleware(req, res, () => {
      nextCalled = true;
    });

    assert.equal(nextCalled, false);
    assert.equal(getStatus(), 403);
    assert.match(getBody().message, /Role \(customer\) is not authorized/i);
  });

  it("ROUTE MIDDLEWARE: authorize('admin') allows authenticated admin (next() called)", () => {
    const middleware = authorize("admin");
    const req = { user: { role: "admin", name: "Super Admin" } };
    const { res, getStatus } = createMockRes();
    let nextCalled = false;

    middleware(req, res, () => {
      nextCalled = true;
    });

    assert.equal(nextCalled, true, "next() must be called for admin");
    assert.equal(getStatus(), null, "No error response status should be set");
  });

  // =========================================================================
  // ACTIVATION & LOGIN TESTS
  // =========================================================================

  it("ACTIVATION RULE: Inactive worker cannot log in via loginWorker (403)", async () => {
    const hashedPassword = await bcrypt.hash("validpassword", 10);
    const mockInactiveWorker = {
      _id: new mongoose.Types.ObjectId(),
      email: "inactive_worker@flowly.fake",
      password: hashedPassword,
      role: "worker",
      status: "inactive",
    };

    const originalFindOne = User.findOne;
    User.findOne = () => ({
      select: async () => mockInactiveWorker,
    });

    try {
      const req = {
        body: {
          email: "inactive_worker@flowly.fake",
          password: "validpassword",
        },
      };

      const { res, getStatus, getBody } = createMockRes();
      await loginWorker(req, res);

      assert.equal(getStatus(), 403, "Inactive worker login must be rejected with HTTP 403");
      assert.equal(getBody().success, false);
      assert.match(getBody().message, /inactive or pending administrator activation/i);
    } finally {
      User.findOne = originalFindOne;
    }
  });

  it("ACTIVATION RULE: Blocked worker cannot log in via loginWorker (403)", async () => {
    const hashedPassword = await bcrypt.hash("validpassword", 10);
    const mockBlockedWorker = {
      _id: new mongoose.Types.ObjectId(),
      email: "blocked_worker@flowly.fake",
      password: hashedPassword,
      role: "worker",
      status: "blocked",
    };

    const originalFindOne = User.findOne;
    User.findOne = () => ({
      select: async () => mockBlockedWorker,
    });

    try {
      const req = {
        body: {
          email: "blocked_worker@flowly.fake",
          password: "validpassword",
        },
      };

      const { res, getStatus, getBody } = createMockRes();
      await loginWorker(req, res);

      assert.equal(getStatus(), 403, "Blocked worker login must be rejected with HTTP 403");
      assert.equal(getBody().success, false);
      assert.match(getBody().message, /(suspended|blocked)/i);
    } finally {
      User.findOne = originalFindOne;
    }
  });

  it("FUNCTIONALITY: Active worker with correct credentials can log in successfully", async () => {
    const hashedPassword = await bcrypt.hash("validpassword", 10);
    const mockActiveWorker = {
      _id: new mongoose.Types.ObjectId(),
      email: "active_worker@flowly.bank",
      password: hashedPassword,
      name: "Officer Smith",
      phone: "9876543210",
      role: "worker",
      workerRole: "general",
      status: "active",
      failedLoginAttempts: 0,
      save: async function () { return this; },
    };

    const originalFindOne = User.findOne;
    User.findOne = () => ({
      select: async () => mockActiveWorker,
    });

    try {
      const req = {
        body: {
          email: "active_worker@flowly.bank",
          password: "validpassword",
        },
      };

      const { res, getStatus, getBody } = createMockRes();
      await loginWorker(req, res);

      assert.equal(getStatus(), 200);
      assert.ok(getBody().token, "Valid active worker login must return session token");
      assert.equal(getBody().worker.email, "active_worker@flowly.bank");
      assert.equal(getBody().worker.role, "worker");
    } finally {
      User.findOne = originalFindOne;
    }
  });

  // =========================================================================
  // POSITIVE AUTHORIZATION TESTS: Authorized Admin Actions
  // =========================================================================

  it("POSITIVE AUTH: Authorized admin can register worker with active status via registerWorker", async () => {
    const originalFindOne = User.findOne;
    const originalFind = User.find;
    const originalCreate = User.create;

    User.findOne = async () => null;
    User.find = () => ({ select: () => ({ lean: async () => [] }) });

    let createdUserData = null;
    User.create = async (data) => {
      createdUserData = data;
      return {
        _id: new mongoose.Types.ObjectId(),
        ...data,
      };
    };

    try {
      const req = {
        user: { role: "admin", name: "Super Admin" },
        body: {
          name: "New Field Officer",
          email: "officer@flowly.bank",
          phone: "9998887790",
          password: "OfficerPass123",
          role: "worker",
        },
      };

      const { res, getStatus, getBody } = createMockRes();
      await registerWorker(req, res);

      assert.equal(getStatus(), 201);
      assert.equal(getBody().success, true);
      assert.ok(getBody().token, "Admin creation must issue session token for active account");
      assert.equal(createdUserData.role, "worker");
      assert.equal(createdUserData.status, "active");
      assert.equal(createdUserData.kycStatus, "verified");
    } finally {
      User.findOne = originalFindOne;
      User.find = originalFind;
      User.create = originalCreate;
    }
  });

  it("POSITIVE AUTH: Authorized admin can create staff account via createWorkerAccount", async () => {
    const originalFindOne = User.findOne;
    const originalFind = User.find;
    const originalCreate = User.create;

    User.findOne = async () => null;
    User.find = () => ({ select: () => ({ lean: async () => [] }) });

    let createdUserData = null;
    User.create = async (data) => {
      createdUserData = data;
      return {
        _id: new mongoose.Types.ObjectId(),
        ...data,
      };
    };

    try {
      const req = {
        user: { role: "admin", name: "Super Admin" },
        body: {
          name: "New Admin Member",
          email: "newadmin@flowly.bank",
          phone: "9998887791",
          password: "AdminPassword123",
          role: "admin",
        },
      };

      const { res, getStatus, getBody } = createMockRes();
      await createWorkerAccount(req, res);

      assert.equal(getStatus(), 201);
      assert.equal(getBody().success, true);
      assert.equal(createdUserData.role, "admin");
      assert.equal(createdUserData.status, "active");
    } finally {
      User.findOne = originalFindOne;
      User.find = originalFind;
      User.create = originalCreate;
    }
  });

  it("POSITIVE AUTH: Authorized admin can update worker status and role via updateWorkerStatus", async () => {
    const mockWorker = {
      _id: new mongoose.Types.ObjectId(),
      name: "Existing Staff",
      role: "worker",
      status: "active",
      workerRole: "general",
      save: async function () { return this; },
    };

    const originalFindById = User.findById;
    const originalFind = User.find;
    User.findById = async () => mockWorker;
    User.find = () => ({ select: () => ({ lean: async () => [] }) });

    try {
      const req = {
        user: { role: "admin", name: "Super Admin" },
        params: { id: String(mockWorker._id) },
        body: { status: "blocked", role: "support" },
      };

      const { res, getStatus, getBody } = createMockRes();
      await updateWorkerStatus(req, res);

      assert.equal(getStatus(), 200);
      assert.equal(getBody().success, true);
      assert.equal(mockWorker.status, "blocked");
      assert.equal(mockWorker.role, "support");
      assert.equal(mockWorker.workerRole, "support");
    } finally {
      User.findById = originalFindById;
      User.find = originalFind;
    }
  });
});
