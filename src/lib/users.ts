import mongoose from "mongoose";

export type UserDoc = {
  _id: unknown;
  name?: string;
  email?: string;
  image?: string | null;
  createdAt?: Date;
};

/** Reads better-auth's `user` collection (ids may be stored as ObjectId or string). */
export async function findUsers(ids: mongoose.Types.ObjectId[]): Promise<Map<string, UserDoc>> {
  if (ids.length === 0) return new Map();
  const users = await mongoose.connection
    .db!.collection<UserDoc>("user")
    .find({ _id: { $in: [...ids, ...ids.map(String)] as never[] } })
    .project<UserDoc>({ name: 1, email: 1, image: 1, createdAt: 1 })
    .toArray();
  return new Map(users.map((u) => [String(u._id), u]));
}
