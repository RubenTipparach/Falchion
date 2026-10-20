import { Rng, hashSeed } from '../rng/Rng';
import { smoothstep, snoise } from '../surface/Noise';

/**
 * The ground of a megastructure you can land on (change mega-surfaces): its shape, its land and
 * its cities, from the structure's seed. Pure and deterministic; the GLSL copy of the height
 * (src/render/megastructures/surface/megaGround.glsl.ts) uses the same simplex noise
 * (src/core/surface/Noise.ts), so the camera and the ground the GPU draws agree.
 *
 * Coordinates are km on the land, from the landing site: x along the spin (round a ring, a
 * habitat), z across it. The ground is bent to the structure's shape only when it is drawn.
 */
export type MegaSurfaceType = 'ringworld' | 'dyson-sphere' | 'alderson-disk' | 'dyson-swarm' | 'topopolis';

export const MEGA_SURFACE_TYPES: readonly MegaSurfaceType[] = ['ringworld', 'dyson-sphere', 'alderson-disk', 'dyson-swarm', 'topopolis'];

/**
 * Lived in inside a spinning tube: land on three strips round it, windows between (a swarm's
 * habitat, closed at both ends; a topopolis, a tube that never ends).
 */
export const isTube = (def: Pick<MegaGroundDef, 'type'>): boolean => def.type === 'dyson-swarm' || def.type === 'topopolis';

export const hasMegaSurface = (type: string): type is MegaSurfaceType => (MEGA_SURFACE_TYPES as readonly string[]).includes(type);

export interface MegaGroundDef {
  readonly type: MegaSurfaceType;
  /** The shape's radius of curvature, km (0: flat). */
  readonly radiusKm: number;
  /** A ring's width or a habitat's length, km. */
  readonly widthKm: number;
  /** Continent size, km. */
  readonly featureKm: number;
  /** The highest mountains, km. */
  readonly reliefKm: number;
  /** Sea level in noise units: higher is more sea. */
  readonly sea: number;
  /** How many of BROAD_OCTAVES the land has: the larger the structure, the larger its shapes. */
  readonly broad: number;
  /** Where on the noise the land is (keeps (0, 0) on dry land). */
  readonly offset: readonly [number, number, number];
  /** Spacing of possible city sites, km, and the cities' radius range. */
  readonly cityCellKm: number;
  readonly cityKm: readonly [number, number];
  /** How far the camera may wander from the landing site, km. */
  readonly roamKm: number;
}

interface ShapeTable {
  readonly radiusKm: number;
  readonly widthKm: number;
  readonly featureKm: number;
  readonly reliefKm: number;
  readonly sea: number;
  readonly broad: number;
  readonly cityCellKm: number;
  readonly cityKm: readonly [number, number];
  readonly roamKm: number;
}

/**
 * The shapes. Bigger than life where life would be invisible: a ring a tenth the size of Niven's
 * so the Arch is a band across the sky, not a hair.
 */
const SHAPES: Readonly<Record<MegaSurfaceType, ShapeTable>> = {
  ringworld: { radiusKm: 1.5e7, widthKm: 1.2e6, featureKm: 1800, reliefKm: 3.2, sea: 0.02, broad: 5, cityCellKm: 260, cityKm: [5, 22], roamKm: 15000 },
  'dyson-sphere': { radiusKm: 3e7, widthKm: 0, featureKm: 2400, reliefKm: 4, sea: -0.02, broad: 7, cityCellKm: 300, cityKm: [6, 26], roamKm: 15000 },
  'alderson-disk': { radiusKm: 0, widthKm: 0, featureKm: 2000, reliefKm: 6.5, sea: 0.05, broad: 8, cityCellKm: 280, cityKm: [5, 20], roamKm: 15000 },
  // One habitat of the swarm: a spinning cylinder, land strips between windows. Its land is the
  // painted O'Neill stripe (the render side): the height here only rolls it gently, with no seas.
  'dyson-swarm': { radiusKm: 4, widthKm: 32, featureKm: 7, reliefKm: 0.05, sea: -0.6, broad: 0, cityCellKm: 5, cityKm: [0.5, 1.1], roamKm: 16 },
  // A topopolis: the same tube, forty km round and with no end (it loops round its star again and
  // again); towns and cities along its strips.
  topopolis: { radiusKm: 40, widthKm: 0, featureKm: 70, reliefKm: 0.3, sea: -0.6, broad: 0, cityCellKm: 34, cityKm: [1.5, 6], roamKm: 1500 },
};

/** The ground of a megastructure: its shape and where on the noise its land is. */
export function megaGround(type: MegaSurfaceType, seed: number): MegaGroundDef {
  const s = SHAPES[type];
  const rng = new Rng(hashSeed(seed, 'mega-ground', type));
  // Find dry, gentle land for the landing site: try spots on the noise until one is.
  const base = { type, ...s, offset: [0, 0, 0] as const };
  let offset: [number, number, number] = [0, 0, rng.range(0, 200)];
  for (let i = 0; i < 64; i++) {
    const o: [number, number, number] = [rng.range(-500, 500), rng.range(-500, 500), offset[2]];
    const e = groundNoise({ ...base, offset: o }, 0, 0, 6);
    offset = o;
    if (e > s.sea + 0.06 && e < s.sea + 0.3) break;
  }
  return { ...base, offset };
}

/** Octaves of detail at a distance (km) from the camera: finer close up (fractional: the last fades in). */
export function octavesAt(def: MegaGroundDef, distKm: number): number {
  return Math.min(Math.max(Math.log2((def.featureKm * 6) / Math.max(distKm, 1e-4)), 1), 13);
}

/** A habitat is round: its land repeats once round (the seam falls in a window). Elsewhere x as is. */
export function wrapX(def: MegaGroundDef, x: number): number {
  if (!isTube(def)) return x;
  const c = 2 * Math.PI * def.radiusKm;
  return x - c * Math.floor((x + c / 2) / c);
}

/**
 * The land's broad scales: octaves 4, 16, ... 65,536 feature sizes across, under the continents.
 * Without them a view from far off (thousands of km up, or across the system) sees one flat sea or
 * one flat continent, and the land pops into shape as the camera comes down; with them every height
 * has its own shapes, ocean basins and super-continents. A structure has as many as fit it
 * (MegaGroundDef.broad): the Alderson disk, hundreds of millions of km across, all eight; habitats
 * (a tube a few km round) none, as they would not wrap. The GLSL landNoise is the same, line for line.
 */
/**
 * How much each finer octave of the land keeps of the one before: over a half, so hills a few km
 * across still have slopes to see (at a half the land smoothed to a table top close up). The GLSL
 * landNoise, the same.
 */
export const DETAIL_GAIN = 0.56;

export const BROAD_OCTAVES: ReadonlyArray<readonly [scale: number, amp: number]> = [
  [4, 0.3], [16, 0.35], [64, 0.35], [256, 0.3], [1024, 0.3], [4096, 0.35], [16384, 0.35], [65536, 0.3],
];

/**
 * The land's noise in about [-1, 1] at (x, z) km: the broad scales, then `oct` octaves. An octave
 * k octaves above the feature size (a broad scale 4^n across is octave -2n) has weight oct + k, in
 * [0, 1], so an oct below 0 leaves out the broad scales a far-off pixel cannot show.
 */
export function groundNoise(def: MegaGroundDef, x: number, z: number, oct: number): number {
  x = wrapX(def, x);
  let v = 0;
  BROAD_OCTAVES.forEach(([scale, amp], i) => {
    if (i < def.broad) {
      const f = def.featureKm * scale;
      const w = Math.min(Math.max(oct + Math.log2(scale), 0), 1);
      if (w > 0) v += w * amp * snoise(x / f + def.offset[0] * 0.37 + 11 + i * 7, z / f + def.offset[1] * 0.37 + 23 - i * 5, def.offset[2] + 50 + i * 4);
    }
  });
  let px = x / def.featureKm + def.offset[0], py = z / def.featureKm + def.offset[1], pz = def.offset[2];
  let a = 0.5;
  for (let i = 0; i < 14; i++) {
    const w = Math.min(Math.max(oct - i, 0), 1);
    if (w <= 0) break;
    v += a * w * snoise(px, py, pz);
    px = px * 2.03 + 1.7; py = py * 2.03 + 9.2; pz = pz * 2.03 + 3.1;
    a *= DETAIL_GAIN;
  }
  return v;
}

/** Mountain chains: ridged noise, sharp crests (0..1). */
export function ridges(def: MegaGroundDef, x: number, z: number): number {
  x = wrapX(def, x);
  let px = (x / def.featureKm) * 2.6 + def.offset[0] + 31, py = (z / def.featureKm) * 2.6 + def.offset[1] + 17, pz = def.offset[2] + 5;
  let v = 0, a = 0.5;
  for (let i = 0; i < 4; i++) {
    const r = 1 - Math.abs(snoise(px, py, pz));
    v += a * r * r;
    px *= 2.1; py *= 2.1; pz *= 2.1;
    a *= 0.5;
  }
  return v;
}

/** A city: centre (km), radius (km) and the level its ground is flattened to (km). */
export interface MegaCity {
  readonly x: number;
  readonly z: number;
  readonly r: number;
  readonly level: number;
  /** 0..1: how tall its towers grow. */
  readonly size: number;
}

/** Height of the ground (km above the floor; below 0 is sea bed) at (x, z), cities flattened in. */
export function groundHeight(def: MegaGroundDef, x: number, z: number, oct: number, cities: readonly MegaCity[] = []): number {
  let h = rawHeight(def, x, z, oct);
  x = wrapX(def, x);
  for (const c of cities) {
    const f = 1 - smoothstep(c.r, c.r * 1.5, Math.hypot(x - c.x, z - c.z));
    if (f > 0) h += (c.level - h) * f;
  }
  return h;
}

/** Height before cities (as the GLSL rawHeight). */
export function rawHeight(def: MegaGroundDef, x: number, z: number, oct: number): number {
  // Eased into about +-0.8: the broad octaves make whole continents and ocean basins high or low,
  // not mountains of the plains or trenches of the shelves (the GLSL rawHeight, the same).
  const land = 0.8 * Math.tanh((groundNoise(def, x, z, oct) - def.sea) / 0.8);
  if (land <= 0) return land * def.reliefKm * 0.8;
  // Plains and hills, with mountain chains only where the land is high.
  const m = ridges(def, x, z);
  return (land * 0.6 + smoothstep(0.14, 0.5, land) * m * m * 1.9 + smoothstep(0, 0.12, land) * hills(def, x, z)) * def.reliefKm;
}

/**
 * Ridged hills and uplands a few tens of km across, in rugged country (where a broad noise says so;
 * plains elsewhere), so the land close up has slopes to light rather than a table top's.
 */
export function hills(def: MegaGroundDef, x: number, z: number): number {
  x = wrapX(def, x);
  const rugged = smoothstep(-0.65, 0.25, snoise(x / (def.featureKm * 2.5) + def.offset[0] + 19, z / (def.featureKm * 2.5) + def.offset[1] + 41, def.offset[2] + 23));
  if (rugged <= 0) return 0;
  let px = (x / def.featureKm) * 30 + def.offset[0] + 7, py = (z / def.featureKm) * 30 + def.offset[1] + 3, pz = def.offset[2] + 11;
  let v = 0, a = 0.55;
  for (let i = 0; i < 3; i++) {
    const r = 1 - Math.abs(snoise(px, py, pz));
    v += a * r * r;
    px *= 2.2; py *= 2.2; pz *= 2.2;
    a *= 0.6;
  }
  return v * rugged;
}

/** The cities whose centres are within `reach` km of (x, z); the capital stands on the landing site. */
export function citiesNear(def: MegaGroundDef, x: number, z: number, reach: number): MegaCity[] {
  const out: MegaCity[] = [];
  const cell = def.cityCellKm;
  const i0 = Math.floor((x - reach) / cell), i1 = Math.floor((x + reach) / cell);
  const j0 = Math.floor((z - reach) / cell), j1 = Math.floor((z + reach) / cell);
  for (let i = i0; i <= i1; i++) {
    for (let j = j0; j <= j1; j++) {
      const c = cityIn(def, i, j);
      if (!c || Math.hypot(c.x - x, c.z - z) >= reach) continue;
      // A habitat's cities stand on its land strips, clear of the windows and the end caps.
      if (isTube(def) && (!onHabitatLand(def, c.x - c.r) || !onHabitatLand(def, c.x + c.r) || (def.widthKm > 0 && Math.abs(c.z) + c.r > def.widthKm / 2 - 1))) continue;
      out.push(c);
    }
  }
  return out;
}

/** The city in grid cell (i, j), if it has one. */
export function cityIn(def: MegaGroundDef, i: number, j: number): MegaCity | null {
  const cell = def.cityCellKm;
  if (i === 0 && j === 0) {
    // The capital, on the landing site.
    const r = def.cityKm[1];
    return { x: 0, z: 0, r, level: Math.max(rawHeight(def, 0, 0, 7), def.reliefKm * 0.02), size: 1 };
  }
  const rng = new Rng(hashSeed(def.offset[2], 'mega-city', i, j));
  if (!rng.chance(0.42)) return null;
  const x = (i + rng.range(0.25, 0.75)) * cell, z = (j + rng.range(0.25, 0.75)) * cell;
  const land = groundNoise(def, x, z, 6) - def.sea;
  // On land, and not up in the mountains.
  if (!isTube(def) && (land < 0.03 || land > 0.32)) return null;
  const size = rng.next();
  const r = def.cityKm[0] + (def.cityKm[1] - def.cityKm[0]) * size * size;
  return { x, z, r, level: Math.max(rawHeight(def, x, z, 7), def.reliefKm * 0.02), size };
}

/** A habitat's land strips: three of the six strips round the cylinder (the rest are windows). */
export function onHabitatLand(def: MegaGroundDef, x: number): boolean {
  const c = 2 * Math.PI * def.radiusKm;
  // The landing site (x = 0) is in the middle of a strip.
  const t = ((((x / c) + 1 / 12) % 1) + 1) % 1;
  return Math.floor(t * 6) % 2 === 0;
}
