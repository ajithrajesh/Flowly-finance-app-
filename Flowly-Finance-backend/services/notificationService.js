import mongoose from "mongoose";
import Notification from "../models/Notification.js";
import User from "../models/User.js";
import { emitToUser, emitToRole, broadcastEvent } from "../sockets/videoKycSocket.js";

/**
 * Creates a notification in MongoDB and broadcasts it in real-time over Socket.IO.
 */
export const createAndSendNotification = async ({
  userId,
  recipientRole = "customer",
  title,
  message,
  type = "system",
  meta = {},
}) => {
  if (!userId) {
    throw new Error("userId is required to send notification");
  }

  const notification = await Notification.create({
    user: userId,
    recipientRole,
    title,
    message,
    type,
    status: "unread",
    meta,
  });

  const unreadCount = await Notification.countDocuments({
    user: userId,
    status: "unread",
  });

  const payload = {
    _id: notification._id,
    id: notification._id,
    user: notification.user,
    recipientRole: notification.recipientRole,
    title: notification.title,
    message: notification.message,
    type: notification.type,
    status: notification.status,
    readAt: notification.readAt,
    meta: notification.meta,
    createdAt: notification.createdAt,
    updatedAt: notification.updatedAt,
  };

  // Emit to user's private socket room
  emitToUser(userId, "new_notification", payload);
  emitToUser(userId, "unread_count", { unreadCount });

  return notification;
};

/**
 * Safe wrapper for single-user notification dispatch (does not crash parent callers)
 */
export const notifyUser = async (userId, { title, message, type = "system", meta = {}, recipientRole }) => {
  try {
    if (!userId) return null;
    let role = recipientRole;
    if (!role) {
      const user = await User.findById(userId).select("role").lean();
      role = user?.role || "customer";
    }

    return await createAndSendNotification({
      userId,
      recipientRole: role,
      title,
      message,
      type,
      meta,
    });
  } catch (err) {
    console.error(`notifyUser failed for ${userId}:`, err.message);
    return null;
  }
};

/**
 * Dispatches a notification to all active users with a specified role (e.g. 'worker', 'admin', 'customer')
 */
export const notifyRole = async (role, { title, message, type = "system", meta = {}, excludeUserId = null }) => {
  try {
    let roleQuery;
    if (role === "worker") {
      roleQuery = { role: { $in: ["worker", "admin", "support"] }, status: "active" };
    } else if (role === "staff") {
      roleQuery = { role: { $in: ["worker", "admin", "support"] }, status: "active" };
    } else {
      roleQuery = { role, status: "active" };
    }

    if (excludeUserId) {
      roleQuery._id = { $ne: excludeUserId };
    }

    const targetUsers = await User.find(roleQuery).select("_id role").lean();
    if (!targetUsers.length) return [];

    const now = new Date();
    const docsToInsert = targetUsers.map((u) => ({
      user: u._id,
      recipientRole: u.role,
      title,
      message,
      type,
      status: "unread",
      meta,
      createdAt: now,
      updatedAt: now,
    }));

    const inserted = await Notification.insertMany(docsToInsert);

    // Emit real-time notification to each user and update their badge count
    for (const doc of inserted) {
      const unreadCount = await Notification.countDocuments({
        user: doc.user,
        status: "unread",
      });

      const payload = {
        _id: doc._id,
        id: doc._id,
        user: doc.user,
        recipientRole: doc.recipientRole,
        title: doc.title,
        message: doc.message,
        type: doc.type,
        status: doc.status,
        readAt: doc.readAt,
        meta: doc.meta,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      };

      emitToUser(doc.user, "new_notification", payload);
      emitToUser(doc.user, "unread_count", { unreadCount });
    }

    // Also emit to the general role room
    emitToRole(role, "new_notification", {
      title,
      message,
      type,
      meta,
      createdAt: now,
    });

    return inserted;
  } catch (err) {
    console.error(`notifyRole (${role}) failed:`, err.message);
    return [];
  }
};

/**
 * Dispatches notification specifically to all administrators
 */
export const notifyAdmins = async ({ title, message, type = "system", meta = {}, excludeUserId = null }) => {
  return notifyRole("admin", { title, message, type, meta, excludeUserId });
};

/**
 * Dispatches notification to all staff (workers and admins)
 */
export const notifyWorkers = async ({ title, message, type = "system", meta = {}, excludeUserId = null }) => {
  return notifyRole("worker", { title, message, type, meta, excludeUserId });
};

/**
 * Dispatches notification to both workers and admins
 */
export const notifyStaff = async ({ title, message, type = "system", meta = {}, excludeUserId = null }) => {
  return notifyRole("staff", { title, message, type, meta, excludeUserId });
};

/**
 * Dispatches notification to all active customers
 */
export const notifyCustomers = async ({ title, message, type = "system", meta = {} }) => {
  return notifyRole("customer", { title, message, type, meta });
};

/**
 * Retrieves unread notification count for a user
 */
export const getUnreadCount = async (userId) => {
  return Notification.countDocuments({ user: userId, status: "unread" });
};

/**
 * Marks a notification as read and emits updated state via Socket.IO
 */
export const markNotificationRead = async (notificationId, userId) => {
  const notification = await Notification.findOneAndUpdate(
    { _id: notificationId, user: userId },
    { $set: { status: "read", readAt: new Date() } },
    { returnDocument: "after" }
  );

  if (!notification) return null;

  const unreadCount = await getUnreadCount(userId);
  emitToUser(userId, "unread_count", { unreadCount });
  emitToUser(userId, "notification_read", {
    id: notification._id,
    notification,
    unreadCount,
  });

  return { notification, unreadCount };
};

/**
 * Marks all unread notifications as read for a user
 */
export const markAllNotificationsRead = async (userId) => {
  const result = await Notification.updateMany(
    { user: userId, status: "unread" },
    { $set: { status: "read", readAt: new Date() } }
  );

  emitToUser(userId, "unread_count", { unreadCount: 0 });
  emitToUser(userId, "notifications_all_read", { ok: true, unreadCount: 0 });

  return { modifiedCount: result.modifiedCount, unreadCount: 0 };
};

/**
 * Deletes a notification and updates unread badge
 */
export const deleteNotificationById = async (notificationId, userId) => {
  const deleted = await Notification.findOneAndDelete({
    _id: notificationId,
    user: userId,
  });

  if (!deleted) return null;

  const unreadCount = await getUnreadCount(userId);
  emitToUser(userId, "unread_count", { unreadCount });

  return { deleted, unreadCount };
};

/**
 * Retrieves paginated notification history with unread count
 */
export const getUserNotificationHistory = async (userId, { page = 1, limit = 20, unreadOnly = false, type = null }) => {
  const filter = { user: userId };
  if (unreadOnly) filter.status = "unread";
  if (type) filter.type = type;

  const skip = (Math.max(1, parseInt(page)) - 1) * parseInt(limit);
  const take = parseInt(limit);

  const [notifications, total, unreadCount] = await Promise.all([
    Notification.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(take)
      .lean(),
    Notification.countDocuments(filter),
    Notification.countDocuments({ user: userId, status: "unread" }),
  ]);

  return {
    notifications,
    unreadCount,
    total,
    page: parseInt(page),
    limit: take,
    hasMore: skip + notifications.length < total,
  };
};

export default {
  createAndSendNotification,
  notifyUser,
  notifyRole,
  notifyWorkers,
  notifyAdmins,
  notifyStaff,
  notifyCustomers,
  getUnreadCount,
  markNotificationRead,
  markAllNotificationsRead,
  deleteNotificationById,
  getUserNotificationHistory,
};
