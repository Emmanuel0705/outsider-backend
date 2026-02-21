import mongoose from "mongoose";
import { Merchant } from "../db/models";

export interface CreateMerchantBody {
  organizerName: string;
  email: string;
  phoneNumber: string;
  eventCategory: string;
  customCategory?: string;
  organizerType: string;
  description?: string;
  website?: string;
}

export async function createMerchantHandler(context: {
  user: { id: string; name: string; email: string; image?: string | null };
  body: CreateMerchantBody;
  set: { status?: number | string };
}) {
  const { user, body, set } = context;
  const userIdStr = user?.id;
  if (!userIdStr || typeof userIdStr !== "string") {
    set.status = 401;
    return { error: "Unauthorized" };
  }

  let userId: mongoose.Types.ObjectId;
  try {
    userId = new mongoose.Types.ObjectId(userIdStr);
  } catch {
    set.status = 400;
    return { error: "Invalid user id" };
  }

  const existing = await Merchant.findOne({ userId });
  if (existing) {
    set.status = 409;
    return { error: "Merchant account already exists for this user" };
  }

  const doc = await Merchant.create({
    userId,
    organizerName: body.organizerName,
    email: body.email.toLowerCase().trim(),
    phoneNumber: body.phoneNumber.trim(),
    eventCategory: body.eventCategory,
    customCategory: body.customCategory?.trim() ?? "",
    organizerType: body.organizerType,
    description: body.description?.trim() ?? "",
    website: body.website?.trim() ?? "",
  });

  const merchant = doc.toObject();
  set.status = 201;
  return { merchant };
}
