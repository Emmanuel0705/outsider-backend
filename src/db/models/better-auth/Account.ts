import mongoose, { Schema, model } from "mongoose";

/**
 * Better Auth – Account schema (reference only).
 * Source: https://www.better-auth.com/docs/concepts/database#account
 * Table/Collection name: "account"
 * Stores provider credentials (OAuth tokens, hashed password for email/password).
 * Better Auth manages this collection; this model is for reference and optional reads.
 */
export interface IBetterAuthAccount {
  id: string;
  userId: string;
  accountId: string;
  providerId: string;
  accessToken?: string;
  refreshToken?: string;
  accessTokenExpiresAt?: Date;
  refreshTokenExpiresAt?: Date;
  scope?: string;
  idToken?: string;
  password?: string;
  createdAt: Date;
  updatedAt: Date;
}

const accountSchema = new Schema<IBetterAuthAccount>(
  {
    id: { type: String, required: true, unique: true },
    userId: { type: String, required: true, index: true },
    accountId: { type: String, required: true },
    providerId: { type: String, required: true },
    accessToken: { type: String },
    refreshToken: { type: String },
    accessTokenExpiresAt: { type: Date },
    refreshTokenExpiresAt: { type: Date },
    scope: { type: String },
    idToken: { type: String },
    password: { type: String },
    createdAt: { type: Date, required: true },
    updatedAt: { type: Date, required: true },
  },
  {
    timestamps: true,
    collection: "account",
    _id: false,
  }
);

export const BetterAuthAccount = model<IBetterAuthAccount>(
  "BetterAuthAccount",
  accountSchema
);
