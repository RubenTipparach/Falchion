import type { Mineral } from '../../content/resources';
import type { Squadron } from '../combat/Combat';
import type { GalaxyModel, StarSystem } from '../galaxy/GalaxyModel';
import { type Hex, hexRing } from '../hex/Hex';

/** How far (ly) an auto-mining fleet looks for fields with rocks left: 80 years at the base speed. */
export const MINE_REACH = 80;

/** A field with fewer units than this left counts as mined out (it only trickles back as it refills). */
export const DRY_FIELD = 10;

/** The resources a group's mining ships mine, in a fixed order (empty when it has none). */
export function minedBy(ships: readonly Squadron[], minesOf: (classId: string) => Mineral | undefined): Mineral[] {
  const out = new Set<Mineral>();
  for (const s of ships) {
    const r = s.count > 0 ? minesOf(s.classId) : undefined;
    if (r) out.add(r);
  }
  return [...out].sort();
}

/** What a system's fields hold for these miners: the units in fields that are not mined out. */
export function stockFor(fields: ReadonlyArray<{ readonly field: { readonly resource: Mineral }; readonly left: number }>, resources: readonly Mineral[]): number {
  return fields.reduce((n, f) => n + (resources.includes(f.field.resource) && f.left >= DRY_FIELD ? f.left : 0), 0);
}

/**
 * The nearest system to `from` (by hex distance, the start excluded) that `stockAt` gives
 * something to mine, within `reach`. Ties at the same distance go to the one with more left,
 * then to the lower star id. Deterministic for a given galaxy, start and stock.
 */
export function nearestMine(galaxy: GalaxyModel, from: Hex, stockAt: (s: StarSystem) => number, reach = MINE_REACH): StarSystem | null {
  for (let k = 1; k <= reach; k++) {
    let best: StarSystem | null = null;
    let bestLeft = 0;
    for (const c of hexRing(from, k)) {
      const s = galaxy.starAt(c);
      if (!s) continue;
      const left = stockAt(s);
      if (left > bestLeft || (left > 0 && left === bestLeft && best && s.id < best.id)) { best = s; bestLeft = left; }
    }
    if (best) return best;
  }
  return null;
}
