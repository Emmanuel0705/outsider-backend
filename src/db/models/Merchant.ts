import mongoose, { Schema, model } from "mongoose";

export const EVENT_CATEGORIES = [
  "Music Concerts",
  "Parties & Nightlife",
  "Workshops",
  "Conferences",
  "Religious Events",
  "Festivals",
  "Others",
] as const;

export const ORGANIZER_TYPES = ["Individual", "Organization"] as const;

export interface IMerchant {
  userId: mongoose.Types.ObjectId;
  organizerName: string;
  email: string;
  phoneNumber: string;
  eventCategory: (typeof EVENT_CATEGORIES)[number];
  customCategory?: string;
  organizerType: (typeof ORGANIZER_TYPES)[number];
  description?: string;
  website?: string;
  status: "pending" | "verified" | "suspended";
  createdAt: Date;
  updatedAt: Date;
}

const merchantSchema = new Schema<IMerchant>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    organizerName: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    phoneNumber: { type: String, required: true, trim: true },
    eventCategory: {
      type: String,
      required: true,
      enum: EVENT_CATEGORIES,
    },
    customCategory: { type: String, trim: true, default: "" },
    organizerType: {
      type: String,
      required: true,
      enum: ORGANIZER_TYPES,
    },
    description: { type: String, trim: true, default: "" },
    website: { type: String, trim: true, default: "" },
    status: {
      type: String,
      enum: ["pending", "verified", "suspended"],
      default: "pending",
    },
  },
  { timestamps: true }
);

export const Merchant = model<IMerchant>("Merchant", merchantSchema);
