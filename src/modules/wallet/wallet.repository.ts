import mongoose from "mongoose";
import { Wallet } from "../../db/models";

export async function findOrCreateWallet(userId: mongoose.Types.ObjectId) {
  const doc = await Wallet.findOneAndUpdate(
    { userId },
    { $setOnInsert: { userId, balance: 0, currency: "NGN", status: "active" } },
    { upsert: true, new: true },
  ).lean();

  if (!doc) return null;

  return {
    _id: String(doc._id),
    userId: String(doc.userId),
    balance: doc.balance,
    currency: doc.currency,
    status: doc.status,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}
