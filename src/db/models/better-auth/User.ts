import mongoose, { Schema, model } from "mongoose";

/**
 * Better Auth – User schema (reference only).
 * Source: https://www.better-auth.com/docs/concepts/database#user
 * Table/Collection name: "user"
 * Better Auth manages this collection via the native MongoDB adapter; this model
 * is for reference, population, and optional server-side reads. Do not use for writes –
 * use Better Auth APIs (signUp, updateUser, etc.) instead.
 */
export interface IBetterAuthUser {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image?: string;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<IBetterAuthUser>(
  {
    id: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    email: { type: String, required: true },
    emailVerified: { type: Boolean, required: true, default: false },
    image: { type: String },
    createdAt: { type: Date, required: true },
    updatedAt: { type: Date, required: true },
  },
  {
    timestamps: true,
    collection: "user", // match Better Auth collection name
    _id: false,
  }
);

export const BetterAuthUser = model<IBetterAuthUser>(
  "user",
  userSchema
);
