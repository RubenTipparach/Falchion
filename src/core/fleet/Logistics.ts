import type { Squadron } from '../combat/Combat';
import type { Resource } from '../../content/resources';

/**
 * Fleet logistics. Every ship carries supply, spent to explore; stores refill completely at a
 * friendly system. (Battles need nothing: there is no ammunition. Damage and repairs are in
 * Combat.ts and the fleet's `damage`.)
 */
export interface LogisticsSpec {
  /** Supply carried per ship. Survey hulls carry far more. */
  readonly supply: number;
}

export type SpecOf = (classId: string) => LogisticsSpec | undefined;

export interface Stores {
  readonly supply: number;
}

export type Capacity = Stores;

export function capacity(ships: readonly Squadron[], specOf: SpecOf): Capacity {
  let supply = 0;
  for (const s of ships) {
    const spec = specOf(s.classId);
    if (!spec || s.count <= 0) continue;
    supply += spec.supply * s.count;
  }
  return { supply };
}

export function fullStores(ships: readonly Squadron[], specOf: SpecOf): Stores {
  return capacity(ships, specOf);
}

/** Supply it takes to survey a planet: bigger worlds take longer. */
export function exploreCost(planet: { readonly size: number }): number {
  return 1 + Math.floor(planet.size / 2);
}

/** Spend supply to explore; null when the fleet cannot afford it. */
export function spendSupply(stores: Stores, cost: number): Stores | null {
  return stores.supply >= cost ? { ...stores, supply: stores.supply - cost } : null;
}

/** One turn of logistics: a full refill at a friendly system. */
export function resupply(stores: Stores, ships: readonly Squadron[], specOf: SpecOf, atFriendly: boolean): Stores {
  const c = capacity(ships, specOf);
  return { supply: atFriendly ? c.supply : Math.min(stores.supply, c.supply) };
}

/**
 * Stores after a group changes size: lost ships take their share of what is
 * left with them; new ships arrive fully stocked.
 */
export function rescaleStores(stores: Stores, before: readonly Squadron[], after: readonly Squadron[], specOf: SpecOf): Stores {
  const a = capacity(before, specOf), b = capacity(after, specOf);
  const one = (have: number, from: number, to: number) => {
    if (to >= from) return have + (to - from);
    return from ? Math.round((have * to) / from) : 0;
  };
  return { supply: one(stores.supply, a.supply, b.supply) };
}

/** Clamp stores to a (shrunken) group's capacity, e.g. after losses. */
export function clampStores(stores: Stores, ships: readonly Squadron[], specOf: SpecOf): Stores {
  const c = capacity(ships, specOf);
  return { supply: Math.min(stores.supply, c.supply) };
}

/** A fleet's hold of ore (change holds-and-market-history): units by resource. */
export type Hold = Readonly<Partial<Record<Resource, number>>>;

/** Units aboard a hold, all told. */
export const heldIn = (hold: Hold | undefined): number => Object.values(hold ?? {}).reduce((n: number, v) => n + (v ?? 0), 0);

/** A hold with more added (undefined while it is empty). */
export function addHold(hold: Hold | undefined, more: Hold | undefined): Hold | undefined {
  if (!more) return hold;
  const out: Partial<Record<Resource, number>> = { ...(hold ?? {}) };
  for (const [r, n] of Object.entries(more)) if (n) out[r as Resource] = (out[r as Resource] ?? 0) + n;
  return heldIn(out) > 0 ? out : undefined;
}
