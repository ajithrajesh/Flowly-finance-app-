import {
  getUserNotificationHistory,
  markNotificationRead,
  markAllNotificationsRead,
  deleteNotificationById,
  createAndSendNotification,
  notifyRole,
} from "../services/notificationService.js";

/**
 * GET /api/notifications/my
 * Access: any authenticated user
 */
export const getMyNotifications = async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const unreadOnly = req.query.unreadOnly === "true";
    const type = req.query.type || null;

    const result = await getUserNotificationHistory(userId, {
      page,
      limit,
      unreadOnly,
      type,
    });

    return res.status(200).json({
      success: true,
      data: {
        notifications: result.notifications,
        unreadCount: result.unreadCount,
      },
      total: result.total,
      page: result.page,
      limit: result.limit,
      hasMore: result.hasMore,
    });
  } catch (err) {
    console.error("getMyNotifications error:", err);
    return res.status(500).json({ success: false, message: "Failed to fetch notifications" });
  }
};

/**
 * PUT /api/notifications/:id/read
 */
export const markAsRead = async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const result = await markNotificationRead(req.params.id, userId);

    if (!result || !result.notification) {
      return res.status(404).json({ success: false, message: "Notification not found" });
    }

    return res.status(200).json({
      success: true,
      data: result.notification,
      unreadCount: result.unreadCount,
    });
  } catch (err) {
    console.error("markAsRead error:", err);
    return res.status(500).json({ success: false, message: "Failed to update notification" });
  }
};

/**
 * PUT /api/notifications/mark-all-read
 */
export const markAllAsRead = async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const result = await markAllNotificationsRead(userId);

    return res.status(200).json({
      success: true,
      message: `${result.modifiedCount} notifications marked as read`,
      unreadCount: 0,
    });
  } catch (err) {
    console.error("markAllAsRead error:", err);
    return res.status(500).json({ success: false, message: "Failed to update notifications" });
  }
};

/**
 * DELETE /api/notifications/:id
 */
export const deleteNotification = async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const result = await deleteNotificationById(req.params.id, userId);

    if (!result) {
      return res.status(404).json({ success: false, message: "Notification not found" });
    }

    return res.status(200).json({
      success: true,
      message: "Notification deleted",
      unreadCount: result.unreadCount,
    });
  } catch (err) {
    console.error("deleteNotification error:", err);
    return res.status(500).json({ success: false, message: "Failed to delete notification" });
  }
};

/**
 * Helper function for internal code dispatch with real-time Socket.IO emission
 */
export const sendNotification = async ({ userId, type = "system", title, message, meta = {}, recipientRole }) => {
  return createAndSendNotification({
    userId,
    recipientRole,
    type,
    title,
    message,
    meta,
  });
};

/**
 * POST /api/notifications/send
 * Access: worker, admin
 * Supports sending to a specific user (userId) OR broadcasting to a role (targetRole: "worker" | "customer")
 */
export const sendNotificationHandler = async (req, res) => {
  try {
    const { userId, targetRole, type = "system", title, message, meta = {} } = req.body;

    if (!title || !message) {
      return res.status(422).json({
        success: false,
        message: "title and message are required",
      });
    }

    if (!userId && !targetRole) {
      return res.status(422).json({
        success: false,
        message: "Either userId or targetRole is required",
      });
    }

    if (targetRole) {
      const records = await notifyRole(targetRole, {
        title,
        message,
        type,
        meta,
        excludeUserId: req.user._id,
      });
      return res.status(201).json({
        success: true,
        message: `Notification broadcasted to ${records.length} user(s) in role '${targetRole}'`,
        count: records.length,
      });
    }

    const notification = await createAndSendNotification({
      userId,
      type,
      title,
      message,
      meta,
    });

    return res.status(201).json({ success: true, data: notification });
  } catch (err) {
    console.error("sendNotificationHandler error:", err);
    return res.status(500).json({ success: false, message: "Failed to send notification" });
  }
};
