import { describe, expect, it } from "bun:test";
import { checkOwnership, checkPaystackPayment, parseTopUpAmount, type PendingTopUp } from "./wallet.verification";

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
    expect(checkPaystackPayment(tx, "TXN-TOPUP-1", paid)).toEqual({ ok: true });
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
