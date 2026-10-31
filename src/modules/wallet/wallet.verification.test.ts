import { describe, expect, it } from "bun:test";
import { chargeFor, checkOwnership, checkPaystackPayment, parseTopUpAmount, paystackFee, type PendingTopUp } from "./wallet.verification";

const tx: PendingTopUp = { userId: "user-a", amount: 5000, currency: "NGN", status: "pending" };
const paid = { status: "success", amount: 500_000, currency: "NGN", reference: "TXN-TOPUP-1" };

describe("parseTopUpAmount", () => {
  it("accepts valid naira amounts and rounds to kobo precision", () => {
    expect(parseTopUpAmount(5000)).toBe(5000);
    expect(parseTopUpAmount(100.555)).toBe(100.56);
  });
  it("rejects below minimum, above maximum and non-numbers", () => {
    for (const bad of [99, 0, -5, 10_000_001, NaN, Infinity, "5000", undefined]) {
      expect(parseTopUpAmount(bad)).toBeNull();
    }
  });
});

describe("checkOwnership", () => {
  it("allows the user who initiated a pending top-up", () => {
    expect(checkOwnership(tx, "user-a")).toEqual({ ok: true });
  });
  it("rejects another user's reference exactly like an unknown one", () => {
    const stranger = checkOwnership(tx, "user-b");
    const missing = checkOwnership(null, "user-b");
    expect(stranger).toEqual(missing);
    expect(stranger.ok).toBe(false);
  });
  it("rejects references that are no longer pending", () => {
    expect(checkOwnership({ ...tx, status: "failed" }, "user-a")).toMatchObject({ ok: false, code: "not_pending" });
  });
});

describe("checkPaystackPayment", () => {
  it("accepts a successful payment for exactly the initiated amount", () => {
    expect(checkPaystackPayment(tx, "TXN-TOPUP-1", paid)).toEqual({ ok: true, credit: 5000 });
  });
  it("rejects unsuccessful payments", () => {
    expect(checkPaystackPayment(tx, "TXN-TOPUP-1", { ...paid, status: "abandoned" })).toMatchObject({ code: "not_successful" });
  });
  it("rejects a different amount, currency or reference", () => {
    expect(checkPaystackPayment(tx, "TXN-TOPUP-1", { ...paid, amount: 50_000 })).toMatchObject({ code: "mismatch" });
    expect(checkPaystackPayment(tx, "TXN-TOPUP-1", { ...paid, currency: "USD" })).toMatchObject({ code: "mismatch" });
    expect(checkPaystackPayment(tx, "TXN-TOPUP-1", { ...paid, reference: "OTHER" })).toMatchObject({ code: "mismatch" });
  });
});

describe("Paystack fee", () => {
  it("matches Paystack's published examples", () => {
    expect(paystackFee(500)).toBe(7.5);
    expect(paystackFee(2499)).toBe(37.49);
    expect(paystackFee(5000)).toBe(175);
    expect(paystackFee(200_000)).toBe(2000); // capped
  });

  it("charges enough that the full amount reaches the wallet", () => {
    for (const amount of [100, 500, 2400, 2460, 2470, 5000, 10_000, 50_000, 120_000, 1_000_000]) {
      const charge = chargeFor(amount);
      expect(charge - paystackFee(charge)).toBeGreaterThanOrEqual(amount);
      // ...and never more than ₦1 over what's needed.
      expect(charge - 1 - paystackFee(charge - 1)).toBeLessThan(amount);
    }
    expect(chargeFor(500)).toBe(508);
    expect(chargeFor(5000)).toBe(5178);
    expect(chargeFor(1_000_000)).toBe(1_002_000);
  });

  it("credits the full amount when the fee was paid, and nets the fee when it wasn't", () => {
    const withFee: PendingTopUp = { userId: "u", amount: 5000, charge: 5178, currency: "NGN", status: "pending" };
    const ok = { status: "success", currency: "NGN", reference: "R" };
    expect(checkPaystackPayment(withFee, "R", { ...ok, amount: 517_800 })).toEqual({ ok: true, credit: 5000 });
    expect(checkPaystackPayment(withFee, "R", { ...ok, amount: 500_000 })).toEqual({ ok: true, credit: 4825 });
    expect(checkPaystackPayment(withFee, "R", { ...ok, amount: 400_000 })).toMatchObject({ ok: false, code: "mismatch" });
  });
});
