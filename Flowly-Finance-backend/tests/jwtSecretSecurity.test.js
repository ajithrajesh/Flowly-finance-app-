process.env.NODE_ENV = "test";
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import User from "../models/User.js";
import {
  MIN_JWT_SECRET_LENGTH,
  INSECURE_EXACT_SECRETS,
  INSECURE_SUBSTRING_PATTERNS,
  checkJwtSecretStrength,
  getJwtSecret,
  validateJwtSecretEnv,
} from "../config/jwt.js";
import { generateToken } from "../controllers/authController.js";
import { protect, optionalAuth } from "../middleware/authMiddleware.js";

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

describe("JWT Secret Security & Environment Configuration Enforcement", () => {
  const originalEnvSecret = process.env.JWT_SECRET;
  const STRONG_TEST_SECRET = "flowly_super_secure_production_ready_jwt_secret_32_plus_chars!";

  beforeEach(() => {
    process.env.JWT_SECRET = STRONG_TEST_SECRET;
  });

  afterEach(() => {
    process.env.JWT_SECRET = originalEnvSecret;
  });

  // =========================================================================
  // 1. Secret Strength Validation Engine
  // =========================================================================
  describe("checkJwtSecretStrength validation", () => {
    it("REJECTS: undefined, null, or non-string secrets", () => {
      assert.strictEqual(checkJwtSecretStrength(undefined).valid, false);
      assert.strictEqual(checkJwtSecretStrength(null).valid, false);
      assert.strictEqual(checkJwtSecretStrength(12345).valid, false);
      assert.strictEqual(checkJwtSecretStrength({}).valid, false);
    });

    it("REJECTS: empty string or whitespace-only secrets", () => {
      assert.strictEqual(checkJwtSecretStrength("").valid, false);
      assert.strictEqual(checkJwtSecretStrength("   \t\n  ").valid, false);
    });

    it("REJECTS: legacy hardcoded fallback 'flowly_secret_key_12345'", () => {
      const result = checkJwtSecretStrength("flowly_secret_key_12345");
      assert.strictEqual(result.valid, false);
      assert.match(result.reason, /minimum strength requirements|known insecure/i);
    });

    it("REJECTS: any secret shorter than 32 characters", () => {
      const shortSecret = "too_short_secret_only_24_ch";
      assert.ok(shortSecret.length < MIN_JWT_SECRET_LENGTH);
      const result = checkJwtSecretStrength(shortSecret);
      assert.strictEqual(result.valid, false);
      assert.match(result.reason, /at least 32 characters long/i);
    });

    it("REJECTS: example placeholder secrets from .env.example", () => {
      const placeholder = "your_super_strong_jwt_secret_key_minimum_32_characters";
      const result = checkJwtSecretStrength(placeholder);
      assert.strictEqual(result.valid, false);
      assert.match(result.reason, /known insecure placeholder/i);
    });

    it("ACCEPTS: cryptographically strong secrets with >= 32 characters", () => {
      const strongKey = "DPSxb8LIx/t/C9KG6odoz/yp/pMZHQ2tQfXdlSto80WTDsuF8dfMgzQothI66Q9+vyiF/zAqSpgp212Rbvl40A==";
      const result = checkJwtSecretStrength(strongKey);
      assert.strictEqual(result.valid, true);
      assert.strictEqual(result.reason, undefined);
    });
  });

  // =========================================================================
  // 2. getJwtSecret and validateJwtSecretEnv Fail-Safe
  // =========================================================================
  describe("getJwtSecret and validateJwtSecretEnv enforcement", () => {
    it("FAIL-SECURE: getJwtSecret throws when process.env.JWT_SECRET is deleted", () => {
      delete process.env.JWT_SECRET;
      assert.throws(
        () => getJwtSecret(),
        /FATAL SECURITY MISCONFIGURATION.*missing, null, or empty/i
      );
    });

    it("FAIL-SECURE: getJwtSecret throws when process.env.JWT_SECRET is weak fallback", () => {
      process.env.JWT_SECRET = "flowly_secret_key_12345";
      assert.throws(
        () => getJwtSecret(),
        /FATAL SECURITY MISCONFIGURATION.*minimum strength requirements/i
      );
    });

    it("SUCCESS: getJwtSecret returns trimmed secret when properly configured", () => {
      process.env.JWT_SECRET = `  ${STRONG_TEST_SECRET}  `;
      assert.strictEqual(getJwtSecret(), STRONG_TEST_SECRET);
    });

    it("FAIL-SECURE: validateJwtSecretEnv throws on missing secret", () => {
      delete process.env.JWT_SECRET;
      assert.throws(
        () => validateJwtSecretEnv({ exitOnError: false }),
        /missing, null, or empty/i
      );
    });

    it("SUCCESS: validateJwtSecretEnv succeeds on strong secret", () => {
      process.env.JWT_SECRET = STRONG_TEST_SECRET;
      assert.strictEqual(validateJwtSecretEnv({ exitOnError: false }), true);
    });
  });

  // =========================================================================
  // 3. Controller Token Generation (generateToken)
  // =========================================================================
  describe("generateToken in authController", () => {
    it("FAIL-SECURE: generateToken throws if JWT_SECRET is unset (no hardcoded fallback)", () => {
      delete process.env.JWT_SECRET;
      assert.throws(
        () => generateToken({ _id: new mongoose.Types.ObjectId(), email: "test@flowly.bank", role: "worker" }),
        /FATAL SECURITY MISCONFIGURATION/i
      );
    });

    it("FAIL-SECURE: generateToken throws if JWT_SECRET is the old hardcoded fallback", () => {
      process.env.JWT_SECRET = "flowly_secret_key_12345";
      assert.throws(
        () => generateToken({ _id: new mongoose.Types.ObjectId(), email: "test@flowly.bank", role: "worker" }),
        /FATAL SECURITY MISCONFIGURATION/i
      );
    });

    it("SUCCESS: generateToken generates verifiable token signed with strong secret", () => {
      process.env.JWT_SECRET = STRONG_TEST_SECRET;
      const userId = new mongoose.Types.ObjectId();
      const token = generateToken({ _id: userId, email: "user@flowly.bank", role: "customer" });

      assert.ok(typeof token === "string" && token.length > 20);
      const decoded = jwt.verify(token, STRONG_TEST_SECRET);
      assert.strictEqual(decoded.id.toString(), userId.toString());
      assert.strictEqual(decoded.role, "customer");
    });
  });

  // =========================================================================
  // 4. Authentication Middleware Enforcement (protect & optionalAuth)
  // =========================================================================
  describe("protect and optionalAuth middleware security", () => {
    const testUserId = new mongoose.Types.ObjectId();
    const testUser = {
      _id: testUserId,
      name: "Test User",
      email: "user@test.flowly",
      role: "customer",
      status: "active",
    };

    let originalUserFindById;
    beforeEach(() => {
      originalUserFindById = User.findById;
      User.findById = () => ({
        select: () => Promise.resolve(testUser),
      });
    });

    afterEach(() => {
      User.findById = originalUserFindById;
    });

    it("FAIL-SECURE: protect responds with 500 configuration error if JWT_SECRET is missing", async () => {
      delete process.env.JWT_SECRET;

      const { res, getStatus, getData } = createMockRes();
      const req = {
        headers: { authorization: "Bearer some.random.token" },
        query: {},
      };

      let nextCalled = false;
      await protect(req, res, () => {
        nextCalled = true;
      });

      assert.strictEqual(nextCalled, false, "next() must not be called when JWT_SECRET is missing");
      assert.strictEqual(getStatus(), 500);
      assert.match(getData()?.message || "", /Internal authentication configuration error/i);
    });

    it("FAIL-SECURE: protect rejects tokens signed with the legacy hardcoded fallback", async () => {
      // Token signed with the old hardcoded fallback
      const rogueToken = jwt.sign(
        { id: testUserId.toString(), email: testUser.email, role: testUser.role },
        "flowly_secret_key_12345"
      );

      // Environment is configured with a real strong secret
      process.env.JWT_SECRET = STRONG_TEST_SECRET;

      const { res, getStatus, getData } = createMockRes();
      const req = {
        headers: { authorization: `Bearer ${rogueToken}` },
        query: {},
      };

      let nextCalled = false;
      await protect(req, res, () => {
        nextCalled = true;
      });

      assert.strictEqual(nextCalled, false);
      assert.strictEqual(getStatus(), 401);
      assert.match(getData()?.message || "", /Invalid or expired token/i);
    });

    it("SUCCESS: protect authenticates valid token signed with strong configured secret", async () => {
      process.env.JWT_SECRET = STRONG_TEST_SECRET;
      const validToken = jwt.sign(
        { id: testUserId.toString(), email: testUser.email, role: testUser.role },
        STRONG_TEST_SECRET
      );

      const { res } = createMockRes();
      const req = {
        headers: { authorization: `Bearer ${validToken}` },
        query: {},
      };

      let nextCalled = false;
      await protect(req, res, () => {
        nextCalled = true;
      });

      assert.strictEqual(nextCalled, true);
      assert.strictEqual(req.user._id.toString(), testUserId.toString());
    });

    it("FAIL-SECURE: optionalAuth sets req.user = null if JWT_SECRET is missing", async () => {
      delete process.env.JWT_SECRET;

      const req = {
        headers: { authorization: "Bearer some.token" },
        query: {},
      };

      let nextCalled = false;
      await optionalAuth(req, {}, () => {
        nextCalled = true;
      });

      assert.strictEqual(nextCalled, true);
      assert.strictEqual(req.user, null);
    });
  });
});
