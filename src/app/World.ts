import { GalaxyModel, StarSystem } from '../core/galaxy/GalaxyModel';
import { Hex, hexAdd, worldToHex } from '../core/hex/Hex';
import { Rng, hash01, hashSeed } from '../core/rng/Rng';
import type { TerritoryClaim } from '../render/map/TerritoryLayer';

export interface Neighbour {
  readonly name: string;
  readonly color: string;
  readonly home: StarSystem;
  readonly kind: TerritoryClaim['kind'];
}

/** The player's home and the nearby empires, all derived from the galaxy seed. */
export interface World {
  readonly home: StarSystem;
  readonly claims: readonly TerritoryClaim[];
  readonly neighbours: readonly Neighbour[];
}

/**
 * The world around one player. Signed-in players (`playerKey` = Discord id) get their
 * own home in a shared starting region 60–260 ly around the original home, so friends
 * start within an hour or two of each other; guests keep the original home.
 */
export function createWorld(galaxy: GalaxyModel, playerKey?: string): World {
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
  const around = (dist: number): StarSystem => starNear(hexAdd(home.hex, offset(dist))) ?? home;

  const neighbours: Neighbour[] = [
    { name: 'Vossk Hegemony', color: '#ff5d5d', home: around(70), kind: 'alien' },
    { name: 'Krell Swarm', color: '#ff9f43', home: around(320), kind: 'alien' },
    { name: 'Nova Collective', color: '#4fd1ff', home: around(140), kind: 'other-player' },
    { name: 'House Arrakai', color: '#c792ea', home: around(1_800), kind: 'other-player' },
    { name: 'Lumen Accord', color: '#ffd166', home: around(9_000), kind: 'other-player' },
  ];

  const colonies = (center: StarSystem, n: number, spread: number, radius: number) => [
    { hex: center.hex, radius: radius + 2 },
    ...Array.from({ length: n }, () => ({ hex: starNear(hexAdd(center.hex, offset(spread)))?.hex ?? center.hex, radius })),
  ];
  const claims: TerritoryClaim[] = [
    { name: 'Your Empire', color: '#e6b450', kind: 'player', home: home.hex, colonies: colonies(home, 3, 14, 4) },
    ...neighbours.map((n) => ({
      name: n.name, color: n.color, kind: n.kind, home: n.home.hex,
      colonies: colonies(n.home, n.kind === 'alien' ? 4 : 2, 16, 3),
    })),
  ];
  return { home, claims, neighbours };
}
