import { MEGASTRUCTURES, hostsStar, type MegaType } from '../../content/megastructures';
import { hexDistance, hexRing, worldToHex, type Hex } from '../hex/Hex';
import { Rng, hashSeed } from '../rng/Rng';
import type { StarSystem } from './GalaxyModel';

/**
 * Where the galaxy's megastructures are (change megastructures): a fixed list, the same for
 * everyone, drawn once from the galaxy seed. Sites follow the stars (more in the arms and the
 * core), keep apart from each other and from the region where empires start, and only take stars
 * that never had planets, so no colony or home is ever moved out of the way. Each takes a type
 * its star can host.
 */
export interface MegaSite {
  readonly starId: string;
  readonly hex: Hex;
  readonly type: MegaType;
}

/** Draws before giving up (each type stops at its quota, MegaDef.weight). */
const MEGA_DRAWS = 2_000;
/** Rings searched round a draw for a planetless star that can host the type; wider for rare hosts. */
const SEARCH_RINGS = 12;
const RARE_RINGS = 30;
/** Hexes kept between two sites. */
const SPACING = 300;
/** Hexes kept clear round where empires start (homes are 60–260 ly out, plus a search margin). */
export const START_CLEARANCE = 600;

/** What building the list needs from the galaxy: its seed, its stars without megastructures, and density sampling. */
export interface SiteSource {
  readonly seed: number;
  rawStarAt(h: Hex): StarSystem | null;
  sampleDensity(count: number, rng: Rng): Array<{ x: number; z: number }>;
  /** Where empires start (the original home). */
  readonly start: Hex;
}

export function buildMegaSites(src: SiteSource): MegaSite[] {
  const rng = new Rng(hashSeed(src.seed, 'megastructures'));
  const sites: MegaSite[] = [];
  const used = new Set<string>();
  const left = new Map(MEGASTRUCTURES.map((m) => [m.id, m.weight]));
  for (let i = 0; i < MEGA_DRAWS && [...left.values()].some((n) => n > 0); i++) {
    const [p] = src.sampleDensity(1, rng);
    // The type first, by what is left of each quota (so types with rare hosts still get theirs),
    // then the nearest planetless star that can host it. Every draw takes its rolls whether or
    // not it yields a site, so the list is stable.
    const type = rng.weighted(MEGASTRUCTURES.map((m) => [m, Math.max(left.get(m.id)!, 0) + 1e-9] as const));
    if (!p) continue;
    const at = worldToHex(p.x, p.z);
    if (hexDistance(at, src.start) < START_CLEARANCE) continue;
    let star: StarSystem | null = null;
    // Hosts outside the common main-sequence classes (remnants, giants, hot stars) are rare: look further.
    const common = type.hosts.includes('main') && (!type.classes || type.classes.some((c) => c === 'G' || c === 'K' || c === 'M'));
    const rings = common ? SEARCH_RINGS : RARE_RINGS;
    for (let k = 0; k <= rings && !star; k++) {
      for (const h of hexRing(at, k)) {
        const s = src.rawStarAt(h);
        if (s && s.planetCount === 0 && s.kind !== 'smbh' && !used.has(s.id) && hostsStar(type, s.kind ?? 'main', s.spectral)) { star = s; break; }
      }
    }
    if (!star || sites.some((x) => hexDistance(x.hex, star!.hex) < SPACING)) continue;
    used.add(star.id);
    sites.push({ starId: star.id, hex: star.hex, type: type.id });
    left.set(type.id, left.get(type.id)! - 1);
  }
  return sites;
}
