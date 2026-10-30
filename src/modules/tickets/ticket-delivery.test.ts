import { describe, expect, it } from "bun:test";
import { eventWhen, giftNotice, orderTotal, purchaseNotice, splitGifts, wantsNotification, type PricedItem } from "./ticket-delivery";

const BUYER = "a".repeat(24);
const FRIEND = "b".repeat(24);
const FRIEND2 = "c".repeat(24);
const items: PricedItem[] = [
  { ticketTierId: "reg", ticketTierName: "Regular", quantity: 3, unitPrice: 1000 },
  { ticketTierId: "vip", ticketTierName: "VIP", quantity: 1, unitPrice: 5000 },
];

describe("splitGifts", () => {
  it("keeps everything on the buyer when there are no gifts (mobile app)", () => {
    expect(splitGifts(items, undefined, BUYER)).toEqual({ ok: true, self: items, recipients: [] });
  });

  it("moves one ticket per gift to each recipient", () => {
    const split = splitGifts(
      items,
      [
        { userId: FRIEND, ticketTierId: "reg" },
        { userId: FRIEND2, ticketTierId: "vip" },
        { userId: FRIEND, ticketTierId: "reg" },
      ],
      BUYER
    );
    expect(split.ok).toBe(true);
    if (!split.ok) return;
    expect(split.self).toEqual([{ ticketTierId: "reg", ticketTierName: "Regular", quantity: 1, unitPrice: 1000 }]);
    expect(split.recipients).toEqual([
      { userId: FRIEND, items: [{ ticketTierId: "reg", ticketTierName: "Regular", quantity: 2, unitPrice: 1000 }] },
      { userId: FRIEND2, items: [{ ticketTierId: "vip", ticketTierName: "VIP", quantity: 1, unitPrice: 5000 }] },
    ]);
    expect(orderTotal(split.self) + split.recipients.reduce((s, r) => s + orderTotal(r.items), 0)).toBe(orderTotal(items));
  });

  it("allows buying only for friends", () => {
    const split = splitGifts([{ ...items[1]! }], [{ userId: FRIEND, ticketTierId: "vip" }], BUYER);
    expect(split).toMatchObject({ ok: true, self: [] });
  });

  it("rejects gifts that don't add up", () => {
    expect(splitGifts(items, [{ userId: FRIEND, ticketTierId: "vip" }, { userId: FRIEND2, ticketTierId: "vip" }], BUYER).ok).toBe(false);
    expect(splitGifts(items, [{ userId: FRIEND, ticketTierId: "nope" }], BUYER).ok).toBe(false);
    expect(splitGifts(items, [{ userId: BUYER, ticketTierId: "reg" }], BUYER).ok).toBe(false);
    expect(splitGifts(items, [{ userId: "not-an-id", ticketTierId: "reg" }], BUYER).ok).toBe(false);
    expect(splitGifts(items, "lots", BUYER).ok).toBe(false);
    expect(splitGifts(items, Array.from({ length: 21 }, () => ({ userId: FRIEND, ticketTierId: "reg" })), BUYER).ok).toBe(false);
  });
});

describe("notices", () => {
  const start = new Date("2026-11-14T19:00:00Z"); // 8:00 PM in Lagos
  it("formats event time in Lagos", () => {
    expect(eventWhen(start)).toMatch(/14 Nov · 8:00\s?pm/i);
    expect(eventWhen(null)).toBe("");
  });
  it("tells the buyer what they bought", () => {
    expect(purchaseNotice({ eventTitle: "Jazz Night", startDate: start, selfCount: 2, giftCount: 1 })).toMatchObject({
      title: "You're going to Jazz Night",
      body: expect.stringMatching(/^2 tickets \+ 1 for a friend · .+ Your entry pass is ready\.$/),
    });
    expect(purchaseNotice({ eventTitle: "Jazz Night", startDate: start, selfCount: 0, giftCount: 2 }).title).toBe(
      "Tickets sent for Jazz Night"
    );
  });
  it("tells a friend who bought them a ticket", () => {
    expect(giftNotice({ buyerName: "Ada O.", eventTitle: "Jazz Night", startDate: start, count: 1 }).title).toBe("Ada O. got you a ticket");
    expect(giftNotice({ buyerName: "Ada O.", eventTitle: "Jazz Night", startDate: start, count: 2 }).title).toBe("Ada O. got you 2 tickets");
  });
  it("respects notification settings", () => {
    expect(wantsNotification(null, "ticketPurchase")).toBe(true);
    expect(wantsNotification({ allNotifications: false }, "ticketPurchase")).toBe(false);
    expect(wantsNotification({ ticketReceived: false }, "ticketReceived")).toBe(false);
    expect(wantsNotification({ ticketReceived: false }, "ticketPurchase")).toBe(true);
  });
});
