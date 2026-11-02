import { Request, Response } from "express";
import mongoose from "mongoose";
import { CardBinding } from "../../db/models/CardBinding";
import { CardOrder } from "../../db/models/CardOrder";
import { CheckIn } from "../../db/models/CheckIn";
import { Event } from "../../db/models/Event";
import { Merchant } from "../../db/models/Merchant";
import { Order } from "../../db/models/Order";
import { VirtualCard } from "../../db/models/VirtualCard";
import { PhysicalTicketTally } from "../../db/models/PhysicalTicketTally";
import { findUsers, type UserDoc } from "../../lib/users";
import { getOrIssueVirtualCard } from "../card/card.controller";
import {
  checkInWindow,
  displayName,
  matchPaperTier,
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

/**
 * A tapped physical card → the owner's public profile id, so a phone that
 * reads the card opens the same profile as their QR. Unconnected cards 404.
 */
export async function getPublicCardController(req: Request, res: Response) {
  const code = parseEntryPayload(String(req.params.cardId ?? ""));
  const binding = code?.kind === "physical" ? await CardBinding.findOne({ cardId: code.id }).select("userId").lean() : null;
  const legacy = !binding && code?.kind === "physical" ? await CardOrder.findOne({ cardId: code.id }).select("userId").lean() : null;
  const ownerId = binding?.userId ?? legacy?.userId;
  if (!ownerId) {
    res.status(404).json({ status: "not_connected", error: "This card isn't connected to an account yet." });
    return;
  }
  const card = await getOrIssueVirtualCard(ownerId);
  res.set("Cache-Control", "public, max-age=60");
  res.json({ publicId: card.virtualCardId });
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
  if (code.kind === "paper") {
    await admitPaperTicket(event, code, ctx.userId, res);
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

// ─── Paper tickets (one shared QR per ticket type) ───────────────────────────

/**
 * Each scan admits one guest and atomically takes one ticket from the type, so
 * the door stops at capacity however many copies of the QR exist. The merchant
 * must have turned paper tickets on: anyone can build this QR from a public link.
 */
async function admitPaperTicket(
  event: NonNullable<Awaited<ReturnType<typeof loadOwnedEvent>>>,
  code: { id: string; eventId: string },
  scannedBy: mongoose.Types.ObjectId,
  res: Response
) {
  if (code.eventId !== String(event._id)) {
    res.status(409).json({ status: "wrong_event", error: "This ticket is for a different event." });
    return;
  }
  if (!event.physicalTicketsEnabled) {
    res.status(409).json({ status: "physical_off", error: "Physical tickets are switched off for this event." });
    return;
  }
  const tier = matchPaperTier(event.ticketTiers, code.id);
  const tierId = (tier as { _id?: mongoose.Types.ObjectId } | null)?._id;
  if (!tier || !tierId) {
    res.status(409).json({ status: "wrong_event", error: "This event has no such ticket type." });
    return;
  }
  const taken = await Event.updateOne(
    { _id: event._id, ticketTiers: { $elemMatch: { _id: tierId, soldQuantity: { $lt: tier.totalQuantity } } } },
    { $inc: { "ticketTiers.$.soldQuantity": 1 } }
  );
  if (taken.modifiedCount === 0) {
    res.status(409).json({ status: "tier_full", error: `${tier.name} is full.`, tierName: tier.name });
    return;
  }
  const now = new Date();
  const bump = () =>
    PhysicalTicketTally.findOneAndUpdate(
      { eventId: event._id, tierId },
      { $inc: { admitted: 1 }, $set: { lastScanAt: now, lastScannedBy: scannedBy } },
      { upsert: true, new: true }
    ).lean();
  // Two gates creating the first tally at once: the loser's retry finds the record.
  const tally = await bump().catch((error) => {
    if (isDuplicateKey(error)) return bump();
    throw error;
  });
  res.status(201).json({
    status: "checked_in",
    admitNow: 1,
    totalAdmitted: 1,
    tiers: [{ name: tier.name, quantity: 1 }],
    checkedInAt: now,
    paperTicket: { tierName: tier.name, number: tally?.admitted ?? 1 },
  });
}

/** PATCH /api/merchant/events/:eventId/physical-tickets { enabled } */
export async function setPhysicalTicketsController(req: Request, res: Response) {
  const ctx = await requireMerchant(req, res);
  if (!ctx) return;
  const event = await loadOwnedEvent(req.params.eventId, ctx.merchantId, res);
  if (!event) return;
  if (typeof req.body?.enabled !== "boolean") {
    res.status(400).json({ error: "enabled must be true or false" });
    return;
  }
  await Event.updateOne({ _id: event._id, merchantId: ctx.merchantId }, { $set: { physicalTicketsEnabled: req.body.enabled } });
  res.json({ enabled: req.body.enabled });
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
  const tallies = await PhysicalTicketTally.find({ eventId: event._id }).select("tierId admitted lastScanAt").lean();
  const ids = recent.map((r) => r.userId);
  const [users, publicIds] = await Promise.all([findUsers(ids), publicIdsFor(ids)]);

  res.json({
    event: { _id: String(event._id), title: event.title, startDate: event.startDate, endDate: event.endDate ?? null, status: event.status },
    ticketsSold: event.ticketTiers.reduce((sum, t) => sum + (t.soldQuantity ?? 0), 0),
    attendees: totals[0]?.attendees ?? 0,
    admitted: (totals[0]?.admitted ?? 0) + tallies.reduce((sum, t) => sum + t.admitted, 0),
    physicalTickets: {
      enabled: !!event.physicalTicketsEnabled,
      tiers: tallies.map((t) => ({
        tierName: event.ticketTiers.find((x) => String((x as { _id?: unknown })._id) === String(t.tierId))?.name ?? "Ticket",
        admitted: t.admitted,
        lastScanAt: t.lastScanAt,
      })),
    },
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
