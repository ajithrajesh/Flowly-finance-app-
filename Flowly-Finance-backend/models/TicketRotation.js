import mongoose from "mongoose";

const ticketRotationSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      default: "support_ticket_rotation",
      unique: true,
      index: true,
    },
    currentIndex: {
      type: Number,
      default: 0,
    },
    currentCycle: {
      type: Number,
      default: 1,
    },
    totalAssigned: {
      type: Number,
      default: 0,
    },
    lastAssignedWorker: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    lastAssignedTicket: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SupportTicket",
    },
    history: [
      {
        ticketId: { type: mongoose.Schema.Types.ObjectId, ref: "SupportTicket" },
        ticketNumber: String,
        subject: String,
        workerId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        workerName: String,
        rotationCycle: Number,
        rotationIndex: Number,
        assignedAt: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true }
);

export default mongoose.model("TicketRotation", ticketRotationSchema);
