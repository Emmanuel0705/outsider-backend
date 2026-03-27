import { Request, Response } from "express";
import mongoose from "mongoose";
import { nanoid } from "nanoid";
import { Event } from "../../db/models/Event";
import { Wallet } from "../../db/models/Wallet";
import { MerchantWallet } from "../../db/models/MerchantWallet";
import { Order } from "../../db/models/Order";
import { Transaction } from "../../db/models/Transaction";
import { findOrCreateWallet } from "../wallet/wallet.repository";

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

export async function buyTicketsController(req: Request, res: Response) {
  const userId = new mongoose.Types.ObjectId(req.user!.id);

  const { eventId, items } = req.body as {
    eventId?: string;
    items?: Array<{ ticketTierId: string; quantity: number }>;
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

  // Create order
  const order = await Order.create({
    userId,
    eventId: eventObjId,
    merchantId,
    items: validatedItems.map((i) => ({
      ticketTierName: i.ticketTierName,
      quantity: i.quantity,
      unitPrice: i.unitPrice,
      currency: "NGN",
    })),
    totalAmount: total,
    currency: "NGN",
    status: "paid",
    paymentReference: reference,
  });

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
    metadata: { eventId: String(eventObjId), eventTitle: event.title },
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

  res.status(201).json({
    success: true,
    order: {
      _id: String(order._id),
      eventId: String(order.eventId),
      eventTitle: event.title,
      eventLocation: event.location ?? "",
      eventDate: event.startDate ?? "",
      items: order.items,
      totalAmount: order.totalAmount,
      currency: order.currency,
      status: order.status,
      paymentReference: order.paymentReference,
      createdAt: order.createdAt,
    },
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
        createdAt: o.createdAt,
      };
    }),
    total,
    page,
    limit,
  });
}
