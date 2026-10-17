import type { Mineral } from '../../content/resources';
import { Rng, hashSeed } from '../rng/Rng';
import type { StarSystem } from './GalaxyModel';

/**
 * Asteroid fields: what mining ships mine. A system holds zero to three, each of one resource,
 * generated from the galaxy seed (the same for everyone). Mined fields refill linearly to full
 * over REFILL_YEARS (24 real hours at one year a minute); how much each has left lives in the
 * shared world (src/core/world/SharedWorld.ts), so everyone mining a field draws on the same rocks.
 */
export interface AsteroidField {
  /** `${starId}#${n}`, or `${starId}#home-…` for a home system's guaranteed belt. */
  readonly id: string;
  readonly starId: string;
  readonly resource: Mineral;
  /** Units when full. */
  readonly capacity: number;
}

/** What is known about a field that has been mined: what it had left, and when. */
export interface FieldState {
  readonly left: number;
  readonly at: number;
}

/** Years for an emptied field to refill completely: 24 hours at one year per minute. */
export const REFILL_YEARS = 1_440;

/** What mining ships can find, by weight (gas and dust clouds count as fields too). */
const KINDS: ReadonlyArray<[Mineral, number]> = [['metals', 55], ['gases', 30], ['crystals', 15]];
const COUNT_WEIGHTS = [25, 40, 25, 10]; // 0, 1, 2 or 3 fields

function pick<T>(rng: Rng, items: ReadonlyArray<[T, number]>): T {
  const total = items.reduce((s, [, w]) => s + w, 0);
  let x = rng.next() * total;
  for (const [v, w] of items) if ((x -= w) < 0) return v;
  return items[items.length - 1][0];
}

/** A system's asteroid fields. Deterministic for a galaxy seed. */
export function fieldsOf(star: StarSystem, galaxySeed: number): AsteroidField[] {
  const rng = new Rng(hashSeed(galaxySeed, 'asteroids', star.id));
  const n = pick(rng, COUNT_WEIGHTS.map((w, i) => [i, w] as [number, number]));
  return Array.from({ length: n }, (_, i) => {
    const resource = pick(rng, KINDS);
    const rare = resource === 'crystals';
    const capacity = Math.round((rare ? 150 : 300) + rng.next() * (rare ? 450 : 1200));
    return { id: `${star.id}#${i}`, starId: star.id, resource, capacity };
  });
}

/** A home system always has a belt of metals and gases besides its own fields, so a new empire can mine. */
export function homeBelt(star: StarSystem): AsteroidField[] {
  return [
    { id: `${star.id}#home-metals`, starId: star.id, resource: 'metals', capacity: 2400 },
    { id: `${star.id}#home-gases`, starId: star.id, resource: 'gases', capacity: 1200 },
  ];
}

/** What a field holds at a world year, given its state (none: never mined, so full). */
export function fieldLeft(field: AsteroidField, state: FieldState | undefined, year: number): number {
  if (!state) return field.capacity;
  const refilled = state.left + (Math.max(0, year - state.at) * field.capacity) / REFILL_YEARS;
  return Math.min(field.capacity, Math.floor(refilled));
}

/** Years until a field is full again (0 when it is). */
export function yearsToFull(field: AsteroidField, state: FieldState | undefined, year: number): number {
  const left = fieldLeft(field, state, year);
  return left >= field.capacity ? 0 : Math.ceil(((field.capacity - left) * REFILL_YEARS) / field.capacity);
}
