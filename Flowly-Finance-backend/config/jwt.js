/**
 * -----------------------------------------------------------------------------
 * JWT Configuration & Security Enforcement Module
 * -----------------------------------------------------------------------------
 * Enforces strong, environment-configured JWT secrets across authentication
 * middleware, controllers, and real-time sockets.
 *
 * Hardcoded fallback secrets (e.g. "flowly_secret_key_12345") are strictly removed.
 * Fails securely and immediately when JWT_SECRET is missing or insecure.
 * -----------------------------------------------------------------------------
 */

export const MIN_JWT_SECRET_LENGTH = 32;

export const INSECURE_EXACT_SECRETS = Object.freeze([
  "secret",
  "jwt_secret",
  "jwtsecret",
  "flowly_secret",
  "123456",
  "12345678",
  "changeme",
  "password",
  "supersecret",
]);

export const INSECURE_SUBSTRING_PATTERNS = Object.freeze([
  "flowly_secret_key_12345",
  "your_super_strong_jwt_secret_key_minimum_32_characters",
  "your_jwt_secret",
]);

/**
 * Evaluates whether a given candidate secret meets strict cryptographic strength standards.
 *
 * @param {unknown} secret
 * @returns {{ valid: boolean, reason?: string }}
 */
export const checkJwtSecretStrength = (secret) => {
  if (!secret || typeof secret !== "string") {
    return {
      valid: false,
      reason: "JWT_SECRET environment variable is missing, null, or empty.",
    };
  }

  const trimmed = secret.trim();

  if (trimmed.length === 0) {
    return {
      valid: false,
      reason: "JWT_SECRET environment variable is blank or whitespace-only.",
    };
  }

  if (trimmed.length < MIN_JWT_SECRET_LENGTH) {
    return {
      valid: false,
      reason: `JWT_SECRET does not meet minimum strength requirements. It must be at least ${MIN_JWT_SECRET_LENGTH} characters long (provided: ${trimmed.length} characters).`,
    };
  }

  const lower = trimmed.toLowerCase();
  if (INSECURE_EXACT_SECRETS.includes(lower)) {
    return {
      valid: false,
      reason: `JWT_SECRET cannot be a trivial default password or string ('${lower}').`,
    };
  }

  for (const pattern of INSECURE_SUBSTRING_PATTERNS) {
    if (lower.includes(pattern)) {
      return {
        valid: false,
        reason: `JWT_SECRET matches or contains a known insecure placeholder or default ('${pattern}').`,
      };
    }
  }

  return { valid: true };
};

/**
 * Retrieves the environment-configured JWT secret.
 * Throws a fatal security error if missing or insufficiently strong.
 * NEVER falls back to hardcoded default strings.
 *
 * @returns {string} The validated, trimmed JWT secret.
 * @throws {Error} If secret is missing, empty, or insecure.
 */
export const getJwtSecret = () => {
  const secret = process.env.JWT_SECRET;
  const evaluation = checkJwtSecretStrength(secret);

  if (!evaluation.valid) {
    throw new Error(
      `FATAL SECURITY MISCONFIGURATION: ${evaluation.reason} Please configure a strong JWT_SECRET (at least 32 characters) in your environment.`
    );
  }

  return secret.trim();
};

/**
 * Boot-time validator for the server.
 * Verifies JWT configuration before the server starts accepting HTTP or socket connections.
 *
 * @param {{ exitOnError?: boolean }} options
 * @returns {boolean} True if valid; exits process or throws if invalid.
 */
export const validateJwtSecretEnv = ({ exitOnError = false } = {}) => {
  const secret = process.env.JWT_SECRET;
  const evaluation = checkJwtSecretStrength(secret);

  if (!evaluation.valid) {
    const errorMsg = [
      "================================================================================",
      "FATAL SERVER SECURITY CONFIGURATION ERROR:",
      `-> ${evaluation.reason}`,
      `-> A strong, cryptographically secure secret (minimum ${MIN_JWT_SECRET_LENGTH} characters) must be configured`,
      "   via the JWT_SECRET environment variable.",
      "-> Hardcoded fallbacks are strictly removed and prohibited.",
      "================================================================================",
    ].join("\n");

    console.error(errorMsg);

    if (exitOnError) {
      process.exit(1);
    }
    throw new Error(evaluation.reason);
  }

  return true;
};
