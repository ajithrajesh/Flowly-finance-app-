import SupportTicket from "../models/SupportTicket.js";
import Notification from "../models/Notification.js";
import User from "../models/User.js";
import Account from "../models/Account.js";
import Transaction from "../models/Transaction.js";
import Payment from "../models/Payment.js";
import { notifyUser, notifyWorkers, notifyAdmins } from "../services/notificationService.js";
import { assignTicketRotational, getRotationStatus } from "../services/ticketAssignmentService.js";

const VALID_CATEGORIES = ["kyc", "loan", "account", "fd", "payment", "technical", "other"];
const VALID_PRIORITIES = ["low", "medium", "high", "urgent"];
const VALID_STATUSES = ["open", "in_progress", "resolved", "closed"];

/**
 * Generate unique sequential ticket number like "TKT-000123"
 */
const generateTicketNumber = async () => {
  let count = await SupportTicket.countDocuments();
  let ticketNumber = `TKT-${String(count + 1).padStart(6, "0")}`;
  while (await SupportTicket.exists({ ticketNumber })) {
    count++;
    ticketNumber = `TKT-${String(count + 1).padStart(6, "0")}`;
  }
  return ticketNumber;
};

// ==========================================
// CUSTOMER CONTROLLERS
// ==========================================

/**
 * Customer: Create a new support ticket
 * POST /api/support-tickets
 */
export const createTicket = async (req, res) => {
  try {
    const { subject, category = "other", description, priority = "medium" } = req.body;

    if (!subject || typeof subject !== "string") {
      return res.status(400).json({ message: "Subject is required." });
    }
    const trimmedSubject = subject.trim();
    if (trimmedSubject.length < 5 || trimmedSubject.length > 120) {
      return res.status(400).json({ message: "Subject must be between 5 and 120 characters." });
    }

    if (!description || typeof description !== "string") {
      return res.status(400).json({ message: "Description is required." });
    }
    const trimmedDescription = description.trim();
    if (trimmedDescription.length < 10 || trimmedDescription.length > 2000) {
      return res.status(400).json({ message: "Description must be between 10 and 2000 characters." });
    }

    if (!VALID_CATEGORIES.includes(category)) {
      return res.status(400).json({
        message: `Invalid category. Allowed: ${VALID_CATEGORIES.join(", ")}`,
      });
    }

    if (!VALID_PRIORITIES.includes(priority)) {
      return res.status(400).json({
        message: `Invalid priority. Allowed: ${VALID_PRIORITIES.join(", ")}`,
      });
    }

    const ticketNumber = await generateTicketNumber();

    const ticket = await SupportTicket.create({
      ticketNumber,
      user: req.user._id,
      subject: trimmedSubject,
      description: trimmedDescription,
      category,
      priority,
      status: "open",
      messages: [
        {
          sender: req.user._id,
          senderRole: "customer",
          message: trimmedDescription,
          sentAt: new Date(),
        },
      ],
    });

    // Rotational assignment to Support Team (rotational cycle 1..4, repeat)
    try {
      await assignTicketRotational(ticket);
    } catch (assignErr) {
      console.error("Rotational ticket assignment error:", assignErr.message);
    }

    // Notify customer
    await notifyUser(req.user._id, {
      type: "support",
      title: "Support Ticket Raised",
      message: `Your ticket #${ticketNumber} ("${trimmedSubject}") was created. Support staff will respond soon.`,
      meta: { ticketId: ticket._id, ticketNumber },
    });

    // Notify workers
    await notifyWorkers({
      type: "support",
      title: "New Support Ticket",
      message: `New ${priority} priority ticket #${ticketNumber} raised: "${trimmedSubject}".`,
      meta: { ticketId: ticket._id, ticketNumber, priority },
    });

    // Notify admins if high or urgent priority
    if (["high", "urgent"].includes(priority)) {
      await notifyAdmins({
        type: "support",
        title: "High-Priority Support Alert",
        message: `High-priority customer ticket #${ticketNumber} created: "${trimmedSubject}".`,
        meta: { ticketId: ticket._id, ticketNumber, priority },
      });
    }

    return res.status(201).json({
      message: "Support ticket created successfully.",
      ticket,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to create support ticket.",
      error: error.message,
    });
  }
};

/**
 * Customer: Get logged-in customer's tickets (paginated & filtered)
 * GET /api/support-tickets/my
 */
export const getMyTickets = async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 50);
    const skip = (page - 1) * limit;

    const filter = { user: req.user._id };

    if (req.query.status && req.query.status !== "all") {
      if (VALID_STATUSES.includes(req.query.status)) {
        filter.status = req.query.status;
      }
    }

    if (req.query.category && req.query.category !== "all") {
      if (VALID_CATEGORIES.includes(req.query.category)) {
        filter.category = req.query.category;
      }
    }

    const [total, tickets] = await Promise.all([
      SupportTicket.countDocuments(filter),
      SupportTicket.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("assignedTo", "name")
        .lean(),
    ]);

    const totalPages = Math.ceil(total / limit) || 0;

    return res.status(200).json({
      tickets,
      pagination: {
        total,
        page,
        limit,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to fetch support tickets.",
      error: error.message,
    });
  }
};

/**
 * Customer: Get one of their own tickets with messages
 * GET /api/support-tickets/my/:id
 */
export const getMyTicket = async (req, res) => {
  try {
    const ticket = await SupportTicket.findById(req.params.id)
      .populate("assignedTo", "name")
      .populate("messages.sender", "name role");

    if (!ticket) {
      return res.status(404).json({ message: "Ticket not found." });
    }

    if (ticket.user.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "You are not authorized to view this ticket." });
    }

    return res.status(200).json({ ticket });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to fetch ticket.",
      error: error.message,
    });
  }
};

// ==========================================
// WORKER / ADMIN CONTROLLERS
// ==========================================

/**
 * Worker/Admin: Get all tickets with pagination, filters, and search
 * GET /api/support-tickets
 */
export const getAllTickets = async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
    const skip = (page - 1) * limit;

    const filter = {};

    if (req.query.status && req.query.status !== "all") {
      if (VALID_STATUSES.includes(req.query.status)) {
        filter.status = req.query.status;
      }
    }

    if (req.query.category && req.query.category !== "all") {
      if (VALID_CATEGORIES.includes(req.query.category)) {
        filter.category = req.query.category;
      }
    }

    if (req.query.priority && req.query.priority !== "all") {
      if (VALID_PRIORITIES.includes(req.query.priority)) {
        filter.priority = req.query.priority;
      }
    }

    const search = req.query.search ? req.query.search.trim() : "";
    if (search) {
      const matchingUsers = await User.find({
        $or: [
          { name: { $regex: search, $options: "i" } },
          { email: { $regex: search, $options: "i" } },
          { phone: { $regex: search, $options: "i" } },
        ],
      }).select("_id");

      const userIds = matchingUsers.map((u) => u._id);

      filter.$or = [
        { ticketNumber: { $regex: search, $options: "i" } },
        { subject: { $regex: search, $options: "i" } },
        { user: { $in: userIds } },
      ];
    }

    if (req.query.assignedTo) {
      if (req.query.assignedTo === "me") {
        filter.assignedTo = req.user._id;
      } else if (req.query.assignedTo === "unassigned") {
        filter.assignedTo = null;
      } else if (req.query.assignedTo !== "all") {
        filter.assignedTo = req.query.assignedTo;
      }
    }

    const [total, tickets] = await Promise.all([
      SupportTicket.countDocuments(filter),
      SupportTicket.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("user", "name email phone")
        .populate("assignedTo", "name email role workerRole rotationOrder")
        .lean(),
    ]);

    const totalPages = Math.ceil(total / limit) || 0;

    return res.status(200).json({
      tickets,
      pagination: {
        total,
        page,
        limit,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to fetch tickets.",
      error: error.message,
    });
  }
};

/**
 * Worker/Admin: Get ticket counts by status and urgent count
 * GET /api/support-tickets/stats
 */
export const getTicketStats = async (req, res) => {
  try {
    const [total, open, in_progress, resolved, closed, urgent] = await Promise.all([
      SupportTicket.countDocuments(),
      SupportTicket.countDocuments({ status: "open" }),
      SupportTicket.countDocuments({ status: "in_progress" }),
      SupportTicket.countDocuments({ status: "resolved" }),
      SupportTicket.countDocuments({ status: "closed" }),
      SupportTicket.countDocuments({ priority: "urgent", status: { $ne: "closed" } }),
    ]);

    return res.status(200).json({
      stats: {
        total,
        open,
        in_progress,
        resolved,
        closed,
        urgent,
      },
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to fetch ticket stats.",
      error: error.message,
    });
  }
};

/**
 * Worker/Admin: Get full ticket with messages and customer info
 * GET /api/support-tickets/:id
 */
export const getTicketById = async (req, res) => {
  try {
    const ticket = await SupportTicket.findById(req.params.id)
      .populate("user", "name email phone")
      .populate("assignedTo", "name email role workerRole rotationOrder")
      .populate("messages.sender", "name role");

    if (!ticket) {
      return res.status(404).json({ message: "Ticket not found." });
    }

    return res.status(200).json({ ticket });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to fetch ticket details.",
      error: error.message,
    });
  }
};

/**
 * Worker/Admin: Assign ticket to self or given worker
 * PUT /api/support-tickets/:id/assign
 */
export const assignTicket = async (req, res) => {
  try {
    const workerId = req.body.workerId || req.user._id;

    const workerUser = await User.findById(workerId);
    if (!workerUser || (!["worker", "admin", "support"].includes(workerUser.role) && workerUser.workerRole !== "support")) {
      return res.status(400).json({ message: "Invalid worker assigned." });
    }

    const ticket = await SupportTicket.findById(req.params.id);
    if (!ticket) {
      return res.status(404).json({ message: "Ticket not found." });
    }

    ticket.assignedTo = workerId;
    ticket.assignedWorkerName = workerUser.name;
    if (ticket.status === "open") {
      ticket.status = "in_progress";
    }
    await ticket.save();

    await ticket.populate("assignedTo", "name email role workerRole rotationOrder");
    await ticket.populate("user", "name email phone");

    return res.status(200).json({
      message: "Ticket assigned successfully.",
      ticket,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to assign ticket.",
      error: error.message,
    });
  }
};

/**
 * Worker/Admin: Change ticket status and notify customer
 * PUT /api/support-tickets/:id/status
 */
export const updateTicketStatus = async (req, res) => {
  try {
    const { status } = req.body;

    if (!status || !VALID_STATUSES.includes(status)) {
      return res.status(400).json({
        message: `Invalid status. Allowed: ${VALID_STATUSES.join(", ")}`,
      });
    }

    const ticket = await SupportTicket.findById(req.params.id);
    if (!ticket) {
      return res.status(404).json({ message: "Ticket not found." });
    }

    ticket.status = status;
    if (status === "resolved" || status === "closed") {
      ticket.resolvedAt = new Date();

      // If this was a reported transfer ticket, re-enable customer account & resolve transaction
      if (/\[REPORT\]/i.test(ticket.subject) || /Account temporarily suspended/i.test(ticket.description)) {
        await Account.updateOne(
          { user: ticket.user, status: "suspended" },
          { $set: { status: "active", suspensionReason: null } }
        );
        await User.updateOne(
          { _id: ticket.user, status: "suspended" },
          { $set: { status: "active" } }
        );

        const match = ticket.subject.match(/FLWTR-[A-Za-z0-9-]+/i) || ticket.description.match(/FLWTR-[A-Za-z0-9-]+/i);
        const baseReceipt = match ? match[0].replace(/-CR$/, "") : null;
        if (baseReceipt) {
          await Transaction.updateMany(
            { $or: [{ receiptNumber: baseReceipt }, { receiptNumber: `${baseReceipt}-CR` }] },
            { $set: { status: "resolved", resolvedAt: new Date(), resolvedBy: req.user._id } }
          );
          await Payment.updateMany(
            { receiptNumber: baseReceipt },
            { $set: { paymentStatus: "resolved" } }
          );
        } else {
          await Transaction.updateMany(
            { user: ticket.user, status: "reported" },
            { $set: { status: "resolved", resolvedAt: new Date(), resolvedBy: req.user._id } }
          );
        }

        await notifyUser(ticket.user, {
          type: "account",
          title: "Account & Transactions Re-enabled",
          message: `A bank worker has resolved your reported transfer ticket (${ticket.ticketNumber}). Your account is now active and transactions have been safely re-enabled.`,
          meta: { ticketId: ticket._id, ticketNumber: ticket.ticketNumber, accountStatus: "active", transactionStatus: "resolved" },
        });
      }
    }
    await ticket.save();

    // Notify customer in real-time
    const formattedStatus = status.replace("_", " ").toUpperCase();
    await notifyUser(ticket.user, {
      type: "support",
      title: `Ticket ${ticket.ticketNumber} Status: ${formattedStatus}`,
      message: `Your support ticket "${ticket.subject}" has been marked as ${formattedStatus}.`,
      meta: { ticketId: ticket._id, ticketNumber: ticket.ticketNumber, status },
    });

    await ticket.populate("assignedTo", "name");
    await ticket.populate("user", "name email phone");

    return res.status(200).json({
      message: `Ticket status updated to ${status}.`,
      ticket,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to update ticket status.",
      error: error.message,
    });
  }
};

// ==========================================
// UNIFIED / ROLE-AWARE REPLY CONTROLLER
// ==========================================

/**
 * Reply to a ticket
 * POST /api/support-tickets/:id/reply
 * Supported for customers (on own tickets) and workers/admins
 */
export const replyTicket = async (req, res) => {
  try {
    const { message } = req.body;

    if (!message || typeof message !== "string") {
      return res.status(400).json({ message: "Message content is required." });
    }
    const trimmedMessage = message.trim();
    if (trimmedMessage.length < 1 || trimmedMessage.length > 2000) {
      return res.status(400).json({ message: "Message must be between 1 and 2000 characters." });
    }

    const ticket = await SupportTicket.findById(req.params.id);
    if (!ticket) {
      return res.status(404).json({ message: "Ticket not found." });
    }

    const isCustomer = req.user.role === "customer";

    // Strict ownership check for customer
    if (isCustomer) {
      if (ticket.user.toString() !== req.user._id.toString()) {
        return res.status(403).json({ message: "You are not authorized to reply to this ticket." });
      }

      if (ticket.status === "closed") {
        return res.status(400).json({ message: "Cannot reply to a closed ticket." });
      }

      ticket.messages.push({
        sender: req.user._id,
        senderRole: "customer",
        message: trimmedMessage,
        sentAt: new Date(),
      });

      // If customer replies to a resolved ticket, we can reopen to in_progress
      if (ticket.status === "resolved") {
        ticket.status = "in_progress";
      }

      await ticket.save();

      // Notify workers of customer reply
      const preview = trimmedMessage.length > 80 ? trimmedMessage.slice(0, 77) + "..." : trimmedMessage;
      await notifyWorkers({
        type: "support",
        title: `Customer Reply on Ticket ${ticket.ticketNumber}`,
        message: `Customer replied to ticket "${ticket.subject}": ${preview}`,
        meta: { ticketId: ticket._id, ticketNumber: ticket.ticketNumber },
      });
    } else {
      // Worker or Admin replying
      ticket.messages.push({
        sender: req.user._id,
        senderRole: req.user.role === "admin" ? "admin" : "worker",
        message: trimmedMessage,
        sentAt: new Date(),
      });

      if (ticket.status === "open") {
        ticket.status = "in_progress";
      }

      if (!ticket.assignedTo) {
        ticket.assignedTo = req.user._id;
      }

      await ticket.save();

      // Notify customer of worker reply in real-time
      const preview = trimmedMessage.length > 80 ? trimmedMessage.slice(0, 77) + "..." : trimmedMessage;
      await notifyUser(ticket.user, {
        type: "support",
        title: `New Reply on Ticket ${ticket.ticketNumber}`,
        message: `Support staff replied to your ticket "${ticket.subject}": ${preview}`,
        meta: { ticketId: ticket._id, ticketNumber: ticket.ticketNumber },
      });
    }

    await ticket.populate("assignedTo", "name email role workerRole rotationOrder");
    await ticket.populate("user", "name email phone");
    await ticket.populate("messages.sender", "name role");

    return res.status(200).json({
      message: "Reply added successfully.",
      ticket,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to add reply.",
      error: error.message,
    });
  }
};

/**
 * Worker/Admin: Get live rotational assignment status and Support Team roster
 * GET /api/support-tickets/rotation-status
 */
export const getTicketRotationInfo = async (req, res) => {
  try {
    const data = await getRotationStatus();
    return res.status(200).json({
      success: true,
      ...data,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to fetch rotation status.",
      error: error.message,
    });
  }
};

/**
 * Worker/Admin: Manually trigger rotational auto-assignment on an unassigned ticket
 * POST /api/support-tickets/:id/auto-assign
 */
export const autoAssignTicket = async (req, res) => {
  try {
    const ticket = await SupportTicket.findById(req.params.id);
    if (!ticket) {
      return res.status(404).json({ message: "Ticket not found." });
    }

    await assignTicketRotational(ticket);
    await ticket.populate("assignedTo", "name email role workerRole rotationOrder");
    await ticket.populate("user", "name email phone");

    return res.status(200).json({
      message: `Ticket #${ticket.ticketNumber} assigned to ${ticket.assignedWorkerName} (Cycle #${ticket.rotationCycle}, Officer #${ticket.rotationIndex}).`,
      ticket,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to auto-assign ticket.",
      error: error.message,
    });
  }
};

