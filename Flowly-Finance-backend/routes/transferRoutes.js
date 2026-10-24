import express from "express";
import {
  getConfig,
  validateBeneficiary,
  requestOTP,
  executeTransfer,
  createStripeTransfer,
  getStripeStatus,
  confirmStripeTransferManual,
  getReceipt,
  downloadReceiptPDF,
  getHistory,
  reportTransfer,
  resolveTransferReport,
} from "../controllers/transferController.js";
import { protect, authorize } from "../middleware/authMiddleware.js";

const router = express.Router();

router.use(protect);

// Configuration & Branch Grid info
router.get("/config", getConfig);

// Customer transfer flow
router.post("/validate-beneficiary", authorize("customer"), validateBeneficiary);
router.post("/request-otp", authorize("customer"), requestOTP);
router.post("/execute", authorize("customer"), executeTransfer);
router.get("/history", authorize("customer"), getHistory);

// Report transfer option (Customer flags suspicious transfer notification/transaction)
router.post("/report", authorize("customer"), reportTransfer);
router.post("/:receiptNumber/report", authorize("customer"), reportTransfer);

// Worker resolution of reported transfers (Allows ONLY worker/admin to resolve and re-enable transactions)
router.post("/resolve-report", authorize("worker", "admin"), resolveTransferReport);

// Stripe Card Transfer flow
router.post("/stripe/intent", authorize("customer"), createStripeTransfer);
router.get("/stripe/status/:paymentIntentId", authorize("customer"), getStripeStatus);
router.post("/stripe/confirm", authorize("customer"), confirmStripeTransferManual);

// Receipt retrieval & PDF download (Accessible to customer and staff)
router.get("/receipt/:receiptNumber/pdf", downloadReceiptPDF);
router.get("/receipt/:receiptNumber", getReceipt);

export default router;
