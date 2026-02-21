import mongoose, { Schema, model } from "mongoose";

export type TransactionType =
  | "ticket_purchase"
  | "payout"
  | "refund"
  | "top_up"
  | "transfer";

export interface ITransaction {
  userId: mongoose.Types.ObjectId;
  orderId?: mongoose.Types.ObjectId;
  merchantId?: mongoose.Types.ObjectId;
  type: TransactionType;
  amount: number;
  currency: string;
  status: "pending" | "completed" | "failed" | "reversed";
  reference: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const transactionSchema = new Schema<ITransaction>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    orderId: { type: Schema.Types.ObjectId, ref: "Order", index: true },
    merchantId: { type: Schema.Types.ObjectId, ref: "Merchant", index: true },
    type: {
      type: String,
      required: true,
      enum: ["ticket_purchase", "payout", "refund", "top_up", "transfer"],
    },
    amount: { type: Number, required: true },
    currency: { type: String, default: "NGN" },
    status: {
      type: String,
      enum: ["pending", "completed", "failed", "reversed"],
      default: "pending",
    },
    reference: { type: String, required: true, trim: true, index: true },
    metadata: { type: Schema.Types.Mixed },
  },
  { timestamps: true }
);

export const Transaction = model<ITransaction>(
  "Transaction",
  transactionSchema
);
