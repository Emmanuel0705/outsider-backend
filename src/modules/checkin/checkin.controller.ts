import { Request, Response } from "express";
import mongoose from "mongoose";
import { CardBinding } from "../../db/models/CardBinding";
import { CardOrder } from "../../db/models/CardOrder";
import { CheckIn } from "../../db/models/CheckIn";
import { Event } from "../../db/models/Event";
import { Merchant } from "../../db/models/Merchant";
import { Order } from "../../db/models/Order";
import { VirtualCard } from "../../db/models/VirtualCard";
import {
  checkInWindow,
  displayName,
  parseEntryPayload,
  parseVirtualCardId,
  summariseAdmission,
  type EntryCode,
} from "./checkin.rules";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function toObjectId(value: unknown): mongoose.Types.ObjectId | null {
  if (typeof value !== "string" || !mongoose.isValidObjectId(value)) return null;
  return new mongoose.Types.ObjectId(value);
}

type UserDoc = { _id: unknown; name?: string; image?: string | null; createdAt?: Date };

/** better-auth's `user` collection (ids may be stored as ObjectId or string). */
async function findUsers(ids: mongoose.Types.ObjectId[]): Promise<Map<string, UserDoc>> {
  if (ids.length === 0) return new Map();
  const users = await mongoose.connection
    .db!.collection<UserDoc>("user")
    .find({ _id: { $in: [...ids, ...ids.map(String)] as never[] } })
    .project<UserDoc>({ name: 1, image: 1, createdAt: 1 })
    .toArray();
  return new Map(users.map((u) => [String(u._id), u]));
}

async function publicIdsFor(userIds: mongoose.Types.ObjectId[]) {
  const cards = await VirtualCard.find({ userId: { $in: userIds } }).select("userId virtualCardId").lean();
  return new Map(cards.map((c) => [String(c.userId), c.virtualCardId]));
}

function attendeeView(user: UserDoc | undefined, publicId: string | null) {
  return { name: displayName(user?.name), image: user?.image ?? null, publicId };
}

/** Owner of a QR / NFC credential, or null. */
async function resolveHolder(code: EntryCode): Promise<mongoose.Types.ObjectId | null> {
  if (code.kind === "virtual") {
    const card = await VirtualCard.findOne({ virtualCardId: code.id }).select("userId").lean();
    if (card) return card.userId;
    const legacy = await CardOrder.findOne({ virtualCardId: code.id }).select("userId").lean();
    return legacy?.userId ?? null;
  }
  const binding = await CardBinding.findOne({ cardId: code.id }).select("userId").lean();
  return binding?.userId ?? null;
}

/** Signed-in merchant who may run check-in. Suspended merchants are refused. */
async function requireMerchant(req: Request, res: Response) {
  const userId = toObjectId(req.user?.id);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }
  const merchant = await Merchant.findOne({ userId }).select("_id status").lean();
  if (!merchant || merchant.status === "suspended") {
    res.status(403).json({ error: "An active merchant account is required" });
    return null;
  }
  return { userId, merchantId: merchant._id as mongoose.Types.ObjectId };
}

/** Same 404 for "doesn't exist" and "not yours" so event ids can't be probed. */
async function loadOwnedEvent(eventIdRaw: unknown, merchantId: mongoose.Types.ObjectId, res: Response) {
  const eventId = toObjectId(eventIdRaw);
  const event = eventId ? await Event.findOne({ _id: eventId, merchantId }).lean() : null;
  if (!event) {
    res.status(404).json({ error: "Event not found" });
    return null;
  }
  return event;
}

const isDuplicateKey = (error: unknown) =>
  typeof error === "object" && error !== null && (error as { code?: number }).code === 11000;

// ─── Public profile ──────────────────────────────────────────────────────────

export async function getPublicProfileController(req: Request, res: Response) {
  const publicId = parseVirtualCardId(String(req.params.publicId ?? ""));
  const holderId = publicId ? await resolveHolder({ kind: "virtual", id: publicId }) : null;
  const user = holderId ? (await findUsers([holderId])).get(String(holderId)) : undefined;
  if (!holderId || !user || !publicId) {
    res.status(404).json({ error: "Profile not found" });
    return;
  }
  res.set("Cache-Control", "public, max-age=60");
  res.json({
    profile: {
      publicId,
      name: displayName(user.name),
      image: user.image ?? null,
      memberSince: user.createdAt ?? null,
    },
  });
}

// ─── Check in ────────────────────────────────────────────────────────────────

export async function checkInController(req: Request, res: Response) {
  const ctx = await requireMerchant(req, res);
  if (!ctx) return;
  const event = await loadOwnedEvent(req.params.eventId, ctx.merchantId, res);
  if (!event) return;

  const window = checkInWindow(event);
  if (!window.ok) {
    const message = {
      event_closed: "This event isn't open for check-in.",
      event_ended: "This event has ended.",
      too_early: "Check-in hasn't opened yet.",
    }[window.code];
    res.status(409).json({ status: window.code, error: message, ...("opensAt" in window ? { opensAt: window.opensAt } : {}) });
    return;
  }

  const code = parseEntryPayload(req.body?.payload);
  if (!code) {
    res.status(400).json({ status: "invalid_code", error: "That isn't an Outsiders code." });
    return;
  }
  const holderId = await resolveHolder(code);
  if (!holderId) {
    res.status(404).json({ status: "unknown_code", error: "We don't recognise this code." });
    return;
  }

  const [users, publicIds, orders] = await Promise.all([
    findUsers([holderId]),
    publicIdsFor([holderId]),
    Order.find({ eventId: event._id, userId: holderId, status: "paid" }).select("_id items").lean(),
  ]);
  const attendee = attendeeView(users.get(String(holderId)), publicIds.get(String(holderId)) ?? null);
  const entitlement = summariseAdmission(orders);

  if (entitlement.admitted === 0) {
    res.status(404).json({ status: "no_ticket", error: "No ticket for this event.", attendee });
    return;
  }

  const now = new Date();
  const record = {
    orderIds: entitlement.orderIds.map((id) => new mongoose.Types.ObjectId(id)),
    tiers: entitlement.tiers,
    lastScanAt: now,
  };

  // First scan: insert. The unique index decides races between gates.
  try {
    await CheckIn.create({
      eventId: event._id,
      merchantId: ctx.merchantId,
      userId: holderId,
      admitted: entitlement.admitted,
      checkedInBy: ctx.userId,
      checkedInAt: now,
      ...record,
    });
    res.status(201).json({
      status: "checked_in",
      admitNow: entitlement.admitted,
      totalAdmitted: entitlement.admitted,
      tiers: entitlement.tiers,
      checkedInAt: now,
      attendee,
    });
    return;
  } catch (error) {
    if (!isDuplicateKey(error)) throw error;
  }

  // Already scanned: only tickets bought since the last scan get in.
  const previous = await CheckIn.findOneAndUpdate(
    { eventId: event._id, userId: holderId, admitted: { $lt: entitlement.admitted } },
    { $set: { admitted: entitlement.admitted, ...record } },
    { new: false }
  ).lean();
  if (previous) {
    res.json({
      status: "checked_in",
      admitNow: entitlement.admitted - previous.admitted,
      totalAdmitted: entitlement.admitted,
      tiers: entitlement.tiers,
      checkedInAt: previous.checkedInAt,
      attendee,
    });
    return;
  }

  const existing = await CheckIn.findOneAndUpdate(
    { eventId: event._id, userId: holderId },
    { $set: { lastScanAt: now } },
    { new: true }
  ).lean();
  res.status(409).json({
    status: "already_checked_in",
    error: "Already checked in.",
    checkedInAt: existing?.checkedInAt ?? null,
    totalAdmitted: existing?.admitted ?? entitlement.admitted,
    attendee,
  });
}

// ─── Resolve a scanned code (merchant tools) ─────────────────────────────────

/**
 * Who does this QR / NFC code belong to? Merchant-only, and it returns the same
 * minimal attendee view as check-in: never user ids or the other card's id.
 */
export async function resolveEntryController(req: Request, res: Response) {
  const ctx = await requireMerchant(req, res);
  if (!ctx) return;
  const raw = [req.body?.payload, req.body?.virtualCardId, req.body?.cardId].find((v) => typeof v === "string" && v.trim());
  const code = parseEntryPayload(raw);
  if (!code) {
    res.status(400).json({ status: "invalid_code", error: "That isn't an Outsiders code." });
    return;
  }
  const holderId = await resolveHolder(code);
  if (!holderId) {
    res.status(404).json({ status: "unknown_code", error: "We don't recognise this code." });
    return;
  }
  const [users, publicIds] = await Promise.all([findUsers([holderId]), publicIdsFor([holderId])]);
  res.json({
    success: true,
    kind: code.kind,
    attendee: attendeeView(users.get(String(holderId)), publicIds.get(String(holderId)) ?? null),
  });
}

// ─── Door stats ──────────────────────────────────────────────────────────────

export async function getCheckInStatsController(req: Request, res: Response) {
  const ctx = await requireMerchant(req, res);
  if (!ctx) return;
  const event = await loadOwnedEvent(req.params.eventId, ctx.merchantId, res);
  if (!event) return;

  const [recent, totals] = await Promise.all([
    CheckIn.find({ eventId: event._id }).sort({ lastScanAt: -1 }).limit(20).lean(),
    CheckIn.aggregate<{ attendees: number; admitted: number }>([
      { $match: { eventId: event._id } },
      { $group: { _id: null, attendees: { $sum: 1 }, admitted: { $sum: "$admitted" } } },
    ]),
  ]);
  const ids = recent.map((r) => r.userId);
  const [users, publicIds] = await Promise.all([findUsers(ids), publicIdsFor(ids)]);

  res.json({
    event: { _id: String(event._id), title: event.title, startDate: event.startDate, endDate: event.endDate ?? null, status: event.status },
    ticketsSold: event.ticketTiers.reduce((sum, t) => sum + (t.soldQuantity ?? 0), 0),
    attendees: totals[0]?.attendees ?? 0,
    admitted: totals[0]?.admitted ?? 0,
    window: checkInWindow(event),
    recent: recent.map((r) => ({
      attendee: attendeeView(users.get(String(r.userId)), publicIds.get(String(r.userId)) ?? null),
      admitted: r.admitted,
      checkedInAt: r.checkedInAt,
      lastScanAt: r.lastScanAt,
    })),
  });
}

// ─── Candidates for a scanned profile ────────────────────────────────────────

/** Events of the signed-in merchant this profile holds tickets for (for the public profile page). */
export async function getCheckInCandidatesController(req: Request, res: Response) {
  const ctx = await requireMerchant(req, res);
  if (!ctx) return;

  const publicId = parseVirtualCardId(String(req.params.publicId ?? ""));
  const holderId = publicId ? await resolveHolder({ kind: "virtual", id: publicId }) : null;
  if (!holderId) {
    res.status(404).json({ error: "Profile not found" });
    return;
  }

  const recentCutoff = new Date(Date.now() - 36 * 3600_000);
  const orders = await Order.find({ userId: holderId, merchantId: ctx.merchantId, status: "paid" }).select("_id eventId items").lean();
  const eventIds = [...new Set(orders.map((o) => String(o.eventId)))].map((id) => new mongoose.Types.ObjectId(id));
  const [events, checkIns] = await Promise.all([
    Event.find({ _id: { $in: eventIds }, merchantId: ctx.merchantId, status: "published", startDate: { $gte: recentCutoff } })
      .select("title image startDate endDate status")
      .sort({ startDate: 1 })
      .lean(),
    CheckIn.find({ userId: holderId, eventId: { $in: eventIds } }).select("eventId admitted checkedInAt").lean(),
  ]);
  const checkInByEvent = new Map(checkIns.map((c) => [String(c.eventId), c]));

  res.json({
    events: events.map((event) => {
      const entitled = summariseAdmission(orders.filter((o) => String(o.eventId) === String(event._id))).admitted;
      const checkIn = checkInByEvent.get(String(event._id));
      return {
        eventId: String(event._id),
        title: event.title,
        image: event.image ?? null,
        startDate: event.startDate,
        entitled,
        admitted: checkIn?.admitted ?? 0,
        checkedInAt: checkIn?.checkedInAt ?? null,
        window: checkInWindow(event),
      };
    }),
  });
}
