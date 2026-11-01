import { Request, Response } from "express";
import mongoose from "mongoose";
import { nanoid } from "nanoid";
import { Transaction } from "../../db/models/Transaction";
import { findOrCreateWallet } from "./wallet.repository";
import { fetchPaystackTransaction, settleTopUp } from "./wallet.settlement";
import {
  MIN_TOPUP_NGN,
  chargeFor,
  checkOwnership,
  parseTopUpAmount,
  toKobo,
} from "./wallet.verification";

// ─── Get user wallet ──────────────────────────────────────────────────────────

export async function getWalletController(req: Request, res: Response) {
  const userId = new mongoose.Types.ObjectId(req.user!.id);
  const wallet = await findOrCreateWallet(userId);
  res.json({ wallet });
}

// ─── Initiate top-up ─────────────────────────────────────────────────────────
// Records a pending top-up owned by the caller. Verification later credits only
// this record, for exactly this amount (see wallet.verification.ts).

export async function initiateTopUpController(req: Request, res: Response) {
  const userId = new mongoose.Types.ObjectId(req.user!.id);
  const amount = parseTopUpAmount((req.body as { amount?: unknown }).amount);

  if (amount === null) {
    res.status(400).json({ error: `Minimum amount is ₦${MIN_TOPUP_NGN}` });
    return;
  }

  // The user covers Paystack's fee: they're charged `charge`, the wallet gets `amount`.
  const charge = chargeFor(amount);
  const fee = Math.round((charge - amount) * 100) / 100;
  const reference = `TXN-TOPUP-${nanoid(12).toUpperCase()}`;
  await Transaction.create({
    userId,
    type: "top_up",
    amount,
    currency: "NGN",
    status: "pending",
    reference,
    metadata: { source: "paystack", charge, fee },
  });

  res.json({ reference, amountKobo: toKobo(charge), amount, fee, total: charge });
}

function walletResponse(wallet: { _id: unknown; userId: unknown; balance: number; currency: string; status: string } | null) {
  return wallet
    ? {
        _id: String(wallet._id),
        userId: String(wallet.userId),
        balance: wallet.balance,
        currency: wallet.currency,
        status: wallet.status,
      }
    : null;
}

// ─── Verify top-up (called after Paystack payment succeeds) ──────────────────

export async function verifyTopUpController(req: Request, res: Response) {
  const userId = new mongoose.Types.ObjectId(req.user!.id);
  const { reference } = req.body as { reference?: string };

  if (!reference || typeof reference !== "string") {
    res.status(400).json({ error: "Reference is required" });
    return;
  }

  const tx = await Transaction.findOne({ reference, type: "top_up" }).lean();

  // Idempotent: verifying your own already-credited top-up again just returns the wallet.
  if (tx && tx.userId.equals(userId) && tx.status === "completed") {
    res.json({ success: true, wallet: walletResponse(await findOrCreateWallet(userId)) });
    return;
  }

  const pending = tx
    ? {
        userId: String(tx.userId),
        amount: tx.amount,
        charge: typeof tx.metadata?.charge === "number" ? tx.metadata.charge : undefined,
        currency: tx.currency,
        status: tx.status,
      }
    : null;
  const owner = checkOwnership(pending, String(userId));
  if (!owner.ok) {
    res.status(owner.code === "not_found" ? 404 : 400).json({ error: owner.message });
    return;
  }

  let lookup: Awaited<ReturnType<typeof fetchPaystackTransaction>>;
  try {
    lookup = await fetchPaystackTransaction(reference);
  } catch {
    res.status(400).json({ error: "Paystack verification failed" });
    return;
  }
  if (!lookup.found) {
    res.status(400).json({ error: lookup.message });
    return;
  }

  // Same settlement the webhook and reconciler use: credits at most once.
  const outcome = await settleTopUp(reference, lookup.data, { userId, source: "verify" });
  switch (outcome.status) {
    case "credited":
      res.json({ success: true, wallet: walletResponse(outcome.wallet) });
      return;
    case "already_completed":
      res.json({ success: true, wallet: walletResponse(await findOrCreateWallet(userId)) });
      return;
    case "rejected":
      res.status(400).json({ error: outcome.message });
      return;
    case "not_found":
      res.status(404).json({ error: "Unknown top-up reference" });
      return;
    case "not_pending":
      res.status(400).json({ error: "This top-up can no longer be verified" });
      return;
  }
}

// ─── Get user transactions ────────────────────────────────────────────────────

// Initiated-but-unpaid (or rejected) top-ups are internal records, not activity.
function visibleToUser(userId: mongoose.Types.ObjectId) {
  return { userId, $nor: [{ type: "top_up", status: { $in: ["pending", "failed"] } }] };
}

export async function getUserTransactionsController(
  req: Request,
  res: Response,
) {
  const userId = new mongoose.Types.ObjectId(req.user!.id);
  const limit = Math.min(
    parseInt((req.query.limit as string) ?? "50", 10),
    100,
  );
  const page = Math.max(parseInt((req.query.page as string) ?? "1", 10), 1);
  const skip = (page - 1) * limit;

  const [transactions, total] = await Promise.all([
    Transaction.find(visibleToUser(userId))
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Transaction.countDocuments(visibleToUser(userId)),
  ]);

  res.json({
    transactions: transactions.map((t) => ({
      _id: String(t._id),
      type: t.type,
      amount: t.amount,
      currency: t.currency,
      status: t.status,
      reference: t.reference,
      metadata: t.metadata,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    })),
    total,
    page,
    limit,
  });
}
