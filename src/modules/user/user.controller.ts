import { Request, Response } from "express";
import mongoose from "mongoose";
import { fromNodeHeaders } from "better-auth/node";
import { auth } from "../../lib/auth";
import { UserProfile } from "../../db/models/UserProfile";
import { getUserProfile } from "./user.repository";

// Lightweight reference to better-auth's user collection
const UserCollection = () =>
  mongoose.connection.db!.collection<{ _id: unknown; id: string; name: string; email: string }>("user");

export async function getMeController(req: Request, res: Response) {
  const user = req.user;

  if (!user?.id) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  let userId: mongoose.Types.ObjectId;
  try {
    userId = new mongoose.Types.ObjectId(user.id);
  } catch {
    res.status(400).json({ error: "Invalid user id" });
    return;
  }

  const [{ merchant, wallet }, profile] = await Promise.all([
    getUserProfile(userId),
    UserProfile.findOne({ userId }).lean(),
  ]);

  res.json({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      emailVerified: user.emailVerified,
      image: user.image ?? null,
      phone: profile?.phone ?? null,
      dob: profile?.dob ?? null,
      address: profile?.address ?? null,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    },
    wallet,
    merchant,
  });
}

export async function patchMeController(req: Request, res: Response) {
  const user = req.user;
  if (!user?.id) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const { name, phone, dob, address } = req.body as {
    name?: string;
    phone?: string;
    dob?: string;
    address?: string;
  };

  let userId: mongoose.Types.ObjectId;
  try {
    userId = new mongoose.Types.ObjectId(user.id);
  } catch {
    res.status(400).json({ error: "Invalid user id" });
    return;
  }

  const updates: Promise<unknown>[] = [];

  if (name !== undefined && name.trim()) {
    updates.push(
      auth.api.updateUser({
        body: { name: name.trim() },
        headers: fromNodeHeaders(req.headers),
      })
    );
  }

  const profileFields: Record<string, string> = {};
  if (phone !== undefined) profileFields.phone = phone.trim();
  if (dob !== undefined) profileFields.dob = dob.trim();
  if (address !== undefined) profileFields.address = address.trim();

  if (Object.keys(profileFields).length > 0) {
    updates.push(
      UserProfile.findOneAndUpdate(
        { userId },
        { $set: profileFields },
        { upsert: true, new: true }
      )
    );
  }

  await Promise.all(updates);

  res.json({ success: true });
}

export function getUserController(req: Request, res: Response) {
  const user = req.user ?? null;
  const merchant = (user as { merchant?: unknown } | null)?.merchant ?? null;
  res.json({ user, merchant });
}

export async function lookupUserByEmailController(req: Request, res: Response) {
  const email = (req.query.email as string | undefined)?.trim().toLowerCase();
  if (!email) {
    res.status(400).json({ error: "email query param is required" });
    return;
  }

  // Prevent looking up yourself
  if (req.user?.email?.toLowerCase() === email) {
    res.status(400).json({ error: "You cannot add yourself as a friend" });
    return;
  }

  const found = await UserCollection().findOne(
    { email },
    { projection: { id: 1, name: 1, email: 1 } }
  );

  if (!found) {
    res.status(404).json({ error: "No user found with that email" });
    return;
  }

  res.json({ user: { id: found.id, name: found.name, email: found.email } });
}
