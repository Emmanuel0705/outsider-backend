import mongoose from "mongoose";
import { Event, type ITicketTier } from "../../db/models";

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
}: ListEventsFilter = {}) {
  const filter: Record<string, unknown> = { status };
  if (category) filter.category = category;
  if (popular) filter.isPopular = true;
  if (recommended) filter.isRecommended = true;

  const skip = (page - 1) * limit;
  const [events, total] = await Promise.all([
    Event.find(filter).sort({ startDate: 1 }).skip(skip).limit(limit).lean(),
    Event.countDocuments(filter),
  ]);
  return { events, total, page, limit };
}

export async function updateEvent(
  id: mongoose.Types.ObjectId,
  merchantId: mongoose.Types.ObjectId,
  updates: Partial<CreateEventData>
) {
  const doc = await Event.findOneAndUpdate(
    { _id: id, merchantId },
    { $set: updates },
    { new: true }
  ).lean();
  return doc;
}

export async function deleteEvent(
  id: mongoose.Types.ObjectId,
  merchantId: mongoose.Types.ObjectId
) {
  const result = await Event.deleteOne({ _id: id, merchantId });
  return result.deletedCount > 0;
}
