import mongoose, { Schema, model } from "mongoose";

/**
 * Better Auth – Verification schema (reference only).
 * Source: https://www.better-auth.com/docs/concepts/database#verification
 * Table/Collection name: "verification"
 * Used for email verification, OTP, password reset, etc.
 * Better Auth manages this collection; this model is for reference and optional reads.
 */
export interface IBetterAuthVerification {
  id: string;
  identifier: string;
  value: string;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const verificationSchema = new Schema<IBetterAuthVerification>(
  {
    id: { type: String, required: true, unique: true },
    identifier: { type: String, required: true, index: true },
    value: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    createdAt: { type: Date, required: true },
    updatedAt: { type: Date, required: true },
  },
  {
    timestamps: true,
    collection: "verification",
    _id: false,
  }
);

export const BetterAuthVerification = model<IBetterAuthVerification>(
  "BetterAuthVerification",
  verificationSchema
);
