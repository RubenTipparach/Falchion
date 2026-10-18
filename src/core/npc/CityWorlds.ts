import type { GalaxyModel, StarSystem } from '../galaxy/GalaxyModel';
import type { Planet } from '../galaxy/Planets';
import { gridNpcsNear } from './NpcCatalog';

/** NPC tiers whose capital is a planet-wide city (the advanced civilisations near the core). */
export const CITY_WORLD_TIER = 4;

/** The world an NPC rules from: its first world that is neither a gas giant nor molten. */
export function seatOf<P extends Pick<Planet, 'index' | 'biome'>>(planets: readonly P[]): P | null {
  return [...planets].sort((a, b) => a.index - b.index).find((p) => p.biome !== 'gas' && p.biome !== 'magma') ?? null;
}

/**
 * The planet id of the city world in a system, if an advanced NPC (tier 4-5) rules from it.
 * Deterministic: the same for every viewer, discovered or not.
 */
export function cityWorldIn(galaxy: GalaxyModel, star: StarSystem, planets: readonly Planet[]): string | null {
  const ruler = gridNpcsNear(galaxy, star.hex, 0).find((d) => d.home.id === star.id && d.tier >= CITY_WORLD_TIER);
  return ruler ? seatOf(planets)?.id ?? null : null;
}
