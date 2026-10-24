import mongoose from "mongoose";

const notificationSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    recipientRole: {
      type: String,
      enum: ["customer", "worker", "admin", "support", "all"],
      default: "customer",
    },

    title: {
      type: String,
      required: true,
      trim: true,
    },

    message: {
      type: String,
      required: true,
      trim: true,
    },

    type: {
      type: String,
      enum: [
        "loan",
        "kyc",
        "emi",
        "payment",
        "deposit",
        "withdrawal",
        "transfer",
        "account",
        "support",
        "system",
      ],
      default: "system",
    },

    status: {
      type: String,
      enum: ["unread", "read"],
      default: "unread",
    },

    readAt: {
      type: Date,
      default: null,
    },

    // Optional structured details (e.g. receipt number, amount, applicationNumber)
    // so the UI can deep-link to the related record.
    meta: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for high-performance notification retrieval & unread counts
notificationSchema.index({ user: 1, status: 1, createdAt: -1 });
notificationSchema.index({ user: 1, createdAt: -1 });
notificationSchema.index({ recipientRole: 1, createdAt: -1 });

export default mongoose.model("Notification", notificationSchema);