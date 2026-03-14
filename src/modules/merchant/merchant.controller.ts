import { Request, Response } from "express";
import mongoose from "mongoose";
import {
  findMerchantByUserId,
  createMerchant,
} from "./merchant.repository";

export async function createMerchantController(req: Request, res: Response) {
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

  const existing = await findMerchantByUserId(userId);
  if (existing) {
    res.status(409).json({ error: "Merchant account already exists for this user" });
    return;
  }

  const merchant = await createMerchant({
    userId,
    organizerName: req.body.organizerName,
    email: req.body.email,
    phoneNumber: req.body.phoneNumber,
    eventCategory: req.body.eventCategory,
    customCategory: req.body.customCategory,
    organizerType: req.body.organizerType,
    description: req.body.description,
    website: req.body.website,
  });

  res.status(201).json({ merchant });
}
