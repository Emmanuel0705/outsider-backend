import { Request, Response } from "express";
import mongoose from "mongoose";
import { nanoid } from "nanoid";
import axios from "axios";
import { Wallet } from "../../db/models/Wallet";
import { Transaction } from "../../db/models/Transaction";
import { findOrCreateWallet } from "./wallet.repository";
import {
  MIN_TOPUP_NGN,
  checkOwnership,
  checkPaystackPayment,
  parseTopUpAmount,
  toKobo,
  type PaystackVerifyData,
} from "./wallet.verification";

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY ?? "";

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

  const reference = `TXN-TOPUP-${nanoid(12).toUpperCase()}`;
  await Transaction.create({
    userId,
    type: "top_up",
    amount,
    currency: "NGN",
    status: "pending",
    reference,
    metadata: { source: "paystack" },
  });

  res.json({ reference, amountKobo: toKobo(amount) });
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
    ? { userId: String(tx.userId), amount: tx.amount, currency: tx.currency, status: tx.status }
    : null;
  const owner = checkOwnership(pending, String(userId));
  if (!owner.ok) {
    res.status(owner.code === "not_found" ? 404 : 400).json({ error: owner.message });
    return;
  }

  let paystack: { status: boolean; data: PaystackVerifyData };
  try {
    const { data } = await axios.get(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
      { headers: { Authorization: `Bearer ${PAYSTACK_SECRET}` }, timeout: 15_000 },
    );
    paystack = data;
  } catch (err: unknown) {
    const msg =
      axios.isAxiosError(err) && err.response?.data?.message
        ? err.response.data.message
        : "Paystack verification failed";
    res.status(400).json({ error: msg });
    return;
  }

  const payment = paystack.status
    ? checkPaystackPayment(pending!, reference, paystack.data)
    : ({ ok: false, code: "not_successful", message: "Payment not successful" } as const);
  if (!payment.ok) {
    if (payment.code === "mismatch") {
      // Never credit a payment that doesn't match what was initiated.
      await Transaction.updateOne(
        { _id: tx!._id, status: "pending" },
        { $set: { status: "failed", "metadata.failure": "amount_or_currency_mismatch", "metadata.paystackAmountKobo": paystack.data.amount } },
      );
    }
    res.status(400).json({ error: payment.message });
    return;
  }

  await findOrCreateWallet(userId);

  // Atomically claim the pending record; only one concurrent verify can win.
  const claimed = await Transaction.findOneAndUpdate(
    { _id: tx!._id, userId, status: "pending" },
    { $set: { status: "completed", "metadata.paystackStatus": paystack.data.status } },
    { new: true },
  ).lean();

  if (!claimed) {
    // Another request completed it first: don't credit again.
    res.json({ success: true, wallet: walletResponse(await findOrCreateWallet(userId)) });
    return;
  }

  try {
    const updatedWallet = await Wallet.findOneAndUpdate(
      { userId },
      { $inc: { balance: claimed.amount } },
      { new: true },
    ).lean();
    res.json({ success: true, wallet: walletResponse(updatedWallet) });
  } catch (err) {
    // Release the claim so the user can retry verification.
    await Transaction.updateOne({ _id: claimed._id, status: "completed" }, { $set: { status: "pending" } });
    throw err;
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
