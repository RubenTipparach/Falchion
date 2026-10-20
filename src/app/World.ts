import { GalaxyModel, StarSystem } from '../core/galaxy/GalaxyModel';
import { Hex, hexAdd } from '../core/hex/Hex';
import { hash01, hashSeed } from '../core/rng/Rng';
import type { TerritoryClaim } from '../render/map/TerritoryLayer';

/** Territory (hex radius) around a home system; settled systems add COLONY_RADIUS around themselves. */
export const HOME_RADIUS = 5;
export const COLONY_RADIUS = 3;

/** The player's home and its territory, derived from the galaxy seed. NPC empires live in the shared world. */
export interface World {
  readonly home: StarSystem;
  readonly claims: readonly TerritoryClaim[];
}

/**
 * The world around one player. Signed-in players (`playerKey` = Discord id) get their
 * own home in a shared starting region 60–260 ly around the original home, so friends
 * start within an hour or two of each other; guests keep the original home. `homeHint` is a
 * saved empire's home system, kept as it is.
 */
export function createWorld(galaxy: GalaxyModel, playerKey?: string, homeHint?: Hex | null): World {
  const starNear = (h: Hex): StarSystem | null => galaxy.nearestStar(h, 60);

  // Home on a spiral arm around 18,000 ly from the core (GalaxyModel.startHex).
  const origin = starNear(galaxy.startHex())!;
  let home = origin;
  if (playerKey) {
    const a = hash01(galaxy.params.seed, hashSeed(playerKey), 1) * Math.PI * 2;
    const d = 60 + hash01(galaxy.params.seed, hashSeed(playerKey), 2) * 200;
    home = starNear(hexAdd(origin.hex, { q: Math.round(Math.cos(a) * d), r: Math.round(Math.sin(a) * d) })) ?? origin;
  }
  // A saved empire keeps its home, even if the galaxy's star layout has changed since.
  const kept = homeHint ? galaxy.starAt(homeHint) : null;
  if (kept) home = kept;
  // Every empire starts with exactly one star system: its home.
  const claims: TerritoryClaim[] = [
    { name: 'Your Empire', color: '#e6b450', kind: 'player', home: home.hex, colonies: [{ hex: home.hex, radius: HOME_RADIUS }] },
  ];
  return { home, claims };
}
