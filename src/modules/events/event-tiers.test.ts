import { describe, expect, it } from "bun:test";
import { planTierUpdate, ticketsLeft, type ExistingTier } from "./event-tiers";

const existing: ExistingTier[] = [
  { _id: "reg", name: "Regular", price: 2000, totalQuantity: 100, soldQuantity: 100 },
  { _id: "vip", name: "VIP", price: 8000, totalQuantity: 20, soldQuantity: 0 },
];

describe("planTierUpdate", () => {
  it("adds more tickets to a sold-out tier without touching sales", () => {
    const plan = planTierUpdate(existing, [
      { _id: "reg", name: "Regular", price: 2000, totalQuantity: 150 },
      { _id: "vip", name: "VIP", price: 8000, totalQuantity: 20 },
    ]);
    expect(plan).toEqual({
      ok: true,
      updates: [
        { id: "reg", name: "Regular", price: 2000, totalQuantity: 150, soldQuantity: 100 },
        { id: "vip", name: "VIP", price: 8000, totalQuantity: 20, soldQuantity: 0 },
      ],
      adds: [],
      removes: [],
    });
  });

  it("adds new tiers and removes unsold ones", () => {
    const plan = planTierUpdate(existing, [
      { _id: "reg", name: "Regular", price: 2500, totalQuantity: 100 },
      { name: "Late entry", price: "3000", totalQuantity: "50" },
    ]);
    expect(plan).toMatchObject({ ok: true, adds: [{ name: "Late entry", price: 3000, totalQuantity: 50 }], removes: ["vip"] });
  });

  it("refuses to go below sold or remove a tier with sales", () => {
    expect(planTierUpdate(existing, [{ _id: "reg", name: "Regular", price: 2000, totalQuantity: 90 }, { _id: "vip", name: "VIP", price: 1, totalQuantity: 1 }]))
      .toMatchObject({ ok: false, error: expect.stringContaining("100 sold") });
    expect(planTierUpdate(existing, [{ _id: "vip", name: "VIP", price: 8000, totalQuantity: 20 }]))
      .toMatchObject({ ok: false, error: expect.stringContaining("can't be removed") });
  });

  it("rejects malformed input", () => {
    for (const bad of [
      "nope",
      [],
      [{ _id: "ghost", name: "X", price: 1, totalQuantity: 1 }],
      [{ name: "", price: 1, totalQuantity: 1 }],
      [{ name: "Free", price: -1, totalQuantity: 1 }],
      [{ name: "Half", price: 1, totalQuantity: 1.5 }],
      [{ _id: "reg", name: "R", price: 1, totalQuantity: 200 }, { _id: "reg", name: "R", price: 1, totalQuantity: 200 }],
    ]) {
      expect(planTierUpdate(existing, bad).ok).toBe(false);
    }
  });

  it("counts tickets left", () => {
    expect(ticketsLeft(existing)).toBe(20);
  });
});
