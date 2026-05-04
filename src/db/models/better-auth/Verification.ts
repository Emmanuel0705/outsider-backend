import { Schema, model } from "mongoose";

/**
 * Better Auth – Verification schema (reference only).
 * Table/Collection name: "verification"
 *
 * Better Auth's MongoDB adapter stores its logical `id` as the document's `_id`
 * (a plain string). We reflect that here so create/upsert operations work correctly.
 */
export interface IBetterAuthVerification {
  _id: string;
  identifier: string;
  value: string;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const verificationSchema = new Schema<IBetterAuthVerification>(
  {
    _id: { type: String },
    identifier: { type: String, required: true, index: true },
    value: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    createdAt: { type: Date, required: true },
    updatedAt: { type: Date, required: true },
  },
  {
    timestamps: true,
    collection: "verification",
    autoIndex: false,
    autoCreate: false,
  }
);

export const BetterAuthVerification = model<IBetterAuthVerification>(
  "BetterAuthVerification",
  verificationSchema
);
