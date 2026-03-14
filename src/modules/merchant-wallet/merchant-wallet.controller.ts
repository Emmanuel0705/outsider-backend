import { Request, Response } from "express";
import mongoose from "mongoose";
import { findMerchantByUserId } from "../merchant/merchant.repository";
import { findOrCreateMerchantWallet } from "./merchant-wallet.repository";

export async function getMerchantWalletController(
  req: Request,
  res: Response,
) {
  const user = req.user;

  if (!user?.id) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  let userId: mongoose.Types.ObjectId;
  try {
    userId = new mongoose.Types.ObjectId(user.id);
  } catch {
    res.status(400).json({ error: "Invalid user id" });
    return;
  }

  const merchant = await findMerchantByUserId(userId);
  if (!merchant) {
    res.status(404).json({ error: "No merchant account found" });
    return;
  }

  const merchantId = new mongoose.Types.ObjectId(merchant._id);
  const wallet = await findOrCreateMerchantWallet(merchantId);

  res.json({ wallet });
}
