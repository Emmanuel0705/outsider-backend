import mongoose from "mongoose";
import { MerchantWallet } from "../../db/models";

export async function findOrCreateMerchantWallet(
  merchantId: mongoose.Types.ObjectId,
) {
  const doc = await MerchantWallet.findOneAndUpdate(
    { merchantId },
    {
      $setOnInsert: {
        merchantId,
        availableBalance: 0,
        pendingBalance: 0,
        currency: "NGN",
        status: "active",
      },
    },
    { upsert: true, new: true },
  ).lean();

  if (!doc) return null;

  return {
    _id: String(doc._id),
    merchantId: String(doc.merchantId),
    availableBalance: doc.availableBalance,
    pendingBalance: doc.pendingBalance,
    totalBalance: doc.availableBalance + doc.pendingBalance,
    currency: doc.currency,
    status: doc.status,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}
