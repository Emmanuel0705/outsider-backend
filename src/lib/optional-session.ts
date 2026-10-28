import type { Request } from "express";
import { fromNodeHeaders } from "better-auth/node";
import { auth } from "./auth";

/** Session for public endpoints that behave differently for signed-in users. Never throws. */
export async function getOptionalSession(req: Request) {
  if (!req.headers.cookie && !req.headers.authorization) return null;
  try {
    return await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
  } catch {
    return null;
  }
}
