import { Request, Response } from "express";
import { randomBytes } from "crypto";
import React from "react";
import { BetterAuthUser } from "../../db/models/better-auth/User";
import { BetterAuthVerification } from "../../db/models/better-auth/Verification";
import { sendEmail } from "../../lib/email";
import ResetPasswordOTPEmail from "../../email/reset-password";

function generateOTP(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes
const TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour
const OTP_IDENTIFIER_PREFIX = "password-reset-otp:";

/**
 * POST /api/password-reset/request
 * Body: { email }
 * Generates an OTP and sends it to the user's email.
 * Always returns success to avoid leaking which emails are registered.
 */
export async function requestPasswordReset(req: Request, res: Response) {
  const { email } = req.body as { email?: string };

  if (!email || typeof email !== "string") {
    res.status(400).json({ error: "Email is required." });
    return;
  }

  const normalised = email.trim().toLowerCase();
  const user = await BetterAuthUser.findOne({ email: normalised }).lean();

  if (!user) {
    // Return success to avoid leaking which emails are registered
    res.json({ success: true });
    return;
  }

  const otp = generateOTP();
  const identifier = `${OTP_IDENTIFIER_PREFIX}${normalised}`;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + OTP_TTL_MS);

  await BetterAuthVerification.findOneAndUpdate(
    { identifier },
    {
      $setOnInsert: { _id: randomBytes(16).toString("hex") },
      $set: { identifier, value: otp, expiresAt, updatedAt: now },
    },
    { upsert: true, new: true }
  );

  await sendEmail({
    to: normalised,
    subject: "Your password reset code",
    react: React.createElement(ResetPasswordOTPEmail, {
      otp,
      name: user.name,
    }),
  });

  res.json({ success: true });
}

/**
 * POST /api/password-reset/verify-otp
 * Body: { email, otp }
 * Verifies the OTP and returns a short-lived reset token.
 */
export async function verifyResetOTP(req: Request, res: Response) {
  const { email, otp } = req.body as { email?: string; otp?: string };

  if (!email || !otp) {
    res.status(400).json({ error: "Email and OTP are required." });
    return;
  }

  const normalised = email.trim().toLowerCase();
  const identifier = `${OTP_IDENTIFIER_PREFIX}${normalised}`;

  const verification = await BetterAuthVerification.findOne({
    identifier,
  }).lean();

  if (!verification) {
    res.status(400).json({ error: "Invalid or expired code." });
    return;
  }

  if (new Date() > verification.expiresAt) {
    await BetterAuthVerification.deleteOne({ identifier });
    res.status(400).json({ error: "Code has expired. Please request a new one." });
    return;
  }

  if (verification.value !== otp.trim()) {
    res.status(400).json({ error: "Invalid code." });
    return;
  }

  await BetterAuthVerification.deleteOne({ identifier });

  const user = await BetterAuthUser.findOne({ email: normalised }).lean();
  if (!user) {
    res.status(400).json({ error: "User not found." });
    return;
  }

  // Generate a reset token compatible with Better Auth's resetPassword endpoint.
  // Better Auth prefixes the token with "reset-password:" when looking up the
  // verification record: findVerificationValue(`reset-password:${token}`)
  const token = randomBytes(32).toString("hex");
  const now = new Date();
  const tokenExpiresAt = new Date(now.getTime() + TOKEN_TTL_MS);

  await BetterAuthVerification.create({
    _id: randomBytes(16).toString("hex"),
    identifier: `reset-password:${token}`,
    value: user._id,
    expiresAt: tokenExpiresAt,
    createdAt: now,
    updatedAt: now,
  });

  res.json({ token });
}
