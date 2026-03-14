import mongoose, { Schema, model } from "mongoose";

export interface IWallet {
  userId: mongoose.Types.ObjectId;
  balance: number;
  currency: string;
  status: "active" | "frozen" | "closed";
  createdAt: Date;
  updatedAt: Date;
}

const walletSchema = new Schema<IWallet>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },
    balance: { type: Number, required: true, default: 0, min: 0 },
    currency: { type: String, default: "NGN", trim: true },
    status: {
      type: String,
      enum: ["active", "frozen", "closed"],
      default: "active",
    },
  },
  { timestamps: true }
);

export const Wallet = model<IWallet>("Wallet", walletSchema);
