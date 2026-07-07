import { Request, Response } from "express";
import mongoose from "mongoose";
import { nanoid } from "nanoid";
import { CardBinding } from "../../db/models/CardBinding";
import { CardOrder, type CardOrderStatus } from "../../db/models/CardOrder";
import { Transaction } from "../../db/models/Transaction";
import { VirtualCard } from "../../db/models/VirtualCard";
import { Wallet } from "../../db/models/Wallet";
import { findOrCreateWallet } from "../wallet/wallet.repository";

const CARD_PRICE_NGN = Number(process.env.CARD_PRICE_NGN ?? "5000");
const CARD_ADMIN_KEY = process.env.CARD_ADMIN_KEY ?? "";

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function toUserObjectId(req: Request): mongoose.Types.ObjectId | null {
  const id = req.user?.id;
  if (!id) return null;
  try {
    return new mongoose.Types.ObjectId(id);
  } catch {
    return null;
  }
}

function parseCardId(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;

  try {
    const url = new URL(raw);
    const id = url.searchParams.get("id");
    if (id && /^[A-Za-z0-9_-]{8,128}$/.test(id)) {
      return id.toLowerCase();
    }
  } catch {
    // Not a URL: continue fallback parsing.
  }

  const match = raw.match(/[?&]id=([A-Za-z0-9_-]{8,128})/);
  if (match?.[1]) return match[1].toLowerCase();

  if (/^[A-Za-z0-9_-]{8,128}$/.test(raw)) return raw.toLowerCase();

  return null;
}

function generateVirtualCardId() {
  return `vc-${nanoid(14).toLowerCase()}`;
}

/**
 * Every authenticated user owns exactly one virtual card. Created lazily on
 * first read so we don't need a migration or a signup hook. Idempotent — a
 * unique index on userId means the retry path after a race still returns the
 * one that was actually persisted.
 */
export async function getOrIssueVirtualCard(userId: mongoose.Types.ObjectId) {
  const existing = await VirtualCard.findOne({ userId }).lean();
  if (existing) return existing;

  try {
    const created = await VirtualCard.create({
      userId,
      virtualCardId: generateVirtualCardId(),
    });
    return created.toObject();
  } catch (error) {
    // Race: another request just inserted one — return it.
    const raced = await VirtualCard.findOne({ userId }).lean();
    if (raced) return raced;
    throw error;
  }
}

function toVirtualCardResponse(v: {
  virtualCardId: string;
  issuedAt: Date;
}) {
  return {
    virtualCardId: v.virtualCardId,
    issuedAt: v.issuedAt,
    qrPayload: `outsider://card?vid=${v.virtualCardId}`,
  };
}

function serializeOrder(order: {
  _id: unknown;
  fullName: string;
  phoneNumber: string;
  state: string;
  address: string;
  postalCode: string;
  price: number;
  currency: string;
  reference: string;
  status: CardOrderStatus;
  cardId?: string;
  virtualCardId?: string;
  deliveredAt?: Date;
  activatedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    _id: String(order._id),
    fullName: order.fullName,
    phoneNumber: order.phoneNumber,
    state: order.state,
    address: order.address,
    postalCode: order.postalCode,
    price: order.price,
    currency: order.currency,
    reference: order.reference,
    status: order.status,
    cardId: order.cardId ?? null,
    virtualCardId: order.virtualCardId ?? null,
    deliveredAt: order.deliveredAt ?? null,
    activatedAt: order.activatedAt ?? null,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
  };
}

export async function getCardOverviewController(req: Request, res: Response) {
  const userId = toUserObjectId(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const [order, binding, virtual] = await Promise.all([
    CardOrder.findOne({ userId }).sort({ createdAt: -1 }).lean(),
    CardBinding.findOne({ userId }).lean(),
    getOrIssueVirtualCard(userId),
  ]);

  res.json({
    cardPrice: CARD_PRICE_NGN,
    hasConnectedCard: !!binding,
    card: binding
      ? {
          cardId: binding.cardId,
          connectedAt: binding.connectedAt,
        }
      : null,
    virtualCard: toVirtualCardResponse(virtual),
    order: order ? serializeOrder(order) : null,
  });
}

export async function createCardOrderController(req: Request, res: Response) {
  const userId = toUserObjectId(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const fullName = normalizeText(req.body?.fullName);
  const phoneNumber = normalizeText(req.body?.phoneNumber);
  const state = normalizeText(req.body?.state);
  const address = normalizeText(req.body?.address);
  const postalCode = normalizeText(req.body?.postalCode);

  if (!fullName || !phoneNumber || !state || !address || !postalCode) {
    res.status(400).json({
      error:
        "fullName, phoneNumber, state, address, and postalCode are required.",
    });
    return;
  }

  if (!Number.isFinite(CARD_PRICE_NGN) || CARD_PRICE_NGN <= 0) {
    res.status(500).json({ error: "Card price is not configured correctly." });
    return;
  }

  const existingActiveOrder = await CardOrder.findOne({
    userId,
    status: { $in: ["pending", "in_transit", "delivered", "activated"] },
  })
    .sort({ createdAt: -1 })
    .lean();

  if (existingActiveOrder) {
    res.status(409).json({
      error:
        "You already have an active card request. Track your order from the Card page.",
      order: serializeOrder(existingActiveOrder),
    });
    return;
  }

  await findOrCreateWallet(userId);

  const updatedWallet = await Wallet.findOneAndUpdate(
    { userId, balance: { $gte: CARD_PRICE_NGN } },
    { $inc: { balance: -CARD_PRICE_NGN } },
    { new: true }
  ).lean();

  if (!updatedWallet) {
    res.status(400).json({
      error: `Insufficient wallet balance. You need ₦${CARD_PRICE_NGN.toLocaleString("en-NG")}.`,
    });
    return;
  }

  const reference = `CARD-ORDER-${nanoid(10).toUpperCase()}`;

  const order = await CardOrder.create({
    userId,
    fullName,
    phoneNumber,
    state,
    address,
    postalCode,
    price: CARD_PRICE_NGN,
    currency: "NGN",
    reference,
    status: "pending",
  });

  await Transaction.create({
    userId,
    type: "card_order",
    amount: CARD_PRICE_NGN,
    currency: "NGN",
    status: "completed",
    reference,
    metadata: {
      source: "card-order",
      delivery: { fullName, phoneNumber, state, address, postalCode },
    },
  });

  res.status(201).json({
    success: true,
    order: serializeOrder(order.toObject()),
    walletBalance: updatedWallet.balance,
  });
}

export async function connectCardController(req: Request, res: Response) {
  const userId = toUserObjectId(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const payload = normalizeText(req.body?.payload);
  const fallbackCardId = normalizeText(req.body?.cardId);
  const cardId = parseCardId(payload || fallbackCardId);

  if (!cardId) {
    res.status(400).json({
      error: "Could not read a valid card id. Use payload with '?id=...'.",
    });
    return;
  }

  const latestOrder = await CardOrder.findOne({ userId })
    .sort({ createdAt: -1 })
    .lean();

  if (!latestOrder || !["delivered", "activated"].includes(latestOrder.status)) {
    res.status(400).json({
      error:
        "Your card is not marked as delivered yet. You can connect it after delivery.",
    });
    return;
  }

  const cardAlreadyConnected = await CardBinding.findOne({ cardId }).lean();
  if (
    cardAlreadyConnected &&
    String(cardAlreadyConnected.userId) !== String(userId)
  ) {
    res.status(409).json({
      error: "This card has already been connected to another account.",
    });
    return;
  }

  const now = new Date();
  try {
    const binding = await CardBinding.findOneAndUpdate(
      { userId },
      { $set: { cardId, sourcePayload: payload || fallbackCardId, connectedAt: now } },
      { upsert: true, new: true }
    ).lean();

    const order = await CardOrder.findOneAndUpdate(
      { _id: latestOrder._id },
      { $set: { status: "activated", cardId, activatedAt: now } },
      { new: true }
    ).lean();

    res.json({
      success: true,
      card: binding
        ? {
            cardId: binding.cardId,
            connectedAt: binding.connectedAt,
          }
        : null,
      order: order ? serializeOrder(order) : null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("duplicate key")) {
      res.status(409).json({
        error: "This card has already been connected to another account.",
      });
      return;
    }
    throw error;
  }
}

function parseVirtualCardId(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;

  try {
    const url = new URL(raw);
    const id =
      url.searchParams.get("vid") ?? url.searchParams.get("virtualCardId");
    if (id && /^[A-Za-z0-9_-]{4,64}$/.test(id)) return id.toLowerCase();
  } catch {
    // Not a URL: fall through.
  }

  const match = raw.match(/[?&](?:vid|virtualCardId)=([A-Za-z0-9_-]{4,64})/);
  if (match?.[1]) return match[1].toLowerCase();

  if (/^[A-Za-z0-9_-]{4,64}$/.test(raw)) return raw.toLowerCase();
  return null;
}

/**
 * Resolves either a virtual card QR payload or a physical NFC card id to the
 * owning user. This is the single entry-point for tap-to-pay / scan-to-enter
 * flows — both card types are first-class.
 */
export async function resolveCardController(req: Request, res: Response) {
  const payload = normalizeText(req.body?.payload);
  const rawVirtual = normalizeText(req.body?.virtualCardId);
  const rawPhysical = normalizeText(req.body?.cardId);

  const virtualCardId =
    parseVirtualCardId(rawVirtual) ?? parseVirtualCardId(payload);
  const physicalCardId = parseCardId(rawPhysical) ?? parseCardId(payload);

  if (!virtualCardId && !physicalCardId) {
    res.status(400).json({ error: "Provide a card payload, virtualCardId, or cardId." });
    return;
  }

  const virtualQuery = virtualCardId
    ? VirtualCard.findOne({ virtualCardId })
    : null;
  const legacyOrderQuery = virtualCardId
    ? CardOrder.findOne({ virtualCardId })
    : null;
  const bindingQuery = physicalCardId
    ? CardBinding.findOne({ cardId: physicalCardId })
    : null;

  const [virtual, legacyOrder, binding] = await Promise.all([
    virtualQuery ? virtualQuery.lean() : Promise.resolve(null),
    legacyOrderQuery ? legacyOrderQuery.lean() : Promise.resolve(null),
    bindingQuery ? bindingQuery.lean() : Promise.resolve(null),
  ]);

  const ownerUserId =
    (virtual?.userId ? String(virtual.userId) : null) ??
    (legacyOrder?.userId ? String(legacyOrder.userId) : null) ??
    (binding?.userId ? String(binding.userId) : null);

  if (!ownerUserId) {
    res.status(404).json({ error: "Card not recognized." });
    return;
  }

  res.json({
    success: true,
    kind: virtualCardId ? "virtual" : "physical",
    userId: ownerUserId,
    virtualCardId: virtual?.virtualCardId ?? legacyOrder?.virtualCardId ?? null,
    physicalCardId: binding?.cardId ?? legacyOrder?.cardId ?? null,
  });
}

export async function updateCardOrderStatusController(
  req: Request,
  res: Response
) {
  const suppliedKey = normalizeText(req.headers["x-card-admin-key"]);
  if (!CARD_ADMIN_KEY || suppliedKey !== CARD_ADMIN_KEY) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const { orderId } = req.params;
  const status = normalizeText(req.body?.status) as CardOrderStatus;
  const allowed: CardOrderStatus[] = [
    "pending",
    "in_transit",
    "delivered",
    "cancelled",
  ];

  if (!allowed.includes(status)) {
    res.status(400).json({ error: "Invalid status." });
    return;
  }

  let objectId: mongoose.Types.ObjectId;
  try {
    objectId = new mongoose.Types.ObjectId(String(orderId));
  } catch {
    res.status(400).json({ error: "Invalid orderId." });
    return;
  }

  const patch: Record<string, unknown> = { status };
  if (status === "delivered") patch.deliveredAt = new Date();

  const order = await CardOrder.findByIdAndUpdate(
    objectId,
    { $set: patch },
    { new: true }
  ).lean();

  if (!order) {
    res.status(404).json({ error: "Order not found." });
    return;
  }

  res.json({ success: true, order: serializeOrder(order) });
}
