import mongoose from "mongoose";

const monthlyStatementSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    account: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Account",
      required: true,
      index: true,
    },

    accountNumber: {
      type: String,
      required: true,
    },

    // Period key in YYYY-MM format, e.g. "2026-09" or "2026-10"
    periodKey: {
      type: String,
      required: true,
      index: true,
    },

    monthName: {
      type: String,
      required: true, // e.g. "September 2026"
    },

    startDate: {
      type: Date,
      required: true,
    },

    endDate: {
      type: Date,
      required: true,
    },

    openingBalance: {
      type: Number,
      required: true,
      default: 0,
    },

    closingBalance: {
      type: Number,
      required: true,
      default: 0,
    },

    totalCredits: {
      type: Number,
      default: 0,
    },

    creditCount: {
      type: Number,
      default: 0,
    },

    totalDebits: {
      type: Number,
      default: 0,
    },

    debitCount: {
      type: Number,
      default: 0,
    },

    netChange: {
      type: Number,
      default: 0,
    },

    transactionCount: {
      type: Number,
      default: 0,
    },

    emailSentTo: {
      type: String,
      required: true,
    },

    status: {
      type: String,
      enum: ["generated", "sent", "failed"],
      default: "sent",
    },

    failureReason: {
      type: String,
    },

    generatedAt: {
      type: Date,
      default: Date.now,
    },

    sentAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

// One monthly statement record per account per periodKey
monthlyStatementSchema.index({ account: 1, periodKey: 1 }, { unique: true });

export default mongoose.models.MonthlyStatement ||
  mongoose.model("MonthlyStatement", monthlyStatementSchema);
