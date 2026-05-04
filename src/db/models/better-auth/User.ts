import { Schema, model } from "mongoose";

/**
 * Better Auth – User schema (reference only).
 * Source: https://www.better-auth.com/docs/concepts/database#user
 * Table/Collection name: "user"
 *
 * Better Auth's MongoDB adapter stores its logical `id` as the document's `_id`
 * (a plain string, not an ObjectId). We reflect that here so `.lean()` queries
 * return a correctly-typed `_id` that can be passed back to Better Auth APIs.
 */
export interface IBetterAuthUser {
  _id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image?: string;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<IBetterAuthUser>(
  {
    _id: { type: String },
    name: { type: String, required: true },
    email: { type: String, required: true },
    emailVerified: { type: Boolean, required: true, default: false },
    image: { type: String },
    createdAt: { type: Date, required: true },
    updatedAt: { type: Date, required: true },
  },
  {
    timestamps: true,
    collection: "user",
    autoIndex: false,
    autoCreate: false,
  }
);

export const BetterAuthUser = model<IBetterAuthUser>("BetterAuthUser", userSchema);
