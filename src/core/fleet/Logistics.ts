import type { Squadron } from '../combat/Combat';

/**
 * Fleet logistics. Every ship carries supply (spent to explore) and armed
 * ships carry ammunition (spent in battle). Stores refill completely at a
 * friendly system; away from home only ammunition trickles back.
 */
export interface LogisticsSpec {
  /** Supply carried per ship. Survey hulls carry far more. */
  readonly supply: number;
  /** Ammunition carried per ship (0 = unarmed). */
  readonly ammo: number;
  /** Ammunition one ship fires in a battle. */
  readonly ammoUse: number;
  /** Ammunition one ship regenerates per turn away from friendly space. */
  readonly ammoRegen: number;
}

export type SpecOf = (classId: string) => LogisticsSpec | undefined;

export interface Stores {
  readonly supply: number;
  readonly ammo: number;
}

export interface Capacity extends Stores {
  /** Ammunition the whole group fires in one battle. */
  readonly ammoUse: number;
  readonly ammoRegen: number;
}

export function capacity(ships: readonly Squadron[], specOf: SpecOf): Capacity {
  let supply = 0, ammo = 0, ammoUse = 0, ammoRegen = 0;
  for (const s of ships) {
    const spec = specOf(s.classId);
    if (!spec || s.count <= 0) continue;
    supply += spec.supply * s.count;
    ammo += spec.ammo * s.count;
    ammoUse += spec.ammoUse * s.count;
    ammoRegen += spec.ammoRegen * s.count;
  }
  return { supply, ammo, ammoUse, ammoRegen };
}

export function fullStores(ships: readonly Squadron[], specOf: SpecOf): Stores {
  const c = capacity(ships, specOf);
  return { supply: c.supply, ammo: c.ammo };
}

/** Supply it takes to survey a planet: bigger worlds take longer. */
export function exploreCost(planet: { readonly size: number }): number {
  return 1 + Math.floor(planet.size / 2);
}

/** Spend supply to explore; null when the fleet cannot afford it. */
export function spendSupply(stores: Stores, cost: number): Stores | null {
  return stores.supply >= cost ? { ...stores, supply: stores.supply - cost } : null;
}

/** One turn of logistics: full refill at a friendly system, otherwise slow ammunition regeneration. */
export function resupply(stores: Stores, ships: readonly Squadron[], specOf: SpecOf, atFriendly: boolean): Stores {
  const c = capacity(ships, specOf);
  if (atFriendly) return { supply: c.supply, ammo: c.ammo };
  return { supply: Math.min(stores.supply, c.supply), ammo: Math.min(c.ammo, stores.ammo + c.ammoRegen) };
}

/**
 * How hard a group can fight with the ammunition it has. A full load gives
 * factor 1; an empty magazine leaves only point-defence and ramming (0.15).
 */
export function firepower(ammo: number, ships: readonly Squadron[], specOf: SpecOf): { readonly factor: number; readonly spent: number } {
  const need = capacity(ships, specOf).ammoUse;
  if (need === 0) return { factor: 1, spent: 0 };
  const spent = Math.min(ammo, need);
  return { factor: Math.max(0.15, spent / need), spent };
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
  return { supply: one(stores.supply, a.supply, b.supply), ammo: one(stores.ammo, a.ammo, b.ammo) };
}

/** Clamp stores to a (shrunken) group's capacity, e.g. after losses. */
export function clampStores(stores: Stores, ships: readonly Squadron[], specOf: SpecOf): Stores {
  const c = capacity(ships, specOf);
  return { supply: Math.min(stores.supply, c.supply), ammo: Math.min(stores.ammo, c.ammo) };
}
