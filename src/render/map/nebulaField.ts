import { hash01, hashSeed } from '../../core/rng/Rng';

/**
 * The nebula colour field, written twice: as GLSL for the map's NebulaLayer and as
 * TypeScript for anything that needs the same colours on the CPU (the system
 * skybox). The two must stay line-for-line in step. The lattice hash is integer
 * arithmetic (`hash01` from core, mirrored in GLSL, keeping the top 24 bits), so
 * both sides agree bit for bit on every lattice value; only float rounding differs.
 *
 * It is ONE nebula at every zoom. A large (~3,200 ly) domain-warped field sets the
 * clouds' shape, colour and density everywhere. Finer octaves (~120 ly down to ~4 ly),
 * warped along those same clouds, only add density detail inside them; `detail`
 * (0..1, from `nebulaDetail`) grows that detail as the view zooms in. So zooming in
 * reveals detail in the same clouds and a region keeps one hue at every scale.
 *
 * `sample()` returns the colour the map draws at a galaxy point: `rgb` with a
 * coverage `alpha`; the map adds `rgb * alpha * 1.3` over the background.
 */

/** Large cloud structure (ly per noise cell) and the finest detail layer's base cell. */
export const CLOUD_SCALE = 3_200;
export const DETAIL_SCALE = 120;
/** Added to lattice coordinates so the GPU only ever casts positive ints to unsigned. */
const LATTICE_OFFSET = 1 << 30;
/** Shader time (seconds) to drift units: the clouds move very slowly. */
export const DRIFT_RATE = 0.0006;

/** Seed uniform for the field: 24 bits, so it is exact as a GLSL float. */
export function nebulaSeed(galaxySeed: number): number {
  return hashSeed(galaxySeed, 'clouds') & 0xffffff;
}

/** Fine-detail amplitude for a view width (ly): full up close, a faint texture at galaxy scale. */
export function nebulaDetail(visibleWidth: number): number {
  const t = Math.min(1, Math.max(0, Math.log(visibleWidth / 400) / Math.log(12_000 / 400)));
  return 1 - 0.85 * t * t * (3 - 2 * t);
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
  vec4 nebulaSample(vec2 hit, float t, float detail) {
    vec2 p = hit / ${CLOUD_SCALE.toFixed(1)} + 11.0;
    vec2 q = vec2(fbm(p + vec2(0.0, t)), fbm(p + vec2(5.2, 1.3) - t));
    vec2 r = vec2(fbm(p + 3.0 * q + vec2(1.7, 9.2) + 0.5 * t), fbm(p + 3.0 * q + vec2(8.3, 2.8) - 0.4 * t));
    float n = fbm(p + 3.5 * r);
    vec3 teal = vec3(0.06, 0.45, 0.55), blue = vec3(0.12, 0.22, 0.75), violet = vec3(0.45, 0.16, 0.70), rose = vec3(0.85, 0.20, 0.42), amber = vec3(0.95, 0.55, 0.20);
    vec3 col = mix(blue, teal, smoothstep(0.2, 0.8, q.x));
    col = mix(col, violet, smoothstep(0.35, 0.85, r.y));
    col = mix(col, rose, smoothstep(0.55, 0.95, n * r.x * 1.8));
    col = mix(col, amber, smoothstep(0.78, 1.0, n * q.y * 2.0) * 0.6);
    float dust = smoothstep(0.55, 0.75, fbm(p * 2.7 + 40.0)) * 0.55;
    // Finer octaves of the same clouds, swept along the large warp: density detail only.
    float fine = fbm(hit / ${DETAIL_SCALE.toFixed(1)} + 6.0 * r);
    float dens = smoothstep(0.30, 0.85, n) * (1.0 - dust) * mix(1.0, 2.2 * smoothstep(0.25, 0.8, fine), detail);
    // A faint, dimmer halo of the cloud's own colour, so the space between clouds is never empty.
    float halo = smoothstep(0.12, 0.6, n);
    vec3 haze = mix(col, vec3(0.16, 0.16, 0.45), 0.45);
    return vec4(mix(haze, col, clamp(dens * 1.6, 0.0, 1.0)), min(dens, 1.0) * 0.62 + 0.13 * halo);
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
const HAZE = [0.16, 0.16, 0.45];

/** CPU twin of NEBULA_GLSL. Pure and deterministic; allocation-free per sample. */
export class NebulaField {
  private readonly seed: number;

  constructor(galaxySeed: number) {
    this.seed = nebulaSeed(galaxySeed);
  }

  /** Map colour at absolute galaxy (x, z); `time` in shader seconds, `detail` 0..1. */
  sample(x: number, z: number, time: number, detail: number, out: NebulaColor): NebulaColor {
    const t = time * DRIFT_RATE;
    const px = x / CLOUD_SCALE + 11, py = z / CLOUD_SCALE + 11;
    const qx = this.fbm(px, py + t), qy = this.fbm(px + 5.2 - t, py + 1.3 - t);
    const rx = this.fbm(px + 3 * qx + 1.7 + 0.5 * t, py + 3 * qy + 9.2 + 0.5 * t);
    const ry = this.fbm(px + 3 * qx + 8.3 - 0.4 * t, py + 3 * qy + 2.8 - 0.4 * t);
    const n = this.fbm(px + 3.5 * rx, py + 3.5 * ry);
    const s1 = smoothstep(0.2, 0.8, qx), s2 = smoothstep(0.35, 0.85, ry);
    const s3 = smoothstep(0.55, 0.95, n * rx * 1.8), s4 = smoothstep(0.78, 1.0, n * qy * 2.0) * 0.6;
    const dust = smoothstep(0.55, 0.75, this.fbm(px * 2.7 + 40, py * 2.7 + 40)) * 0.55;
    const fine = this.fbm(x / DETAIL_SCALE + 6 * rx, z / DETAIL_SCALE + 6 * ry);
    const dens = smoothstep(0.30, 0.85, n) * (1 - dust) * mix(1, 2.2 * smoothstep(0.25, 0.8, fine), detail);
    const halo = smoothstep(0.12, 0.6, n);
    const k = clamp01(dens * 1.6);
    let r = 0, g = 0, b = 0;
    for (let i = 0; i < 3; i++) {
      let c = mix(BLUE[i], TEAL[i], s1);
      c = mix(c, VIOLET[i], s2);
      c = mix(c, ROSE[i], s3);
      c = mix(c, AMBER[i], s4);
      c = mix(mix(c, HAZE[i], 0.45), c, k);
      if (i === 0) r = c; else if (i === 1) g = c; else b = c;
    }
    out.r = r; out.g = g; out.b = b;
    out.a = Math.min(dens, 1) * 0.62 + 0.13 * halo;
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
