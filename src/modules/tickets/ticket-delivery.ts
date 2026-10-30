// Pure rules for who gets which tickets in a purchase and what we tell them.
// No I/O so they can be unit-tested; the controller and notifier do the work.

const OBJECT_ID = /^[a-f0-9]{24}$/i;
export const MAX_GIFTS = 20;

export interface PricedItem {
  ticketTierId: string;
  ticketTierName: string;
  quantity: number;
  unitPrice: number;
}

export interface GiftRequest {
  userId: string;
  ticketTierId: string;
}

export type Split =
  | { ok: true; self: PricedItem[]; recipients: Array<{ userId: string; items: PricedItem[] }> }
  | { ok: false; error: string };

/**
 * Splits a purchase into the buyer's own tickets and tickets for other people.
 * `items` is the full basket (what's paid for); each gift takes one ticket of a
 * tier out of it. Requests without gifts (e.g. the mobile app) keep every
 * ticket on the buyer.
 */
export function splitGifts(items: PricedItem[], gifts: unknown, buyerId: string): Split {
  if (gifts === undefined || gifts === null) return { ok: true, self: items, recipients: [] };
  if (!Array.isArray(gifts)) return { ok: false, error: "gifts must be a list" };
  if (gifts.length > MAX_GIFTS) return { ok: false, error: `You can buy for at most ${MAX_GIFTS} people at once` };

  const left = new Map(items.map((i) => [i.ticketTierId, i.quantity]));
  const byRecipient = new Map<string, Map<string, number>>();

  for (const raw of gifts as Array<Partial<GiftRequest>>) {
    const userId = typeof raw?.userId === "string" ? raw.userId : "";
    const tierId = typeof raw?.ticketTierId === "string" ? raw.ticketTierId : "";
    if (!OBJECT_ID.test(userId)) return { ok: false, error: "Invalid recipient" };
    if (userId === buyerId) return { ok: false, error: "Pick your own ticket instead of gifting it to yourself" };
    const remaining = left.get(tierId);
    if (!remaining) return { ok: false, error: "A gifted ticket isn't in your order" };
    left.set(tierId, remaining - 1);
    const tiers = byRecipient.get(userId) ?? new Map<string, number>();
    tiers.set(tierId, (tiers.get(tierId) ?? 0) + 1);
    byRecipient.set(userId, tiers);
  }

  const withQty = (tierId: string, quantity: number): PricedItem => ({
    ...items.find((i) => i.ticketTierId === tierId)!,
    quantity,
  });
  return {
    ok: true,
    self: [...left].filter(([, q]) => q > 0).map(([tierId, q]) => withQty(tierId, q)),
    recipients: [...byRecipient].map(([userId, tiers]) => ({
      userId,
      items: [...tiers].map(([tierId, q]) => withQty(tierId, q)),
    })),
  };
}

export const countTickets = (items: Array<{ quantity: number }>) => items.reduce((sum, i) => sum + i.quantity, 0);
export const orderTotal = (items: PricedItem[]) => items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);

/** "Sat, 14 Nov · 8:00 PM" in Lagos time, for notifications and email. */
export function eventWhen(date: Date | string | null | undefined): string {
  if (!date) return "";
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return "";
  const day = d.toLocaleDateString("en-NG", { weekday: "short", day: "numeric", month: "short", timeZone: "Africa/Lagos" });
  const time = d.toLocaleTimeString("en-NG", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Africa/Lagos" });
  return `${day} · ${time}`;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** In-app notification for the person who paid. */
export function purchaseNotice(input: { eventTitle: string; startDate: Date | string; selfCount: number; giftCount: number }) {
  const parts: string[] = [];
  if (input.selfCount) parts.push(plural(input.selfCount, "ticket"));
  if (input.giftCount) parts.push(`${input.giftCount} for ${input.giftCount === 1 ? "a friend" : "friends"}`);
  const when = eventWhen(input.startDate);
  return {
    title: input.selfCount ? `You're going to ${input.eventTitle}` : `Tickets sent for ${input.eventTitle}`,
    body: `${parts.join(" + ")}${when ? ` · ${when}` : ""}. ${input.selfCount ? "Your entry pass is ready." : "We've let them know."}`,
  };
}

/** In-app notification for someone who was bought a ticket. */
export function giftNotice(input: { buyerName: string; eventTitle: string; startDate: Date | string; count: number }) {
  const when = eventWhen(input.startDate);
  return {
    title: `${input.buyerName} got you ${input.count === 1 ? "a ticket" : plural(input.count, "ticket")}`,
    body: `${input.eventTitle}${when ? ` · ${when}` : ""}. Show your Outsiders QR or card at the door.`,
  };
}

/** Notification preferences: everything is on unless the user turned it off. */
export function wantsNotification(
  prefs: { allNotifications?: boolean; ticketPurchase?: boolean; ticketReceived?: boolean } | null | undefined,
  kind: "ticketPurchase" | "ticketReceived"
) {
  if (!prefs) return true;
  return prefs.allNotifications !== false && prefs[kind] !== false;
}
