import express from "express";
import { protect, authorize } from "../middleware/authMiddleware.js";
import {
  createTicket,
  getMyTickets,
  getMyTicket,
  getAllTickets,
  getTicketStats,
  getTicketById,
  assignTicket,
  updateTicketStatus,
  replyTicket,
  getTicketRotationInfo,
  autoAssignTicket,
} from "../controllers/supportTicketController.js";

const router = express.Router();

// ----------------------------------------------------------------------
// Customer-specific routes (defined before /:id parameter catches them)
// ----------------------------------------------------------------------
router.get("/my", protect, authorize("customer"), getMyTickets);
router.get("/my/:id", protect, authorize("customer"), getMyTicket);
router.post("/my/:id/reply", protect, authorize("customer"), replyTicket);

// ----------------------------------------------------------------------
// Worker/Admin-specific stats & rotational assignment status
// ----------------------------------------------------------------------
router.get("/stats", protect, authorize("worker", "admin"), getTicketStats);
router.get("/rotation-status", protect, authorize("worker", "admin"), getTicketRotationInfo);

// ----------------------------------------------------------------------
// General Customer Ticket Creation
// ----------------------------------------------------------------------
router.post("/", protect, authorize("customer"), createTicket);

// ----------------------------------------------------------------------
// Worker/Admin Queue
// ----------------------------------------------------------------------
router.get("/", protect, authorize("worker", "admin"), getAllTickets);

// ----------------------------------------------------------------------
// By ID Routes
// ----------------------------------------------------------------------
router.get("/:id", protect, authorize("worker", "admin"), getTicketById);
router.put("/:id/assign", protect, authorize("worker", "admin"), assignTicket);
router.post("/:id/auto-assign", protect, authorize("worker", "admin"), autoAssignTicket);
router.put("/:id/status", protect, authorize("worker", "admin"), updateTicketStatus);

// Role-aware reply route (supports both customer on own ticket and worker/admin)
router.post("/:id/reply", protect, replyTicket);

export default router;
