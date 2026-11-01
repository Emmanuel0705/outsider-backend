import { describe, expect, it } from "bun:test";
import { createHmac } from "node:crypto";
import { isValidPaystackSignature } from "./wallet.webhook";

const secret = "sk_test_example";
const body = JSON.stringify({ event: "charge.success", data: { reference: "TXN-TOPUP-ABC", amount: 517800 } });
const sign = (raw: string, key = secret) => createHmac("sha512", key).update(raw).digest("hex");

describe("isValidPaystackSignature", () => {
  it("accepts Paystack's HMAC-SHA512 of the exact body", () => {
    expect(isValidPaystackSignature(body, sign(body), secret)).toBe(true);
    expect(isValidPaystackSignature(Buffer.from(body), sign(body).toUpperCase(), secret)).toBe(true);
  });

  it("rejects tampering, other keys and junk", () => {
    expect(isValidPaystackSignature(body.replace("517800", "999999"), sign(body), secret)).toBe(false);
    expect(isValidPaystackSignature(body, sign(body, "sk_test_other"), secret)).toBe(false);
    expect(isValidPaystackSignature(body, undefined, secret)).toBe(false);
    expect(isValidPaystackSignature(body, "abc", secret)).toBe(false);
    expect(isValidPaystackSignature(body, sign(body), "")).toBe(false);
  });
});
