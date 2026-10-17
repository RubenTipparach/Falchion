import { DEFAULT_GALAXY } from '../../core/galaxy/GalaxyModel';
import { hash01, hashSeed } from '../../core/rng/Rng';

/**
 * The nebula colour field, written twice: as GLSL for the map's NebulaLayer and as
 * TypeScript for anything that needs the same colours on the CPU (the system
 * skybox). The two must stay line-for-line in step. The lattice hash is integer
 * arithmetic (`hash01` from core, mirrored in GLSL, keeping the top 24 bits), so
 * both sides agree bit for bit on every lattice value; only float rounding differs.
 *
 * Two layers that work together. A large (~3,200 ly) layer is the mask and colour guide: it
 * decides where there is nebula at all and its overall hue. A fine (~220 ly) layer of slowly
 * drifting clouds is the texture: it only shows inside the large layer's clouds, tinted toward
 * their colour. `detail` (0..1, from `nebulaDetail`) fades the fine texture into a smooth fill as
 * the view zooms out, where it would only alias into speckle. Outside the large clouds space
 * stays dark, apart from a faint haze. The large clouds themselves follow the galaxy's spiral
 * arms (`armPresence`): rich along the arms, sparse between them. Toward the core the arms
 * merge into one bright blob (`coreHeat`) of white, yellow and orange clouds, with no gaps.
 *
 * `sample()` returns the colour the map draws at a galaxy point: `rgb` with a
 * coverage `alpha`; the map adds `rgb * alpha * 1.3` over the background.
 */

/** Fine clouds (ly per noise cell), the large mask/colour layer, and the haze beneath them. */
export const CLOUD_SCALE = 220;
export const REGION_SCALE = 3_200;
export const HAZE_SCALE = 1_800;
/** How strongly the fine clouds keep their own hue against the large layer's colour. */
const FINE_TINT = 0.35;
/** The galaxy's spiral (the same arms GalaxyModel places stars on): nebulae gather along them. */
const { arms: ARMS, pitch: PITCH, radius: GALAXY_R, bulgeRadius: BULGE } = DEFAULT_GALAXY;
const INV_TAN_PITCH = 1 / Math.tan(PITCH);

/** The core blob, 0..1: full in the bulge, fading out to where the arms take over. */
export function coreHeat(r: number): number {
  return 1 - smoothstep(BULGE * 1.1, BULGE * 2.9, r);
}

/**
 * How much nebula the galaxy holds at a point, 0..1: full along the spiral arms, thin in the
 * gaps between them, full again in the core (the arms merge into one blob instead of winding
 * into skinny spirals) and gone past the rim.
 */
export function armPresence(x: number, z: number): number {
  const r = Math.hypot(x, z);
  const phase = ARMS * (Math.atan2(z, x) - Math.log(Math.max(r, 1) / 1_500) * INV_TAN_PITCH);
  const arm = Math.pow(0.5 + 0.5 * Math.cos(phase), 1.5);
  const edge = 1 - smoothstep(GALAXY_R * 0.82, GALAXY_R * 1.02, r);
  return mix(0.12 + 0.88 * smoothstep(0.08, 0.55, arm), 1, coreHeat(r)) * edge;
}
/** Core colours: hot white, yellow and orange. */
const CORE_WHITE = [1.0, 0.93, 0.80], CORE_YELLOW = [1.0, 0.78, 0.34], CORE_ORANGE = [0.98, 0.50, 0.18];
/** Added to lattice coordinates so the GPU only ever casts positive ints to unsigned. */
const LATTICE_OFFSET = 1 << 30;
/** Shader time (seconds) to drift units: the clouds move very slowly. */
export const DRIFT_RATE = 0.0012;

/** Seed uniform for the field: 24 bits, so it is exact as a GLSL float. */
export function nebulaSeed(galaxySeed: number): number {
  return hashSeed(galaxySeed, 'clouds') & 0xffffff;
}

/** Fine-texture amount for a view width (ly): full up close, a smooth fill at galaxy scale. */
export function nebulaDetail(visibleWidth: number): number {
  const t = Math.min(1, Math.max(0, Math.log(visibleWidth / 1_500) / Math.log(9_000 / 1_500)));
  return 1 - t * t * (3 - 2 * t);
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
  // Phones define NEB_OCTAVES 4 (the last two octaves add 1/32 and 1/64: invisible at their resolution).
  #ifndef NEB_OCTAVES
  #define NEB_OCTAVES 6
  #endif
  float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < NEB_OCTAVES; i++) { v += a * noise(p); p = p * 2.03 + 17.0; a *= 0.5; } return v; }
  // One cloud layer at noise coordinates p: rgb and coverage.
  vec4 cloudLayer(vec2 p, float t) {
    vec2 q = vec2(fbm(p + vec2(0.0, t)), fbm(p + vec2(5.2, 1.3) - t));
    vec2 r = vec2(fbm(p + 3.0 * q + vec2(1.7, 9.2) + 0.5 * t), fbm(p + 3.0 * q + vec2(8.3, 2.8) - 0.4 * t));
    float n = fbm(p + 3.5 * r);
    vec3 teal = vec3(0.06, 0.45, 0.55), blue = vec3(0.12, 0.22, 0.75), violet = vec3(0.45, 0.16, 0.70), rose = vec3(0.85, 0.20, 0.42), amber = vec3(0.95, 0.55, 0.20);
    vec3 col = mix(blue, teal, smoothstep(0.2, 0.8, q.x));
    col = mix(col, violet, smoothstep(0.35, 0.85, r.y));
    col = mix(col, rose, smoothstep(0.55, 0.95, n * r.x * 1.8));
    col = mix(col, amber, smoothstep(0.78, 1.0, n * q.y * 2.0) * 0.6);
    float dust = smoothstep(0.55, 0.75, fbm(p * 2.7 + 40.0)) * 0.55;
    return vec4(col, smoothstep(0.30, 0.85, n) * (1.0 - dust));
  }
  // Nebula the galaxy holds here (armPresence): along the arms, thin between them.
  float coreHeat(float r) { return 1.0 - smoothstep(${(BULGE * 1.1).toFixed(1)}, ${(BULGE * 2.9).toFixed(1)}, r); }
  float armPresence(vec2 p) {
    float r = length(p);
    float phase = ${ARMS.toFixed(1)} * (atan(p.y, p.x) - log(max(r, 1.0) / 1500.0) * ${INV_TAN_PITCH.toFixed(8)});
    float arm = pow(0.5 + 0.5 * cos(phase), 1.5);
    float edge = 1.0 - smoothstep(${(GALAXY_R * 0.82).toFixed(1)}, ${(GALAXY_R * 1.02).toFixed(1)}, r);
    return mix(0.12 + 0.88 * smoothstep(0.08, 0.55, arm), 1.0, coreHeat(r)) * edge;
  }
  // Map colour at an absolute galaxy point: rgb and coverage.
  vec4 nebulaSample(vec2 hit, float t, float detail) {
    vec4 region = cloudLayer(hit / ${REGION_SCALE.toFixed(1)} + 11.0, t * 0.5);
    vec4 fine = cloudLayer(hit / ${CLOUD_SCALE.toFixed(1)}, t);
    float heat = coreHeat(length(hit));
    // In the core the large layer's gaps fill in: one blob, textured by the fine clouds.
    float mask = mix(smoothstep(0.12, 0.55, region.a * (0.35 + 0.95 * armPresence(hit))), 1.0, heat * 0.9);
    vec3 col = mix(region.rgb, fine.rgb, ${FINE_TINT});
    float cover = mask * mix(0.6, min(1.0, fine.a * 1.25), detail);
    // Faint two-tone haze, strongest inside the large clouds.
    float hazeN = fbm(hit / ${HAZE_SCALE.toFixed(1)} + 3.0);
    // The core burns white, yellow and orange (the haze noise picks the mix), never dark.
    vec3 coreCol = mix(mix(vec3(${CORE_ORANGE.join(', ')}), vec3(${CORE_YELLOW.join(', ')}), smoothstep(0.30, 0.60, hazeN)), vec3(${CORE_WHITE.join(', ')}), smoothstep(0.55, 0.80, hazeN));
    col = mix(col, coreCol * (0.7 + 0.33 * fine.a), heat * 0.85);
    cover = max(cover, heat * (0.52 + 0.32 * fine.a));
    vec3 haze = mix(vec3(0.10, 0.16, 0.42), vec3(0.32, 0.12, 0.40), hazeN);
    float hazeA = 0.16 * smoothstep(0.25, 0.75, hazeN) * (0.25 + 0.75 * mask);
    return vec4(mix(mix(haze, region.rgb * 0.6, mask), col, clamp(cover * 1.6, 0.0, 1.0)), cover * 0.85 + hazeA);
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

  private readonly region = [0, 0, 0, 0];
  private readonly fine = [0, 0, 0, 0];

  /** One cloud layer at noise coordinates (px, py): rgb and coverage into `out`. */
  private cloudLayer(px: number, py: number, t: number, out: number[]): void {
    const qx = this.fbm(px, py + t), qy = this.fbm(px + 5.2 - t, py + 1.3 - t);
    const rx = this.fbm(px + 3 * qx + 1.7 + 0.5 * t, py + 3 * qy + 9.2 + 0.5 * t);
    const ry = this.fbm(px + 3 * qx + 8.3 - 0.4 * t, py + 3 * qy + 2.8 - 0.4 * t);
    const n = this.fbm(px + 3.5 * rx, py + 3.5 * ry);
    const s1 = smoothstep(0.2, 0.8, qx), s2 = smoothstep(0.35, 0.85, ry);
    const s3 = smoothstep(0.55, 0.95, n * rx * 1.8), s4 = smoothstep(0.78, 1.0, n * qy * 2.0) * 0.6;
    for (let i = 0; i < 3; i++) {
      let c = mix(BLUE[i], TEAL[i], s1);
      c = mix(c, VIOLET[i], s2);
      c = mix(c, ROSE[i], s3);
      out[i] = mix(c, AMBER[i], s4);
    }
    const dust = smoothstep(0.55, 0.75, this.fbm(px * 2.7 + 40, py * 2.7 + 40)) * 0.55;
    out[3] = smoothstep(0.30, 0.85, n) * (1 - dust);
  }

  /** Map colour at absolute galaxy (x, z); `time` in shader seconds, `detail` 0..1 (1 up close). */
  sample(x: number, z: number, time: number, out: NebulaColor, detail = 1): NebulaColor {
    const t = time * DRIFT_RATE;
    const reg = this.region, fin = this.fine;
    this.cloudLayer(x / REGION_SCALE + 11, z / REGION_SCALE + 11, t * 0.5, reg);
    this.cloudLayer(x / CLOUD_SCALE, z / CLOUD_SCALE, t, fin);
    const heat = coreHeat(Math.hypot(x, z));
    const mask = mix(smoothstep(0.12, 0.55, reg[3] * (0.35 + 0.95 * armPresence(x, z))), 1, heat * 0.9);
    let cover = mask * mix(0.6, Math.min(1, fin[3] * 1.25), detail);
    const hazeN = this.fbm(x / HAZE_SCALE + 3, z / HAZE_SCALE + 3);
    const sY = smoothstep(0.30, 0.60, hazeN), sW = smoothstep(0.55, 0.80, hazeN);
    cover = Math.max(cover, heat * (0.52 + 0.32 * fin[3]));
    const k = clamp01(cover * 1.6);
    const rgb = [0, 0, 0];
    for (let i = 0; i < 3; i++) {
      const coreCol = mix(mix(CORE_ORANGE[i], CORE_YELLOW[i], sY), CORE_WHITE[i], sW);
      const col = mix(mix(reg[i], fin[i], FINE_TINT), coreCol * (0.7 + 0.33 * fin[3]), heat * 0.85);
      const haze = mix(mix(HAZE_A[i], HAZE_B[i], hazeN), reg[i] * 0.6, mask);
      rgb[i] = mix(haze, col, k);
    }
    out.r = rgb[0]; out.g = rgb[1]; out.b = rgb[2];
    out.a = cover * 0.85 + 0.16 * smoothstep(0.25, 0.75, hazeN) * (0.25 + 0.75 * mask);
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
