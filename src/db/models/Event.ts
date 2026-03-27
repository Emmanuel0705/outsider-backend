import mongoose, { Schema, model } from "mongoose";

export interface ITicketTier {
  name: string;
  price: number;
  totalQuantity: number;
  soldQuantity: number;
  currency?: string;
}

export interface IEvent {
  merchantId: mongoose.Types.ObjectId;
  title: string;
  description?: string;
  address: string;
  lga: string;
  state: string;
  location: string;
  venue?: string;
  startDate: Date;
  endDate?: Date;
  category: string;
  image?: string;
  images?: string[];
  ticketTiers: ITicketTier[];
  status: "draft" | "published" | "cancelled" | "completed";
  isFavoriteCount?: number;
  isPopular?: boolean;
  isRecommended?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const ticketTierSchema = new Schema<ITicketTier>(
  {
    name: { type: String, required: true, trim: true },
    price: { type: Number, required: true, min: 0 },
    totalQuantity: { type: Number, required: true, min: 0 },
    soldQuantity: { type: Number, default: 0, min: 0 },
    currency: { type: String, default: "NGN" },
  },
  { _id: true }
);

const eventSchema = new Schema<IEvent>(
  {
    merchantId: {
      type: Schema.Types.ObjectId,
      ref: "Merchant",
      required: true,
      index: true,
    },
    title: { type: String, required: true, trim: true },
    description: { type: String, trim: true, default: "" },
    address: { type: String, required: true, trim: true },
    lga: { type: String, required: true, trim: true },
    state: { type: String, required: true, trim: true },
    location: { type: String, trim: true, default: "" },
    venue: { type: String, trim: true, default: "" },
    startDate: { type: Date, required: true },
    endDate: { type: Date },
    category: { type: String, required: true, trim: true, index: true },
    image: { type: String, trim: true, default: "" },
    images: [{ type: String, trim: true }],
    ticketTiers: {
      type: [ticketTierSchema],
      default: [],
    },
    status: {
      type: String,
      enum: ["draft", "published", "cancelled", "completed"],
      default: "draft",
    },
    isFavoriteCount: { type: Number, default: 0 },
    isPopular: { type: Boolean, default: false },
    isRecommended: { type: Boolean, default: false },
  },
  { timestamps: true }
);

eventSchema.index({ startDate: 1 });
eventSchema.index({ category: 1, startDate: 1 });
eventSchema.index({ status: 1 });

export const Event = model<IEvent>("Event", eventSchema);
