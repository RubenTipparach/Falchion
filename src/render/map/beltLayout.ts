import type { Mineral } from '../../content/resources';
import { hashSeed } from '../../core/rng/Rng';

/**
 * Where a system's asteroid belts go and how full they look: pure helpers, no three.js, so
 * they can be tested. Belts sit in the gaps between planet orbits (or beyond the outermost),
 * never on an orbit line or over a planet's body or rings.
 */

/** A planet orbit as drawn: its radius and how far the planet (and any rings) reach from the line (ly). */
export interface OrbitSlot {
  readonly radius: number;
  readonly extent: number;
}

/** Where one belt sits: its centre radius and half its width (ly). */
export interface BeltPlace {
  readonly radius: number;
  readonly halfWidth: number;
}

/** Half width of a belt with room to spare (ly). */
export const BELT_HALF_WIDTH = 0.009;
/** The narrowest half width worth drawing in a tight gap (ly). */
const MIN_HALF_WIDTH = 0.0045;
/** Kept clear between a belt's edge and an orbit line or planet (rocks have size too). */
export const BELT_MARGIN = 0.005;
/** Space between two belts placed beyond the outermost planet. */
const OUTER_SPACING = 0.012;

interface Gap { readonly lo: number; readonly hi: number }

/**
 * Places each field (by id) at a distinct radius. The bounded gaps (between the star's clear zone
 * and the first orbit, and between neighbouring orbits) are the slots; beyond the outermost planet
 * there is always room. A field picks its slot from its id, so the layout is the same for everyone.
 */
export function placeBelts(orbits: readonly OrbitSlot[], innerEdge: number, firstOrbit: number, ids: readonly string[]): BeltPlace[] {
  const sorted = [...orbits].sort((a, b) => a.radius - b.radius);
  const gaps: Gap[] = [];
  let lo = innerEdge;
  for (const o of sorted) {
    gaps.push({ lo, hi: o.radius - o.extent });
    lo = o.radius + o.extent;
  }
  const slots = gaps
    .map((g) => ({ ...g, half: (g.hi - g.lo) / 2 - BELT_MARGIN }))
    .filter((g) => g.half >= MIN_HALF_WIDTH);
  const outerStart = sorted.length ? lo : Math.max(lo, firstOrbit);
  let outer = 0;
  const places = new Map<string, BeltPlace>();
  for (const id of [...ids].sort()) {
    const h = hashSeed(id, 'belt-slot');
    const pick = h % (slots.length + 1);
    const jitter = (hashSeed(id, 'belt-jitter') % 1000) / 1000;
    if (pick < slots.length) {
      const [s] = slots.splice(pick, 1);
      const halfWidth = Math.min(BELT_HALF_WIDTH, s.half);
      const slack = s.half - halfWidth;
      places.set(id, { radius: (s.lo + s.hi) / 2 + (jitter - 0.5) * 2 * slack, halfWidth });
    } else {
      const radius = outerStart + BELT_MARGIN + BELT_HALF_WIDTH + outer * (2 * BELT_HALF_WIDTH + OUTER_SPACING) + jitter * 0.006;
      outer++;
      places.set(id, { radius, halfWidth: BELT_HALF_WIDTH });
    }
  }
  return ids.map((id) => places.get(id)!);
}

/** The most rocks a belt of a resource draws when full: a few hundred at most, cheap on phones. */
const MAX_ROCKS: Readonly<Record<Mineral, number>> = { metals: 320, gases: 70, crystals: 190 };
/** Capacity at which a field draws its most rocks (crystal fields are small and rare). */
const FULL_AT: Readonly<Record<Mineral, number>> = { metals: 1500, gases: 1200, crystals: 600 };

/** How many rocks a full field of this resource and capacity draws. */
export function maxRocks(resource: Mineral, capacity: number): number {
  const f = Math.min(1, 0.4 + 0.6 * Math.sqrt(Math.max(0, capacity) / FULL_AT[resource]));
  return Math.round(MAX_ROCKS[resource] * f);
}

/** What is left as a fraction of capacity, in [0, 1]. */
export function fullness(left: number, capacity: number): number {
  return capacity > 0 ? Math.min(1, Math.max(0, left / capacity)) : 0;
}

/** Rocks shown for what is left: all when full, a sprinkle of gravel when mined out. */
export function visibleRocks(left: number, capacity: number, max: number): number {
  return Math.round(max * (0.04 + 0.96 * fullness(left, capacity)));
}
