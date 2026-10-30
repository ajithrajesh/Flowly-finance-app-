import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import http from "http";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import connectDB from "./config/db.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import authRoutes from "./routes/authRoutes.js";
import kycRoutes from "./routes/kycRoutes.js";
import videoKycRoutes from "./routes/videoKycRoutes.js";
import { initVideoKycSocket } from "./sockets/videoKycSocket.js";
import calculatorRoutes from "./routes/calculatorRoutes.js";
import depositRoutes from "./routes/depositRoutes.js";
import loanRoutes from "./routes/loanRoutes.js";
import customerDashboardRoutes from "./routes/customerDashboardRoutes.js";
import customerRoutes from "./routes/customerRoutes.js";
import notificationRoutes from "./routes/notificationRoutes.js";
import repaymentRoutes from "./routes/repaymentRoutes.js";
import webhookRoutes from "./routes/webhookRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";
import walletRoutes from "./routes/walletRoutes.js";
import cashDepositRoutes from "./routes/cashDepositRoutes.js";
import cashWithdrawalRoutes from "./routes/cashWithdrawalRoutes.js";
import supportTicketRoutes from "./routes/supportTicketRoutes.js";
import transferRoutes from "./routes/transferRoutes.js";
import statementRoutes from "./routes/statementRoutes.js";
import documentRoutes from "./routes/documentRoutes.js";
import { startOverdueCheckJob } from "./jobs/overdueCheckJob.js";
import { startFDMaturityJob } from "./jobs/fdMaturityJob.js";
import { startEmiReminderJob } from "./jobs/emiReminderJob.js";
import { startVideoKycReminderJob } from "./jobs/videoKycReminderJob.js";
import { startMonthlyStatementJob } from "./jobs/monthlyStatementJob.js";
import { ensureDefaultSupportTeam } from "./services/ticketAssignmentService.js";
import { validateJwtSecretEnv } from "./config/jwt.js";

dotenv.config();

// Enforce strong JWT secret configuration on startup; fail securely if missing or insecure
validateJwtSecretEnv({ exitOnError: process.env.NODE_ENV !== "test" });

connectDB().then(() => {
  ensureDefaultSupportTeam().catch((err) => console.error("Support team initialization error:", err.message));
});

const app = express();

app.use(cors());

// Webhook route requires raw body before express.json()
app.use("/api/webhooks", webhookRoutes);

app.use(express.json());

// Secure document preview & download routes (requires authentication, ownership checks, role-based authorization)
app.use("/uploads", documentRoutes);
app.use("/api/documents", documentRoutes);


// Health Check
app.get("/", (req, res) => {
  res.json({
    message: "Flowly Finance Backend API is running 🚀",
    version: "1.0.0",
    modules: [
      "User & Worker Authentication",
      "KYC Verification Workflow & Review Queue",
      "Loan EMI & FD Calculators",
      "Savings & Fixed Deposit Management",
      "Loan Products, Applications, Worker Approvals & Disbursement",
      "Customer Dashboard & Financial Metrics",
      "Video KYC (WebRTC scheduling, calls & recording)",
      "User Notifications System",
      "EMI Repayments & Payment Gateway Integration",
      "Admin Dashboard, Business Analysis & Worker Monitor",
      "Offline Cash Deposits (worker-assisted)",
    ],
  });
});

// API Routes
app.use("/api/auth", authRoutes);
app.use("/api/kyc", kycRoutes);
app.use("/api/video-kyc", videoKycRoutes);
app.use("/api/calculator", calculatorRoutes);
app.use("/api/deposits", depositRoutes);
app.use("/api/loans", loanRoutes);
app.use("/api/customer/dashboard", customerDashboardRoutes);
app.use("/api/customers", customerRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/repayments", repaymentRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/wallet", walletRoutes);
app.use("/api/cash-deposits", cashDepositRoutes);
app.use("/api/cash-withdrawals", cashWithdrawalRoutes);
app.use("/api/support-tickets", supportTicketRoutes);
app.use("/api/transfers", transferRoutes);
app.use("/api/statements", statementRoutes);

// Start background cron / timer jobs
startOverdueCheckJob();
startFDMaturityJob();
startEmiReminderJob();
startVideoKycReminderJob();
startMonthlyStatementJob();

// Global 404 Handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `API endpoint '${req.method} ${req.originalUrl}' not found. Please verify the URL path.`,
  });
});

// Global Error Handler for Unexpected Errors
app.use((err, req, res, next) => {
  console.error("Unhandled Server Error:", err);

  // Handle JSON parsing syntax error
  if (err instanceof SyntaxError && err.status === 400 && "body" in err) {
    return res.status(400).json({
      success: false,
      message: "Malformed JSON payload in request body. Please verify JSON formatting.",
      error: err.message,
    });
  }

  // Handle Multer upload errors
  if (err.name === "MulterError") {
    let multerMsg = "File upload failed.";
    if (err.code === "LIMIT_FILE_SIZE") multerMsg = "File exceeds the allowed size limit.";
    else if (err.code === "LIMIT_UNEXPECTED_FILE") multerMsg = "Unexpected file field in upload request.";
    return res.status(400).json({
      success: false,
      message: multerMsg,
      error: err.message,
    });
  }

  // Handle Mongoose Validation Error
  if (err.name === "ValidationError") {
    const messages = Object.values(err.errors || {}).map((e) => e.message);
    return res.status(400).json({
      success: false,
      message: messages.join(", ") || "Data validation error.",
      error: err.message,
    });
  }

  // Handle Mongoose CastError (invalid ObjectId)
  if (err.name === "CastError") {
    return res.status(400).json({
      success: false,
      message: `Invalid format for identifier '${err.path}'.`,
      error: err.message,
    });
  }

  const statusCode = err.status || err.statusCode || 500;
  const userMessage =
    statusCode >= 500
      ? "An internal server error occurred. Please try again shortly."
      : err.message || "An error occurred while processing your request.";

  res.status(statusCode).json({
    success: false,
    message: userMessage,
    error: err.message,
  });
});

const PORT = process.env.PORT || 5000;

// HTTP server shared by Express and the Video KYC (Socket.IO) signaling
const server = http.createServer(app);
initVideoKycSocket(server);

server.listen(PORT, () => {
  console.log(`Server running on port http://localhost:${PORT}`);
});

export default app;