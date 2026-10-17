import { GalaxyModel, StarSystem } from '../core/galaxy/GalaxyModel';
import { Hex, hexAdd, hexDistance, worldToHex } from '../core/hex/Hex';
import type { TradePartner } from '../content/society';
import { Rng, hash01, hashSeed } from '../core/rng/Rng';
import type { TerritoryClaim } from '../render/map/TerritoryLayer';

export interface Neighbour {
  readonly name: string;
  readonly color: string;
  readonly home: StarSystem;
  readonly kind: TerritoryClaim['kind'];
}

/** Territory (hex radius) around a home system; settled systems add COLONY_RADIUS around themselves. */
export const HOME_RADIUS = 5;
export const COLONY_RADIUS = 3;

/** The player's home and the nearby empires, all derived from the galaxy seed. */
export interface World {
  readonly home: StarSystem;
  readonly claims: readonly TerritoryClaim[];
  readonly neighbours: readonly Neighbour[];
}

/**
 * The world around one player. Signed-in players (`playerKey` = Discord id) get their
 * own home in a shared starting region 60–260 ly around the original home, so friends
 * start within an hour or two of each other; guests keep the original home. `homeHint` is a
 * saved empire's home system, kept as it is.
 */
export function createWorld(galaxy: GalaxyModel, playerKey?: string, homeHint?: Hex | null): World {
  const rng = new Rng(playerKey ? hashSeed(galaxy.params.seed, 'world', playerKey) : hashSeed(galaxy.params.seed, 'world'));
  const offset = (dist: number): Hex => {
    const a = rng.next() * Math.PI * 2;
    return { q: Math.round(Math.cos(a) * dist), r: Math.round(Math.sin(a) * dist) };
  };
  const starNear = (h: Hex): StarSystem | null => galaxy.nearestStar(h, 60);

  // Home on a spiral arm around 18,000 ly from the core.
  let best = { d: -1, x: 0, z: 0 };
  for (let i = 0; i < 64; i++) {
    const a = (i / 64) * Math.PI * 2;
    const x = 18_000 * Math.cos(a), z = 18_000 * Math.sin(a);
    const d = galaxy.density(x, z);
    if (d > best.d) best = { d, x, z };
  }
  const origin = starNear(worldToHex(best.x, best.z))!;
  let home = origin;
  if (playerKey) {
    const a = hash01(galaxy.params.seed, hashSeed(playerKey), 1) * Math.PI * 2;
    const d = 60 + hash01(galaxy.params.seed, hashSeed(playerKey), 2) * 200;
    home = starNear(hexAdd(origin.hex, { q: Math.round(Math.cos(a) * d), r: Math.round(Math.sin(a) * d) })) ?? origin;
  }
  // A saved empire keeps its home, even if the galaxy's star layout has changed since.
  const kept = homeHint ? galaxy.starAt(homeHint) : null;
  if (kept) home = kept;
  const around = (dist: number): StarSystem => starNear(hexAdd(home.hex, offset(dist))) ?? home;

  const neighbours: Neighbour[] = [
    { name: 'Vossk Hegemony', color: '#ff5d5d', home: around(70), kind: 'alien' },
    { name: 'Krell Swarm', color: '#ff9f43', home: around(320), kind: 'alien' },
    { name: 'Nova Collective', color: '#4fd1ff', home: around(140), kind: 'other-player' },
    { name: 'House Arrakai', color: '#c792ea', home: around(1_800), kind: 'other-player' },
    { name: 'Lumen Accord', color: '#ffd166', home: around(9_000), kind: 'other-player' },
  ];

  // Every empire starts with exactly one star system: its home.
  const claims: TerritoryClaim[] = [
    { name: 'Your Empire', color: '#e6b450', kind: 'player', home: home.hex, colonies: [{ hex: home.hex, radius: HOME_RADIUS }] },
    ...neighbours.map((n) => ({ name: n.name, color: n.color, kind: n.kind, home: n.home.hex, colonies: [{ hex: n.home.hex, radius: HOME_RADIUS }] })),
  ];
  return { home, claims, neighbours };
}

/** Trade partners derived from the world, with distances from home. */
export function tradePartners(world: World, home: StarSystem): TradePartner[] {
  const dist = (h: { q: number; r: number }) => hexDistance(home.hex, h);
  const mine = world.claims.find((c) => c.kind === 'player')!;
  return [
    ...mine.colonies.slice(1).map((c, i) => ({ id: `colony-${i}`, name: `Colony ${['Aster', 'Brannoc', 'Cirrus', 'Daleth'][i] ?? i + 1}`, kind: 'colony' as const, distance: Math.max(1, dist(c.hex)) })),
    ...world.neighbours.map((n) => ({ id: n.name, name: n.name, kind: n.kind === 'alien' ? ('alien' as const) : ('player' as const), distance: dist(n.home.hex) })),
  ];
}
