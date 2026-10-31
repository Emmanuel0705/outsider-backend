// Pure rules for editing an event's ticket tiers without touching sold counts.
// Existing tiers are matched by _id; tiers without an _id are new.

export const MAX_TIERS = 20;
export const MAX_TIER_QUANTITY = 1_000_000;

export interface ExistingTier {
  _id: string;
  name: string;
  price: number;
  totalQuantity: number;
  soldQuantity: number;
}

export interface TierChange {
  id: string;
  name: string;
  price: number;
  totalQuantity: number;
  /** Lower bound used as an update guard: sales can't exceed the new total. */
  soldQuantity: number;
}

export type TierPlan =
  | {
      ok: true;
      updates: TierChange[];
      adds: Array<{ name: string; price: number; totalQuantity: number }>;
      removes: string[];
    }
  | { ok: false; error: string };

function readTier(raw: unknown): { id?: string; name: string; price: number; totalQuantity: number } | string {
  const t = (raw ?? {}) as Record<string, unknown>;
  const name = typeof t.name === "string" ? t.name.trim() : "";
  const price = typeof t.price === "number" ? t.price : Number(t.price);
  const totalQuantity = typeof t.totalQuantity === "number" ? t.totalQuantity : Number(t.totalQuantity);
  if (!name || name.length > 60) return "Each ticket type needs a name (up to 60 characters).";
  if (!Number.isFinite(price) || price < 0) return `"${name}" needs a valid price.`;
  if (!Number.isInteger(totalQuantity) || totalQuantity < 1 || totalQuantity > MAX_TIER_QUANTITY) {
    return `"${name}" needs a quantity between 1 and ${MAX_TIER_QUANTITY.toLocaleString("en-NG")}.`;
  }
  const id = typeof t._id === "string" && t._id ? t._id : undefined;
  return { id, name, price: Math.round(price * 100) / 100, totalQuantity };
}

/**
 * Plans tier edits: change name/price/quantity of existing tiers, add new
 * ones, remove unsold ones. Quantities can't go below what's already sold,
 * and tiers with sales can't be removed (their buyers' tickets reference them).
 */
export function planTierUpdate(existing: ExistingTier[], incoming: unknown): TierPlan {
  if (!Array.isArray(incoming)) return { ok: false, error: "ticketTiers must be a list." };
  if (incoming.length === 0) return { ok: false, error: "Keep at least one ticket type." };
  if (incoming.length > MAX_TIERS) return { ok: false, error: `At most ${MAX_TIERS} ticket types.` };

  const byId = new Map(existing.map((t) => [t._id, t]));
  const seen = new Set<string>();
  const updates: TierChange[] = [];
  const adds: Array<{ name: string; price: number; totalQuantity: number }> = [];

  for (const raw of incoming) {
    const tier = readTier(raw);
    if (typeof tier === "string") return { ok: false, error: tier };
    if (!tier.id) {
      adds.push({ name: tier.name, price: tier.price, totalQuantity: tier.totalQuantity });
      continue;
    }
    const current = byId.get(tier.id);
    if (!current) return { ok: false, error: "A ticket type no longer exists. Reload and try again." };
    if (seen.has(tier.id)) return { ok: false, error: "A ticket type appears twice." };
    seen.add(tier.id);
    if (tier.totalQuantity < current.soldQuantity) {
      return {
        ok: false,
        error: `"${tier.name}" has ${current.soldQuantity} sold, so its quantity can't be less than ${current.soldQuantity}.`,
      };
    }
    updates.push({ id: tier.id, name: tier.name, price: tier.price, totalQuantity: tier.totalQuantity, soldQuantity: current.soldQuantity });
  }

  const removes: string[] = [];
  for (const tier of existing) {
    if (seen.has(tier._id)) continue;
    if (tier.soldQuantity > 0) {
      return { ok: false, error: `"${tier.name}" already has sales and can't be removed. Set its quantity instead.` };
    }
    removes.push(tier._id);
  }

  return { ok: true, updates, adds, removes };
}

/** Tickets still on sale across all tiers. */
export function ticketsLeft(tiers: Array<{ totalQuantity: number; soldQuantity: number }>) {
  return tiers.reduce((sum, t) => sum + Math.max(0, t.totalQuantity - t.soldQuantity), 0);
}
