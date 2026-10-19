import { Hex, hexRing, hexToWorld, worldToHex } from '../hex/Hex';
import type { MegaType } from '../../content/megastructures';
import { buildMegaSites, type MegaSite } from './Megastructures';
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

/**
 * What a system's primary is (change worlds-and-stars). Main-sequence stars are most systems;
 * the rest follow the Milky Way's makeup. `smbh` is the one supermassive black hole at the centre.
 */
export type StarKind = 'main' | 'giant' | 'white-dwarf' | 'brown-dwarf' | 'neutron' | 'pulsar' | 'black-hole' | 'smbh';

export interface StarSystem {
  readonly id: string;
  readonly hex: Hex;
  readonly name: string;
  /** Main-sequence class (for other kinds, the class it is drawn and named near). */
  readonly spectral: SpectralClass;
  readonly planetCount: number;
  /** Missing on stars from before change worlds-and-stars (read with kindOf). */
  readonly kind?: StarKind;
  /** A megastructure system (change megastructures): the star and the structure, nothing else. */
  readonly megastructure?: MegaType;
  /** Companion stars of a binary or triple system, by class. */
  readonly companions?: readonly SpectralClass[];
  /** World position; y (elevation) is always 0 — the galaxy is a flat plane. */
  readonly position: { readonly x: number; readonly y: 0; readonly z: number };
}

export const SPECTRAL_COLORS: Record<SpectralClass, string> = {
  O: '#9bb0ff', B: '#aabfff', A: '#cad7ff', F: '#f8f7ff', G: '#fff4ea', K: '#ffd2a1', M: '#ffad6b',
};

/**
 * Main-sequence stars by number in the solar neighbourhood (percent): M dwarfs are three quarters
 * of all stars, O stars vanishingly rare (raised a little so a few exist). O and B stars are young
 * and live in the spiral arms: their weight grows with the arm (spectralWeights).
 */
export const SPECTRAL_SHARE: Readonly<Record<SpectralClass, number>> = {
  O: 0.0006, B: 0.13, A: 0.6, F: 3, G: 7.6, K: 12.1, M: 76.5,
};

/** Class weights at a place: `arm` 0..1 is how deep in a spiral arm it is. */
function spectralWeights(arm: number): ReadonlyArray<readonly [SpectralClass, number]> {
  const young = 1 + 3 * arm;
  return (['O', 'B', 'A', 'F', 'G', 'K', 'M'] as const).map((c) => [c, SPECTRAL_SHARE[c] * (c === 'O' || c === 'B' ? young : 1)] as const);
}

/**
 * Chance a star has at least one companion, by class: about a quarter of M dwarfs, half of Sun-like
 * stars, nearly all O stars. A fifth of multiples are triples.
 */
export const MULTIPLICITY: Readonly<Record<SpectralClass, number>> = {
  O: 0.9, B: 0.8, A: 0.65, F: 0.55, G: 0.5, K: 0.4, M: 0.26,
};

/**
 * Shares of the other kinds. Neutron stars (about 1% of stars) and black holes (0.1%) only take
 * systems without planets, so their share among those is ten times higher. White dwarfs are about
 * 8% of stars locally; brown dwarfs are common but faint; giants are old and gather in the bulge.
 */
export const REMNANT_SHARE = { neutron: 0.1, pulsarOfNeutron: 0.3, blackHole: 0.01 } as const;
export const STAR_SHARE = { whiteDwarf: 0.08, brownDwarf: 0.12, giant: 0.01, giantInBulge: 0.04 } as const;

/** The supermassive black hole at the galactic centre (like Sagittarius A*, about 4 million suns). */
export const CENTRAL_BLACK_HOLE = { q: 0, r: 0, name: 'The Maw', solarMasses: 4_300_000 } as const;

/** A star's kind (stars from before change worlds-and-stars are main-sequence). */
export const kindOf = (s: Pick<StarSystem, 'kind'>): StarKind => s.kind ?? 'main';

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
    const spiralPhase = arms * (theta - Math.log(Math.max(r, 1) / 1_500) / Math.tan(pitch));
    let arm = (0.5 + 0.5 * Math.cos(spiralPhase)) ** ARM_POWER;
    let bulge = Math.exp(-((r / bulgeRadius) ** 2));
    // The core: arms do not wind into the centre but dissolve into a bright oval bulge, its long
    // axis on the arms' roots (like M101 or the Milky Way).
    if (r < bulgeRadius * CORE_OUTER) {
      const c = coreShape(x, z, r, bulgeRadius, pitch);
      arm = arm * c.armFade + 0.45 * (1 - c.armFade);
      bulge += (c.oval - bulge) * c.blend;
    }
    const disk = Math.exp(-r / 14_000);
    const edge = 1 - smoothstep(radius * 0.8, radius, r);
    const noise = 0.75 + 0.5 * this.valueNoise(x / 900, z / 900);
    return clamp01(bulge + disk * (ARM_GAP + (1 - ARM_GAP) * arm) * edge * noise);
  }

  /**
   * The star in a hex, or null. Same seed + hex always gives the same answer. A megastructure
   * system has the structure as its only world (planetCount 1) and nothing else.
   */
  starAt(h: Hex): StarSystem | null {
    const star = this.rawStarAt(h);
    const type = star && star.planetCount === 0 ? this.megaIndex().get(star.id) : undefined;
    return type ? { ...star!, planetCount: 1, megastructure: type } : star;
  }

  /** Every megastructure in the galaxy (a few hundred), in the order they were placed. */
  megastructures(): readonly MegaSite[] {
    this.megaIndex();
    return this.megaSites!;
  }

  private megaSites: MegaSite[] | null = null;
  private megaById: Map<string, MegaType> | null = null;

  private megaIndex(): Map<string, MegaType> {
    if (this.megaById) return this.megaById;
    this.megaSites = buildMegaSites({
      seed: this.params.seed,
      rawStarAt: (h) => this.rawStarAt(h),
      sampleDensity: (n, rng) => this.sampleDensity(n, rng),
      start: this.startHex(),
    });
    this.megaById = new Map(this.megaSites.map((s) => [s.starId, s.type]));
    return this.megaById;
  }

  /**
   * Where empires start: the densest point of the ring 18,000 ly from the core, at its nearest
   * star (World.ts places every home 60–260 ly from it).
   */
  startHex(): Hex {
    let best = { d: -1, x: 0, z: 0 };
    for (let i = 0; i < 64; i++) {
      const a = (i / 64) * Math.PI * 2;
      const x = 18_000 * Math.cos(a), z = 18_000 * Math.sin(a);
      const d = this.density(x, z);
      if (d > best.d) best = { d, x, z };
    }
    return worldToHex(best.x, best.z);
  }

  /** A star as first rolled, before any megastructure claims it. */
  private rawStarAt(h: Hex): StarSystem | null {
    const p = hexToWorld(h);
    if (h.q === CENTRAL_BLACK_HOLE.q && h.r === CENTRAL_BLACK_HOLE.r) {
      return { id: `${h.q},${h.r}`, hex: h, name: CENTRAL_BLACK_HOLE.name, spectral: 'O', planetCount: 0, kind: 'smbh', companions: [], position: { x: p.x, y: 0, z: p.z } };
    }
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
    // One draw each for class and planet count, in this order (planet rolls depend on the count).
    const spectral = rng.weighted(spectralWeights(this.armAt(x, z)));
    const planetCount = rng.int(0, 9);
    // Kind and companions come from their own roll, so they never shift the rolls above.
    const k = new Rng(hashSeed(this.params.seed, 'stellar', h.q, h.r));
    const kind = starKind(k, planetCount, this.bulgeAt(x, z));
    return {
      id: `${h.q},${h.r}`,
      hex: h,
      name,
      spectral: kind === 'giant' ? (k.chance(0.7) ? 'K' : 'M') : spectral,
      planetCount,
      kind,
      companions: companionsOf(k, kind, spectral),
      position: { x, y: 0, z },
    };
  }

  /** How deep in a spiral arm a place is, 0..1 (young, hot stars gather there). */
  armAt(x: number, z: number): number {
    const r = Math.hypot(x, z);
    const phase = this.params.arms * (Math.atan2(z, x) - Math.log(Math.max(r, 1) / 1_500) / Math.tan(this.params.pitch));
    return (0.5 + 0.5 * Math.cos(phase)) ** ARM_POWER * smoothstep(this.params.bulgeRadius * 0.8, this.params.bulgeRadius * 2, r);
  }

  /** How deep in the old central bulge a place is, 0..1 (giants gather there). */
  bulgeAt(x: number, z: number): number {
    return Math.exp(-((Math.hypot(x, z) / this.params.bulgeRadius) ** 2));
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

/** A system's kind: remnants only where there are no planets; dwarfs and giants anywhere. */
function starKind(rng: Rng, planetCount: number, bulge: number): StarKind {
  const r = rng.next();
  if (planetCount === 0) {
    if (r < REMNANT_SHARE.blackHole) return 'black-hole';
    if (r < REMNANT_SHARE.blackHole + REMNANT_SHARE.neutron) return rng.chance(REMNANT_SHARE.pulsarOfNeutron) ? 'pulsar' : 'neutron';
  }
  const giant = STAR_SHARE.giant + (STAR_SHARE.giantInBulge - STAR_SHARE.giant) * bulge;
  const t = rng.next();
  if (t < giant) return 'giant';
  if (t < giant + STAR_SHARE.whiteDwarf) return 'white-dwarf';
  if (t < giant + STAR_SHARE.whiteDwarf + STAR_SHARE.brownDwarf) return 'brown-dwarf';
  return 'main';
}

const CLASSES: readonly SpectralClass[] = ['O', 'B', 'A', 'F', 'G', 'K', 'M'];

/** Companions: lighter stars than the primary, picked by how common each lighter class is. */
function companionsOf(rng: Rng, kind: StarKind, spectral: SpectralClass): SpectralClass[] {
  if (kind === 'neutron' || kind === 'pulsar' || kind === 'black-hole' || kind === 'smbh') return [];
  const p = kind === 'brown-dwarf' ? 0.2 : kind === 'white-dwarf' ? 0.25 : MULTIPLICITY[spectral];
  if (!rng.chance(p)) return [];
  const lighter = CLASSES.slice(CLASSES.indexOf(kind === 'main' ? spectral : 'K')).map((c) => [c, SPECTRAL_SHARE[c]] as const);
  const n = rng.chance(0.2) ? 2 : 1;
  return Array.from({ length: n }, () => rng.weighted(lighter));
}

/**
 * Arm shape: the arm profile is (0.5 + 0.5 cos phase) ^ ARM_POWER (lower is broader), and
 * ARM_GAP is the share of the disc's stars left between the arms. Broad arms with near-empty
 * gaps between them. Existing empires keep their homes through changes here: saves record
 * the home system.
 */
export const ARM_POWER = 1.6;
export const ARM_GAP = 0.02;

/** The core reaches out to this many bulge radii; beyond it density is the plain spiral. */
export const CORE_OUTER = 2.5;

/**
 * The oval core: its long axis lies where the arms would reach the core, so arms grow out of
 * its ends. `oval` is the core's brightness, `armFade` how much spiral survives (0 at the
 * centre, 1 outside the core) and `blend` how much the oval replaces the plain round bulge.
 */
export function coreShape(x: number, z: number, r: number, bulgeRadius: number, pitch: number): { oval: number; armFade: number; blend: number } {
  const length = bulgeRadius * 1.15, width = bulgeRadius * 0.72;
  const axis = Math.log(length / 1_500) / Math.tan(pitch);
  const u = x * Math.cos(axis) + z * Math.sin(axis);
  const v = -x * Math.sin(axis) + z * Math.cos(axis);
  const oval = Math.exp(-((u / length) ** 2) - (v / width) ** 2) * 1.05 + Math.exp(-((r / (bulgeRadius * 0.45)) ** 2)) * 0.4;
  return {
    oval,
    armFade: smoothstep(bulgeRadius * 0.55, bulgeRadius * 1.6, r),
    blend: 1 - smoothstep(bulgeRadius * 1.8, bulgeRadius * CORE_OUTER, r),
  };
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function smoothstep(e0: number, e1: number, x: number): number {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
}
