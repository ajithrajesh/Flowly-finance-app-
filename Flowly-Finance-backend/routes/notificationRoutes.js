import express from "express";
import {
  getMyNotifications,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  sendNotificationHandler,
} from "../controllers/notificationController.js";
import { protect, authorize } from "../middleware/authMiddleware.js";

import { reportTransfer } from "../controllers/transferController.js";

const router = express.Router();

router.use(protect);

router.get("/my", getMyNotifications);
router.put("/mark-all-read", markAllAsRead);
router.put("/:id/read", markAsRead);
router.delete("/:id", deleteNotification);
router.post("/send", authorize("worker", "admin"), sendNotificationHandler);

// Report transfer directly from notification
router.post("/:id/report", authorize("customer"), (req, res) => {
  req.body = req.body || {};
  req.body.notificationId = req.params.id;
  return reportTransfer(req, res);
});

export default router;
