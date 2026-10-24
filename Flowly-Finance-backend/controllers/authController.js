import User from "../models/User.js";
import Account from "../models/Account.js";
import OTP from "../models/OTP.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { OAuth2Client } from "google-auth-library";
import { sendOTPEmail, sendAccountLockoutEmail } from "../utils/mailer.js";

const generateToken = (user) => {
  const secret = process.env.JWT_SECRET || "flowly_secret_key_12345";
  return jwt.sign(
    {
      id: user._id,
      email: user.email,
      role: user.role,
    },
    secret,
    {
      expiresIn: "7d",
    }
  );
};

const BANK_PREFIX = 50100;
const START_SEQUENCE = 10001;
const BASE_ACCOUNT_NUMBER = Number(`${BANK_PREFIX}${START_SEQUENCE}`);

export const generateAccountNumber = async () => {
  // Fetch existing account numbers to find the highest numerical sequence
  const accounts = await Account.find({}, { accountNumber: 1 }).lean();
  let maxAccountNum = BASE_ACCOUNT_NUMBER - 1;

  for (const acc of accounts) {
    const num = Number(acc.accountNumber);
    if (!isNaN(num) && num > maxAccountNum) {
      maxAccountNum = num;
    }
  }

  return maxAccountNum + 1;
};

/**
 * Creates and activates a bank account for a user once KYC is approved.
 * Retries on accountNumber collisions (duplicate key errors) and is safe
 * to call multiple times for the same user (idempotent).
 */
export const createBankAccountForUser = async (userId, options = {}) => {
  let existingAccount = await Account.findOne({ user: userId });
  if (existingAccount) {
    if (existingAccount.status !== "active") {
      existingAccount.status = "active";
      await existingAccount.save();
    }
    return existingAccount;
  }

  const MAX_ATTEMPTS = 5;
  let lastError;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const accountNumber = await generateAccountNumber();
      const account = await Account.create({
        user: userId,
        accountNumber,
        accountType: options.accountType || "savings",
        balance: options.balance || 0,
        branch: options.branch || "Kochi Main Branch",
        ifscCode: options.ifscCode || "FLOW0001001",
        status: "active",
      });

      return account;
    } catch (error) {
      lastError = error;

      // 11000 = duplicate key error. This happens when two account
      // creations race and compute the same "next" accountNumber.
      // Retry with a freshly recomputed number instead of failing outright.
      if (error.code === 11000) {
        // Another request may have created this user's account in the
        // meantime (e.g. two KYC reviews fired concurrently) - reuse it.
        const raceAccount = await Account.findOne({ user: userId });
        if (raceAccount) {
          if (raceAccount.status !== "active") {
            raceAccount.status = "active";
            await raceAccount.save();
          }
          return raceAccount;
        }
        continue; // retry with a new accountNumber
      }

      throw error;
    }
  }

  throw new Error(
    `Failed to generate a unique account number after ${MAX_ATTEMPTS} attempts: ${lastError?.message}`,
  );
};



/**
 * Send OTP to user's email via SMTP
 */
export const sendOTP = async (req, res) => {
  try {
    const { email, purpose = "registration" } = req.body;

    if (!email) {
      return res.status(400).json({
        message: "Email address is required to send OTP",
      });
    }

    const cleanEmail = email.toLowerCase().trim();

    // Check if user already exists for registration purpose
    if (purpose === "registration") {
      const existingUser = await User.findOne({ email: cleanEmail });
      if (existingUser) {
        return res.status(400).json({
          message: "User with this email already exists",
        });
      }
    } else if (purpose === "reset_password" || purpose === "reset_mpin") {
      const existingUser = await User.findOne({ email: cleanEmail });
      if (!existingUser) {
        return res.status(404).json({
          message: "No registered account found with this email address",
        });
      }
    }

    // Generate 6-digit random numeric OTP
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();

    // Remove any previous unexpired OTPs for same email & purpose
    await OTP.deleteMany({ email: cleanEmail, purpose });

    // Store OTP in database with 5-minute expiry
    await OTP.create({
      email: cleanEmail,
      otp: otpCode,
      purpose,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5 minutes
    });

    // Send email using SMTP helper
    await sendOTPEmail(cleanEmail, otpCode, purpose);

    return res.status(200).json({
      message: `OTP verification code sent successfully to ${cleanEmail}`,
      email: cleanEmail,
      purpose,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to send OTP email",
      error: error.message,
    });
  }
};

/**
 * Verify OTP entered by user
 */
export const verifyOTP = async (req, res) => {
  try {
    const { email, otp, purpose = "registration" } = req.body;

    if (!email || !otp) {
      return res.status(400).json({
        message: "Email and OTP code are required",
      });
    }

    const cleanEmail = email.toLowerCase().trim();

    const otpRecord = await OTP.findOne({
      email: cleanEmail,
      otp: otp.trim(),
      purpose,
      expiresAt: { $gt: new Date() },
    });

    if (!otpRecord) {
      return res.status(400).json({
        message: "Invalid or expired OTP verification code",
      });
    }

    // Mark OTP as verified
    otpRecord.isVerified = true;
    await otpRecord.save();

    return res.status(200).json({
      message: "OTP verified successfully",
      email: cleanEmail,
      verified: true,
    });
  } catch (error) {
    return res.status(500).json({
      message: "OTP verification failed",
      error: error.message,
    });
  }
};

/**
 * Customer Registration (MPIN setup is done separately after registration)
 */
export const registerUser = async (req, res) => {
  try {
    const { fullName, name, email, phone, password, otp } = req.body;
    const userName = name || fullName;

    if (!userName || !email || !phone || !otp) {
      return res.status(400).json({
        message: "Please provide name, email, phone, and 6-digit email OTP code",
      });
    }

    if (!password || String(password).trim().length < 6) {
      return res.status(400).json({
        message: "Password is required and must be at least 6 characters long",
      });
    }

    const cleanEmail = email.toLowerCase().trim();

    // Check if user already exists
    const existingUser = await User.findOne({
      $or: [{ email: cleanEmail }, { phone }],
    });

    if (existingUser) {
      return res.status(400).json({
        message: "User with this email or phone already exists",
      });
    }

    // Verify mandatory OTP for registration
    const otpRecord = await OTP.findOne({
      email: cleanEmail,
      otp: String(otp).trim(),
      purpose: "registration",
    });

    if (!otpRecord) {
      return res.status(400).json({
        message: "Invalid or expired OTP code provided for registration",
      });
    }

    const hashedPassword = await bcrypt.hash(String(password).trim(), 10);

    const user = await User.create({
      name: userName,
      email: cleanEmail,
      phone,
      password: hashedPassword,
      isMpinSet: false,
      role: "customer",
      kycStatus: "pending",
      isEmailVerified: true,
    });

    // Clean up OTP record
    await OTP.deleteMany({ email: cleanEmail, purpose: "registration" });

    const token = generateToken(user);

    return res.status(201).json({
      message: "User registered successfully. You can now log in using your email and password, and generate your MPIN for financial transactions.",
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        kycStatus: user.kycStatus,
        isEmailVerified: user.isEmailVerified,
        isMpinSet: user.isMpinSet,
      },
      account: null,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Registration failed",
      error: error.message,
    });
  }
};

/**
 * Generate / Set up MPIN via 2-step OTP verification
 */
export const generateMPIN = async (req, res) => {
  try {
    const { email, phone, otp, mpin } = req.body;

    if ((!email && !phone) || !otp || !mpin) {
      return res.status(400).json({
        message: "Email/Phone, OTP code, and MPIN are required",
      });
    }

    const cleanMpin = String(mpin).trim();
    if (!/^\d{4,6}$/.test(cleanMpin)) {
      return res.status(400).json({
        message: "MPIN must be a 4 to 6 digit numerical PIN",
      });
    }

    const query = email ? { email: email.toLowerCase().trim() } : { phone };
    const user = await User.findOne(query).select("+password +mpinHash +mpinHistory");

    if (!user) {
      return res.status(404).json({
        message: "User account not found",
      });
    }

    const cleanEmail = user.email.toLowerCase().trim();

    // Verify OTP for purpose "generate_mpin"
    const otpRecord = await OTP.findOne({
      email: cleanEmail,
      otp: String(otp).trim(),
      purpose: "generate_mpin",
    });

    if (!otpRecord) {
      return res.status(400).json({
        message: "Invalid or expired OTP code for MPIN generation",
      });
    }

    // Check against previous MPIN history to prevent reuse
    const previousHashes = [
      ...(user.mpinHistory || []),
      ...(user.mpinHash ? [user.mpinHash] : []),
    ];

    for (const hash of previousHashes) {
      if (hash) {
        const isPrevious = await bcrypt.compare(cleanMpin, hash);
        if (isPrevious) {
          return res.status(400).json({
            message: "You cannot reuse a previously used MPIN. Please enter a new MPIN.",
          });
        }
      }
    }

    // Hash MPIN securely
    const hashedMpin = await bcrypt.hash(cleanMpin, 10);
    if (!user.mpinHistory) {
      user.mpinHistory = [];
    }
    if (user.mpinHash && !user.mpinHistory.includes(user.mpinHash)) {
      user.mpinHistory.push(user.mpinHash);
    }

    user.mpinHash = hashedMpin;
    if (!user.password) {
      user.password = hashedMpin; // Save in password field for backward-compatibility only if no password set
    }
    user.isMpinSet = true;
    user.failedLoginAttempts = 0;
    user.lockUntil = null;
    await user.save();

    // Clean up OTP record
    await OTP.deleteMany({ email: cleanEmail, purpose: "generate_mpin" });

    const token = generateToken(user);

    return res.status(200).json({
      message: "MPIN generated successfully. You can now login using your MPIN.",
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        kycStatus: user.kycStatus,
        isEmailVerified: user.isEmailVerified,
        isMpinSet: user.isMpinSet,
      },
    });
  } catch (error) {
    return res.status(500).json({
      message: "MPIN generation failed",
      error: error.message,
    });
  }
};

/**
 * Customer Login via MPIN or Email & Password
 */
export const loginUser = async (req, res) => {
  try {
    const { email, phone, mpin, password } = req.body;
    const loginSecret = mpin || password;

    if ((!email && !phone) || !loginSecret) {
      return res.status(400).json({
        message: "Please provide your email or phone and your password or MPIN",
      });
    }

    const query = email ? { email: email.toLowerCase().trim() } : { phone: String(phone).trim() };
    const user = await User.findOne(query).select("+mpinHash +password +failedLoginAttempts +lockUntil +isMpinSet");

    if (!user || user.role !== "customer") {
      return res.status(401).json({
        message: "Invalid credentials or account does not exist",
      });
    }

    if (user.status === "blocked") {
      return res.status(403).json({
        message: "Your account has been blocked. Please contact customer support.",
      });
    }

    // Check if account is suspended due to 4 consecutive failed attempts
    if (user.lockUntil && user.lockUntil > new Date()) {
      const remainingMs = user.lockUntil.getTime() - Date.now();
      const remainingHours = Math.ceil(remainingMs / (1000 * 60 * 60));
      return res.status(403).json({
        message: `Account is temporarily suspended due to 4 consecutive failed login attempts. Please try again after ${remainingHours} hour(s).`,
        isLocked: true,
        lockUntil: user.lockUntil,
      });
    }

    // Reset lock if 24 hours have passed
    if (user.lockUntil && user.lockUntil <= new Date()) {
      user.failedLoginAttempts = 0;
      user.lockUntil = null;
    }

    const candidateMpin = mpin ? String(mpin).trim() : null;
    const candidatePassword = password ? String(password).trim() : null;
    let isMatch = false;

    // Case 1: MPIN explicitly provided
    if (candidateMpin) {
      if (user.isMpinSet && user.mpinHash) {
        isMatch = await bcrypt.compare(candidateMpin, user.mpinHash);
      } else if (user.password) {
        // Fallback: If user enters their password in the secret input field
        isMatch = await bcrypt.compare(candidateMpin, user.password);
      }

      if (!user.isMpinSet && !isMatch) {
        return res.status(400).json({
          message: "MPIN has not been generated for this account. Please log in using your registered password.",
          requiresMpinSetup: true,
          hasPassword: !!user.password,
        });
      }
    } 
    // Case 2: Password explicitly provided
    else if (candidatePassword) {
      if (user.password) {
        isMatch = await bcrypt.compare(candidatePassword, user.password);
      }
      // Fallback for legacy accounts where MPIN hash was also stored in password field
      if (!isMatch && user.isMpinSet && user.mpinHash) {
        isMatch = await bcrypt.compare(candidatePassword, user.mpinHash);
      }

      if (!user.password && !user.mpinHash) {
        return res.status(400).json({
          message: "No password or MPIN has been set for this account. Please sign in with Google or reset your password.",
          noPasswordSet: true,
        });
      }
    }

    if (!isMatch) {
      user.failedLoginAttempts = (user.failedLoginAttempts || 0) + 1;

      if (user.failedLoginAttempts >= 4) {
        user.lockUntil = new Date(Date.now() + 24 * 60 * 60 * 1000); // Suspend for 24 hours
        await user.save();

        // Send security alert email
        sendAccountLockoutEmail(user.email, user.name).catch((err) =>
          console.error("Failed to send lockout alert email:", err)
        );

        return res.status(403).json({
          message: "Account suspended for 24 hours due to 4 incorrect login attempts. An alert email has been sent to your registered email.",
          isLocked: true,
          lockUntil: user.lockUntil,
        });
      }

      await user.save();
      const attemptsLeft = 4 - user.failedLoginAttempts;

      return res.status(401).json({
        message: `Invalid credentials. ${attemptsLeft} attempt(s) remaining before 24-hour account suspension.`,
        failedAttempts: user.failedLoginAttempts,
        attemptsLeft,
      });
    }

    // On successful login, reset failed attempts & lock
    if (user.failedLoginAttempts > 0 || user.lockUntil) {
      user.failedLoginAttempts = 0;
      user.lockUntil = null;
      await user.save();
    }

    let account = await Account.findOne({ user: user._id });
    if (!account && user.kycStatus === "verified") {
      account = await createBankAccountForUser(user._id);
    }
    const token = generateToken(user);

    return res.status(200).json({
      message: "Login successful",
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone || null,
        role: user.role,
        kycStatus: user.kycStatus,
        isEmailVerified: user.isEmailVerified,
        isMpinSet: user.isMpinSet || false,
      },
      account: account
        ? {
            id: account._id,
            accountNumber: account.accountNumber,
            accountType: account.accountType,
            balance: account.balance,
            ifscCode: account.ifscCode,
          }
        : null,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Login failed",
      error: error.message,
    });
  }
};

/**
 * Reset MPIN via OTP verification
 */
export const resetMPIN = async (req, res) => {
  try {
    const { email, otp, newMpin } = req.body;

    if (!email || !otp || !newMpin) {
      return res.status(400).json({
        message: "Email, OTP, and new MPIN are required",
      });
    }

    const cleanMpin = String(newMpin).trim();
    if (!/^\d{4,6}$/.test(cleanMpin)) {
      return res.status(400).json({
        message: "New MPIN must be a 4 to 6 digit numerical PIN",
      });
    }

    const cleanEmail = email.toLowerCase().trim();

    // Check OTP record
    const otpRecord = await OTP.findOne({
      email: cleanEmail,
      otp: otp.trim(),
      purpose: "reset_mpin",
    });

    if (!otpRecord) {
      return res.status(400).json({
        message: "Invalid or expired OTP code for MPIN reset",
      });
    }

    const user = await User.findOne({ email: cleanEmail }).select("+password +mpinHash +mpinHistory");
    if (!user) {
      return res.status(404).json({
        message: "User account not found",
      });
    }

    // Check against previous MPIN history to prevent reuse
    const previousHashes = [
      ...(user.mpinHistory || []),
      ...(user.mpinHash ? [user.mpinHash] : []),
    ];

    for (const hash of previousHashes) {
      if (hash) {
        const isPrevious = await bcrypt.compare(cleanMpin, hash);
        if (isPrevious) {
          return res.status(400).json({
            message: "You cannot reuse a previously used MPIN. Please enter a new MPIN.",
          });
        }
      }
    }

    const hashedMpin = await bcrypt.hash(cleanMpin, 10);
    if (!user.mpinHistory) {
      user.mpinHistory = [];
    }
    if (user.mpinHash && !user.mpinHistory.includes(user.mpinHash)) {
      user.mpinHistory.push(user.mpinHash);
    }

    user.mpinHash = hashedMpin;
    if (!user.password) {
      user.password = hashedMpin; // Fallback only for legacy accounts without a password
    }
    user.isMpinSet = true;
    user.failedLoginAttempts = 0;
    user.lockUntil = null;
    await user.save();

    // Delete used OTP
    await OTP.deleteMany({ email: cleanEmail, purpose: "reset_mpin" });

    return res.status(200).json({
      message: "MPIN reset successfully. You can now login with your new MPIN.",
    });
  } catch (error) {
    return res.status(500).json({
      message: "Reset MPIN failed",
      error: error.message,
    });
  }
};

/**
 * Reset or Set Password via verified OTP
 */
export const resetPassword = async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;

    if (!email || !otp || !newPassword) {
      return res.status(400).json({
        message: "Email, OTP code, and new password are required",
      });
    }

    const cleanPassword = String(newPassword).trim();
    if (cleanPassword.length < 6) {
      return res.status(400).json({
        message: "New password must be at least 6 characters long",
      });
    }

    const cleanEmail = email.toLowerCase().trim();

    const otpRecord = await OTP.findOne({
      email: cleanEmail,
      otp: String(otp).trim(),
      purpose: "reset_password",
      expiresAt: { $gt: new Date() },
    });

    if (!otpRecord) {
      return res.status(400).json({
        message: "Invalid or expired OTP code for password reset",
      });
    }

    const user = await User.findOne({ email: cleanEmail }).select("+password +failedLoginAttempts +lockUntil");
    if (!user) {
      return res.status(404).json({
        message: "User account not found with this email",
      });
    }

    user.password = await bcrypt.hash(cleanPassword, 10);
    user.failedLoginAttempts = 0;
    user.lockUntil = null;
    user.isEmailVerified = true;
    await user.save();

    await OTP.deleteMany({ email: cleanEmail, purpose: "reset_password" });

    return res.status(200).json({
      message: "Password updated successfully. You can now log in using your registered email and password.",
    });
  } catch (error) {
    return res.status(500).json({
      message: "Reset password failed",
      error: error.message,
    });
  }
};

/**
 * Continue with Google OAuth 2.0 (Register and Login with Backend Token Verification & Secure Account Linking)
 */
export const googleAuth = async (req, res) => {
  try {
    const { idToken, accessToken, phone } = req.body;

    if (!idToken && !accessToken) {
      return res.status(400).json({
        message: "Google authentication requires an idToken or accessToken",
      });
    }

    let verifiedEmail = null;
    let verifiedName = null;
    let verifiedGoogleId = null;

    const configuredClientId = process.env.GOOGLE_CLIENT_ID;
    const hasConfiguredClientId =
      configuredClientId &&
      !configuredClientId.includes("your_google_client_id") &&
      configuredClientId.includes(".apps.googleusercontent.com");

    // 1. Verify Google ID Token (from Google Identity Services credential response)
    if (idToken) {
      try {
        const client = new OAuth2Client(configuredClientId);
        const ticket = await client.verifyIdToken({
          idToken,
          audience: hasConfiguredClientId ? configuredClientId : undefined,
        });
        const payload = ticket.getPayload();
        if (payload && payload.email) {
          if (payload.email_verified === false) {
            return res.status(401).json({
              message: "Google email address is not verified by Google",
            });
          }
          verifiedEmail = payload.email.toLowerCase().trim();
          verifiedName = payload.name;
          verifiedGoogleId = payload.sub;
        }
      } catch (tokenErr) {
        return res.status(401).json({
          message: "Invalid or expired Google ID token",
          error: tokenErr.message,
        });
      }
    }
    // 2. Verify Google OAuth Access Token (from popup / code flow token client)
    else if (accessToken) {
      try {
        const gResponse = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
          headers: { Authorization: `Bearer ${accessToken}` },
        });

        if (!gResponse.ok) {
          return res.status(401).json({
            message: "Invalid or expired Google access token",
          });
        }

        const gData = await gResponse.json();
        if (!gData || !gData.email) {
          return res.status(401).json({
            message: "Unable to retrieve verified email from Google",
          });
        }

        if (gData.email_verified === false) {
          return res.status(401).json({
            message: "Google email address is not verified by Google",
          });
        }

        verifiedEmail = gData.email.toLowerCase().trim();
        verifiedName = gData.name;
        verifiedGoogleId = gData.sub;
      } catch (fetchErr) {
        return res.status(401).json({
          message: "Google access token verification failed",
          error: fetchErr.message,
        });
      }
    }

    if (!verifiedEmail) {
      return res.status(401).json({
        message: "Google token verification failed: verified email is required",
      });
    }

    // 3. Secure Account Lookup & Linking
    let user = await User.findOne({
      $or: [
        ...(verifiedGoogleId ? [{ googleId: verifiedGoogleId }] : []),
        { email: verifiedEmail },
      ],
    }).select("+failedLoginAttempts +lockUntil");

    let isNewUser = false;

    if (user) {
      // Security checks on existing account
      if (user.status === "blocked") {
        return res.status(403).json({
          message: "Your account has been blocked. Please contact support.",
        });
      }

      if (user.lockUntil && user.lockUntil > new Date()) {
        const remainingMs = user.lockUntil.getTime() - Date.now();
        const remainingHours = Math.ceil(remainingMs / (1000 * 60 * 60));
        return res.status(403).json({
          message: `Account is temporarily suspended due to 4 consecutive failed login attempts. Please try again after ${remainingHours} hour(s).`,
          isLocked: true,
          lockUntil: user.lockUntil,
        });
      }

      if (user.role !== "customer") {
        return res.status(403).json({
          message: "Staff or admin accounts cannot sign in via customer Google OAuth portal.",
        });
      }

      // Secure Account Linking:
      // If user registered with email/password previously, link the verified Google ID
      if (verifiedGoogleId) {
        if (!user.googleId) {
          user.googleId = verifiedGoogleId;
          user.isEmailVerified = true;
        } else if (user.googleId !== verifiedGoogleId) {
          return res.status(400).json({
            message: "This email is already associated with a different Google account.",
          });
        }
      }

      if (!user.name && verifiedName) {
        user.name = verifiedName;
      }

      // Reset any previous failed attempts
      user.failedLoginAttempts = 0;
      user.lockUntil = null;
      await user.save();
    } else {
      // 4. Register new user via Google
      isNewUser = true;
      user = await User.create({
        name: verifiedName || verifiedEmail.split("@")[0],
        email: verifiedEmail,
        phone: phone || undefined,
        googleId: verifiedGoogleId,
        role: "customer",
        kycStatus: "pending",
        isEmailVerified: true,
        isMpinSet: false,
      });
    }

    let account = await Account.findOne({ user: user._id });
    if (!account && user.kycStatus === "verified") {
      account = await createBankAccountForUser(user._id);
    }
    const token = generateToken(user);

    return res.status(isNewUser ? 201 : 200).json({
      message: isNewUser
        ? "Registered and logged in with Google successfully"
        : "Logged in with Google successfully",
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone || null,
        role: user.role,
        kycStatus: user.kycStatus,
        isEmailVerified: user.isEmailVerified,
        isMpinSet: user.isMpinSet || false,
      },
      account: account
        ? {
            id: account._id,
            accountNumber: account.accountNumber,
            accountType: account.accountType,
            balance: account.balance,
            ifscCode: account.ifscCode,
          }
        : null,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Google authentication failed",
      error: error.message,
    });
  }
};

/**
 * Get Public Google OAuth Client ID Configuration
 */
export const getGoogleClientId = (req, res) => {
  const clientId = process.env.GOOGLE_CLIENT_ID || "";
  const isConfigured =
    clientId &&
    !clientId.includes("your_google_client_id") &&
    clientId.includes(".apps.googleusercontent.com");

  return res.status(200).json({
    clientId: isConfigured ? clientId : "",
    isConfigured: !!isConfigured,
  });
};

/**
 * Worker / Internal Staff Registration
 */
export const registerWorker = async (req, res) => {
  try {
    const { name, email, phone, password, role } = req.body;

    if (!name || !email || !password || !phone) {
      return res.status(400).json({
        message: "Please provide name, email, phone, and password",
      });
    }

    const workerRole = role && ["worker", "admin", "support"].includes(role) ? role : "worker";

    const existingUser = await User.findOne({
      $or: [{ email: email.toLowerCase() }, { phone }],
    });

    if (existingUser) {
      return res.status(400).json({
        message: "Worker with this email or phone already exists",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const worker = await User.create({
      name,
      email: email.toLowerCase(),
      phone,
      password: hashedPassword,
      role: workerRole,
      workerRole: req.body.workerRole || (workerRole === "support" ? "support" : "general"),
      rotationOrder: req.body.rotationOrder || 0,
      kycStatus: "verified",
      status: "active",
    });

    const token = generateToken(worker);

    return res.status(201).json({
      message: "Worker account created successfully",
      token,
      worker: {
        id: worker._id,
        name: worker.name,
        email: worker.email,
        phone: worker.phone,
        role: worker.role,
        workerRole: worker.workerRole,
        rotationOrder: worker.rotationOrder,
      },
    });
  } catch (error) {
    return res.status(500).json({
      message: "Worker registration failed",
      error: error.message,
    });
  }
};

/**
 * Worker Login
 */
export const loginWorker = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        message: "Please provide email and password",
      });
    }

    const worker = await User.findOne({ email: email.toLowerCase() }).select("+password +failedLoginAttempts +lockUntil");

    if (!worker || (!["worker", "admin", "support"].includes(worker.role) && worker.workerRole !== "support")) {
      return res.status(401).json({
        message: "Invalid worker credentials or account unauthorized",
      });
    }

    // Check if account is suspended due to 4 failed attempts
    if (worker.lockUntil && worker.lockUntil > new Date()) {
      const remainingMs = worker.lockUntil.getTime() - Date.now();
      const remainingHours = Math.ceil(remainingMs / (1000 * 60 * 60));
      return res.status(403).json({
        message: `Worker account is temporarily suspended due to 4 consecutive failed login attempts. Please try again after ${remainingHours} hour(s).`,
        isLocked: true,
        lockUntil: worker.lockUntil,
      });
    }

    // Reset lock if 24 hours have passed
    if (worker.lockUntil && worker.lockUntil <= new Date()) {
      worker.failedLoginAttempts = 0;
      worker.lockUntil = null;
    }

    const isMatch = await bcrypt.compare(password, worker.password);

    if (!isMatch) {
      worker.failedLoginAttempts = (worker.failedLoginAttempts || 0) + 1;

      if (worker.failedLoginAttempts >= 4) {
        worker.lockUntil = new Date(Date.now() + 24 * 60 * 60 * 1000); // Suspend for 24 hours
        await worker.save();

        // Send security alert email
        sendAccountLockoutEmail(worker.email, worker.name).catch((err) =>
          console.error("Failed to send worker lockout alert email:", err)
        );

        return res.status(403).json({
          message: "Worker account suspended for 24 hours due to 4 incorrect login attempts. An alert email has been sent.",
          isLocked: true,
          lockUntil: worker.lockUntil,
        });
      }

      await worker.save();
      const attemptsLeft = 4 - worker.failedLoginAttempts;

      return res.status(401).json({
        message: `Invalid email or password. ${attemptsLeft} attempt(s) remaining before 24-hour account suspension.`,
        failedAttempts: worker.failedLoginAttempts,
        attemptsLeft,
      });
    }

    // On successful login, reset failed attempts & lock
    if (worker.failedLoginAttempts > 0 || worker.lockUntil) {
      worker.failedLoginAttempts = 0;
      worker.lockUntil = null;
      await worker.save();
    }

    const token = generateToken(worker);

    return res.status(200).json({
      message: "Worker login successful",
      token,
      worker: {
        id: worker._id,
        name: worker.name,
        email: worker.email,
        phone: worker.phone,
        role: worker.role,
        workerRole: worker.workerRole || (worker.role === "support" ? "support" : "general"),
        rotationOrder: worker.rotationOrder || 0,
      },
    });
  } catch (error) {
    return res.status(500).json({
      message: "Worker login failed",
      error: error.message,
    });
  }
};

/**
 * Fetch Current Authenticated User Profile
 */
export const getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    let account = await Account.findOne({ user: req.user._id });
    if (!account && user.kycStatus === "verified") {
      account = await createBankAccountForUser(req.user._id);
    }

    return res.status(200).json({
      user,
      account: account || null,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to fetch user profile",
      error: error.message,
    });
  }
};
