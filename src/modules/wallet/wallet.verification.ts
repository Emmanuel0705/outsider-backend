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
const round2 = (n: number) => Math.round(n * 100) / 100;

// ─── Paystack fee (paid by the user on top of their top-up) ──────────────────
// Paystack Nigeria, local cards: 1.5% + ₦100, the ₦100 waived under ₦2,500,
// total capped at ₦2,000. Overridable if Paystack's pricing changes.
const envNumber = (name: string, fallback: number) => {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
};
export const PAYSTACK_FEE = {
  percent: envNumber("PAYSTACK_FEE_PERCENT", 1.5) / 100,
  flat: envNumber("PAYSTACK_FEE_FLAT_NGN", 100),
  flatFrom: envNumber("PAYSTACK_FEE_FLAT_FROM_NGN", 2500),
  cap: envNumber("PAYSTACK_FEE_CAP_NGN", 2000),
};

/** What Paystack keeps from a charge of `charge` naira. */
export function paystackFee(charge: number, fee = PAYSTACK_FEE): number {
  const flat = charge >= fee.flatFrom ? fee.flat : 0;
  return round2(Math.min(charge * fee.percent + flat, fee.cap));
}

/**
 * Whole-naira amount to charge so that, after Paystack's fee, at least
 * `amount` is left for the wallet.
 */
export function chargeFor(amount: number, fee = PAYSTACK_FEE): number {
  let gross = amount / (1 - fee.percent);
  if (gross >= fee.flatFrom) gross = (amount + fee.flat) / (1 - fee.percent);
  if (gross - amount > fee.cap) gross = amount + fee.cap;
  let charge = Math.ceil(round2(gross));
  while (charge - paystackFee(charge, fee) < amount) charge += 1;
  return charge;
}

export interface PendingTopUp {
  userId: string;
  amount: number; // naira credited to the wallet
  /** Naira the user is charged (amount + Paystack fee). Absent on older records. */
  charge?: number;
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

export type PaymentCheck = { ok: true; credit: number } | Exclude<TopUpCheck, { ok: true }>;

/**
 * Does Paystack's record match what this user started, and how much to credit?
 * Paid amount + fee → the full amount. A client that ignored the fee (older
 * mobile builds) paid just the amount → credit it minus Paystack's fee.
 */
export function checkPaystackPayment(tx: PendingTopUp, reference: string, data: PaystackVerifyData): PaymentCheck {
  if (data.status !== "success") return { ok: false, code: "not_successful", message: "Payment not successful" };
  if (data.reference && data.reference !== reference) {
    return { ok: false, code: "mismatch", message: "Payment does not match this top-up" };
  }
  if ((data.currency ?? "").toUpperCase() !== tx.currency.toUpperCase()) {
    return { ok: false, code: "mismatch", message: "Payment does not match this top-up" };
  }
  const expected = tx.charge ?? tx.amount;
  if (data.amount === toKobo(expected)) return { ok: true, credit: tx.amount };
  if (tx.charge !== undefined && tx.charge !== tx.amount && data.amount === toKobo(tx.amount)) {
    return { ok: true, credit: round2(tx.amount - paystackFee(tx.amount)) };
  }
  return { ok: false, code: "mismatch", message: "Payment does not match this top-up" };
}
