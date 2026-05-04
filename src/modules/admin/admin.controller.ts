import { Request, Response } from "express";
import mongoose from "mongoose";
import {
  AccountStatus,
  BetterAuthUser,
  CardBinding,
  CardOrder,
  Event,
  Merchant,
  MerchantWallet,
  Order,
  UserProfile,
  Wallet,
} from "../../db/models";
import { createAdminToken, getAdminEmail, validateAdminCredentials } from "../../lib/admin-auth";

type UserLite = {
  id?: string;
  _id?: unknown;
  name: string;
  email: string;
  createdAt: Date;
  updatedAt: Date;
};

function toPositiveInt(value: unknown, fallback: number, max: number) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (Number.isNaN(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, max);
}

function makeRegex(value?: string) {
  const q = value?.trim();
  if (!q) return null;
  return new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
}

function toObjectIdOrNull(value: string) {
  try {
    return new mongoose.Types.ObjectId(value);
  } catch {
    return null;
  }
}

function getStableUserId(user: { id?: string; _id?: unknown }) {
  const directId = typeof user.id === "string" ? user.id.trim() : "";
  if (directId) return directId;

  if (user._id) {
    const fallback = String(user._id).trim();
    if (fallback) return fallback;
  }

  return "";
}

async function findAdminUserByIdentifier(
  identifier: string,
  selectFields: string
) {
  const byId = await BetterAuthUser.findOne({ id: identifier })
    .select(selectFields)
    .lean();
  if (byId) return byId;

  const objectId = toObjectIdOrNull(identifier);
  if (!objectId) return null;

  return BetterAuthUser.findById(objectId).select(selectFields).lean();
}

async function buildUserSummaries(users: UserLite[]) {
  const pairs = users
    .map((user) => {
      const stableId = getStableUserId(user);
      return { user, stableId, objectId: toObjectIdOrNull(stableId) };
    })
    .filter(
      (
        entry
      ): entry is {
        user: UserLite;
        stableId: string;
        objectId: mongoose.Types.ObjectId;
      } => !!entry.objectId
    );

  const objectIds = pairs.map((pair) => pair.objectId);

  const [merchants, wallets, accountStatuses] = await Promise.all([
    Merchant.find({ userId: { $in: objectIds } })
      .select("userId organizerName status")
      .lean(),
    Wallet.find({ userId: { $in: objectIds } })
      .select("userId balance status currency")
      .lean(),
    AccountStatus.find({ userId: { $in: objectIds } })
      .select("userId isActive deactivatedAt")
      .lean(),
  ]);

  const merchantByUser = new Map(merchants.map((m) => [String(m.userId), m]));
  const walletByUser = new Map(wallets.map((w) => [String(w.userId), w]));
  const accountByUser = new Map(accountStatuses.map((a) => [String(a.userId), a]));

  return users.map((user) => {
    const stableId = getStableUserId(user);
    const key = toObjectIdOrNull(stableId)?.toString() ?? "";
    const merchant = merchantByUser.get(key);
    const wallet = walletByUser.get(key);
    const account = accountByUser.get(key);

    return {
      id: stableId,
      name: user.name,
      email: user.email,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      isActive: account ? account.isActive : true,
      deactivatedAt: account?.deactivatedAt ?? null,
      wallet: wallet
        ? {
            balance: wallet.balance,
            currency: wallet.currency,
            status: wallet.status,
          }
        : null,
      merchant: merchant
        ? {
            organizerName: merchant.organizerName,
            status: merchant.status,
          }
        : null,
    };
  });
}

export function adminLoginController(req: Request, res: Response) {
  const email = typeof req.body?.email === "string" ? req.body.email : "";
  const password = typeof req.body?.password === "string" ? req.body.password : "";

  if (!validateAdminCredentials(email, password)) {
    res.status(401).json({ error: "Invalid admin credentials" });
    return;
  }

  const token = createAdminToken();

  res.json({
    success: true,
    token,
    admin: {
      email: getAdminEmail(),
    },
  });
}

export async function adminOverviewController(_: Request, res: Response) {
  const now = new Date();

  const [
    totalUsers,
    totalEvents,
    upcomingEvents,
    totalPaidOrders,
    totalCardOrders,
    totalMerchants,
    verifiedMerchants,
    deactivatedUsers,
    ticketStats,
    orderAmountStats,
  ] = await Promise.all([
    BetterAuthUser.countDocuments({}),
    Event.countDocuments({}),
    Event.countDocuments({ status: "published", startDate: { $gte: now } }),
    Order.countDocuments({ status: "paid" }),
    CardOrder.countDocuments({}),
    Merchant.countDocuments({}),
    Merchant.countDocuments({ status: "verified" }),
    AccountStatus.countDocuments({ isActive: false }),
    Order.aggregate<{ totalTickets: number }>([
      { $match: { status: "paid" } },
      { $unwind: "$items" },
      { $group: { _id: null, totalTickets: { $sum: "$items.quantity" } } },
    ]),
    Order.aggregate<{ totalAmount: number }>([
      { $match: { status: "paid" } },
      { $group: { _id: null, totalAmount: { $sum: "$totalAmount" } } },
    ]),
  ]);

  res.json({
    metrics: {
      totalUsers,
      deactivatedUsers,
      totalEvents,
      upcomingEvents,
      totalPurchasedTickets: ticketStats[0]?.totalTickets ?? 0,
      totalPaidOrders,
      totalRevenue: orderAmountStats[0]?.totalAmount ?? 0,
      totalCardOrders,
      totalMerchants,
      verifiedMerchants,
    },
  });
}

export async function listAdminUsersController(req: Request, res: Response) {
  const page = toPositiveInt(req.query.page, 1, 10000);
  const limit = toPositiveInt(req.query.limit, 20, 100);
  const skip = (page - 1) * limit;
  const searchRegex = makeRegex(req.query.search as string | undefined);

  const filter = searchRegex
    ? {
        $or: [{ name: searchRegex }, { email: searchRegex }],
      }
    : {};

  const [users, total] = await Promise.all([
    BetterAuthUser.find(filter)
      .select("id name email createdAt updatedAt")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean<UserLite[]>(),
    BetterAuthUser.countDocuments(filter),
  ]);

  const summaries = await buildUserSummaries(users);

  res.json({ users: summaries, total, page, limit });
}

export async function getAdminUserDetailController(req: Request, res: Response) {
  const userId = String(req.params.userId);

  const user = await findAdminUserByIdentifier(
    userId,
    "_id id name email emailVerified image createdAt updatedAt"
  );

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const objectId = toObjectIdOrNull(getStableUserId(user));
  if (!objectId) {
    res.status(400).json({ error: "User id is not compatible with admin views" });
    return;
  }

  const [profile, wallet, merchant, cardBinding, merchantWallet, accountStatus, eventsCount, paidOrdersCount] =
    await Promise.all([
      UserProfile.findOne({ userId: objectId }).lean(),
      Wallet.findOne({ userId: objectId }).lean(),
      Merchant.findOne({ userId: objectId }).lean(),
      CardBinding.findOne({ userId: objectId }).lean(),
      Merchant.findOne({ userId: objectId })
        .select("_id")
        .lean()
        .then((m) => {
          if (!m?._id) return null;
          return MerchantWallet.findOne({ merchantId: m._id }).lean();
        }),
      AccountStatus.findOne({ userId: objectId }).lean(),
      Merchant.findOne({ userId: objectId })
        .select("_id")
        .lean()
        .then((m) => {
          if (!m?._id) return 0;
          return Event.countDocuments({ merchantId: m._id });
        }),
      Order.countDocuments({ userId: objectId, status: "paid" }),
    ]);

  res.json({
    user: {
      ...user,
      id: getStableUserId(user),
      isActive: accountStatus ? accountStatus.isActive : true,
      deactivatedAt: accountStatus?.deactivatedAt ?? null,
      deactivationReason: accountStatus?.deactivationReason ?? null,
    },
    profile,
    wallet,
    merchant,
    cardBinding,
    merchantWallet,
    stats: {
      eventsCount,
      paidOrdersCount,
    },
  });
}

export async function updateAdminUserStatusController(req: Request, res: Response) {
  const userId = String(req.params.userId);
  const isActive = req.body?.isActive;
  const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";

  if (typeof isActive !== "boolean") {
    res.status(400).json({ error: "isActive (boolean) is required" });
    return;
  }

  const user = await findAdminUserByIdentifier(userId, "_id id");
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const objectId = toObjectIdOrNull(getStableUserId(user));
  if (!objectId) {
    res.status(400).json({ error: "User id is not compatible with status updates" });
    return;
  }

  const account = await AccountStatus.findOneAndUpdate(
    { userId: objectId },
    {
      $set: {
        isActive,
        deactivatedAt: isActive ? null : new Date(),
        deactivationReason: isActive ? "" : reason,
        updatedBy: req.admin?.email ?? "admin",
      },
    },
    { upsert: true, new: true }
  ).lean();

  res.json({
    success: true,
    accountStatus: {
      isActive: account?.isActive ?? true,
      deactivatedAt: account?.deactivatedAt ?? null,
      deactivationReason: account?.deactivationReason ?? null,
    },
  });
}

export async function unlinkAdminUserCardController(req: Request, res: Response) {
  const userId = String(req.params.userId);

  const user = await findAdminUserByIdentifier(userId, "_id id");
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const objectId = toObjectIdOrNull(getStableUserId(user));
  if (!objectId) {
    res.status(400).json({ error: "User id is not compatible with card unlink" });
    return;
  }

  const deleted = await CardBinding.findOneAndDelete({ userId: objectId }).lean();

  res.json({
    success: true,
    unlinked: !!deleted,
    card: deleted
      ? {
          cardId: deleted.cardId,
          connectedAt: deleted.connectedAt,
        }
      : null,
  });
}

export async function listAdminEventsController(req: Request, res: Response) {
  const page = toPositiveInt(req.query.page, 1, 10000);
  const limit = toPositiveInt(req.query.limit, 20, 100);
  const skip = (page - 1) * limit;
  const searchRegex = makeRegex(req.query.search as string | undefined);
  const status = typeof req.query.status === "string" ? req.query.status.trim() : "";

  const filter: Record<string, unknown> = {};
  if (searchRegex) {
    filter.$or = [
      { title: searchRegex },
      { category: searchRegex },
      { location: searchRegex },
      { address: searchRegex },
      { state: searchRegex },
    ];
  }
  if (status) {
    filter.status = status;
  }

  const [events, total] = await Promise.all([
    Event.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Event.countDocuments(filter),
  ]);

  const merchantIds = [...new Set(events.map((event) => String(event.merchantId)))].map(
    (id) => new mongoose.Types.ObjectId(id)
  );

  const merchants = await Merchant.find({ _id: { $in: merchantIds } })
    .select("_id organizerName userId")
    .lean();

  const merchantById = new Map(merchants.map((m) => [String(m._id), m]));

  res.json({
    events: events.map((event) => {
      const merchant = merchantById.get(String(event.merchantId));
      return {
        _id: String(event._id),
        title: event.title,
        category: event.category,
        location: event.location,
        startDate: event.startDate,
        status: event.status,
        createdAt: event.createdAt,
        merchant: merchant
          ? {
              _id: String(merchant._id),
              organizerName: merchant.organizerName,
              userId: String(merchant.userId),
            }
          : null,
      };
    }),
    total,
    page,
    limit,
  });
}

export async function getAdminEventDetailController(req: Request, res: Response) {
  const id = toObjectIdOrNull(String(req.params.eventId));
  if (!id) {
    res.status(400).json({ error: "Invalid event id" });
    return;
  }

  const event = await Event.findById(id).lean();
  if (!event) {
    res.status(404).json({ error: "Event not found" });
    return;
  }

  const [merchant, orderStats] = await Promise.all([
    Merchant.findById(event.merchantId).lean(),
    Order.aggregate<{
      paidOrders: number;
      totalTicketsSold: number;
      totalAmount: number;
    }>([
      { $match: { eventId: id, status: "paid" } },
      { $unwind: "$items" },
      {
        $group: {
          _id: "$_id",
          ticketsInOrder: { $sum: "$items.quantity" },
          orderAmount: { $first: "$totalAmount" },
        },
      },
      {
        $group: {
          _id: null,
          paidOrders: { $sum: 1 },
          totalTicketsSold: { $sum: "$ticketsInOrder" },
          totalAmount: { $sum: "$orderAmount" },
        },
      },
    ]),
  ]);

  res.json({
    event,
    merchant,
    stats: {
      paidOrders: orderStats[0]?.paidOrders ?? 0,
      totalTicketsSold: orderStats[0]?.totalTicketsSold ?? 0,
      totalAmount: orderStats[0]?.totalAmount ?? 0,
    },
  });
}

export async function updateAdminEventStatusController(req: Request, res: Response) {
  const id = toObjectIdOrNull(String(req.params.eventId));
  if (!id) {
    res.status(400).json({ error: "Invalid event id" });
    return;
  }

  const action = typeof req.body?.action === "string" ? req.body.action.trim() : "";
  const requestedStatus = typeof req.body?.status === "string" ? req.body.status.trim() : "";

  let nextStatus = requestedStatus;
  if (action === "activate") nextStatus = "published";
  if (action === "deactivate") nextStatus = "cancelled";

  if (!nextStatus || !["draft", "published", "cancelled", "completed"].includes(nextStatus)) {
    res.status(400).json({
      error: "status must be one of draft, published, cancelled, completed (or use action activate/deactivate)",
    });
    return;
  }

  const event = await Event.findByIdAndUpdate(
    id,
    { $set: { status: nextStatus } },
    { new: true }
  ).lean();

  if (!event) {
    res.status(404).json({ error: "Event not found" });
    return;
  }

  res.json({ success: true, event });
}

export async function listAdminCardOrdersController(req: Request, res: Response) {
  const page = toPositiveInt(req.query.page, 1, 10000);
  const limit = toPositiveInt(req.query.limit, 20, 100);
  const skip = (page - 1) * limit;
  const searchRegex = makeRegex(req.query.search as string | undefined);
  const status = typeof req.query.status === "string" ? req.query.status.trim() : "";

  const filter: Record<string, unknown> = {};
  if (searchRegex) {
    filter.$or = [
      { fullName: searchRegex },
      { phoneNumber: searchRegex },
      { reference: searchRegex },
      { cardId: searchRegex },
      { state: searchRegex },
    ];
  }
  if (status) {
    filter.status = status;
  }

  const [orders, total] = await Promise.all([
    CardOrder.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    CardOrder.countDocuments(filter),
  ]);

  const userObjectIds = [...new Set(orders.map((order) => String(order.userId)))].map(
    (id) => new mongoose.Types.ObjectId(id)
  );

  const users = await BetterAuthUser.find({ id: { $in: userObjectIds.map((id) => id.toString()) } })
    .select("id name email")
    .lean();

  const userById = new Map(users.map((u) => [u.id, u]));

  res.json({
    cardOrders: orders.map((order) => {
      const user = userById.get(String(order.userId));
      return {
        ...order,
        _id: String(order._id),
        user: user
          ? {
              id: user.id,
              name: user.name,
              email: user.email,
            }
          : null,
      };
    }),
    total,
    page,
    limit,
  });
}

export async function getAdminCardOrderDetailController(req: Request, res: Response) {
  const id = toObjectIdOrNull(String(req.params.orderId));
  if (!id) {
    res.status(400).json({ error: "Invalid order id" });
    return;
  }

  const order = await CardOrder.findById(id).lean();
  if (!order) {
    res.status(404).json({ error: "Card order not found" });
    return;
  }

  const user = await BetterAuthUser.findOne({ id: String(order.userId) })
    .select("id name email")
    .lean();

  res.json({
    order,
    user: user
      ? {
          id: user.id,
          name: user.name,
          email: user.email,
        }
      : null,
  });
}

export async function updateAdminCardOrderStatusController(req: Request, res: Response) {
  const id = toObjectIdOrNull(String(req.params.orderId));
  if (!id) {
    res.status(400).json({ error: "Invalid order id" });
    return;
  }

  const status = typeof req.body?.status === "string" ? req.body.status.trim() : "";
  const allowed = ["pending", "in_transit", "delivered", "activated", "cancelled"];
  if (!allowed.includes(status)) {
    res.status(400).json({ error: `status must be one of ${allowed.join(", ")}` });
    return;
  }

  const patch: Record<string, unknown> = { status };
  if (status === "delivered") {
    patch.deliveredAt = new Date();
  }
  if (status === "activated") {
    patch.activatedAt = new Date();
  }

  const order = await CardOrder.findByIdAndUpdate(id, { $set: patch }, { new: true }).lean();
  if (!order) {
    res.status(404).json({ error: "Card order not found" });
    return;
  }

  res.json({ success: true, order });
}
