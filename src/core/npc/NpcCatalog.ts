import { NPC_ARCHETYPES, type NpcArchetype } from '../../content/npcs';
import type { Squadron } from '../combat/Combat';
import type { GalaxyModel, StarSystem } from '../galaxy/GalaxyModel';
import { Hex, hexAdd, hexDistance, hexToWorld, worldToHex } from '../hex/Hex';
import { Rng, hashSeed } from '../rng/Rng';
import type { NpcState } from './types';

/**
 * The NPC empires of the galaxy, generated from its seed: nothing about an NPC is stored until it
 * is discovered, because everything about who it is can be regenerated from its id.
 *
 * - Grid NPCs: the galaxy is cut into cells of NPC_CELL light years; a cell holds one NPC with a
 *   chance that rises with how dense its stars are (a few hundred in all). Id `c:i,j`.
 * - Spawn NPCs: two or three close to every player's home. Id `s:q,r:n`, from the home's hex.
 */
export interface NpcDef {
  readonly id: string;
  readonly archetype: NpcArchetype;
  readonly name: string;
  readonly color: string;
  readonly home: StarSystem;
  /** Its other worlds (0–2). */
  readonly colonies: readonly StarSystem[];
  /** Strength, 1–5: higher toward the galactic core. */
  readonly tier: number;
  /** Spawn NPCs are known to their player from the start. */
  readonly spawn: boolean;
}

export const NPC_CELL = 900;
/** Light years of territory around an NPC's home, and around each of its other worlds. */
export const HOME_TERRITORY = 4;
export const COLONY_TERRITORY = 2;
/** How close (beyond its territory) a fleet must come to discover an NPC. */
export const DISCOVERY_RANGE = 20;
/** How far from home NPC raiders strike. */
export const RAID_RANGE = 150;
/** Chance a cell holds an NPC, per unit of star density. */
const CELL_CHANCE = 0.55;

const cache = new Map<string, NpcDef | null>();

function generate(galaxy: GalaxyModel, id: string, home: StarSystem, rng: Rng, tier: number, spawn: boolean): NpcDef {
  const archetype = rng.pick(NPC_ARCHETYPES);
  const name = `${rng.pick(archetype.prefixes)} ${rng.pick(archetype.suffixes)}`;
  const colonies: StarSystem[] = [];
  const count = rng.int(0, 2);
  for (let i = 0; i < count; i++) {
    const a = rng.next() * Math.PI * 2, d = rng.range(12, 35);
    const s = galaxy.nearestStar(hexAdd(home.hex, { q: Math.round(Math.cos(a) * d), r: Math.round(Math.sin(a) * d) }), 8);
    if (s && s.id !== home.id && !colonies.some((c) => c.id === s.id)) colonies.push(s);
  }
  return { id, archetype, name, color: shade(archetype.color, rng.range(-40, 40), rng.range(-0.12, 0.12)), home, colonies, tier, spawn };
}

/** The NPC of a grid cell, if it has one. */
function gridNpc(galaxy: GalaxyModel, i: number, j: number): NpcDef | null {
  const id = `c:${i},${j}`;
  if (cache.has(id)) return cache.get(id)!;
  const rng = new Rng(hashSeed(galaxy.params.seed, 'npc', id));
  const x = (i + rng.range(0.2, 0.8)) * NPC_CELL, z = (j + rng.range(0.2, 0.8)) * NPC_CELL;
  const r = Math.hypot(x, z);
  let def: NpcDef | null = null;
  if (r < galaxy.params.radius * 0.95 && rng.chance(Math.min(0.85, galaxy.density(x, z) * CELL_CHANCE))) {
    const home = galaxy.nearestStar(worldToHex(x, z), 40);
    if (home) def = generate(galaxy, id, home, rng, Math.max(1, Math.min(5, 1 + Math.floor((1 - r / galaxy.params.radius) * 5))), false);
  }
  cache.set(id, def);
  return def;
}

/** The two or three NPCs close to a player's home. */
export function spawnNpcs(galaxy: GalaxyModel, home: Hex): NpcDef[] {
  const rng = new Rng(hashSeed(galaxy.params.seed, 'spawn-npcs', home.q, home.r));
  const count = rng.chance(0.5) ? 3 : 2;
  const turn = rng.next() * Math.PI * 2;
  const out: NpcDef[] = [];
  for (let n = 0; n < count; n++) out.push(spawnNpc(galaxy, home, n, count, turn)!);
  return out.filter((d) => !!d);
}

function spawnNpc(galaxy: GalaxyModel, home: Hex, n: number, count: number, turn: number): NpcDef | null {
  const id = `s:${home.q},${home.r}:${n}`;
  if (cache.has(id)) return cache.get(id)!;
  const rng = new Rng(hashSeed(galaxy.params.seed, 'npc', id));
  const a = turn + (n / count) * Math.PI * 2 + rng.range(-0.4, 0.4);
  const d = rng.range(25, 90);
  const star = galaxy.nearestStar(hexAdd(home, { q: Math.round(Math.cos(a) * d), r: Math.round(Math.sin(a) * d) }), 15);
  const def = star && hexDistance(star.hex, home) > HOME_TERRITORY * 2 ? generate(galaxy, id, star, rng, n === 2 ? 2 : 1, true) : null;
  cache.set(id, def);
  return def;
}

/** An NPC by id (null for an empty cell or an unknown id). */
export function npcById(galaxy: GalaxyModel, id: string): NpcDef | null {
  let m = /^c:(-?\d+),(-?\d+)$/.exec(id);
  if (m) return gridNpc(galaxy, Number(m[1]), Number(m[2]));
  m = /^s:(-?\d+),(-?\d+):(\d)$/.exec(id);
  if (!m) return null;
  const home = { q: Number(m[1]), r: Number(m[2]) };
  return spawnNpcs(galaxy, home).find((d) => d.id === id) ?? null;
}

/** Grid NPCs with a world within `radius` light years of a hex. */
export function gridNpcsNear(galaxy: GalaxyModel, h: Hex, radius: number): NpcDef[] {
  const p = hexToWorld(h);
  const reach = radius + 60; // a home sits up to 40 ly from its cell's point, colonies 35 beyond
  const out: NpcDef[] = [];
  for (let i = Math.floor((p.x - reach) / NPC_CELL); i <= Math.floor((p.x + reach) / NPC_CELL); i++) {
    for (let j = Math.floor((p.z - reach) / NPC_CELL); j <= Math.floor((p.z + reach) / NPC_CELL); j++) {
      const def = gridNpc(galaxy, i, j);
      if (def && worldsOf(def).some((w) => hexDistance(w.hex, h) <= radius)) out.push(def);
    }
  }
  return out;
}

/** Every grid NPC in the galaxy (slow: for tests and tools). */
export function allGridNpcs(galaxy: GalaxyModel): NpcDef[] {
  const n = Math.ceil(galaxy.params.radius / NPC_CELL);
  const out: NpcDef[] = [];
  for (let i = -n; i <= n; i++) for (let j = -n; j <= n; j++) {
    const def = gridNpc(galaxy, i, j);
    if (def) out.push(def);
  }
  return out;
}

export const worldsOf = (def: NpcDef): StarSystem[] => [def.home, ...def.colonies];

/** Light years of territory around one of its worlds. */
export const territoryOf = (def: NpcDef, starId: string): number => (starId === def.home.id ? HOME_TERRITORY : COLONY_TERRITORY);

/** Whether a hex is inside an NPC's territory, or within `margin` of it. */
export function nearNpc(def: NpcDef, h: Hex, margin = 0): boolean {
  return worldsOf(def).some((w) => hexDistance(w.hex, h) <= territoryOf(def, w.id) + margin);
}

/** Warships an NPC fields with a given number of hulls, from its archetype's pool for its tier. */
export function shipsFor(def: NpcDef, hulls: number, rng: Rng): Squadron[] {
  const pool = def.archetype.pool.filter(([, , min]) => min <= def.tier).map(([id, w]) => [id, w] as [string, number]);
  const counts = new Map<string, number>();
  for (let i = 0; i < hulls; i++) {
    const id = rng.weighted(pool);
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return [...counts].map(([classId, count]) => ({ classId, count }));
}

/** Hulls in a raider fleet, and in a world's garrison. */
export const raiderHulls = (def: NpcDef): number => 3 + def.tier * 2;
export const garrisonHulls = (def: NpcDef, starId: string): number => (starId === def.home.id ? 4 : 2) + def.tier * 2;
/** Planetary defence and troops of one of its worlds. */
export const worldDefense = (def: NpcDef, starId: string) => ({
  defense: (starId === def.home.id ? 220 : 120) * def.tier,
  troops: (starId === def.home.id ? 30 : 15) * def.tier,
});
/** Years between raider fleets (and garrison reinforcements). */
export const buildEvery = (def: NpcDef): number => 12 - def.tier;

/** An NPC as it starts the moment it is discovered: garrisoned worlds and one raider fleet at home. */
export function initialNpcState(def: NpcDef, year: number): NpcState {
  const rng = new Rng(hashSeed(def.id, 'start'));
  return {
    id: def.id, discoveredAt: year, knownBy: [], lastBuilt: year, built: 1,
    colonies: worldsOf(def).map((w) => ({ starId: w.id, garrison: shipsFor(def, garrisonHulls(def, w.id), rng) })),
    fleets: [{ id: `${def.id}/1`, name: `${def.name} Raiders I`, ships: shipsFor(def, raiderHulls(def), rng), mission: 'home', from: def.home.hex, to: def.home.hex, depart: year }],
  };
}

/** A colour turned `dh` degrees round the hue wheel and lightened by `dl`: kin of one archetype look related but distinct. */
function shade(hex: string, dh: number, dl: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  const sat = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let h = d === 0 ? 0 : max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h = (((h * 60 + dh) % 360) + 360) % 360;
  const L = Math.max(0.25, Math.min(0.85, l + dl));
  const c = (1 - Math.abs(2 * L - 1)) * sat, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = L - c / 2;
  const [R, G, B] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  const to = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, '0');
  return `#${to(R)}${to(G)}${to(B)}`;
}
