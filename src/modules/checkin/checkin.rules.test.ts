import { describe, expect, it } from "bun:test";
import {
  cardUrl,
  checkInWindow,
  clampPaging,
  displayName,
  parseEntryPayload,
  profileUrl,
  searchPattern,
  summariseAdmission,
} from "./checkin.rules";

const VC = "vc-ab12cd34ef56gh";

describe("parseEntryPayload", () => {
  it("reads the new public profile link", () => {
    expect(parseEntryPayload(`https://app.outsiderbyremy.com/u/${VC}`)).toEqual({ kind: "virtual", id: VC });
    expect(parseEntryPayload(`https://app.outsiderbyremy.com/u/${VC.toUpperCase()}/`)).toEqual({ kind: "virtual", id: VC });
  });
  it("still reads legacy QR codes and bare ids", () => {
    expect(parseEntryPayload(`outsider://card?vid=${VC}`)).toEqual({ kind: "virtual", id: VC });
    expect(parseEntryPayload(`  ${VC} `)).toEqual({ kind: "virtual", id: VC });
  });
  it("reads the physical card link in every printed form", () => {
    expect(parseEntryPayload("https://app.outsiderbyremy.com/c/CARD12345678")).toEqual({ kind: "physical", id: "card12345678" });
    expect(parseEntryPayload("appurl/card?id=CARD12345678")).toEqual({ kind: "physical", id: "card12345678" });
    expect(parseEntryPayload(cardUrl("card12345678", "https://app.example.com/"))).toEqual({ kind: "physical", id: "card12345678" });
    expect(parseEntryPayload("https://app.outsiderbyremy.com/c/vc-ab12cd34ef56gh")).toBeNull();
  });
  it("reads physical NFC card payloads", () => {
    expect(parseEntryPayload("https://outsiders.app/c?id=CARD12345678")).toEqual({ kind: "physical", id: "card12345678" });
    expect(parseEntryPayload("CARD12345678")).toEqual({ kind: "physical", id: "card12345678" });
  });
  it("rejects junk", () => {
    for (const bad of ["", "hi", "https://evil.example/u/not-a-card", "javascript:alert(1)", 42, null, "x".repeat(600)]) {
      expect(parseEntryPayload(bad)).toBeNull();
    }
  });
  it("round-trips profileUrl", () => {
    expect(parseEntryPayload(profileUrl(VC, "https://app.example.com/"))).toEqual({ kind: "virtual", id: VC });
  });
});

describe("displayName", () => {
  it("shows first name and last initial only", () => {
    expect(displayName("Ada Lovelace")).toBe("Ada L.");
    expect(displayName("  ada  van  rossum ")).toBe("ada R.");
    expect(displayName("Kemi")).toBe("Kemi");
    expect(displayName("")).toBe("Outsiders member");
    expect(displayName(undefined)).toBe("Outsiders member");
  });
});

describe("summariseAdmission", () => {
  it("adds quantities across orders and groups by tier", () => {
    const result = summariseAdmission([
      { _id: "o1", items: [{ ticketTierName: "Regular", quantity: 2 }, { ticketTierName: "VIP", quantity: 1 }] },
      { _id: "o2", items: [{ ticketTierName: "Regular", quantity: 1 }, { ticketTierName: "Bad", quantity: -3 }] },
    ]);
    expect(result.admitted).toBe(4);
    expect(result.tiers).toEqual([{ name: "Regular", quantity: 3 }, { name: "VIP", quantity: 1 }]);
    expect(result.orderIds).toEqual(["o1", "o2"]);
  });
});

describe("checkInWindow", () => {
  const start = new Date("2026-11-01T18:00:00Z");
  const at = (iso: string) => new Date(iso);
  it("opens 12h before start and closes at end", () => {
    const event = { status: "published", startDate: start, endDate: new Date("2026-11-01T23:00:00Z") };
    expect(checkInWindow(event, at("2026-11-01T05:59:00Z"))).toMatchObject({ ok: false, code: "too_early" });
    expect(checkInWindow(event, at("2026-11-01T06:00:00Z"))).toEqual({ ok: true });
    expect(checkInWindow(event, at("2026-11-01T23:01:00Z"))).toEqual({ ok: false, code: "event_ended" });
  });
  it("defaults to 24h after start without an end date, and rejects non-published events", () => {
    expect(checkInWindow({ status: "published", startDate: start }, at("2026-11-02T17:00:00Z"))).toEqual({ ok: true });
    expect(checkInWindow({ status: "cancelled", startDate: start }, at("2026-11-01T18:00:00Z"))).toEqual({ ok: false, code: "event_closed" });
  });
});

describe("clampPaging / searchPattern", () => {
  it("clamps paging", () => {
    expect(clampPaging("abc", "9999")).toEqual({ page: 1, limit: 50 });
    expect(clampPaging("3", "0")).toEqual({ page: 3, limit: 20 });
  });
  it("escapes regex input", () => {
    expect(searchPattern("a.b(")!.test("A.B(")).toBe(true);
    expect(searchPattern("a.b(")!.test("axb(")).toBe(false);
    expect(searchPattern("   ")).toBeNull();
  });
});
