import mongoose, { Schema, model } from "mongoose";

export type CardOrderStatus =
  | "pending"
  | "in_transit"
  | "delivered"
  | "activated"
  | "cancelled";

export interface ICardOrder {
  userId: mongoose.Types.ObjectId;
  fullName: string;
  phoneNumber: string;
  state: string;
  address: string;
  postalCode: string;
  price: number;
  currency: string;
  reference: string;
  status: CardOrderStatus;
  cardId?: string;
  deliveredAt?: Date;
  activatedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const cardOrderSchema = new Schema<ICardOrder>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    fullName: { type: String, required: true, trim: true },
    phoneNumber: { type: String, required: true, trim: true },
    state: { type: String, required: true, trim: true },
    address: { type: String, required: true, trim: true },
    postalCode: { type: String, required: true, trim: true },
    price: { type: Number, required: true, min: 0 },
    currency: { type: String, default: "NGN", trim: true },
    reference: { type: String, required: true, trim: true, unique: true },
    status: {
      type: String,
      required: true,
      enum: ["pending", "in_transit", "delivered", "activated", "cancelled"],
      default: "pending",
    },
    cardId: { type: String, trim: true, lowercase: true },
    deliveredAt: { type: Date },
    activatedAt: { type: Date },
  },
  { timestamps: true }
);

cardOrderSchema.index({ userId: 1, createdAt: -1 });

export const CardOrder = model<ICardOrder>("CardOrder", cardOrderSchema);
