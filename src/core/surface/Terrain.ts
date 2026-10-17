import type { PlanetLook, SurfaceKind } from '../../content/planetLooks';
import { Rng } from '../rng/Rng';
import { fbmN, ridged4, smoothstep } from './Noise';

/** A direction or point in a planet's own frame (unit sphere = the planet). */
export type Vec3 = readonly [number, number, number];

/**
 * One planet's look with its per-planet variation rolled: the numbers both the planet-view shader
 * and the surface view use, so a planet looks the same from the system and from its surface.
 */
export interface SurfaceLook {
  readonly kind: SurfaceKind;
  readonly palette: readonly [string, string, string, string];
  /** Noise offset (the planet's own continents). */
  readonly seed: Vec3;
  readonly detail: number;
  /** Height below which the surface is liquid (only when not `dry`). */
  readonly sea: number;
  /** Latitude where polar ice begins (> 1: none). */
  readonly ice: number;
  readonly clouds: number;
  readonly cloudColor: string;
  readonly atmosphere: string;
  readonly atmosphereStrength: number;
  readonly glow: string;
  /** Night lights of cities. */
  readonly cityGlow: string;
  /** No liquid at all (deserts, lava worlds, airless rock). */
  readonly dry: boolean;
  readonly craters: boolean;
  /** Snow on high ground (temperate worlds with ice caps). */
  readonly snow: boolean;
}

/**
 * The look of one planet: `seed` is `hashSeed(planet.id, 'surface')`. The order of rolls is fixed
 * (palette, sea, ice, clouds, detail, offset): changing it would repaint every planet.
 */
export function surfaceLookOf(look: PlanetLook, seed: number): SurfaceLook {
  const rng = new Rng(seed);
  const palette = look.variants ? rng.pick(look.variants) : look.palette;
  const sea = look.sea + rng.range(-0.08, 0.08);
  const ice = look.ice + rng.range(-0.06, 0.06);
  const clouds = look.clouds * rng.range(0.7, 1.2);
  const detail = look.detail * rng.range(0.85, 1.25);
  const off: Vec3 = [rng.range(-50, 50), rng.range(-50, 50), rng.range(-50, 50)];
  const glow = look.glow ?? '#ffcf7a';
  return {
    kind: look.kind, palette, seed: off, detail, sea, ice, clouds,
    cloudColor: look.cloudColor, atmosphere: look.atmosphere, atmosphereStrength: look.atmosphereStrength,
    glow, cityGlow: look.kind === 'lava' ? '#ffd27a' : glow,
    dry: look.sea < -1, craters: !!look.craters, snow: look.sea >= -1 && look.ice > 0.3 && look.ice < 1,
  };
}

/** Octaves of the globe's baked heightmap; the detail patch near the camera adds more on the GPU. */
export const BASE_OCTAVES = 7;

/** Terrain height (about -1..1) at a unit direction: continents, mountain ridges and craters. */
export function rawHeight(look: SurfaceLook, x: number, y: number, z: number, octaves = BASE_OCTAVES): number {
  const px = x * look.detail + look.seed[0], py = y * look.detail + look.seed[1], pz = z * look.detail + look.seed[2];
  let h = fbmN(px, py, pz, octaves);
  if (look.craters) h += (ridged4(px * 1.6, py * 1.6, pz * 1.6) - 0.6) * 0.5;
  const land = smoothstep(look.sea + 0.03, look.sea + 0.5, h);
  if (land > 0) h += land * (ridged4(px * 2 + 5.1, py * 2 + 5.1, pz * 2 + 5.1) - 0.55) * 0.5;
  return h;
}

/** Dry land at this height (with a margin above the shore). */
export function isLand(look: SurfaceLook, h: number): boolean {
  return look.dry || h > look.sea + 0.05;
}

// ── Small vector helpers (plain tuples: core has no three.js) ──

export const normalize = (v: Vec3): Vec3 => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};
export const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const distance = (a: Vec3, b: Vec3): number => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/** Tangent frame at a point on the sphere: t1 east-ish, t2 north-ish. */
export function frameAt(c: Vec3): { t1: Vec3; t2: Vec3 } {
  const up: Vec3 = Math.abs(c[1]) > 0.98 ? [1, 0, 0] : [0, 1, 0];
  const t1 = normalize(cross(up, c));
  return { t1, t2: cross(c, t1) };
}

/** The direction `x` along t1 and `y` along t2 from `c` (small offsets, in planet radii). */
export function offsetDir(c: Vec3, x: number, y: number): Vec3 {
  const { t1, t2 } = frameAt(c);
  return normalize([c[0] + t1[0] * x + t2[0] * y, c[1] + t1[1] * x + t2[1] * y, c[2] + t1[2] * x + t2[2] * y]);
}
