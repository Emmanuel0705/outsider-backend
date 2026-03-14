import { Request, Response } from "express";
import mongoose from "mongoose";
import { getUserProfile } from "./user.repository";

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

  const { merchant, wallet } = await getUserProfile(userId);

  res.json({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      emailVerified: user.emailVerified,
      image: user.image ?? null,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    },
    wallet,
    merchant,
  });
}

export function getUserController(req: Request, res: Response) {
  const user = req.user ?? null;
  const merchant = (user as { merchant?: unknown } | null)?.merchant ?? null;
  res.json({ user, merchant });
}
