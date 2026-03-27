import { Request, Response } from "express";
import mongoose from "mongoose";
import { findMerchantByUserId } from "../merchant/merchant.repository";
import {
  createEvent,
  deleteEvent,
  findEventById,
  findEventsByMerchant,
  listPublicEvents,
  updateEvent,
} from "./events.repository";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseObjectId(
  value: string,
  label: string,
  res: Response,
): mongoose.Types.ObjectId | null {
  try {
    return new mongoose.Types.ObjectId(value);
  } catch {
    res.status(400).json({ error: `Invalid ${label}` });
    return null;
  }
}

async function resolveMerchant(userId: string, res: Response) {
  let uid: mongoose.Types.ObjectId;
  try {
    uid = new mongoose.Types.ObjectId(userId);
  } catch {
    res.status(400).json({ error: "Invalid user id" });
    return null;
  }
  const merchant = await findMerchantByUserId(uid);
  if (!merchant) {
    res.status(403).json({ error: "Merchant account required" });
    return null;
  }
  return { merchant, merchantId: new mongoose.Types.ObjectId(merchant._id) };
}

// ─── Controllers ─────────────────────────────────────────────────────────────

export async function createEventController(req: Request, res: Response) {
  if (!req.user?.id) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const ctx = await resolveMerchant(req.user.id, res);
  if (!ctx) return;

  const {
    title,
    description,
    address,
    lga,
    state,
    startDate,
    endDate,
    category,
    image,
    ticketTiers,
    status,
  } = req.body;

  if (!title || !address || !lga || !state || !startDate || !category) {
    res
      .status(400)
      .json({
        error:
          "title, address, lga, state, startDate and category are required",
      });
    return;
  }

  if (!Array.isArray(ticketTiers) || ticketTiers.length === 0) {
    res.status(400).json({ error: "At least one ticket tier is required" });
    return;
  }

  const event = await createEvent({
    merchantId: ctx.merchantId,
    title,
    description,
    address,
    lga,
    state,
    startDate: new Date(startDate),
    endDate: endDate ? new Date(endDate) : undefined,
    category,
    image,
    ticketTiers,
    status: status === "draft" ? "draft" : "published",
  });

  res.status(201).json({ event });
}

export async function listPublicEventsController(req: Request, res: Response) {
  const { category, page, limit, popular, recommended } = req.query;
  const result = await listPublicEvents({
    category: category as string | undefined,
    page: page ? parseInt(page as string, 10) : 1,
    limit: limit ? parseInt(limit as string, 10) : 20,
    popular: popular === "true",
    recommended: recommended === "true",
  });
  res.json(result);
}

export async function getMyEventsController(req: Request, res: Response) {
  if (!req.user?.id) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const ctx = await resolveMerchant(req.user.id, res);
  if (!ctx) return;

  const { page, limit } = req.query;
  const result = await findEventsByMerchant(ctx.merchantId, {
    page: page ? parseInt(page as string, 10) : 1,
    limit: limit ? parseInt(limit as string, 10) : 20,
  });
  res.json(result);
}

export async function getEventByIdController(req: Request, res: Response) {
  const id = parseObjectId(req?.params?.id as any, "event id", res);
  if (!id) return;

  const event = await findEventById(id);
  if (!event) {
    res.status(404).json({ error: "Event not found" });
    return;
  }
  res.json({ event });
}

export async function updateEventController(req: Request, res: Response) {
  if (!req.user?.id) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const id = parseObjectId(req.params.id as any, "event id", res);
  if (!id) return;

  const ctx = await resolveMerchant(req.user.id, res);
  if (!ctx) return;

  const updated = await updateEvent(id, ctx.merchantId, req.body);
  if (!updated) {
    res.status(404).json({ error: "Event not found or not owned by you" });
    return;
  }
  res.json({ event: updated });
}

export async function deleteEventController(req: Request, res: Response) {
  if (!req.user?.id) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const id = parseObjectId(req.params.id as any, "event id", res);
  if (!id) return;

  const ctx = await resolveMerchant(req.user.id, res);
  if (!ctx) return;

  const deleted = await deleteEvent(id, ctx.merchantId);
  if (!deleted) {
    res.status(404).json({ error: "Event not found or not owned by you" });
    return;
  }
  res.status(204).send();
}
