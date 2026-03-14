import mongoose from "mongoose";
import { findMerchantByUserId } from "../merchant/merchant.repository";
import { findOrCreateWallet } from "../wallet/wallet.repository";

export async function getUserProfile(userId: mongoose.Types.ObjectId) {
  const [merchant, wallet] = await Promise.all([
    findMerchantByUserId(userId),
    findOrCreateWallet(userId),
  ]);

  return { merchant, wallet };
}
