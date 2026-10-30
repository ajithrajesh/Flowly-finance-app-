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
  updateProfile,
  uploadAvatar,
  deleteAvatar,
} from "../controllers/authController.js";
import { protect, authorize, optionalAuth } from "../middleware/authMiddleware.js";
import { uploadAvatarFile } from "../middleware/uploadMiddleware.js";

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

// Worker / Staff Auth - Worker creation restricted to authorized administrators
router.post("/worker/register", protect, authorize("admin"), registerWorker);
router.post("/worker/login", loginWorker);

// Profile
router.get("/me", protect, getMe);
router.put("/profile", protect, updateProfile);
router.patch("/profile", protect, updateProfile);
router.post("/profile/avatar", protect, uploadAvatarFile, uploadAvatar);
router.delete("/profile/avatar", protect, deleteAvatar);

export default router;
