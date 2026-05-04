import { Request, Response, NextFunction } from "express";
import mongoose from "mongoose";
import { fromNodeHeaders } from "better-auth/node";
import { auth } from "../lib/auth";
import { AccountStatus } from "../db/models";

export type AuthUser = {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image?: string | null;
  createdAt: Date;
  updatedAt: Date;
};

declare module "express-serve-static-core" {
  interface Request {
    user?: AuthUser;
    session?: unknown;
  }
}

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const session = await auth.api.getSession({
    headers: fromNodeHeaders(req.headers),
  });

  if (!session) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  let objectId: mongoose.Types.ObjectId | null = null;
  try {
    objectId = new mongoose.Types.ObjectId(session.user.id);
  } catch {
    objectId = null;
  }

  if (objectId) {
    const accountStatus = await AccountStatus.findOne({ userId: objectId })
      .select("isActive")
      .lean();

    if (accountStatus && !accountStatus.isActive) {
      res.status(403).json({
        error:
          "Your account has been deactivated. Please contact support if this is unexpected.",
      });
      return;
    }
  }

  req.user = session.user as AuthUser;
  req.session = session.session;
  next();
}
