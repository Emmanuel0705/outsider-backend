import mongoose, { Schema, model } from "mongoose";

export interface IOrderItem {
  ticketTierName: string;
  quantity: number;
  unitPrice: number;
  currency?: string;
}

export interface IOrder {
  userId: mongoose.Types.ObjectId;
  eventId: mongoose.Types.ObjectId;
  merchantId: mongoose.Types.ObjectId;
  items: IOrderItem[];
  totalAmount: number;
  currency: string;
  status: "pending" | "paid" | "cancelled" | "refunded";
  paymentReference?: string;
  createdAt: Date;
  updatedAt: Date;
}

const orderItemSchema = new Schema<IOrderItem>(
  {
    ticketTierName: { type: String, required: true, trim: true },
    quantity: { type: Number, required: true, min: 1 },
    unitPrice: { type: Number, required: true, min: 0 },
    currency: { type: String, default: "NGN" },
  },
  { _id: true }
);

const orderSchema = new Schema<IOrder>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    eventId: {
      type: Schema.Types.ObjectId,
      ref: "Event",
      required: true,
      index: true,
    },
    merchantId: {
      type: Schema.Types.ObjectId,
      ref: "Merchant",
      required: true,
      index: true,
    },
    items: {
      type: [orderItemSchema],
      required: true,
      validate: {
        validator: (v: IOrderItem[]) => Array.isArray(v) && v.length > 0,
        message: "At least one item is required",
      },
    },
    totalAmount: { type: Number, required: true, min: 0 },
    currency: { type: String, default: "NGN" },
    status: {
      type: String,
      enum: ["pending", "paid", "cancelled", "refunded"],
      default: "pending",
    },
    paymentReference: { type: String, trim: true },
  },
  { timestamps: true }
);

export const Order = model<IOrder>("Order", orderSchema);
