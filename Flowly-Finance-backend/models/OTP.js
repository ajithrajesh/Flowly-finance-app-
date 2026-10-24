import mongoose from "mongoose";

const otpSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },
    otp: {
      type: String,
      required: true,
    },
    purpose: {
      type: String,
      enum: ["registration", "login", "reset_mpin", "reset_password", "generate_mpin", "transfer"],
      default: "registration",
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: { expires: 0 }, // Auto remove expired documents
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model("OTP", otpSchema);
