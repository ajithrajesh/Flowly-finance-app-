import express from "express";
import {
  sendOTP,
  verifyOTP,
  registerUser,
  generateMPIN,
  loginUser,
  resetMPIN,
  resetPassword,
  googleAuth,
  getGoogleClientId,
  registerWorker,
  loginWorker,
  getMe,
} from "../controllers/authController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

// OTP Endpoints (SMTP Email OTP)
router.post("/otp/send", sendOTP);
router.post("/otp/verify", verifyOTP);

// Customer Auth (MPIN, Password & Google OAuth)
router.post("/user/register", registerUser);
router.post("/mpin/generate", generateMPIN);
router.post("/user/login", loginUser);
router.post("/mpin/reset", resetMPIN);
router.post("/password/reset", resetPassword);
router.post("/google", googleAuth);
router.get("/google/client-id", getGoogleClientId);

// Worker / Staff Auth
router.post("/worker/register", registerWorker);
router.post("/worker/login", loginWorker);

// Profile
router.get("/me", protect, getMe);

export default router;
