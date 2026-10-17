import { hash01, hashSeed } from '../../core/rng/Rng';

/**
 * The nebula colour field, written twice: as GLSL for the map's NebulaLayer and as
 * TypeScript for anything that needs the same colours on the CPU (the system
 * skybox). The two must stay line-for-line in step. The lattice hash is integer
 * arithmetic (`hash01` from core, mirrored in GLSL, keeping the top 24 bits), so
 * both sides agree bit for bit on every lattice value; only float rounding differs.
 *
 * It is one layer: fine (~220 ly) domain-warped clouds that drift slowly, over a faint
 * two-tone haze (~1,800 ly) so the space between clouds is never empty. The same clouds
 * show at every zoom; the map fades them out toward galaxy scale.
 *
 * `sample()` returns the colour the map draws at a galaxy point: `rgb` with a
 * coverage `alpha`; the map adds `rgb * alpha * 1.3` over the background.
 */

/** Cloud size (ly per noise cell) and the haze beneath them. */
export const CLOUD_SCALE = 220;
export const HAZE_SCALE = 1_800;
/** Added to lattice coordinates so the GPU only ever casts positive ints to unsigned. */
const LATTICE_OFFSET = 1 << 30;
/** Shader time (seconds) to drift units: the clouds move very slowly. */
export const DRIFT_RATE = 0.0012;

/** Seed uniform for the field: 24 bits, so it is exact as a GLSL float. */
export function nebulaSeed(galaxySeed: number): number {
  return hashSeed(galaxySeed, 'clouds') & 0xffffff;
}

/** GLSL for the field. The includer declares `uniform float uSeed;` (from `nebulaSeed`). */
export const NEBULA_GLSL = /* glsl */ `
  const int LATTICE_OFFSET = ${LATTICE_OFFSET};
  float nebHash(vec2 p) {
    uvec2 q = uvec2(ivec2(p) + LATTICE_OFFSET); // positive before the unsigned cast (negative ints clamp on some GPUs)
    uint h = (q.x * 0x27d4eb2du) ^ (q.y * 0x165667b1u) ^ uint(uSeed);
    h ^= h >> 16u; h *= 0x7feb352du; h ^= h >> 15u; h *= 0x846ca68bu; h ^= h >> 16u;
    return float(h >> 8u) * (1.0 / 16777216.0); // top 24 bits: exact as a float on every GPU
  }
  float noise(vec2 p) { vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(nebHash(i), nebHash(i + vec2(1, 0)), u.x), mix(nebHash(i + vec2(0, 1)), nebHash(i + vec2(1, 1)), u.x), u.y); }
  float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 6; i++) { v += a * noise(p); p = p * 2.03 + 17.0; a *= 0.5; } return v; }
  // Map colour at an absolute galaxy point: rgb and coverage.
  vec4 nebulaSample(vec2 hit, float t) {
    vec2 p = hit / ${CLOUD_SCALE.toFixed(1)};
    vec2 q = vec2(fbm(p + vec2(0.0, t)), fbm(p + vec2(5.2, 1.3) - t));
    vec2 r = vec2(fbm(p + 3.0 * q + vec2(1.7, 9.2) + 0.5 * t), fbm(p + 3.0 * q + vec2(8.3, 2.8) - 0.4 * t));
    float n = fbm(p + 3.5 * r);
    vec3 teal = vec3(0.06, 0.45, 0.55), blue = vec3(0.12, 0.22, 0.75), violet = vec3(0.45, 0.16, 0.70), rose = vec3(0.85, 0.20, 0.42), amber = vec3(0.95, 0.55, 0.20);
    vec3 col = mix(blue, teal, smoothstep(0.2, 0.8, q.x));
    col = mix(col, violet, smoothstep(0.35, 0.85, r.y));
    col = mix(col, rose, smoothstep(0.55, 0.95, n * r.x * 1.8));
    col = mix(col, amber, smoothstep(0.78, 1.0, n * q.y * 2.0) * 0.6);
    float dust = smoothstep(0.55, 0.75, fbm(p * 2.7 + 40.0)) * 0.55;
    float cover = smoothstep(0.30, 0.85, n) * (1.0 - dust);
    // Faint two-tone haze so the space between clouds is never empty.
    float hazeN = fbm(hit / ${HAZE_SCALE.toFixed(1)} + 3.0);
    vec3 haze = mix(vec3(0.10, 0.16, 0.42), vec3(0.32, 0.12, 0.40), hazeN);
    return vec4(mix(haze, col, clamp(cover * 1.6, 0.0, 1.0)), cover * 0.85 + 0.16 * smoothstep(0.25, 0.75, hazeN));
  }`;

/** One field sample: map colour and coverage. */
export interface NebulaColor {
  r: number;
  g: number;
  b: number;
  a: number;
}

const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
function smoothstep(e0: number, e1: number, x: number): number {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
}

const TEAL = [0.06, 0.45, 0.55], BLUE = [0.12, 0.22, 0.75], VIOLET = [0.45, 0.16, 0.70], ROSE = [0.85, 0.20, 0.42], AMBER = [0.95, 0.55, 0.20];
const HAZE_A = [0.10, 0.16, 0.42], HAZE_B = [0.32, 0.12, 0.40];

/** CPU twin of NEBULA_GLSL. Pure and deterministic; allocation-free per sample. */
export class NebulaField {
  private readonly seed: number;

  constructor(galaxySeed: number) {
    this.seed = nebulaSeed(galaxySeed);
  }

  /** Map colour at absolute galaxy (x, z); `time` in shader seconds. */
  sample(x: number, z: number, time: number, out: NebulaColor): NebulaColor {
    const t = time * DRIFT_RATE;
    const px = x / CLOUD_SCALE, py = z / CLOUD_SCALE;
    const qx = this.fbm(px, py + t), qy = this.fbm(px + 5.2 - t, py + 1.3 - t);
    const rx = this.fbm(px + 3 * qx + 1.7 + 0.5 * t, py + 3 * qy + 9.2 + 0.5 * t);
    const ry = this.fbm(px + 3 * qx + 8.3 - 0.4 * t, py + 3 * qy + 2.8 - 0.4 * t);
    const n = this.fbm(px + 3.5 * rx, py + 3.5 * ry);
    const s1 = smoothstep(0.2, 0.8, qx), s2 = smoothstep(0.35, 0.85, ry);
    const s3 = smoothstep(0.55, 0.95, n * rx * 1.8), s4 = smoothstep(0.78, 1.0, n * qy * 2.0) * 0.6;
    const dust = smoothstep(0.55, 0.75, this.fbm(px * 2.7 + 40, py * 2.7 + 40)) * 0.55;
    const cover = smoothstep(0.30, 0.85, n) * (1 - dust);
    const hazeN = this.fbm(x / HAZE_SCALE + 3, z / HAZE_SCALE + 3);
    const k = clamp01(cover * 1.6);
    let r = 0, g = 0, b = 0;
    for (let i = 0; i < 3; i++) {
      let c = mix(BLUE[i], TEAL[i], s1);
      c = mix(c, VIOLET[i], s2);
      c = mix(c, ROSE[i], s3);
      c = mix(c, AMBER[i], s4);
      c = mix(mix(HAZE_A[i], HAZE_B[i], hazeN), c, k);
      if (i === 0) r = c; else if (i === 1) g = c; else b = c;
    }
    out.r = r; out.g = g; out.b = b;
    out.a = cover * 0.85 + 0.16 * smoothstep(0.25, 0.75, hazeN);
    return out;
  }

  fbm(px: number, py: number): number {
    let v = 0, a = 0.5;
    for (let i = 0; i < 6; i++) {
      v += a * this.noise(px, py);
      px = px * 2.03 + 17;
      py = py * 2.03 + 17;
      a *= 0.5;
    }
    return v;
  }

  noise(px: number, py: number): number {
    const ix = Math.floor(px), iy = Math.floor(py);
    const fx = px - ix, fy = py - iy;
    const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
    const a = this.hash(ix, iy), b = this.hash(ix + 1, iy), c = this.hash(ix, iy + 1), d = this.hash(ix + 1, iy + 1);
    return mix(mix(a, b, ux), mix(c, d, ux), uy);
  }

  /** Lattice hash: the bits of `hash01` from core, top 24 kept; nebHash mirrors it exactly. */
  hash(ix: number, iy: number): number {
    return Math.floor(hash01(this.seed, ix + LATTICE_OFFSET, iy + LATTICE_OFFSET) * 16777216) / 16777216;
  }
}
