import { BUILDINGS } from '../../content/buildings';
import { TOWN_NAMES } from '../../content/surfaceNames';
import { Rng, hashSeed } from '../rng/Rng';
import { SurfaceLook, Vec3, distance, frameAt, isLand, normalize, offsetDir, rawHeight } from './Terrain';

/**
 * Where things stand on a planet's surface: its main city, towns and special buildings. Pure and
 * deterministic: the same planet id, look and colony always give the same layout (seeded from
 * the planet id; no ambient randomness). Distances are in planet radii.
 */

export type SettlementKind = 'capital' | 'city' | 'town';

export interface Settlement {
  readonly name: string;
  readonly kind: SettlementKind;
  /** Centre, a unit direction in the planet's frame. */
  readonly dir: Vec3;
  /** Population in millions. */
  readonly pop: number;
  /** Urban radius (chord, planet radii). */
  readonly radius: number;
  /** Street grid cell. */
  readonly cell: number;
  /** The ground is flattened to `level` within `flatIn` of the centre, blending out by `flatOut`. */
  readonly flatIn: number;
  readonly flatOut: number;
  readonly level: number;
  /** Seed for the city's own blocks and towers. */
  readonly seed: number;
}

export interface BuildingSite {
  /** Building id (src/content/buildings.ts). */
  readonly id: string;
  /** On the ground: centre of the model; orbital: the point it hangs over. */
  readonly dir: Vec3;
  /** Heading of the model about the local up, radians (it faces the city). */
  readonly heading: number;
  /** Built in low orbit (the shipyard), not on the ground. */
  readonly orbital: boolean;
}

/** Who holds the planet, as the surface shows it. */
export interface SettlementInput {
  /** 'own': the player's colony (city, towns, buildings); 'foreign': one generic city. */
  readonly owner: 'own' | 'foreign';
  /** The main city's name (the colony's name, or the owner's world). */
  readonly name: string;
  readonly capital: boolean;
  /** Colony size, 1..5 (the planet's size). */
  readonly size: number;
  /** Building ids, as on the colony (repeats allowed). */
  readonly buildings: readonly string[];
}

export interface SurfaceLayout {
  /** Main city first (when settled), then towns. */
  readonly settlements: readonly Settlement[];
  readonly buildings: readonly BuildingSite[];
  /** Where a landing goes: the main city, or the best site on an unsettled world. */
  readonly landing: Vec3;
}

/** Most towns a colony grows. */
export const MAX_TOWNS = 7;
/** Candidate sites tested on the sphere (a Fibonacci lattice). */
const CANDIDATES = 2400;
const GOLDEN = Math.PI * (3 - Math.sqrt(5));
/** Best-ranked candidates checked for land all round the main city. */
const SHORTLIST = 160;
const KNOWN_BUILDINGS = new Set(BUILDINGS.map((b) => b.id));

interface Candidate { readonly d: Vec3; readonly h: number }

/** Number of towns for a colony: grows with its size and buildings. */
export function townCount(c: SettlementInput): number {
  if (c.owner !== 'own') return 0;
  return Math.min(MAX_TOWNS, Math.max(1, c.size) + Math.floor(c.buildings.length / 2) + (c.capital ? 1 : 0));
}

/** Population (millions) of the main city. */
export function cityPopulation(c: SettlementInput): number {
  const n = c.owner === 'own' ? c.buildings.length : 0;
  return c.capital ? 3 + c.size * 0.9 + n * 0.35 : 0.8 + c.size * 0.45 + n * 0.3;
}

/** The buildings that get a model: known ids only, in the colony's order. */
export function modelledBuildings(c: SettlementInput | null): string[] {
  return c?.owner === 'own' ? c.buildings.filter((id) => KNOWN_BUILDINGS.has(id)) : [];
}

export function surfaceLayout(planetId: string, look: SurfaceLook, colony: SettlementInput | null): SurfaceLayout {
  const rng = new Rng(hashSeed(planetId, 'surface-layout'));
  const capsOK = (y: number) => look.ice < 0.3 || Math.abs(y) < look.ice - 0.12;
  const land = (d: Vec3) => isLand(look, rawHeight(look, d[0], d[1], d[2]));
  const all: Candidate[] = [];
  for (let i = 0; i < CANDIDATES; i++) {
    const y = 1 - ((i + 0.5) / CANDIDATES) * 2, r = Math.sqrt(1 - y * y), a = i * GOLDEN;
    const d: Vec3 = [Math.cos(a) * r, y, Math.sin(a) * r];
    all.push({ d, h: rawHeight(look, d[0], d[1], d[2]) });
  }
  // Settleable: dry land, below the high mountains, clear of the ice caps.
  const cand = all.filter((c) => isLand(look, c.h) && capsOK(c.d[1]) && (look.dry || c.h < look.sea + 0.55));
  const ringLand = (d: Vec3, rad: number, k: number) => {
    const { t1, t2 } = frameAt(d);
    let n = 0;
    for (let i = 0; i < k; i++) {
      const a = (i / k) * Math.PI * 2, x = Math.cos(a) * rad, y = Math.sin(a) * rad;
      if (land(normalize([d[0] + t1[0] * x + t2[0] * y, d[1] + t1[1] * x + t2[1] * y, d[2] + t1[2] * x + t2[2] * y]))) n++;
    }
    return n / k;
  };

  // The main site: temperate lowland with land all around the plateau. A world with no land at
  // all gets its highest point, raised into an island plateau.
  // Rank by height and latitude first; only the best few get the (costly) check for land all round.
  const target = look.dry ? 0 : look.sea + 0.16;
  const ranked = cand.filter((c) => Math.abs(c.d[1]) <= 0.62)
    .map((c) => ({ c, score: -Math.abs(c.h - target) * 3 - Math.abs(Math.abs(c.d[1]) - 0.3) * 1.5 + rng.next() * 0.15 }))
    .sort((a, b) => b.score - a.score)
    .slice(0, SHORTLIST);
  let best: Candidate | null = null, bestScore = -Infinity;
  for (const { c, score: base } of ranked) {
    const score = base + ringLand(c.d, 0.06, 10) * 3 + ringLand(c.d, 0.1, 12) * 2;
    if (score > bestScore) { bestScore = score; best = c; }
  }
  if (!best) best = (cand.length ? cand : all).reduce((a, b) => (b.h > a.h ? b : a));
  if (!colony) return { settlements: [], buildings: [], landing: best.d };

  const level = (h: number) => (look.dry ? h : Math.min(Math.max(h, look.sea + 0.08), look.sea + 0.3));
  const seedOf = () => Math.floor(rng.next() * 2 ** 31);
  const pop = cityPopulation(colony);
  const capital = colony.owner === 'own' && colony.capital;
  const cityR = capital ? 0.034 : Math.min(0.026, 0.0072 + 0.0048 * Math.sqrt(pop));
  const ring = cityR + 0.016;
  const ground = modelledBuildings(colony).filter((id) => !BUILDINGS.find((b) => b.id === id)?.shipyard);
  const flatIn = ground.length ? ring + 0.022 : cityR * 1.35;
  const main: Settlement = {
    name: colony.name, kind: capital ? 'capital' : 'city', dir: best.d, pop, radius: cityR, cell: capital ? 0.0032 : 0.0028,
    flatIn, flatOut: flatIn + (ground.length ? 0.03 : cityR), level: level(best.h), seed: seedOf(),
  };
  const settlements: Settlement[] = [main];

  // Special buildings: evenly round the city just outside its edge, each facing it; shipyards in orbit.
  const buildings: BuildingSite[] = [];
  const turn = rng.next() * Math.PI * 2;
  ground.forEach((id, k) => {
    const a = turn + (k / ground.length) * Math.PI * 2;
    const dist = ring + (k % 2 ? 0.004 : 0);
    buildings.push({ id, dir: offsetDir(best!.d, Math.cos(a) * dist, Math.sin(a) * dist), heading: -a + Math.PI / 2, orbital: false });
  });
  modelledBuildings(colony).filter((id) => !ground.includes(id)).forEach((id, k) => {
    buildings.push({ id, dir: offsetDir(best!.d, k * 0.03, cityR + 0.011), heading: 0.4, orbital: true });
  });

  // Towns: spread over the land, well apart, each with land all round it; smaller the further down the list.
  const names = shuffled(TOWN_NAMES, rng.fork('names'));
  const order = shuffled(cand, rng.fork('towns'));
  const want = townCount(colony);
  const townPop = pop * 0.32;
  for (const c of order) {
    if (settlements.length > want) break;
    const near = settlements.reduce((m, o) => Math.min(m, distance(o.dir, c.d) - (o === main ? main.flatOut : 0)), Infinity);
    if (near < 0.24) continue;
    if (ringLand(c.d, 0.025, 6) < 1) continue;
    const i = settlements.length - 1;
    const p = townPop * Math.pow(0.68, i) * (0.85 + rng.next() * 0.3);
    const r = Math.min(0.02, 0.0072 + 0.0048 * Math.sqrt(p));
    settlements.push({ name: names[i % names.length], kind: 'town', dir: c.d, pop: p, radius: r, cell: 0.0028, flatIn: r * 1.35, flatOut: r * 2.3, level: level(c.h), seed: seedOf() });
  }
  return { settlements, buildings, landing: best.d };
}

/** The planet a foreign empire's city stands on: the system's first world that is not a gas giant. */
export function foreignSeat<P extends { readonly index: number; readonly biome: string }>(planets: readonly P[]): P | null {
  return [...planets].sort((a, b) => a.index - b.index).find((p) => p.biome !== 'gas') ?? null;
}

function shuffled<T>(items: readonly T[], rng: Rng): T[] {
  return items.map((item) => ({ item, k: rng.next() })).sort((a, b) => a.k - b.k).map((x) => x.item);
}
