import express from "express";
import statementController from "../controllers/statementController.js";
import { protect, authorize } from "../middleware/authMiddleware.js";

const router = express.Router();

// Customer endpoints
router.get("/my-statements", protect, statementController.getMyStatements);
router.get("/download", protect, statementController.downloadStatement);
router.post("/email", protect, statementController.emailStatement);

// Staff / Admin batch trigger
router.post(
  "/admin/trigger-monthly",
  protect,
  authorize("admin", "worker"),
  statementController.triggerMonthlyStatements
);

export default router;
