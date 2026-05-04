import mongoose, { Schema, model } from "mongoose";

export interface ICardBinding {
  userId: mongoose.Types.ObjectId;
  cardId: string;
  sourcePayload?: string;
  connectedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const cardBindingSchema = new Schema<ICardBinding>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },
    cardId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      index: true,
    },
    sourcePayload: { type: String, trim: true },
    connectedAt: { type: Date, required: true, default: Date.now },
  },
  { timestamps: true }
);

export const CardBinding = model<ICardBinding>("CardBinding", cardBindingSchema);
