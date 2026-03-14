import mongoose from "mongoose";
import { Merchant } from "../../db/models";

export async function findMerchantByUserId(userId: mongoose.Types.ObjectId) {
  const doc = await Merchant.findOne({ userId }).lean();
  if (!doc) return null;

  return {
    _id: String(doc._id),
    userId: String(doc.userId),
    organizerName: doc.organizerName,
    email: doc.email,
    phoneNumber: doc.phoneNumber,
    eventCategory: doc.eventCategory,
    customCategory: doc.customCategory,
    organizerType: doc.organizerType,
    description: doc.description,
    website: doc.website,
    status: doc.status,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

export interface CreateMerchantData {
  userId: mongoose.Types.ObjectId;
  organizerName: string;
  email: string;
  phoneNumber: string;
  eventCategory: string;
  customCategory?: string;
  organizerType: string;
  description?: string;
  website?: string;
}

export async function createMerchant(data: CreateMerchantData) {
  const doc = await Merchant.create({
    userId: data.userId,
    organizerName: data.organizerName,
    email: data.email.toLowerCase().trim(),
    phoneNumber: data.phoneNumber.trim(),
    eventCategory: data.eventCategory,
    customCategory: data.customCategory?.trim() ?? "",
    organizerType: data.organizerType,
    description: data.description?.trim() ?? "",
    website: data.website?.trim() ?? "",
  });

  return doc.toObject();
}
