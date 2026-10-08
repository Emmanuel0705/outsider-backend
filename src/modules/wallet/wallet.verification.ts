// Pure rules for verifying a Paystack top-up against the pending record created
// at initiation. Kept free of I/O so they can be unit-tested.

export const MIN_TOPUP_NGN = 100;
export const MAX_TOPUP_NGN = 10_000_000;

/** Validates and normalises the requested amount (naira, max 2 decimals). */
export function parseTopUpAmount(amount: unknown): number | null {
  if (typeof amount !== "number" || !Number.isFinite(amount)) return null;
  const rounded = Math.round(amount * 100) / 100;
  if (rounded < MIN_TOPUP_NGN || rounded > MAX_TOPUP_NGN) return null;
  return rounded;
}

export const toKobo = (naira: number) => Math.round(naira * 100);

export interface PendingTopUp {
  userId: string;
  amount: number; // naira
  currency: string;
  status: "pending" | "completed" | "failed" | "reversed";
}

export interface PaystackVerifyData {
  status: string;
  amount: number; // kobo
  currency: string;
  reference?: string;
}

export type TopUpCheck =
  | { ok: true }
  | { ok: false; code: "not_found" | "not_pending" | "not_successful" | "mismatch"; message: string };

/** Who may verify this reference, and is it still verifiable? */
export function checkOwnership(tx: PendingTopUp | null, userId: string): TopUpCheck {
  // Same response for "doesn't exist" and "someone else's" so references can't be probed.
  if (!tx || tx.userId !== userId) return { ok: false, code: "not_found", message: "Unknown top-up reference" };
  if (tx.status !== "pending") return { ok: false, code: "not_pending", message: "This top-up can no longer be verified" };
  return { ok: true };
}

/** Does Paystack's record match exactly what this user started? */
export function checkPaystackPayment(tx: PendingTopUp, reference: string, data: PaystackVerifyData): TopUpCheck {
  if (data.status !== "success") return { ok: false, code: "not_successful", message: "Payment not successful" };
  if (data.reference && data.reference !== reference) {
    return { ok: false, code: "mismatch", message: "Payment does not match this top-up" };
  }
  if ((data.currency ?? "").toUpperCase() !== tx.currency.toUpperCase() || data.amount !== toKobo(tx.amount)) {
    return { ok: false, code: "mismatch", message: "Payment does not match this top-up" };
  }
  return { ok: true };
}
