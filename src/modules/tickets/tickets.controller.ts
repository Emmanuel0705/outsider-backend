import { Request, Response } from "express";
import mongoose from "mongoose";
import { nanoid } from "nanoid";
import { Event } from "../../db/models/Event";
import { Wallet } from "../../db/models/Wallet";
import { MerchantWallet } from "../../db/models/MerchantWallet";
import { Order } from "../../db/models/Order";
import { Transaction } from "../../db/models/Transaction";
import { CheckIn } from "../../db/models/CheckIn";
import { findOrCreateWallet } from "../wallet/wallet.repository";
import { findUsers } from "../../lib/users";
import { displayName } from "../checkin/checkin.rules";
import { orderTotal, splitGifts } from "./ticket-delivery";
import { deliverPurchase } from "./ticket-notifier";

// ─── Buy tickets ──────────────────────────────────────────────────────────────
//
// Flow:
//   1. Validate event + ticket tiers have capacity
//   2. Calculate total
//   3. Deduct from user wallet (atomic, fails if insufficient)
//   4. Increment soldQuantity on each tier
//   5. Create Order (paid)
//   6. Create user Transaction (ticket_purchase, completed)
//   7. Credit merchant pendingBalance (cannot withdraw until released)
//   8. Create merchant Transaction (ticket_purchase, pending)
//   9. Notify the buyer (+ email) and everyone they bought for
//
// Tickets for other people (`gifts`) become their own paid orders, so they show
// in the recipient's tickets and their own QR/card gets them in.

export async function buyTicketsController(req: Request, res: Response) {
  const userId = new mongoose.Types.ObjectId(req.user!.id);

  const { eventId, items, gifts } = req.body as {
    eventId?: string;
    items?: Array<{ ticketTierId: string; quantity: number }>;
    gifts?: unknown;
  };

  if (!eventId || !Array.isArray(items) || items.length === 0) {
    res.status(400).json({ error: "eventId and items are required" });
    return;
  }

  let eventObjId: mongoose.Types.ObjectId;
  try {
    eventObjId = new mongoose.Types.ObjectId(eventId);
  } catch {
    res.status(400).json({ error: "Invalid eventId" });
    return;
  }

  // Load event
  const event = await Event.findById(eventObjId).lean();
  if (!event || event.status !== "published") {
    res.status(404).json({ error: "Event not found or not available" });
    return;
  }

  // Validate each requested tier and calculate total
  let total = 0;
  const validatedItems: Array<{
    ticketTierId: mongoose.Types.ObjectId;
    ticketTierName: string;
    quantity: number;
    unitPrice: number;
  }> = [];

  for (const item of items) {
    let tierObjId: mongoose.Types.ObjectId;
    try {
      tierObjId = new mongoose.Types.ObjectId(item.ticketTierId);
    } catch {
      res.status(400).json({ error: `Invalid ticketTierId: ${item.ticketTierId}` });
      return;
    }

    const tier = event.ticketTiers.find((t) => String((t as any)._id) === String(tierObjId));
    if (!tier) {
      res.status(400).json({ error: `Ticket tier not found: ${item.ticketTierId}` });
      return;
    }

    const qty = Math.max(1, Math.floor(item.quantity));
    const remaining = tier.totalQuantity - tier.soldQuantity;
    if (remaining < qty) {
      res.status(400).json({ error: `Not enough tickets for tier "${tier.name}". Only ${remaining} left.` });
      return;
    }

    total += tier.price * qty;
    validatedItems.push({
      ticketTierId: tierObjId,
      ticketTierName: tier.name,
      quantity: qty,
      unitPrice: tier.price,
    });
  }

  // Who gets which tickets. Checked before any money moves.
  const split = splitGifts(
    validatedItems.map((i) => ({ ...i, ticketTierId: String(i.ticketTierId) })),
    gifts,
    String(userId)
  );
  if (!split.ok) {
    res.status(400).json({ error: split.error });
    return;
  }
  const recipientIds = split.recipients.map((r) => new mongoose.Types.ObjectId(r.userId));
  if (recipientIds.length) {
    const found = await findUsers(recipientIds);
    if (found.size !== recipientIds.length) {
      res.status(400).json({ error: "One of the people you're buying for no longer has an account." });
      return;
    }
  }

  // Ensure user wallet exists, then atomically deduct
  await findOrCreateWallet(userId);
  const updatedUserWallet = await Wallet.findOneAndUpdate(
    { userId, balance: { $gte: total } },
    { $inc: { balance: -total } },
    { new: true }
  ).lean();

  if (!updatedUserWallet) {
    res.status(400).json({ error: "Insufficient wallet balance" });
    return;
  }

  // Increment soldQuantity for each tier
  for (const item of validatedItems) {
    await Event.updateOne(
      { _id: eventObjId, "ticketTiers._id": item.ticketTierId },
      { $inc: { "ticketTiers.$.soldQuantity": item.quantity } }
    );
  }

  const reference = `TXN-TKT-${nanoid(12).toUpperCase()}`;
  const merchantId = event.merchantId;

  const toOrderItems = (list: typeof split.self) =>
    list.map((i) => ({ ticketTierName: i.ticketTierName, quantity: i.quantity, unitPrice: i.unitPrice, currency: "NGN" }));
  const baseOrder = { eventId: eventObjId, merchantId, currency: "NGN", status: "paid" as const, paymentReference: reference };

  // The buyer's own tickets (none when they only bought for others)
  const buyerOrder = split.self.length
    ? await Order.create({ ...baseOrder, userId, items: toOrderItems(split.self), totalAmount: orderTotal(split.self) })
    : null;

  // One order per person they bought for
  const giftOrders = [];
  for (const recipient of split.recipients) {
    const recipientId = new mongoose.Types.ObjectId(recipient.userId);
    const giftOrder = await Order.create({
      ...baseOrder,
      userId: recipientId,
      purchasedBy: userId,
      items: toOrderItems(recipient.items),
      totalAmount: orderTotal(recipient.items),
    });
    giftOrders.push({ recipientId, order: giftOrder });
  }
  // The money moved once; transactions point at the buyer's order (or the first gift).
  const order = buyerOrder ?? giftOrders[0]!.order;

  // User transaction
  await Transaction.create({
    userId,
    orderId: order._id,
    merchantId,
    type: "ticket_purchase",
    amount: total,
    currency: "NGN",
    status: "completed",
    reference,
    metadata: { eventId: String(eventObjId), eventTitle: event.title, giftedTo: giftOrders.length },
  });

  // Credit merchant pending balance (not available — cannot withdraw yet)
  await MerchantWallet.findOneAndUpdate(
    { merchantId },
    {
      $inc: { pendingBalance: total },
      $setOnInsert: { availableBalance: 0, currency: "NGN", status: "active" },
    },
    { upsert: true, new: true }
  );

  // Merchant transaction (pending until released to available)
  await Transaction.create({
    userId,
    orderId: order._id,
    merchantId,
    type: "ticket_purchase",
    amount: total,
    currency: "NGN",
    status: "pending",
    reference: `${reference}-MERCHANT`,
    metadata: { eventId: String(eventObjId), eventTitle: event.title, note: "pending_release" },
  });

  const serialize = (o: NonNullable<typeof buyerOrder>) => ({
    _id: String(o._id),
    eventId: String(o.eventId),
    eventTitle: event.title,
    eventLocation: event.location ?? "",
    eventDate: event.startDate ?? "",
    items: o.items,
    totalAmount: o.totalAmount,
    currency: o.currency,
    status: o.status,
    paymentReference: o.paymentReference,
    createdAt: o.createdAt,
  });

  res.status(201).json({
    success: true,
    // The buyer's order; null when every ticket went to someone else.
    order: buyerOrder ? serialize(buyerOrder) : null,
    gifts: giftOrders.map((g) => ({ orderId: String(g.order._id), recipientId: String(g.recipientId) })),
    totalAmount: total,
  });

  void deliverPurchase({
    buyerId: userId,
    buyerEmail: req.user?.email,
    event: { title: event.title, startDate: event.startDate, location: event.location, address: event.address, venue: event.venue },
    reference,
    total,
    buyerOrder,
    gifts: giftOrders,
  });
}

// ─── Get user's orders ────────────────────────────────────────────────────────

export async function getMyTicketsController(req: Request, res: Response) {
  const userId = new mongoose.Types.ObjectId(req.user!.id);
  const limit = Math.min(parseInt((req.query.limit as string) ?? "20", 10), 100);
  const page = Math.max(parseInt((req.query.page as string) ?? "1", 10), 1);
  const skip = (page - 1) * limit;

  const [orders, total] = await Promise.all([
    Order.find({ userId, status: "paid" })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Order.countDocuments({ userId, status: "paid" }),
  ]);

  // Enrich with event title
  const eventIds = [...new Set(orders.map((o) => String(o.eventId)))];
  const events = await Event.find({
    _id: { $in: eventIds.map((id) => new mongoose.Types.ObjectId(id)) },
  })
    .select("title image location startDate")
    .lean();

  const eventMap = Object.fromEntries(events.map((e) => [String(e._id), e]));
  const checkIns = await CheckIn.find({
    userId,
    eventId: { $in: eventIds.map((id) => new mongoose.Types.ObjectId(id)) },
  })
    .select("eventId checkedInAt")
    .lean();
  const checkedInByEvent = Object.fromEntries(checkIns.map((c) => [String(c.eventId), c.checkedInAt]));
  const gifters = await findUsers(
    [...new Set(orders.flatMap((o) => (o.purchasedBy ? [String(o.purchasedBy)] : [])))].map((id) => new mongoose.Types.ObjectId(id))
  );

  res.json({
    orders: orders.map((o) => {
      const ev = eventMap[String(o.eventId)];
      return {
        _id: String(o._id),
        eventId: String(o.eventId),
        eventTitle: ev?.title ?? "",
        eventImage: ev?.image ?? "",
        eventLocation: ev?.location ?? "",
        eventDate: ev?.startDate ?? null,
        items: o.items,
        totalAmount: o.totalAmount,
        currency: o.currency,
        status: o.status,
        paymentReference: o.paymentReference,
        checkedInAt: checkedInByEvent[String(o.eventId)] ?? null,
        // Gifts show who bought them (first name + initial only).
        purchasedBy: o.purchasedBy ? { name: displayName(gifters.get(String(o.purchasedBy))?.name) } : null,
        createdAt: o.createdAt,
      };
    }),
    total,
    page,
    limit,
  });
}
