import { Request, Response } from "express";
import mongoose from "mongoose";
import { nanoid } from "nanoid";
import { Transaction } from "../../db/models/Transaction";
import { MerchantWallet } from "../../db/models/MerchantWallet";
import { findMerchantByUserId } from "../merchant/merchant.repository";
import { findOrCreateMerchantWallet } from "./merchant-wallet.repository";

async function getMerchantForUser(userId: mongoose.Types.ObjectId, res: Response) {
  const merchant = await findMerchantByUserId(userId);
  if (!merchant) {
    res.status(404).json({ error: "No merchant account found" });
    return null;
  }
  return merchant;
}

// ─── Get merchant wallet ──────────────────────────────────────────────────────

export async function getMerchantWalletController(req: Request, res: Response) {
  const userId = new mongoose.Types.ObjectId(req.user!.id);
  const merchant = await getMerchantForUser(userId, res);
  if (!merchant) return;

  const merchantId = new mongoose.Types.ObjectId(merchant._id);
  const wallet = await findOrCreateMerchantWallet(merchantId);
  res.json({ wallet });
}

// ─── Get merchant transactions ────────────────────────────────────────────────

export async function getMerchantTransactionsController(
  req: Request,
  res: Response
) {
  const userId = new mongoose.Types.ObjectId(req.user!.id);
  const merchant = await getMerchantForUser(userId, res);
  if (!merchant) return;

  const merchantId = new mongoose.Types.ObjectId(merchant._id);
  const limit = Math.min(parseInt((req.query.limit as string) ?? "50", 10), 100);
  const page = Math.max(parseInt((req.query.page as string) ?? "1", 10), 1);
  const skip = (page - 1) * limit;

  const [transactions, total] = await Promise.all([
    Transaction.find({ merchantId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Transaction.countDocuments({ merchantId }),
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

// ─── Withdraw ─────────────────────────────────────────────────────────────────

export async function withdrawMerchantWalletController(
  req: Request,
  res: Response
) {
  const userId = new mongoose.Types.ObjectId(req.user!.id);
  const merchant = await getMerchantForUser(userId, res);
  if (!merchant) return;

  const merchantId = new mongoose.Types.ObjectId(merchant._id);
  const { amount, bankName, accountNumber, accountName } = req.body as {
    amount?: number;
    bankName?: string;
    accountNumber?: string;
    accountName?: string;
  };

  if (!amount || typeof amount !== "number" || amount <= 0) {
    res.status(400).json({ error: "Invalid amount" });
    return;
  }
  if (!bankName || !accountNumber || !accountName) {
    res.status(400).json({ error: "Bank details are required" });
    return;
  }

  const wallet = await findOrCreateMerchantWallet(merchantId);
  if (!wallet || wallet.availableBalance < amount) {
    res.status(400).json({ error: "Insufficient available balance" });
    return;
  }

  // Deduct from available balance atomically
  const updated = await MerchantWallet.findOneAndUpdate(
    { merchantId, availableBalance: { $gte: amount } },
    { $inc: { availableBalance: -amount } },
    { new: true }
  ).lean();

  if (!updated) {
    res.status(400).json({ error: "Insufficient available balance" });
    return;
  }

  // Record the payout transaction
  await Transaction.create({
    userId,
    merchantId,
    type: "payout",
    amount,
    currency: "NGN",
    status: "pending",
    reference: `TXN-PAYOUT-${nanoid(10).toUpperCase()}`,
    metadata: { bankName, accountNumber, accountName },
  });

  res.json({
    success: true,
    message: "Withdrawal request submitted. Funds will be credited within 1-2 business days.",
    wallet: {
      availableBalance: updated.availableBalance,
      pendingBalance: updated.pendingBalance,
      totalBalance: updated.availableBalance + updated.pendingBalance,
    },
  });
}
