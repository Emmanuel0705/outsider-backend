import mongoose, { Schema, model } from "mongoose";

export interface IMerchantWallet {
  merchantId: mongoose.Types.ObjectId;
  availableBalance: number;
  pendingBalance: number;
  currency: string;
  status: "active" | "frozen" | "closed";
  createdAt: Date;
  updatedAt: Date;
}

const merchantWalletSchema = new Schema<IMerchantWallet>(
  {
    merchantId: {
      type: Schema.Types.ObjectId,
      ref: "Merchant",
      required: true,
      unique: true,
      index: true,
    },
    availableBalance: { type: Number, required: true, default: 0, min: 0 },
    pendingBalance: { type: Number, required: true, default: 0, min: 0 },
    currency: { type: String, default: "NGN", trim: true },
    status: {
      type: String,
      enum: ["active", "frozen", "closed"],
      default: "active",
    },
  },
  { timestamps: true },
);

export const MerchantWallet = model<IMerchantWallet>(
  "MerchantWallet",
  merchantWalletSchema,
);
