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
 */
export async function requestPasswordReset(req: Request, res: Response) {
  const { email } = req.body as { email?: string };

  console.log("Password reset requested for email:", email);

  if (!email || typeof email !== "string") {
    res.status(400).json({ error: "Email is required." });
    return;
  }

  const allUsers = await BetterAuthUser.find().lean();
  console.log("All users in system:", allUsers);

  const normalised = email.trim().toLowerCase();
  const user = await BetterAuthUser.findOne({ email: normalised }).lean();

  console.log("User lookup result:", user);

  // fail with success false to avoid leaking which emails are registered in the system
  if (!user) {
    res.status(400).json({ success: false, error: "email is not registered" });
    return;
  }

  const otp = generateOTP();
  console.log({otp})
  const identifier = `${OTP_IDENTIFIER_PREFIX}${normalised}`;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + OTP_TTL_MS);

  // Upsert: replace any existing OTP for this email
  await BetterAuthVerification.findOneAndUpdate(
    { identifier },
    {
      id: randomBytes(16).toString("hex"),
      identifier,
      value: otp,
      expiresAt,
      createdAt: now,
      updatedAt: now,
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
 * The reset token is stored so Better Auth's resetPassword endpoint can use it.
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

  // OTP verified — delete it so it can't be reused
  await BetterAuthVerification.deleteOne({ identifier });

  // Find the user to get their id
  const user = await BetterAuthUser.findOne({ email: normalised }).lean();
  if (!user) {
    res.status(400).json({ error: "User not found." });
    return;
  }

  // Generate a reset token compatible with Better Auth's resetPassword endpoint.
  // Better Auth looks up: verification where identifier = token, value = userId.
  const token = randomBytes(32).toString("hex");
  const now = new Date();
  const tokenExpiresAt = new Date(now.getTime() + TOKEN_TTL_MS);

  await BetterAuthVerification.create({
    id: randomBytes(16).toString("hex"),
    identifier: token,
    value: user.id,
    expiresAt: tokenExpiresAt,
    createdAt: now,
    updatedAt: now,
  });

  res.json({ token });
}
