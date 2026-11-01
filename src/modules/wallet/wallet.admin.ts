import type { Request, Response } from "express";
import mongoose from "mongoose";
import { Transaction } from "../../db/models/Transaction";
import { findUsers } from "../../lib/users";
import { searchPattern, clampPaging } from "../checkin/checkin.rules";
import { fetchPaystackTransaction, reconcilePendingTopUps, settleTopUp } from "./wallet.settlement";

// Admin tools for top-ups that were paid but never credited: list them, ask
// Paystack about one, or sweep them all. Crediting always goes through
// settleTopUp, so nothing is ever credited twice.

const STATUSES = ["pending", "failed", "completed"] as const;
type ListStatus = (typeof STATUSES)[number] | "all";

const adminEmail = (req: Request) => (req.admin as { email?: string } | undefined)?.email ?? "admin";

function serialize(tx: Record<string, any>, user?: { name?: string; email?: string }) {
  const meta = (tx.metadata ?? {}) as Record<string, unknown>;
  return {
    _id: String(tx._id),
    reference: tx.reference as string,
    status: tx.status as string,
    amount: tx.amount as number,
    charge: typeof meta.charge === "number" ? meta.charge : null,
    fee: typeof meta.fee === "number" ? meta.fee : null,
    currency: tx.currency as string,
    createdAt: tx.createdAt as Date,
    updatedAt: tx.updatedAt as Date,
    user: { id: String(tx.userId), name: user?.name ?? "", email: user?.email ?? "" },
    paystackStatus: (meta.paystackStatus as string | undefined) ?? null,
    lastCheckedAt: (meta.lastCheckedAt as Date | undefined) ?? null,
    failure: (meta.failure as string | undefined) ?? null,
    settledBy: (meta.settledBy as string | undefined) ?? null,
    paidKobo: (meta.paidKobo as number | undefined) ?? null,
    adminCheckedBy: (meta.adminCheckedBy as string | undefined) ?? null,
  };
}

/** GET /api/admin/topups?status=pending|failed|completed|all&search=&page=&limit= */
export async function listTopUpsController(req: Request, res: Response) {
  const status = (STATUSES as readonly string[]).includes(String(req.query.status)) ? (req.query.status as ListStatus) : req.query.status === "all" ? "all" : "pending";
  const { page, limit } = clampPaging(req.query.page, req.query.limit, 100);
  const filter: Record<string, unknown> = { type: "top_up" };
  if (status !== "all") filter.status = status;

  const pattern = searchPattern(req.query.search);
  if (pattern) {
    // Reference, or the user's email/name.
    const users = await mongoose.connection
      .db!.collection("user")
      .find({ $or: [{ email: pattern }, { name: pattern }] })
      .project({ _id: 1 })
      .limit(200)
      .toArray();
    const ids = users.map((u) => (u._id instanceof mongoose.Types.ObjectId ? u._id : new mongoose.Types.ObjectId(String(u._id))));
    filter.$or = [{ reference: pattern }, { userId: { $in: ids } }];
  }

  const [items, total, counts] = await Promise.all([
    Transaction.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    Transaction.countDocuments(filter),
    Transaction.aggregate<{ _id: string; count: number }>([{ $match: { type: "top_up" } }, { $group: { _id: "$status", count: { $sum: 1 } } }]),
  ]);
  const users = await findUsers([...new Set(items.map((t) => String(t.userId)))].map((id) => new mongoose.Types.ObjectId(id)));

  res.json({
    topUps: items.map((t) => serialize(t, users.get(String(t.userId)))),
    total,
    page,
    limit,
    counts: Object.fromEntries(STATUSES.map((s) => [s, counts.find((c) => c._id === s)?.count ?? 0])),
  });
}

/**
 * POST /api/admin/topups/:reference/check: ask Paystack about one top-up and
 * credit it if it was paid. Also reopens top-ups that were closed as unpaid
 * but later turned out to be paid. Mismatched amounts are never auto-credited.
 */
export async function checkTopUpController(req: Request, res: Response) {
  const reference = String(req.params.reference ?? "").trim();
  const tx = reference ? await Transaction.findOne({ reference, type: "top_up" }).lean() : null;
  if (!tx) {
    res.status(404).json({ error: "Top-up not found" });
    return;
  }

  let lookup: Awaited<ReturnType<typeof fetchPaystackTransaction>>;
  try {
    lookup = await fetchPaystackTransaction(reference);
  } catch {
    res.status(502).json({ error: "Couldn't reach Paystack. Try again in a moment." });
    return;
  }

  const now = new Date();
  const paystack = lookup.found
    ? { found: true, status: lookup.data.status, amountKobo: lookup.data.amount, currency: lookup.data.currency }
    : { found: false, status: "not_found", message: lookup.message };
  const audit = { "metadata.lastCheckedAt": now, "metadata.adminCheckedBy": adminEmail(req), "metadata.adminCheckedAt": now };

  const respond = async (outcome: string, message: string) => {
    const fresh = await Transaction.findById(tx._id).lean();
    const user = (await findUsers([tx.userId])).get(String(tx.userId));
    res.json({ outcome, message, paystack, topUp: serialize(fresh ?? tx, user) });
  };

  if (tx.status === "completed") {
    await respond("already_credited", "Already credited to the wallet.");
    return;
  }

  if (!lookup.found || lookup.data.status !== "success") {
    await Transaction.updateOne({ _id: tx._id }, { $set: { ...audit, "metadata.paystackStatus": paystack.status } });
    await respond("not_paid", lookup.found ? `Paystack says this payment is "${lookup.data.status}". Nothing to credit.` : "Paystack has no payment for this reference. The user never paid.");
    return;
  }

  if (tx.status === "failed") {
    if (tx.metadata?.failure === "amount_or_currency_mismatch") {
      await Transaction.updateOne({ _id: tx._id }, { $set: audit });
      await respond("needs_review", "Paid, but the amount or currency doesn't match what was started. Not credited automatically; check it in Paystack.");
      return;
    }
    // Closed as unpaid, but the user paid after all: reopen and settle.
    await Transaction.updateOne({ _id: tx._id, status: "failed" }, { $set: { status: "pending" }, $unset: { "metadata.failure": "" } });
  }

  await Transaction.updateOne({ _id: tx._id }, { $set: audit });
  const outcome = await settleTopUp(reference, lookup.data, { source: "admin" });
  switch (outcome.status) {
    case "credited":
      await respond("credited", `Credited ₦${outcome.credit.toLocaleString("en-NG")} to the wallet.`);
      return;
    case "already_completed":
      await respond("already_credited", "Already credited to the wallet.");
      return;
    case "rejected":
      await respond("needs_review", outcome.message);
      return;
    default:
      await respond("not_paid", "This top-up can't be credited.");
  }
}

/** POST /api/admin/topups/reconcile: sweep every pending top-up now. */
export async function reconcileTopUpsController(_req: Request, res: Response) {
  res.json({ success: true, summary: await reconcilePendingTopUps({ minAgeMs: 0, recheckMs: 0, limit: 500 }) });
}
