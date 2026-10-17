import { Hex, hexRing, hexToWorld } from '../hex/Hex';
import { Rng, hash01, hashSeed } from '../rng/Rng';

export interface GalaxyParams {
  readonly seed: number;
  /** Radius in light years (1 ly = 1 hex). */
  readonly radius: number;
  readonly arms: number;
  /** Logarithmic spiral pitch angle in radians. */
  readonly pitch: number;
  readonly bulgeRadius: number;
  /** Probability of a star in a hex at density 1. */
  readonly maxStarChance: number;
}

export const DEFAULT_GALAXY: GalaxyParams = {
  seed: 1337,
  radius: 35_000,
  arms: 4,
  pitch: 0.24,
  bulgeRadius: 3_800,
  maxStarChance: 0.14,
};

export type SpectralClass = 'O' | 'B' | 'A' | 'F' | 'G' | 'K' | 'M';

export interface StarSystem {
  readonly id: string;
  readonly hex: Hex;
  readonly name: string;
  readonly spectral: SpectralClass;
  readonly planetCount: number;
  /** World position; y (elevation) is always 0 — the galaxy is a flat plane. */
  readonly position: { readonly x: number; readonly y: 0; readonly z: number };
}

export const SPECTRAL_COLORS: Record<SpectralClass, string> = {
  O: '#9bb0ff', B: '#aabfff', A: '#cad7ff', F: '#f8f7ff', G: '#fff4ea', K: '#ffd2a1', M: '#ffad6b',
};

const SPECTRAL_WEIGHTS: ReadonlyArray<readonly [SpectralClass, number]> = [
  ['O', 0.5], ['B', 2], ['A', 5], ['F', 9], ['G', 14], ['K', 24], ['M', 45],
];

const SYLLABLES = ['ka', 'vor', 'eth', 'lin', 'zar', 'qu', 'oth', 'mir', 'tal', 'sen', 'dra', 'xi', 'nor', 'bel', 'ul', 'phe', 'ron', 'ash', 'cy', 'tor'];
const SUFFIXES = ['', '', '', ' Prime', ' Major', ' Minor', ' II', ' IV'];

/**
 * Pure, deterministic description of the galaxy. Nothing is stored: every
 * query is answered from the seed, so the 70,000 ly galaxy costs no memory.
 */
export class GalaxyModel {
  constructor(readonly params: GalaxyParams = DEFAULT_GALAXY) {}

  /** Stellar density in [0, 1] at a world position. */
  density(x: number, z: number): number {
    const { radius, arms, pitch, bulgeRadius } = this.params;
    const r = Math.hypot(x, z);
    if (r >= radius) return 0;
    const theta = Math.atan2(z, x);
    const bulge = Math.exp(-((r / bulgeRadius) ** 2));
    const spiralPhase = arms * (theta - Math.log(Math.max(r, 1) / 1_500) / Math.tan(pitch));
    const arm = (0.5 + 0.5 * Math.cos(spiralPhase)) ** 3;
    const disk = Math.exp(-r / 14_000);
    const edge = 1 - smoothstep(radius * 0.8, radius, r);
    const noise = 0.75 + 0.5 * this.valueNoise(x / 900, z / 900);
    return clamp01(bulge + disk * (0.07 + 0.93 * arm) * edge * noise);
  }

  /** The star in a hex, or null. Same seed + hex always gives the same answer. */
  starAt(h: Hex): StarSystem | null {
    const p = hexToWorld(h);
    const d = this.density(p.x, p.z);
    if (d <= 0) return null;
    if (hash01(this.params.seed, h.q, h.r) >= d * this.params.maxStarChance) return null;
    return this.buildStar(h, p.x, p.z);
  }

  /** Nearest star to a hex by hex distance (ties broken by ring order), or null within maxRadius. */
  nearestStar(h: Hex, maxRadius = 50): StarSystem | null {
    for (let k = 0; k <= maxRadius; k++) {
      for (const c of hexRing(h, k)) {
        const s = this.starAt(c);
        if (s) return s;
      }
    }
    return null;
  }

  /** Rejection-samples `count` positions following the density (for far-view rendering). */
  sampleDensity(count: number, rng: Rng): Array<{ x: number; z: number; d: number }> {
    const out: Array<{ x: number; z: number; d: number }> = [];
    const R = this.params.radius;
    let guard = count * 60;
    while (out.length < count && guard-- > 0) {
      // Bias radius toward the centre, then correct via acceptance.
      const r = R * Math.sqrt(rng.next());
      const a = rng.next() * Math.PI * 2;
      const x = r * Math.cos(a);
      const z = r * Math.sin(a);
      const d = this.density(x, z);
      if (rng.next() < d) out.push({ x, z, d });
    }
    return out;
  }

  private buildStar(h: Hex, x: number, z: number): StarSystem {
    const rng = new Rng(hashSeed(this.params.seed, 'star', h.q, h.r));
    const syll = rng.int(2, 3);
    let name = '';
    for (let i = 0; i < syll; i++) name += rng.pick(SYLLABLES);
    name = name[0].toUpperCase() + name.slice(1) + rng.pick(SUFFIXES);
    return {
      id: `${h.q},${h.r}`,
      hex: h,
      name,
      spectral: rng.weighted(SPECTRAL_WEIGHTS),
      planetCount: rng.int(0, 9),
      position: { x, y: 0, z },
    };
  }

  /** Smooth 2D value noise in [0, 1]. */
  private valueNoise(x: number, y: number): number {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const s = this.params.seed ^ 0x5bd1e995;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = hash01(s, xi, yi), b = hash01(s, xi + 1, yi);
    const c = hash01(s, xi, yi + 1), d = hash01(s, xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function smoothstep(e0: number, e1: number, x: number): number {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
}
