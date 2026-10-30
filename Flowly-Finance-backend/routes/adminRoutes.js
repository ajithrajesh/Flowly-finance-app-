import express from "express";
import {
  getBusinessAnalysis,
  getWorkerMonitor,
  createWorkerAccount,
  updateWorkerStatus,
} from "../controllers/adminController.js";
import { protect, authorize } from "../middleware/authMiddleware.js";

const router = express.Router();

// Apply protect middleware to all admin endpoints
router.use(protect);

// GET /api/admin/analysis — Business & Financial Analytics Dashboard
router.get("/analysis", authorize("admin", "worker"), getBusinessAnalysis);

// GET /api/admin/workers — Worker Monitoring & Performance Roster
router.get("/workers", authorize("admin", "worker"), getWorkerMonitor);

// POST /api/admin/workers — Admin creates a new staff/worker account
router.post("/workers", authorize("admin"), createWorkerAccount);

// PATCH & PUT /api/admin/workers/:id/status — Admin updates worker status (active, blocked, inactive) or role
router.patch("/workers/:id/status", authorize("admin"), updateWorkerStatus);
router.put("/workers/:id/status", authorize("admin"), updateWorkerStatus);

export default router;
