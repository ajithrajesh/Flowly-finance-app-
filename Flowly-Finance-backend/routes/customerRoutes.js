import express from "express";
import {
  getCustomers,
  getCustomerById,
  reEnableTransactions,
} from "../controllers/customerController.js";
import { protect, authorize } from "../middleware/authMiddleware.js";

const router = express.Router();

// Worker / Admin customer management routes
router.get("/", protect, authorize("worker", "admin"), getCustomers);
router.get("/:id", protect, authorize("worker", "admin"), getCustomerById);
router.patch("/:id/re-enable-transactions", protect, authorize("worker", "admin"), reEnableTransactions);
router.post("/:id/re-enable-transactions", protect, authorize("worker", "admin"), reEnableTransactions);

export default router;
