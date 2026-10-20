import { Rng, hash01, hashSeed } from '../../core/rng/Rng';
import { NebulaColor, NebulaField } from './nebulaField';

/** Where a sky is painted from: a star system, or a point in deep space. */
export interface SkyAnchor {
  readonly id: string;
  readonly x: number;
  readonly z: number;
}

/** The nebula is a slab this many ly either side of the galactic plane. */
const SLAB = 20;
/** Furthest a view ray looks across the plane (ly). */
const REACH = 90;
/** Polar grid of field samples around the anchor: azimuth bins x log-spaced rings. */
const AZ = 96, RINGS = 24, R0 = 0.75;
const STEPS = 12;
/** Distances (ly) at which lobes look for neighbouring clouds' colours. */
const FAR = [150, 300, 600, 1000];
/** Path length (ly) that counts as one unit of glow, so lobes and band match the march. */
const PATH_UNIT = 20;
/** Light absorbed per ly per unit of cloud coverage. */
const ABSORB = 0.03;
/** Mean sky brightness the exposure aims for, and how far it may push. */
const TARGET = 0.28, MIN_GAIN = 0.3, MAX_GAIN = 8;
/** Sky brightness, relative to a full nebula sky, out in empty space: a faint glow at most. */
const EMPTY_SKY = 0.06;

/**
 * Homeworld-style sky colours, one per direction on a sphere, painted from the map's
 * nebula field around an anchor point. The system sits inside a slab of the same
 * clouds the map draws: a ray near the plane looks out across tens of ly of them, a
 * ray toward either pole leaves the slab soon and sees a darker, desaturated tint of
 * the local colour. On top come Homeworld's broad strokes, seeded per anchor: a few
 * big glowing cloud lobes, a tilted band with a dust lane, a dim side and a bright
 * side. Exposure is normalised to the nebula actually around the anchor: inside a
 * cloud on the map the system looks enveloped; out in empty space (no cloud on the map)
 * the sky stays a dark starfield with at most a faint glow.
 *
 * Pure and deterministic (same field, seed, anchor and time give the same colours).
 */
export class NebulaSkyPainter {
  private readonly grid = new Float32Array(AZ * RINGS * 4);
  private readonly centre = new Float32Array(4);
  private readonly sample: NebulaColor = { r: 0, g: 0, b: 0, a: 0 };
  private readonly radii: Float32Array;
  private readonly raw: Float32Array;

  /** `directions`: unit vectors, xyz per vertex (y is up out of the galactic plane). */
  constructor(private readonly field: NebulaField, private readonly galaxySeed: number, private readonly directions: Float32Array) {
    this.radii = Float32Array.from({ length: RINGS }, (_, j) => R0 * Math.pow(REACH / R0, j / (RINGS - 1)));
    this.raw = new Float32Array(directions.length);
  }

  /** Writes rgb per direction into `out` (same length as `directions`). */
  paint(anchor: SkyAnchor, time: number, out: Float32Array): Float32Array {
    this.sampleGrid(anchor, time);
    const rng = new Rng(hashSeed(this.galaxySeed, 'sky', anchor.id));
    const noiseSeed = rng.int(0, 0x7fffffff);

    // Overall nebula colour around the anchor (emission-weighted), used for the floor and band.
    const mean = this.meanEmission(0, AZ, RINGS - 4);
    const lobes = Array.from({ length: rng.int(4, 6) }, () => {
      const az = rng.range(0, Math.PI * 2), el = Math.asin(rng.range(-0.9, 0.7));
      const bin = Math.floor((az / (Math.PI * 2)) * AZ);
      return {
        x: Math.cos(el) * Math.cos(az), y: Math.sin(el), z: Math.cos(el) * Math.sin(az),
        radius: rng.range(0.3, 0.75), strength: rng.range(1.0, 2.0),
        // The colour of the clouds lying that way, near and far (as on the sector map), a little more vivid.
        tint: vivid(mix3(this.meanEmission(bin - 6, bin + 6, RINGS - 2), this.farEmission(anchor, az, time), 0.5), 1.35),
      };
    });
    const bandTilt = rng.range(0.15, 0.55), bandAz = rng.range(0, Math.PI * 2);
    const band = { x: Math.sin(bandTilt) * Math.cos(bandAz), y: Math.cos(bandTilt), z: Math.sin(bandTilt) * Math.sin(bandAz) };
    const bandWidth = rng.range(0.16, 0.28), laneOffset = rng.range(-0.3, 0.3), bandStrength = rng.range(0.7, 1.2);
    const bandTint = mix3(vivid(mean, 1.2), [1, 0.95, 0.9], 0.2);
    const litAz = rng.range(0, Math.PI * 2), litEl = rng.range(-0.4, 0.4);
    const lit = { x: Math.cos(litEl) * Math.cos(litAz), y: Math.sin(litEl), z: Math.cos(litEl) * Math.sin(litAz) };

    const dirs = this.directions, raw = this.raw;
    const em = [0, 0, 0];
    let lumSum = 0;
    for (let i = 0; i < dirs.length; i += 3) {
      const dx = dirs[i], dy = dirs[i + 1], dz = dirs[i + 2];
      this.march(dx, dy, dz, em);
      // Big, soft brightness variation (Homeworld skies are never flat).
      const broad = noise3(noiseSeed, dx * 1.7, dy * 1.7, dz * 1.7, 3);
      const shape = noise3(noiseSeed + 1, dx * 3.2 + 7, dy * 3.2, dz * 3.2, 3);
      const side = 0.4 + 0.8 * smoothstep(-0.8, 0.9, dx * lit.x + dy * lit.y + dz * lit.z);
      const k = (0.4 + 1.1 * broad) * side;
      let r = em[0] * k, g = em[1] * k, b = em[2] * k;
      // Cloud lobes: wispy glows of the colour lying in their direction.
      for (const l of lobes) {
        const ang = Math.acos(Math.max(-1, Math.min(1, dx * l.x + dy * l.y + dz * l.z))) / l.radius;
        const w = l.strength * (Math.exp(-ang * ang * 2.2) * (0.3 + 0.9 * smoothstep(0.35, 0.7, shape)) + 0.35 * Math.exp(-ang * ang * 9));
        r += l.tint[0] * w; g += l.tint[1] * w; b += l.tint[2] * w;
      }
      // A tilted band of glowing cloud, clumpy along its length, split by a dark dust lane.
      const d = (dx * band.x + dy * band.y + dz * band.z) / bandWidth;
      const lane = 1 - (0.3 + 0.6 * broad) * Math.exp(-Math.pow((d - laneOffset + (shape - 0.5) * 1.2) * 2.6, 2));
      const bw = bandStrength * Math.exp(-d * d) * (0.2 + 1.2 * shape) * lane * side;
      r += bandTint[0] * bw; g += bandTint[1] * bw; b += bandTint[2] * bw;
      // Toward the poles: dimmer and greyer, but still the local hue.
      const grey = 0.45 * dy * dy;
      const lum = 0.3 * r + 0.55 * g + 0.15 * b;
      r += (lum - r) * grey; g += (lum - g) * grey; b += (lum - b) * grey;
      raw[i] = r; raw[i + 1] = g; raw[i + 2] = b;
      lumSum += lum;
    }

    // Exposure: aim every sky at the same mean brightness, then roll highlights off softly,
    // scaled by how much cloud surrounds the anchor on the map (the haze alone does not count).
    const presence = this.presence();
    const meanLum = lumSum / (dirs.length / 3);
    const gain = Math.min(MAX_GAIN, Math.max(MIN_GAIN, TARGET / Math.max(1e-6, meanLum)));
    const mLum = 0.3 * mean[0] + 0.55 * mean[1] + 0.15 * mean[2];
    const floor = mLum > 1e-6 ? mean.map((c) => (0.07 * c * presence) / mLum) : [0, 0, 0];
    const level = EMPTY_SKY + (1 - EMPTY_SKY) * presence;
    for (let i = 0; i < dirs.length; i += 3) {
      for (let c = 0; c < 3; c++) out[i + c] = Math.max(floor[c], (1 - Math.exp(-raw[i + c] * gain * 1.15)) * level);
    }
    return out;
  }

  /**
   * How much nebula surrounds the anchor, 0 (empty space) to 1 (inside a cloud): coverage at
   * the anchor and within ~30 ly around it, above the faint haze every point has.
   */
  private presence(): number {
    let sum = this.centre[3] * AZ, n = AZ;
    for (let a = 0; a < AZ; a++) for (let j = 0; j < RINGS - 6; j++, n++) sum += this.grid[(a * RINGS + j) * 4 + 3];
    return smoothstep(0.18, 0.5, sum / n);
  }

  /** Field around the anchor: one sample at the centre plus AZ x RINGS on log-spaced rings. */
  private sampleGrid(anchor: SkyAnchor, time: number): void {
    const s = this.sample;
    const put = (arr: Float32Array, o: number) => {
      // Emission as the map draws it (premultiplied), plus coverage for absorption.
      arr[o] = s.r * s.a * 1.3; arr[o + 1] = s.g * s.a * 1.3; arr[o + 2] = s.b * s.a * 1.3; arr[o + 3] = s.a;
    };
    this.field.sample(anchor.x, anchor.z, time, s);
    put(this.centre, 0);
    for (let a = 0; a < AZ; a++) {
      const th = (a / AZ) * Math.PI * 2, cx = Math.cos(th), cz = Math.sin(th);
      for (let j = 0; j < RINGS; j++) {
        this.field.sample(anchor.x + cx * this.radii[j], anchor.z + cz * this.radii[j], time, s);
        put(this.grid, (a * RINGS + j) * 4);
      }
    }
  }

  /** Emission integrated along one view ray through the slab (front to back). */
  private march(dx: number, dy: number, dz: number, out: number[]): void {
    const ay = Math.abs(dy), ce = Math.sqrt(Math.max(0, 1 - dy * dy));
    const length = Math.min(SLAB / Math.max(ay, 1e-3), REACH / Math.max(ce, 1e-3));
    let az = (Math.atan2(dz, dx) / (Math.PI * 2)) * AZ;
    if (az < 0) az += AZ;
    const a0 = Math.floor(az) % AZ, a1 = (a0 + 1) % AZ, fa = az - Math.floor(az);
    let r = 0, g = 0, b = 0, trans = 1, prev = 0;
    const cell = [0, 0, 0, 0];
    for (let k = 1; k <= STEPS; k++) {
      // Steps bunch up near the anchor, where the view changes fastest.
      const s = length * Math.pow(k / STEPS, 1.6), ds = s - prev;
      prev = s;
      this.lookup(a0, a1, fa, (s - ds / 2) * ce, cell);
      r += trans * cell[0] * ds; g += trans * cell[1] * ds; b += trans * cell[2] * ds;
      trans *= Math.exp(-ABSORB * cell[3] * ds);
    }
    out[0] = r / PATH_UNIT; out[1] = g / PATH_UNIT; out[2] = b / PATH_UNIT;
  }

  /** Bilinear lookup in (azimuth, log radius); inside the first ring blend toward the centre. */
  private lookup(a0: number, a1: number, fa: number, radius: number, out: number[]): void {
    const g = this.grid;
    if (radius <= R0) {
      const t = radius / R0;
      for (let c = 0; c < 4; c++) out[c] = this.centre[c] + ((g[a0 * RINGS * 4 + c] * (1 - fa) + g[a1 * RINGS * 4 + c] * fa) - this.centre[c]) * t;
      return;
    }
    const jf = Math.min(RINGS - 1.0001, (Math.log(radius / R0) / Math.log(REACH / R0)) * (RINGS - 1));
    const j0 = Math.floor(jf), fj = jf - j0;
    const i00 = (a0 * RINGS + j0) * 4, i01 = i00 + 4, i10 = (a1 * RINGS + j0) * 4, i11 = i10 + 4;
    for (let c = 0; c < 4; c++) {
      out[c] = (g[i00 + c] * (1 - fj) + g[i01 + c] * fj) * (1 - fa) + (g[i10 + c] * (1 - fj) + g[i11 + c] * fj) * fa;
    }
  }

  /** Mean emission of the neighbouring clouds hundreds of ly out along an azimuth. */
  private farEmission(anchor: SkyAnchor, az: number, time: number): number[] {
    const s = this.sample, m = [0, 0, 0];
    for (const d of FAR) {
      this.field.sample(anchor.x + Math.cos(az) * d, anchor.z + Math.sin(az) * d, time, s);
      m[0] += (s.r * s.a * 1.3) / FAR.length; m[1] += (s.g * s.a * 1.3) / FAR.length; m[2] += (s.b * s.a * 1.3) / FAR.length;
    }
    return m;
  }

  /** Mean emission over azimuth bins [from, to) (wrapping) and the first `rings` rings. */
  private meanEmission(from: number, to: number, rings: number): [number, number, number] {
    const m: [number, number, number] = [0, 0, 0];
    let n = 0;
    for (let a = from; a < to; a++) {
      const base = (((a % AZ) + AZ) % AZ) * RINGS * 4;
      for (let j = 0; j < rings; j++, n++) for (let c = 0; c < 3; c++) m[c] += this.grid[base + j * 4 + c];
    }
    return [m[0] / n, m[1] / n, m[2] / n];
  }
}

function smoothstep(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

function mix3(a: number[], b: number[], t: number): number[] {
  return a.map((v, i) => v + (b[i] - v) * t);
}

/** Push a colour away from its grey, keeping its luminance. */
function vivid(c: number[], amount: number): number[] {
  const lum = 0.3 * c[0] + 0.55 * c[1] + 0.15 * c[2];
  return c.map((v) => Math.max(0, lum + (v - lum) * amount));
}

/** Smooth 3D value noise in [0, 1) on the sky sphere (octaves summed, normalised). */
function noise3(seed: number, x: number, y: number, z: number, octaves: number): number {
  let v = 0, amp = 0.5, total = 0;
  for (let o = 0; o < octaves; o++) {
    v += amp * value3(seed + o * 1013, x, y, z);
    total += amp;
    x *= 2.07; y *= 2.07; z *= 2.07;
    amp *= 0.5;
  }
  return v / total;
}

function value3(seed: number, x: number, y: number, z: number): number {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const fx = x - ix, fy = y - iy, fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy), uz = fz * fz * (3 - 2 * fz);
  const h = (a: number, b: number, c: number) => hash01(seed ^ Math.imul(iz + c, 0x9e3779b1), ix + a, iy + b);
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  const z0 = lerp(lerp(h(0, 0, 0), h(1, 0, 0), ux), lerp(h(0, 1, 0), h(1, 1, 0), ux), uy);
  const z1 = lerp(lerp(h(0, 0, 1), h(1, 0, 1), ux), lerp(h(0, 1, 1), h(1, 1, 1), ux), uy);
  return lerp(z0, z1, uz);
}
