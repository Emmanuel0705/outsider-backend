import { createHmac, timingSafeEqual } from "node:crypto";
import type { Request, Response } from "express";
import { settleTopUp } from "./wallet.settlement";

/** Paystack signs the raw body with HMAC-SHA512 using your secret key. */
export function isValidPaystackSignature(raw: Buffer | string, signature: unknown, secret: string): boolean {
  if (!secret || typeof signature !== "string" || !/^[a-f0-9]{128}$/i.test(signature)) return false;
  const expected = createHmac("sha512", secret).update(raw).digest();
  const given = Buffer.from(signature, "hex");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

interface PaystackEvent {
  event?: string;
  data?: { reference?: string; status?: string; amount?: number; currency?: string };
}

/**
 * POST /api/webhooks/paystack. Paystack calls this when a payment succeeds,
 * even if the user closed the app before it could confirm. Must be mounted
 * with a raw body parser (the signature covers the exact bytes).
 */
export async function paystackWebhookController(req: Request, res: Response) {
  const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from(typeof req.body === "string" ? req.body : "");
  if (!isValidPaystackSignature(raw, req.header("x-paystack-signature"), process.env.PAYSTACK_SECRET_KEY ?? "")) {
    res.status(401).json({ error: "Invalid signature" });
    return;
  }

  let event: PaystackEvent;
  try {
    event = JSON.parse(raw.toString("utf8"));
  } catch {
    res.status(400).json({ error: "Invalid JSON" });
    return;
  }

  const reference = event.data?.reference;
  if (event.event === "charge.success" && typeof reference === "string" && reference.startsWith("TXN-TOPUP-")) {
    // Throwing here returns 500, so Paystack retries later.
    const outcome = await settleTopUp(
      reference,
      {
        status: String(event.data?.status ?? ""),
        amount: Number(event.data?.amount),
        currency: String(event.data?.currency ?? ""),
        reference,
      },
      { source: "webhook" }
    );
    if (outcome.status === "credited") console.log(`[paystack-webhook] credited ${reference}: ₦${outcome.credit}`);
    else if (outcome.status === "rejected") console.warn(`[paystack-webhook] rejected ${reference}: ${outcome.message}`);
  }

  // Acknowledge everything else (other events, unknown references) so Paystack stops retrying.
  res.status(200).json({ received: true });
}
