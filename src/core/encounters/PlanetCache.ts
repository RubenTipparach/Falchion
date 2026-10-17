import { BIOME_YIELDS, Resource } from '../../content/resources';
import type { Planet } from '../galaxy/Planets';
import { Rng, hashSeed } from '../rng/Rng';

export type Haul = Partial<Record<Resource, number>>;

/**
 * One-time resource cache found on a newly explored planet. Deterministic per
 * planet: biome yields scaled by size, with an occasional rare find.
 */
export function planetCache(planet: Planet, galaxySeed: number): Haul {
  const rng = new Rng(hashSeed(galaxySeed, 'cache', planet.id));
  const out: Haul = {};
  for (const [r, n] of Object.entries(BIOME_YIELDS[planet.biome] ?? {})) {
    out[r as Resource] = Math.round(n! * (4 + planet.size * 2) * rng.range(0.8, 1.4));
  }
  if (rng.chance(0.3)) out.rareEarths = (out.rareEarths ?? 0) + rng.int(5, 20);
  if (rng.chance(0.15)) out.exotics = (out.exotics ?? 0) + rng.int(2, 8);
  if (rng.chance(0.08)) out.darkMatter = (out.darkMatter ?? 0) + rng.int(1, 4);
  return out;
}

export function addHaul(a: Haul, b: Haul): Haul {
  const out: Haul = { ...a };
  for (const [r, n] of Object.entries(b)) out[r as Resource] = (out[r as Resource] ?? 0) + n!;
  return out;
}
