import mongoose from "mongoose";
import { Event, type ITicketTier } from "../../db/models";
import { planTierUpdate } from "./event-tiers";

export interface CreateEventData {
  merchantId: mongoose.Types.ObjectId;
  title: string;
  description?: string;
  address: string;
  lga: string;
  state: string;
  location?: string;
  startDate: Date;
  endDate?: Date;
  category: string;
  image?: string;
  ticketTiers: Array<{
    name: string;
    price: number;
    totalQuantity: number;
    currency?: string;
  }>;
  status?: "draft" | "published";
}

export interface ListEventsFilter {
  upcoming?: boolean;
  search?: RegExp | null;
  category?: string;
  status?: string;
  merchantId?: mongoose.Types.ObjectId;
  page?: number;
  limit?: number;
  popular?: boolean;
  recommended?: boolean;
}

export async function createEvent(data: CreateEventData) {
  const doc = await Event.create({
    merchantId: data.merchantId,
    title: data.title.trim(),
    description: data.description?.trim() ?? "",
    address: data.address.trim(),
    lga: data.lga.trim(),
    state: data.state.trim(),
    location: `${data.address.trim()}, ${data.lga.trim()}, ${data.state.trim()}`,
    startDate: data.startDate,
    endDate: data.endDate,
    category: data.category,
    image: data.image ?? "",
    ticketTiers: data.ticketTiers.map((t) => ({
      name: t.name.trim(),
      price: t.price,
      totalQuantity: t.totalQuantity,
      soldQuantity: 0,
      currency: t.currency ?? "NGN",
    })),
    status: data.status ?? "published",
  });

  return doc.toObject();
}

export async function findEventById(id: mongoose.Types.ObjectId) {
  return Event.findById(id).lean();
}

export async function findEventsByMerchant(
  merchantId: mongoose.Types.ObjectId,
  { page = 1, limit = 20 }: { page?: number; limit?: number } = {}
) {
  const skip = (page - 1) * limit;
  const [events, total] = await Promise.all([
    Event.find({ merchantId }).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Event.countDocuments({ merchantId }),
  ]);
  return { events, total, page, limit };
}

export async function listPublicEvents({
  category,
  status = "published",
  page = 1,
  limit = 20,
  popular,
  recommended,
  upcoming,
  search,
}: ListEventsFilter = {}) {
  const filter: Record<string, unknown> = { status };
  if (category) filter.category = category;
  if (upcoming) {
    const now = new Date();
    filter.$or = [
      { endDate: { $gte: now } },
      { endDate: null, startDate: { $gte: new Date(now.getTime() - 12 * 3600_000) } },
    ];
  }
  if (search) {
    filter.$and = [
      { $or: [{ title: search }, { location: search }, { venue: search }, { state: search }, { category: search }] },
    ];
  }
  if (popular) filter.isPopular = true;
  if (recommended) filter.isRecommended = true;

  const skip = (page - 1) * limit;
  const [events, total] = await Promise.all([
    Event.find(filter).sort({ startDate: 1 }).skip(skip).limit(limit).lean(),
    Event.countDocuments(filter),
  ]);
  return { events, total, page, limit };
}

const TEXT_FIELDS = ["title", "description", "address", "lga", "state", "venue", "category", "image"] as const;

export type UpdateEventResult =
  | { ok: true; event: Awaited<ReturnType<typeof findEventById>> }
  | { ok: false; status: 400 | 404 | 409; error: string };

/**
 * Owner update. Only editable fields are applied (never sold counts, merchant
 * or promotion flags). Ticket tiers are merged, not replaced: see planTierUpdate.
 */
export async function updateEvent(
  id: mongoose.Types.ObjectId,
  merchantId: mongoose.Types.ObjectId,
  body: Record<string, unknown>
): Promise<UpdateEventResult> {
  const current = await Event.findOne({ _id: id, merchantId }).lean();
  if (!current) return { ok: false, status: 404, error: "Event not found or not owned by you" };

  const set: Record<string, unknown> = {};
  for (const field of TEXT_FIELDS) {
    if (body[field] === undefined) continue;
    if (typeof body[field] !== "string") return { ok: false, status: 400, error: `${field} must be text` };
    set[field] = (body[field] as string).trim();
  }
  if ((set.title as string | undefined) === "") return { ok: false, status: 400, error: "Title can't be empty" };
  if (Array.isArray(body.images)) set.images = body.images.filter((x): x is string => typeof x === "string").slice(0, 20);
  for (const field of ["startDate", "endDate"] as const) {
    if (body[field] === undefined) continue;
    if (body[field] === null && field === "endDate") {
      set.endDate = null;
      continue;
    }
    const date = new Date(body[field] as string);
    if (Number.isNaN(date.getTime())) return { ok: false, status: 400, error: `${field} is not a valid date` };
    set[field] = date;
  }
  if (body.status !== undefined) {
    // Organizers switch between draft and published; cancelled/completed are admin-managed.
    if (body.status !== "draft" && body.status !== "published") return { ok: false, status: 400, error: "Invalid status" };
    if (current.status !== "draft" && current.status !== "published") return { ok: false, status: 409, error: `A ${current.status} event can't be republished` };
    set.status = body.status;
  }
  if (set.address !== undefined || set.lga !== undefined || set.state !== undefined) {
    const address = (set.address as string | undefined) ?? current.address;
    const lga = (set.lga as string | undefined) ?? current.lga;
    const state = (set.state as string | undefined) ?? current.state;
    set.location = `${address}, ${lga}, ${state}`;
  }

  let plan: ReturnType<typeof planTierUpdate> | null = null;
  if (body.ticketTiers !== undefined) {
    plan = planTierUpdate(
      current.ticketTiers.map((t) => ({
        _id: String((t as { _id?: unknown })._id),
        name: t.name,
        price: t.price,
        totalQuantity: t.totalQuantity,
        soldQuantity: t.soldQuantity ?? 0,
      })),
      body.ticketTiers
    );
    if (!plan.ok) return { ok: false, status: 400, error: plan.error };
  }

  if (Object.keys(set).length) await Event.updateOne({ _id: id, merchantId }, { $set: set });

  if (plan?.ok) {
    // One atomic update per tier. soldQuantity is never written; the filter makes
    // sure a sale that landed while the organizer was editing still fits.
    for (const change of plan.updates) {
      const result = await Event.updateOne(
        { _id: id, merchantId, ticketTiers: { $elemMatch: { _id: new mongoose.Types.ObjectId(change.id), soldQuantity: { $lte: change.totalQuantity } } } },
        {
          $set: {
            "ticketTiers.$[tier].name": change.name,
            "ticketTiers.$[tier].price": change.price,
            "ticketTiers.$[tier].totalQuantity": change.totalQuantity,
          },
        },
        { arrayFilters: [{ "tier._id": new mongoose.Types.ObjectId(change.id) }] }
      );
      if (result.matchedCount === 0) {
        return { ok: false, status: 409, error: `More "${change.name}" tickets sold while you were editing. Reload and try again.` };
      }
    }
    if (plan.removes.length) {
      await Event.updateOne(
        { _id: id, merchantId },
        { $pull: { ticketTiers: { _id: { $in: plan.removes.map((x) => new mongoose.Types.ObjectId(x)) }, soldQuantity: 0 } } }
      );
    }
    if (plan.adds.length) {
      await Event.updateOne(
        { _id: id, merchantId },
        { $push: { ticketTiers: { $each: plan.adds.map((t) => ({ ...t, soldQuantity: 0, currency: "NGN" })) } } }
      );
    }
  }

  return { ok: true, event: await findEventById(id) };
}

export async function deleteEvent(
  id: mongoose.Types.ObjectId,
  merchantId: mongoose.Types.ObjectId
) {
  const result = await Event.deleteOne({ _id: id, merchantId });
  return result.deletedCount > 0;
}
