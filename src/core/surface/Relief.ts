import { snoise, smoothstep } from './Noise';

/**
 * Landforms laid over a planet's noise terrain (change planet-audit): impact craters, canyon
 * networks, volcanoes and a tidally locked world's sunward basin. This CPU copy bakes the
 * close-up's globe; RELIEF_GLSL (src/render/planets/relief.glsl.ts) is the same arithmetic for the
 * system view and the close-up's detail patch, and hashes on exact integers like the noise, so the
 * two agree to float precision. `p` is the planet's noise position (direction × detail + seed).
 */

const m289 = (x: number): number => x - Math.floor((x + 0.5) / 289) * 289;
const perm = (x: number): number => m289(m289(x * 34 + 1) * x);
/** An exact hash of a lattice cell (0..288), salted per layer. */
const cellHash = (x: number, y: number, z: number, salt: number): number => perm(m289(x + salt) + perm(m289(y) + perm(m289(z))));

/** One cell's feature: its centre (in layer space), radius (fraction of a cell) and hash, or null when the cell has none. */
function feature(cx: number, cy: number, cz: number, salt: number, density: number): { x: number; y: number; z: number; r: number; a: number } | null {
  const a = cellHash(cx, cy, cz, salt);
  if (a / 289 > density) return null;
  const b = perm(a + 1), c = perm(b + 1), d = perm(c + 1), e = perm(d + 1);
  return { x: cx + 0.2 + (0.6 * b) / 289, y: cy + 0.2 + (0.6 * c) / 289, z: cz + 0.2 + (0.6 * d) / 289, r: 0.16 + (0.28 * e) / 289, a };
}

/** Craters of one size: bowls below the ground with raised rims, depth by size. */
function craterLayer(x: number, y: number, z: number, salt: number, density: number): number {
  const fx = Math.floor(x), fy = Math.floor(y), fz = Math.floor(z);
  let sum = 0;
  for (let k = -1; k <= 1; k++) for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    const f = feature(fx + i, fy + j, fz + k, salt, density);
    if (!f) continue;
    const d = Math.hypot(x - f.x, y - f.y, z - f.z) / f.r;
    if (d > 1.7) continue;
    const bowl = d < 1 ? d * d - 1 : 0;
    const rim = Math.exp(-(((d - 1) / 0.24) ** 2)) * 0.32;
    sum += f.r * (bowl + rim);
  }
  return sum;
}

/** Crater layers, largest first: [scale, salt, density, weight, octave it appears at]. */
export const CRATER_LAYERS: ReadonlyArray<readonly [number, number, number, number, number]> = [
  [1.3, 11, 0.5, 0.75, 0], [3.1, 37, 0.65, 0.45, 0], [7.3, 71, 0.8, 0.26, 0], [17, 113, 0.85, 0.12, 8], [41, 151, 0.9, 0.05, 10],
];

/** Impact craters at every size the octaves reach (the close-up adds smaller ones as it comes down). */
export function craters(x: number, y: number, z: number, octaves: number): number {
  let h = 0;
  for (const [s, salt, density, weight, from] of CRATER_LAYERS) {
    const w = Math.min(Math.max(octaves - from, 0), 1);
    if (w > 0) h += w * weight * craterLayer(x * s, y * s, z * s, salt, density);
  }
  return h;
}

/** How deep in a canyon a point is (0..1): warped rift valleys with tributaries, in networks.
 * Past a strength of 1 the networks widen and spread until they cover the world (a canyon world). */
export function canyonCut(x: number, y: number, z: number, strength: number): number {
  const wide = Math.min(Math.max(strength - 1, 0), 1);
  const wx = snoise(x * 0.7 + 11, y * 0.7 + 11, z * 0.7 + 11), wy = snoise(x * 0.7 + 23, y * 0.7 + 23, z * 0.7 + 23), wz = snoise(x * 0.7 + 37, y * 0.7 + 37, z * 0.7 + 37);
  const valley = 1 - smoothstep(0, 0.2 + 0.1 * wide, Math.abs(snoise(x * 0.9 + wx * 0.6, y * 0.9 + wy * 0.6, z * 0.9 + wz * 0.6)));
  const tribs = 1 - smoothstep(0, 0.11, Math.abs(snoise(x * 2.3 + wx * 0.8 + 5, y * 2.3 + wy * 0.8 + 5, z * 2.3 + wz * 0.8 + 5)));
  const mask = smoothstep(-0.25 - wide, 0.3 - wide, snoise(x * 0.45 + 71, y * 0.45 + 71, z * 0.45 + 71));
  return Math.max(valley, tribs * 0.55) * mask;
}

/** The depth a canyon cut takes off the ground: sloped walls onto a flat floor. */
export const canyonDepth = (cut: number, strength: number): number => strength * (0.55 * cut + 0.35 * smoothstep(0.45, 0.9, cut));

export const VOLCANO_SCALE = 0.9;
/**
 * Volcanoes: great shield cones, each with a caldera whose rim glows and lava rivers running down its
 * flanks. Returns [height, lava 0..1]. Each cone's centre is moved onto the planet's surface (the
 * sphere of radius `rad` round `s` in noise space), so every volcano is whole rather than a slice
 * through a ball; only centres within half a cell of the surface count, which keeps every cone that
 * can reach a point inside the 27 cells round it.
 */
export function volcanoes(x: number, y: number, z: number, sx: number, sy: number, sz: number, rad: number): [number, number] {
  const S = VOLCANO_SCALE;
  const qx = x * S, qy = y * S, qz = z * S;
  const fx = Math.floor(qx), fy = Math.floor(qy), fz = Math.floor(qz);
  const cx = sx * S, cy = sy * S, cz = sz * S, R = rad * S;
  let h = 0, lava = 0;
  for (let k = -1; k <= 1; k++) for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    const f = feature(fx + i, fy + j, fz + k, 197, 0.6);
    if (!f) continue;
    const ox = f.x - cx, oy = f.y - cy, oz = f.z - cz;
    const ol = Math.hypot(ox, oy, oz);
    if (Math.abs(ol - R) > 0.5) continue;
    const r = f.r * 1.8;
    const dx = qx - (cx + (ox * R) / ol), dy = qy - (cy + (oy * R) / ol), dz = qz - (cz + (oz * R) / ol);
    const len = Math.hypot(dx, dy, dz);
    const d = len / r;
    if (d >= 1) continue;
    const cone = (1 - d) ** 1.4;
    const caldera = 1 - smoothstep(0.1, 0.2, d);
    h += r * (1.4 * cone - 0.45 * caldera);
    // Lava: a lake and a glowing ring in the caldera, and rivers down the flanks (thin lines where a
    // noise of the direction from the summit crosses zero, so they run straight downhill).
    const l = 1 / (len || 1);
    const ring = Math.max(Math.exp(-(((d - 0.17) / 0.06) ** 2)), 0.8 * (1 - smoothstep(0.08, 0.12, d)));
    const river = (1 - smoothstep(0.0, 0.07, Math.abs(snoise(dx * l * 4 + f.a, dy * l * 4, dz * l * 4)))) * smoothstep(0.12, 0.2, d) * (1 - smoothstep(0.35, 0.9, d));
    lava = Math.max(lava, Math.max(ring, river * 0.85));
  }
  return [h, lava];
}

/** The locked world's basin: how far into the sunward eye a point is (0..1). Its sunward pole is +x. */
export const LOCKED_AXIS: readonly [number, number, number] = [1, 0, 0];
export const lockedEye = (dirX: number, h: number, locked: number): number => smoothstep(locked - 0.1, locked + 0.12, dirX + h * 0.2);
