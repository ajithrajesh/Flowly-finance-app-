import express from "express";
import {
  getSchedule,
  initiateRepayment,
  payAutoDebit,
  confirmRepayment,
  payAutoDebitAll,
  initiateRepaymentAll,
  confirmCardRepaymentAll,
  markPaidManually,
  getRepaymentHistory,
  getDigitalPaymentHistory,
  getOverdueLoans,
  getCollectionsOverview,
  getNocCertificate,
  applyForNoc,
  getNocRequestsAdmin,
  approveNocAdmin,
  rejectNocAdmin,
  recordRecoveryFollowup,
} from "../controllers/repaymentController.js";
import { disburseLoan } from "../controllers/loanController.js";
import { protect, authorize } from "../middleware/authMiddleware.js";

const router = express.Router();

router.use(protect);

router.get("/schedule/:loanId", getSchedule);
router.post("/initiate/:loanId/:installmentNo", initiateRepayment);
router.post("/confirm/:loanId/:installmentNo", confirmRepayment);
router.post("/pay-auto-debit/:loanId/:installmentNo", payAutoDebit);
router.post("/pay-auto-debit-all/:loanId", payAutoDebitAll);
router.post("/initiate-all/:loanId", initiateRepaymentAll);
router.post("/confirm-all-card/:loanId", confirmCardRepaymentAll);
router.get("/history/:loanId", getRepaymentHistory);
router.get("/payments", getDigitalPaymentHistory);

// NOC Endpoints
router.get("/noc/:loanId", getNocCertificate);
router.get("/noc/:loanId/download", (req, res, next) => {
  req.query.format = "pdf";
  return getNocCertificate(req, res, next);
});
router.get("/noc/:loanId/pdf", (req, res, next) => {
  req.query.format = "pdf";
  return getNocCertificate(req, res, next);
});
router.post("/noc/:loanId/apply", applyForNoc);
router.get("/noc-requests", authorize("worker", "admin"), getNocRequestsAdmin);
router.post("/noc/:loanId/approve", authorize("admin"), approveNocAdmin);
router.post("/noc/:loanId/reject", authorize("admin"), rejectNocAdmin);

// Staff / Worker routes
router.get("/collections", authorize("worker", "admin"), getCollectionsOverview);
router.get("/overdue", authorize("worker", "admin"), getOverdueLoans);
router.post("/mark-paid/:loanId/:installmentNo", authorize("worker", "admin"), markPaidManually);
router.post("/disburse/:loanId", authorize("worker", "admin"), disburseLoan);
router.put("/recovery-followup/:loanId", authorize("worker", "admin"), recordRecoveryFollowup);

export default router;
