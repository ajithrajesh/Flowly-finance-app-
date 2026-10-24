import bcrypt from "bcryptjs";
import User from "../models/User.js";
import SupportTicket from "../models/SupportTicket.js";
import TicketRotation from "../models/TicketRotation.js";
import { notifyUser } from "./notificationService.js";

const DEFAULT_SUPPORT_TEAM = [
  {
    name: "Support Specialist 1",
    email: "support1@flowly.com",
    phone: "9876599981",
    role: "support",
    workerRole: "support",
    rotationOrder: 1,
  },
  {
    name: "Support Specialist 2",
    email: "support2@flowly.com",
    phone: "9876599982",
    role: "support",
    workerRole: "support",
    rotationOrder: 2,
  },
  {
    name: "Support Specialist 3",
    email: "support3@flowly.com",
    phone: "9876599983",
    role: "support",
    workerRole: "support",
    rotationOrder: 3,
  },
  {
    name: "Support Specialist 4",
    email: "support4@flowly.com",
    phone: "9876599984",
    role: "support",
    workerRole: "support",
    rotationOrder: 4,
  },
];

/**
 * Ensures the 4 dedicated Support Team members exist in MongoDB.
 * Password for each: Worker@1234 (uses the same login mechanism as workers).
 */
export async function ensureDefaultSupportTeam() {
  const passwordHash = await bcrypt.hash("Worker@1234", 10);

  for (const member of DEFAULT_SUPPORT_TEAM) {
    let existing = await User.findOne({
      $or: [{ email: member.email.toLowerCase() }, { phone: member.phone }],
    });

    if (!existing) {
      await User.create({
        name: member.name,
        email: member.email.toLowerCase(),
        phone: member.phone,
        password: passwordHash,
        role: "support",
        workerRole: "support",
        rotationOrder: member.rotationOrder,
        status: "active",
        kycStatus: "verified",
        isEmailVerified: true,
      });
      console.log(`[SupportTeam] Created member #${member.rotationOrder}: ${member.email}`);
    } else {
      let needsSave = false;
      if (existing.role !== "support" || existing.workerRole !== "support") {
        existing.role = "support";
        existing.workerRole = "support";
        needsSave = true;
      }
      if (existing.rotationOrder !== member.rotationOrder) {
        existing.rotationOrder = member.rotationOrder;
        needsSave = true;
      }
      if (existing.status !== "active") {
        existing.status = "active";
        needsSave = true;
      }
      if (needsSave) {
        await existing.save();
        console.log(`[SupportTeam] Updated member #${member.rotationOrder}: ${member.email}`);
      }
    }
  }
  return await getSupportWorkers();
}

/**
 * Returns all active Support Team workers ordered by rotation order.
 */
export async function getSupportWorkers() {
  let workers = await User.find({
    $or: [{ role: "support" }, { workerRole: "support" }],
    status: "active",
  })
    .select("name email phone role workerRole rotationOrder status")
    .sort({ rotationOrder: 1, createdAt: 1, _id: 1 })
    .lean();

  if (!workers || workers.length < 4) {
    await ensureDefaultSupportTeam();
    workers = await User.find({
      $or: [{ role: "support" }, { workerRole: "support" }],
      status: "active",
    })
      .select("name email phone role workerRole rotationOrder status")
      .sort({ rotationOrder: 1, createdAt: 1, _id: 1 })
      .lean();
  }

  return workers;
}

// In-process lock to prevent race conditions during rotational assignment
let assignmentMutex = Promise.resolve();

/**
 * Concurrency-safe rotational assignment of a support ticket to the 4 Support Team workers.
 *
 * Rotational rule:
 * - 4 support workers in rotation (Order 1, Order 2, Order 3, Order 4).
 * - Ticket 1 -> Worker 1 (Order 1, Cycle 1)
 * - Ticket 2 -> Worker 2 (Order 2, Cycle 1)
 * - Ticket 3 -> Worker 3 (Order 3, Cycle 1)
 * - Ticket 4 -> Worker 4 (Order 4, Cycle 1) [End of Cycle 1]
 * - Ticket 5 -> Worker 1 (Order 1, Cycle 2) [Start of Cycle 2]
 * - Ticket 6 -> Worker 2 (Order 2, Cycle 2) ... and so on.
 */
export async function assignTicketRotational(ticketDoc) {
  let release;
  const lock = new Promise((resolve) => {
    release = resolve;
  });
  const prevLock = assignmentMutex;
  assignmentMutex = lock;

  await prevLock;
  try {
    return await _executeRotationalAssignment(ticketDoc);
  } finally {
    release();
  }
}

async function _executeRotationalAssignment(ticket) {
  const supportWorkers = await getSupportWorkers();

  if (!supportWorkers || supportWorkers.length === 0) {
    console.warn("[TicketAssignment] No active support workers available.");
    return ticket;
  }

  const numWorkers = supportWorkers.length;

  let state = await TicketRotation.findOne({ key: "support_ticket_rotation" });
  if (!state) {
    state = await TicketRotation.create({
      key: "support_ticket_rotation",
      currentIndex: 0,
      currentCycle: 1,
      totalAssigned: 0,
    });
  }

  // Calculate rotation indices
  const assignedIndex = (state.currentIndex || 0) % numWorkers;
  const cycleNumber = Math.floor((state.totalAssigned || 0) / numWorkers) + 1;
  const assignedWorker = supportWorkers[assignedIndex];

  // Assign to ticket
  ticket.assignedTo = assignedWorker._id;
  ticket.assignedWorkerName = assignedWorker.name;
  ticket.rotationCycle = cycleNumber;
  ticket.rotationIndex = assignedIndex + 1; // 1-indexed for display (1 to 4)
  ticket.assignedAt = new Date();

  // Advance rotation state
  const nextIndex = (assignedIndex + 1) % numWorkers;
  const nextCycle = Math.floor(((state.totalAssigned || 0) + 1) / numWorkers) + 1;

  state.currentIndex = nextIndex;
  state.currentCycle = nextCycle;
  state.totalAssigned = (state.totalAssigned || 0) + 1;
  state.lastAssignedWorker = assignedWorker._id;
  state.lastAssignedTicket = ticket._id;

  if (!state.history) state.history = [];
  state.history.unshift({
    ticketId: ticket._id,
    ticketNumber: ticket.ticketNumber,
    subject: ticket.subject,
    workerId: assignedWorker._id,
    workerName: assignedWorker.name,
    rotationCycle: cycleNumber,
    rotationIndex: assignedIndex + 1,
    assignedAt: new Date(),
  });
  if (state.history.length > 50) {
    state.history = state.history.slice(0, 50);
  }

  await state.save();
  await ticket.save();

  console.log(
    `[TicketAssignment] Ticket #${ticket.ticketNumber} assigned to ${assignedWorker.name} (Officer #${assignedIndex + 1}/${numWorkers}, Cycle #${cycleNumber}). Next in queue: ${supportWorkers[nextIndex]?.name || "N/A"}`
  );

  // Notify the assigned Support Team worker in real-time
  try {
    await notifyUser(assignedWorker._id, {
      type: "support",
      title: `New Ticket Assigned [Cycle #${cycleNumber} · Order ${assignedIndex + 1}]`,
      message: `Ticket #${ticket.ticketNumber} ("${ticket.subject}") has been assigned to you for investigation and resolution.`,
      meta: {
        ticketId: ticket._id,
        ticketNumber: ticket.ticketNumber,
        rotationCycle: cycleNumber,
        rotationIndex: assignedIndex + 1,
      },
    });
  } catch (err) {
    console.error("[TicketAssignment] Error sending real-time notification to worker:", err.message);
  }

  return ticket;
}

/**
 * Returns current status of rotational assignment for Admin and Staff Dashboards.
 */
export async function getRotationStatus() {
  const supportWorkers = await getSupportWorkers();
  let state = await TicketRotation.findOne({ key: "support_ticket_rotation" }).populate("lastAssignedWorker", "name email");

  if (!state) {
    state = {
      currentIndex: 0,
      currentCycle: 1,
      totalAssigned: 0,
      history: [],
    };
  }

  const numWorkers = supportWorkers.length || 1;
  const nextWorkerIndex = (state.currentIndex || 0) % numWorkers;
  const nextWorker = supportWorkers[nextWorkerIndex] || null;

  // Enrich workers with active and resolved ticket metrics
  const workerIds = supportWorkers.map((w) => w._id);
  const ticketCounts = await SupportTicket.aggregate([
    { $match: { assignedTo: { $in: workerIds } } },
    {
      $group: {
        _id: "$assignedTo",
        total: { $sum: 1 },
        open: { $sum: { $cond: [{ $eq: ["$status", "open"] }, 1, 0] } },
        in_progress: { $sum: { $cond: [{ $eq: ["$status", "in_progress"] }, 1, 0] } },
        resolved: { $sum: { $cond: [{ $eq: ["$status", "resolved"] }, 1, 0] } },
        closed: { $sum: { $cond: [{ $eq: ["$status", "closed"] }, 1, 0] } },
      },
    },
  ]);

  const countMap = new Map(ticketCounts.map((c) => [String(c._id), c]));

  const enrichedWorkers = supportWorkers.map((w, idx) => {
    const counts = countMap.get(String(w._id)) || { total: 0, open: 0, in_progress: 0, resolved: 0, closed: 0 };
    return {
      ...w,
      orderNumber: w.rotationOrder || idx + 1,
      isNextInQueue: idx === nextWorkerIndex,
      activeTickets: counts.open + counts.in_progress,
      resolvedTickets: counts.resolved + counts.closed,
      totalAssigned: counts.total,
    };
  });

  return {
    currentCycle: state.currentCycle || 1,
    totalAssigned: state.totalAssigned || 0,
    currentIndex: state.currentIndex || 0,
    numWorkers,
    nextWorker: nextWorker ? { id: nextWorker._id, name: nextWorker.name, email: nextWorker.email, orderNumber: nextWorker.rotationOrder || nextWorkerIndex + 1 } : null,
    lastAssignedWorker: state.lastAssignedWorker || null,
    workers: enrichedWorkers,
    recentAssignments: (state.history || []).slice(0, 10),
  };
}
