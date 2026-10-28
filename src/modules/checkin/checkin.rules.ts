// Pure rules for entry codes, public profiles and check-in. No I/O so they can
// be unit-tested; controllers do the database work.

export const DEFAULT_APP_URL = "https://app.outsiderbyremy.com";

const VIRTUAL_ID = /^vc-[a-z0-9_-]{6,40}$/i;
const PHYSICAL_ID = /^[A-Za-z0-9_-]{8,128}$/;

export type EntryCode =
  | { kind: "virtual"; id: string }
  | { kind: "physical"; id: string };

/** Public profile link encoded in every user's QR code. */
export function profileUrl(virtualCardId: string, appUrl = DEFAULT_APP_URL) {
  return `${appUrl.replace(/\/+$/, "")}/u/${virtualCardId}`;
}

/** Link programmed into physical NFC cards (and any QR printed on them). */
export function cardUrl(cardId: string, appUrl = DEFAULT_APP_URL) {
  return `${appUrl.replace(/\/+$/, "")}/c/${cardId}`;
}

/** Accepts a virtual card id in any form we have ever printed into a QR. */
export function parseVirtualCardId(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;

  try {
    const url = new URL(raw);
    // New format: https://app.../u/vc-xxxx
    const fromPath = url.pathname.match(/^\/u\/([^/]+)\/?$/)?.[1];
    if (fromPath && VIRTUAL_ID.test(fromPath)) return fromPath.toLowerCase();
    // Legacy format: outsider://card?vid=vc-xxxx
    const fromQuery = url.searchParams.get("vid") ?? url.searchParams.get("virtualCardId");
    if (fromQuery && VIRTUAL_ID.test(fromQuery)) return fromQuery.toLowerCase();
    return null;
  } catch {
    // Not a URL: fall through to a bare id.
  }

  return VIRTUAL_ID.test(raw) ? raw.toLowerCase() : null;
}

/**
 * Physical NFC cards: `https://app…/c/<cardId>`, the older `…/card?id=<cardId>`
 * (also without a scheme, e.g. `appurl/card?id=…`), or the bare id.
 */
export function parsePhysicalCardId(input: string): string | null {
  const raw = input.trim();
  if (!raw || VIRTUAL_ID.test(raw)) return null;
  const ok = (id: string | null | undefined) => (id && PHYSICAL_ID.test(id) && !VIRTUAL_ID.test(id) ? id.toLowerCase() : null);

  try {
    const url = new URL(raw);
    return ok(url.pathname.match(/^\/c\/([^/]+)\/?$/)?.[1]) ?? ok(url.searchParams.get("id"));
  } catch {
    // Not a full URL: fall through.
  }

  const fromPath = raw.match(/(?:^|\/)c\/([A-Za-z0-9_-]{8,128})\/?$/)?.[1];
  const fromQuery = raw.match(/[?&]id=([A-Za-z0-9_-]{8,128})/)?.[1];
  return ok(fromPath) ?? ok(fromQuery) ?? ok(raw);
}

/** What a scanner read → which credential it is. Virtual wins when both match. */
export function parseEntryPayload(input: unknown): EntryCode | null {
  if (typeof input !== "string" || input.length > 512) return null;
  const virtual = parseVirtualCardId(input);
  if (virtual) return { kind: "virtual", id: virtual };
  const physical = parsePhysicalCardId(input);
  return physical ? { kind: "physical", id: physical } : null;
}

/** "Ada Lovelace" → "Ada L." — enough for door staff, not a full identity. */
export function displayName(name: unknown): string {
  const parts = typeof name === "string" ? name.trim().split(/\s+/).filter(Boolean) : [];
  if (parts.length === 0) return "Outsiders member";
  const first = parts[0]!;
  const last = parts.length > 1 ? parts[parts.length - 1]! : "";
  return last ? `${first} ${last[0]!.toUpperCase()}.` : first;
}

export interface OrderLike {
  _id: unknown;
  items: Array<{ ticketTierName: string; quantity: number }>;
}

/** Total people admitted by one scan, grouped by tier for the door screen. */
export function summariseAdmission(orders: OrderLike[]) {
  const byTier = new Map<string, number>();
  for (const order of orders) {
    for (const item of order.items) {
      const qty = Number.isFinite(item.quantity) && item.quantity > 0 ? Math.floor(item.quantity) : 0;
      if (qty) byTier.set(item.ticketTierName, (byTier.get(item.ticketTierName) ?? 0) + qty);
    }
  }
  const tiers = [...byTier].map(([name, quantity]) => ({ name, quantity }));
  return {
    admitted: tiers.reduce((sum, t) => sum + t.quantity, 0),
    tiers,
    orderIds: orders.map((o) => String(o._id)),
  };
}

export type WindowCheck =
  | { ok: true }
  | { ok: false; code: "event_closed" | "event_ended" }
  | { ok: false; code: "too_early"; opensAt: Date };

/** Doors open 12h before start and close at the end (or 24h after start when no end is set). */
export function checkInWindow(
  event: { status: string; startDate: Date; endDate?: Date | null },
  now = new Date()
): WindowCheck {
  if (event.status !== "published") return { ok: false, code: "event_closed" };
  const opensAt = new Date(event.startDate.getTime() - 12 * 3600_000);
  const closes = event.endDate ?? new Date(event.startDate.getTime() + 24 * 3600_000);
  if (now < opensAt) return { ok: false, code: "too_early", opensAt };
  if (now > closes) return { ok: false, code: "event_ended" };
  return { ok: true };
}

/** Clamp list paging to sane numbers (NaN-safe). */
export function clampPaging(page: unknown, limit: unknown, maxLimit = 50) {
  const p = Number.parseInt(String(page ?? ""), 10);
  const l = Number.parseInt(String(limit ?? ""), 10);
  return {
    page: Number.isFinite(p) && p > 0 ? p : 1,
    limit: Number.isFinite(l) && l > 0 ? Math.min(l, maxLimit) : 20,
  };
}

/** Escape user text for a case-insensitive regex search. */
export function searchPattern(q: unknown): RegExp | null {
  if (typeof q !== "string") return null;
  const trimmed = q.trim().slice(0, 64);
  if (!trimmed) return null;
  return new RegExp(trimmed.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
}
