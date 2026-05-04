import mongoose, { Schema, model } from "mongoose";

export interface IAccountStatus {
  userId: mongoose.Types.ObjectId;
  isActive: boolean;
  deactivatedAt?: Date | null;
  deactivationReason?: string;
  updatedBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

const accountStatusSchema = new Schema<IAccountStatus>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      required: true,
      unique: true,
      index: true,
    },
    isActive: { type: Boolean, default: true, index: true },
    deactivatedAt: { type: Date, default: null },
    deactivationReason: { type: String, trim: true, default: "" },
    updatedBy: { type: String, trim: true, default: "" },
  },
  { timestamps: true }
);

export const AccountStatus = model<IAccountStatus>(
  "AccountStatus",
  accountStatusSchema
);
