import axios from "axios";
import mongoose from "mongoose";
import { Transaction } from "../../db/models/Transaction";
import { Wallet } from "../../db/models/Wallet";
import { findOrCreateWallet } from "./wallet.repository";
import { checkPaystackPayment, type PaystackVerifyData } from "./wallet.verification";

// One place that turns a paid Paystack top-up into wallet money. Used by the
// verify endpoint (app returns from checkout), the Paystack webhook (Paystack
// tells us directly) and the reconciler (we ask Paystack about stragglers).
// Crediting is claim-then-credit, so whichever path gets there first wins and
// the others see "already completed".

export type SettleSource = "verify" | "webhook" | "reconcile" | "admin";

export type SettleOutcome =
  | { status: "credited"; credit: number; wallet: Awaited<ReturnType<typeof creditWallet>> }
  | { status: "already_completed" }
  | { status: "not_found" }
  | { status: "not_pending" }
  | { status: "rejected"; code: "not_successful" | "mismatch"; message: string };

async function creditWallet(userId: mongoose.Types.ObjectId, amount: number) {
  return Wallet.findOneAndUpdate({ userId }, { $inc: { balance: amount } }, { new: true }).lean();
}

/**
 * Credits a pending top-up once Paystack says it's paid. `userId`, when given,
 * restricts settlement to that user's top-up (the verify endpoint).
 */
export async function settleTopUp(
  reference: string,
  data: PaystackVerifyData,
  { userId, source }: { userId?: mongoose.Types.ObjectId; source: SettleSource }
): Promise<SettleOutcome> {
  const tx = await Transaction.findOne({ reference, type: "top_up", ...(userId ? { userId } : {}) }).lean();
  if (!tx) return { status: "not_found" };
  if (tx.status === "completed") return { status: "already_completed" };
  if (tx.status !== "pending") return { status: "not_pending" };

  const payment = checkPaystackPayment(
    {
      userId: String(tx.userId),
      amount: tx.amount,
      charge: typeof tx.metadata?.charge === "number" ? tx.metadata.charge : undefined,
      currency: tx.currency,
      status: tx.status,
    },
    reference,
    data
  );
  if (!payment.ok) {
    if (payment.code === "mismatch") {
      // Never credit a payment that doesn't match what was initiated.
      await Transaction.updateOne(
        { _id: tx._id, status: "pending" },
        { $set: { status: "failed", "metadata.failure": "amount_or_currency_mismatch", "metadata.paystackAmountKobo": data.amount } }
      );
    }
    return { status: "rejected", code: payment.code as "not_successful" | "mismatch", message: payment.message };
  }

  await findOrCreateWallet(tx.userId);

  // Atomically claim the pending record; only one caller can win.
  const claimed = await Transaction.findOneAndUpdate(
    { _id: tx._id, status: "pending" },
    {
      $set: {
        status: "completed",
        amount: payment.credit,
        "metadata.paystackStatus": data.status,
        "metadata.paidKobo": data.amount,
        "metadata.settledBy": source,
      },
    },
    { new: true }
  ).lean();
  if (!claimed) return { status: "already_completed" };

  try {
    const wallet = await creditWallet(tx.userId, claimed.amount);
    return { status: "credited", credit: claimed.amount, wallet };
  } catch (error) {
    // Release the claim so a retry (or the reconciler) can credit it.
    await Transaction.updateOne({ _id: claimed._id, status: "completed" }, { $set: { status: "pending" } });
    throw error;
  }
}

// ─── Asking Paystack ─────────────────────────────────────────────────────────

export type PaystackLookup =
  | { found: true; data: PaystackVerifyData }
  | { found: false; message: string };

/** GET /transaction/verify. "Reference not found" means the user never paid. */
export async function fetchPaystackTransaction(reference: string): Promise<PaystackLookup> {
  try {
    const { data } = await axios.get(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
      headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY ?? ""}` },
      timeout: 15_000,
    });
    return { found: true, data: data.data as PaystackVerifyData };
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 400) {
      return { found: false, message: String(error.response.data?.message ?? "Transaction not found") };
    }
    throw error;
  }
}

// ─── Reconciler ──────────────────────────────────────────────────────────────

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

export interface ReconcileOptions {
  now?: Date;
  /** Leave very fresh top-ups to the app/webhook. */
  minAgeMs?: number;
  /** Don't look further back than this. */
  maxAgeMs?: number;
  /** Don't ask Paystack about the same top-up more often than this. */
  recheckMs?: number;
  /** Unpaid this long → mark failed so it stops being checked. */
  expireMs?: number;
  limit?: number;
  lookup?: (reference: string) => Promise<PaystackLookup>;
}

/**
 * Finds top-ups still pending (user paid but the app never confirmed, and the
 * webhook didn't arrive) and settles the ones Paystack says are paid.
 */
export async function reconcilePendingTopUps({
  now = new Date(),
  minAgeMs = 2 * MINUTE,
  maxAgeMs = 30 * 24 * HOUR,
  recheckMs = 10 * MINUTE,
  expireMs = 24 * HOUR,
  limit = 50,
  lookup = fetchPaystackTransaction,
}: ReconcileOptions = {}) {
  const summary = { checked: 0, credited: 0, expired: 0, rejected: 0, errors: 0 };
  const pending = await Transaction.find({
    type: "top_up",
    status: "pending",
    createdAt: { $lte: new Date(now.getTime() - minAgeMs), $gte: new Date(now.getTime() - maxAgeMs) },
    $or: [{ "metadata.lastCheckedAt": { $exists: false } }, { "metadata.lastCheckedAt": { $lte: new Date(now.getTime() - recheckMs) } }],
  })
    .sort({ createdAt: 1 })
    .limit(limit)
    .lean();

  for (const tx of pending) {
    summary.checked += 1;
    try {
      const result = await lookup(tx.reference);
      if (result.found && result.data.status === "success") {
        const outcome = await settleTopUp(tx.reference, result.data, { source: "reconcile" });
        if (outcome.status === "credited") summary.credited += 1;
        else if (outcome.status === "rejected") summary.rejected += 1;
        continue;
      }
      const age = now.getTime() - new Date(tx.createdAt).getTime();
      const paystackStatus = result.found ? result.data.status : "not_found";
      const unpaid = !result.found || ["abandoned", "failed", "reversed"].includes(paystackStatus);
      if (unpaid && age >= expireMs) {
        await Transaction.updateOne(
          { _id: tx._id, status: "pending" },
          { $set: { status: "failed", "metadata.failure": "unpaid_expired", "metadata.paystackStatus": paystackStatus, "metadata.lastCheckedAt": now } }
        );
        summary.expired += 1;
      } else {
        await Transaction.updateOne({ _id: tx._id }, { $set: { "metadata.lastCheckedAt": now, "metadata.paystackStatus": paystackStatus } });
      }
    } catch (error) {
      summary.errors += 1;
      console.error(`[topup-reconcile] ${tx.reference}:`, error instanceof Error ? error.message : error);
    }
  }
  return summary;
}

/** Runs the reconciler on a timer. TOPUP_RECONCILE_INTERVAL_MS=0 turns it off. */
export function startTopUpReconciler() {
  const interval = Number(process.env.TOPUP_RECONCILE_INTERVAL_MS ?? 5 * MINUTE);
  if (!process.env.PAYSTACK_SECRET_KEY || !Number.isFinite(interval) || interval <= 0) return;
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const summary = await reconcilePendingTopUps();
      if (summary.credited || summary.expired || summary.errors) console.log("[topup-reconcile]", summary);
    } catch (error) {
      console.error("[topup-reconcile] failed:", error);
    } finally {
      running = false;
    }
  };
  setTimeout(tick, 30_000);
  setInterval(tick, interval).unref?.();
}
