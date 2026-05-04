import { NextFunction, Request, Response } from "express";
import { verifyAdminToken, type AdminTokenPayload } from "../lib/admin-auth";

declare module "express-serve-static-core" {
  interface Request {
    admin?: AdminTokenPayload;
  }
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Admin authorization required" });
    return;
  }

  const token = header.slice("Bearer ".length).trim();
  if (!token) {
    res.status(401).json({ error: "Admin authorization required" });
    return;
  }

  const payload = verifyAdminToken(token);
  if (!payload) {
    res.status(401).json({ error: "Invalid or expired admin token" });
    return;
  }

  req.admin = payload;
  next();
}
