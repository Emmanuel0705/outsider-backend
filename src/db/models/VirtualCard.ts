import mongoose, { Schema, model } from "mongoose";

/**
 * Every user gets a virtual access card the moment they exist. It's the
 * scannable QR credential that unlocks event entry — no payment required.
 * (A `CardOrder` + `CardBinding` still model the *physical* NFC card, which
 * is a separate, optional purchase.)
 */
export interface IVirtualCard {
  userId: mongoose.Types.ObjectId;
  virtualCardId: string;
  issuedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const virtualCardSchema = new Schema<IVirtualCard>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },
    virtualCardId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      index: true,
    },
    issuedAt: { type: Date, required: true, default: Date.now },
  },
  { timestamps: true }
);

export const VirtualCard = model<IVirtualCard>("VirtualCard", virtualCardSchema);
