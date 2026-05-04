import mongoose, { Schema, model } from "mongoose";

/**
 * Better Auth – Session schema (reference only).
 * Source: https://www.better-auth.com/docs/concepts/database#session
 * Table/Collection name: "session"
 * Better Auth manages this collection; this model is for reference and optional reads.
 */
export interface IBetterAuthSession {
  id: string;
  userId: string;
  token: string;
  expiresAt: Date;
  ipAddress?: string;
  userAgent?: string;
  createdAt: Date;
  updatedAt: Date;
}

const sessionSchema = new Schema<IBetterAuthSession>(
  {
    id: { type: String, required: true, unique: true },
    userId: { type: String, required: true, index: true },
    token: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    ipAddress: { type: String },
    userAgent: { type: String },
    createdAt: { type: Date, required: true },
    updatedAt: { type: Date, required: true },
  },
  {
    timestamps: true,
    collection: "session",
    _id: false,
    autoIndex: false,
    autoCreate: false,
  }
);

export const BetterAuthSession = model<IBetterAuthSession>(
  "BetterAuthSession",
  sessionSchema
);
