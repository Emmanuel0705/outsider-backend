import { Request, Response } from "express";
import mongoose from "mongoose";
import { nanoid } from "nanoid";
import axios from "axios";
import { Wallet } from "../../db/models/Wallet";
import { Transaction } from "../../db/models/Transaction";
import { findOrCreateWallet } from "./wallet.repository";

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY ?? "";

// ─── Get user wallet ──────────────────────────────────────────────────────────

export async function getWalletController(req: Request, res: Response) {
  const userId = new mongoose.Types.ObjectId(req.user!.id);
  const wallet = await findOrCreateWallet(userId);
  res.json({ wallet });
}

// ─── Initiate top-up (generate reference for Paystack) ───────────────────────

export async function initiateTopUpController(req: Request, res: Response) {
  const { amount } = req.body as { amount?: number };

  if (!amount || typeof amount !== "number" || amount < 100) {
    res.status(400).json({ error: "Minimum amount is ₦100" });
    return;
  }

  // Generate a unique reference for this transaction
  const reference = `TXN-TOPUP-${nanoid(12).toUpperCase()}`;

  res.json({
    reference,
    amountKobo: Math.round(amount * 100), // Paystack expects kobo
  });
}

// ─── Verify top-up (called after Paystack payment succeeds) ──────────────────

export async function verifyTopUpController(req: Request, res: Response) {
  const userId = new mongoose.Types.ObjectId(req.user!.id);
  const { reference } = req.body as { reference?: string };

  if (!reference) {
    res.status(400).json({ error: "Reference is required" });
    return;
  }

  // Check if already processed (idempotency)
  const existing = await Transaction.findOne({ reference }).lean();
  if (existing) {
    if (existing.status === "completed") {
      const wallet = await findOrCreateWallet(userId);
      res.json({ success: true, wallet });
      return;
    }
    res.status(400).json({ error: "Transaction already processed" });
    return;
  }

  // Verify with Paystack
  let paystackData: {
    status: boolean;
    data: { status: string; amount: number; currency: string };
  };
  try {
    const { data } = await axios.get(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
      { headers: { Authorization: `Bearer ${PAYSTACK_SECRET}` } },
    );
    // console.log("Paystack verification response:", data);
    paystackData = data;
  } catch (err: unknown) {
    const msg =
      axios.isAxiosError(err) && err.response?.data?.message
        ? err.response.data.message
        : "Paystack verification failed";
    res.status(400).json({ error: msg });
    return;
  }

  if (!paystackData.status || paystackData.data.status !== "success") {
    res.status(400).json({ error: "Payment not successful" });
    return;
  }

  const amountNGN = paystackData.data.amount / 100; // convert from kobo

  // Ensure wallet exists then credit
  await findOrCreateWallet(userId);

  const updatedWallet = await Wallet.findOneAndUpdate(
    { userId },
    { $inc: { balance: amountNGN } },
    { new: true },
  ).lean();

  // Record transaction
  await Transaction.create({
    userId,
    type: "top_up",
    amount: amountNGN,
    currency: paystackData.data.currency ?? "NGN",
    status: "completed",
    reference,
    metadata: { source: "paystack", paystackStatus: paystackData.data.status },
  });

  res.json({
    success: true,
    wallet: updatedWallet
      ? {
          _id: String(updatedWallet._id),
          userId: String(updatedWallet.userId),
          balance: updatedWallet.balance,
          currency: updatedWallet.currency,
          status: updatedWallet.status,
        }
      : null,
  });
}

// ─── Get user transactions ────────────────────────────────────────────────────

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
    Transaction.find({ userId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Transaction.countDocuments({ userId }),
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
