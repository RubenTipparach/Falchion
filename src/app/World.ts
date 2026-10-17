import { GalaxyModel, StarSystem } from '../core/galaxy/GalaxyModel';
import { Hex, hexAdd, hexDistance, worldToHex } from '../core/hex/Hex';
import { Rng, hashSeed } from '../core/rng/Rng';
import type { TerritoryClaim } from '../render/map/TerritoryLayer';

export interface Neighbour {
  readonly name: string;
  readonly color: string;
  readonly home: StarSystem;
  readonly kind: TerritoryClaim['kind'];
}

/** Mock world for the mockup: the player's home and nearby empires, all derived from the seed. */
export interface MockWorld {
  readonly home: StarSystem;
  readonly claims: readonly TerritoryClaim[];
  readonly neighbours: readonly Neighbour[];
}

export function createMockWorld(galaxy: GalaxyModel): MockWorld {
  const rng = new Rng(hashSeed(galaxy.params.seed, 'world'));
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
  const home = starNear(worldToHex(best.x, best.z))!;
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
    { name: 'Your Empire', color: '#5dff9b', kind: 'player', home: home.hex, colonies: colonies(home, 3, 14, 4) },
    ...neighbours.map((n) => ({
      name: n.name, color: n.color, kind: n.kind, home: n.home.hex,
      colonies: colonies(n.home, n.kind === 'alien' ? 4 : 2, 16, 3),
    })),
  ];
  return { home, claims, neighbours };
}

/** Fleets of two players within this many ly enter a lockstep encounter zone. */
export const LOCKSTEP_RADIUS = 6;

export function inContact(a: Hex, b: Hex): boolean {
  return hexDistance(a, b) <= LOCKSTEP_RADIUS;
}
