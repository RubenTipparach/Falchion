import { hexDistance, hexRing, type Hex } from '../hex/Hex';
import { kindOf, type GalaxyModel, type SpectralClass, type StarKind, type StarSystem } from './GalaxyModel';
import type { Planet } from './Planets';

/**
 * Galaxy search (change galaxy-search). Stars and planets are pure functions of the seed and the
 * hex, and a hash cannot be run backwards (no formula turns "an ocean world" into the hexes that
 * hold one), so the search walks hex rings outward from an origin and tests each star it meets:
 * nearest first, about three million hexes a second, stopping at a result limit or a radius and
 * resumable from the next hex.
 */

/** How far a planet is along: not yet surveyed, surveyed, or someone's colony. */
export type PlanetStatus = 'unsurveyed' | 'surveyed' | 'settled';

export interface SearchQuery {
  /** Stars or planets. */
  readonly what: 'stars' | 'planets';
  /** Part of a star's or planet's name, any case. */
  readonly text?: string;
  /** Star kinds to keep (empty: any). */
  readonly kinds?: readonly StarKind[];
  /** Main-sequence spectral classes to keep (empty: any). */
  readonly spectral?: readonly SpectralClass[];
  /** Planet types to keep (empty: any). Planets only. */
  readonly biomes?: readonly string[];
  /** Planets only: 'free' is anything not settled. */
  readonly status?: PlanetStatus | 'free' | 'any';
}

export interface SearchHit {
  readonly star: StarSystem;
  /** The planet, when searching planets. */
  readonly planet?: Planet;
  /** Hex distance from the origin, in light years. */
  readonly distance: number;
}

export interface ScanContext {
  /** A star's planets as the empire sees them (colonies keep the type they were settled as). */
  planetsOf(star: StarSystem): readonly Planet[];
  statusOf(planet: Planet): PlanetStatus;
}

/** Does a star pass the star filters (kind, class, and its name when searching stars)? */
export function starMatches(star: StarSystem, q: SearchQuery): boolean {
  if (q.kinds?.length && !q.kinds.includes(kindOf(star))) return false;
  if (q.spectral?.length && !(kindOf(star) === 'main' && q.spectral.includes(star.spectral))) return false;
  if (q.what === 'stars' && q.text && !star.name.toLowerCase().includes(q.text.trim().toLowerCase())) return false;
  return true;
}

/** Does a planet pass the planet filters (type, status, name)? */
export function planetMatches(planet: Planet, q: SearchQuery, status: PlanetStatus): boolean {
  if (q.biomes?.length && !q.biomes.includes(planet.biome)) return false;
  const want = q.status ?? 'any';
  if (want === 'free' ? status === 'settled' : want !== 'any' && want !== status) return false;
  if (q.text && !planet.name.toLowerCase().includes(q.text.trim().toLowerCase())) return false;
  return true;
}

/** A search in progress: call `step` until `done`, or `extend` it to search further. */
export class GalaxyScan {
  /** The ring being walked (its radius in ly) and the next hex in it. */
  private ring = 0;
  private index = 0;
  private current: Hex[] = [];
  private found = 0;
  /** Hexes looked at and stars met, for the progress line. */
  hexes = 0;
  stars = 0;

  constructor(
    private readonly galaxy: GalaxyModel,
    readonly origin: Hex,
    readonly query: SearchQuery,
    private readonly ctx: ScanContext,
    /** Stop at this many results... */
    private limit = 50,
    /** ...or after this radius (ly). */
    private maxRadius = 1_500,
  ) {
    this.current = [origin];
  }

  /** The radius searched so far (ly): the last ring begun. */
  get radius(): number {
    return Math.max(0, this.index === 0 ? this.ring - 1 : this.ring);
  }

  get done(): boolean {
    return this.found >= this.limit || this.ring > this.maxRadius;
  }

  /** Search further: more results and a wider radius, carrying on from where it stopped. */
  extend(results = 50, radius = 1_500): void {
    this.limit = this.found + results;
    this.maxRadius = Math.max(this.maxRadius, this.ring) + radius;
  }

  /** Look at up to `budget` hexes; the hits found, nearest first. */
  step(budget = 50_000): SearchHit[] {
    const hits: SearchHit[] = [];
    while (budget > 0 && !this.done) {
      if (this.index >= this.current.length) {
        this.ring++;
        this.index = 0;
        this.current = hexRing(this.origin, this.ring);
        continue;
      }
      const h = this.current[this.index++];
      budget--;
      this.hexes++;
      const star = this.galaxy.starAt(h);
      if (!star) continue;
      this.stars++;
      if (!starMatches(star, this.query)) continue;
      const distance = hexDistance(this.origin, h);
      if (this.query.what === 'stars') {
        hits.push({ star, distance });
        this.found++;
        continue;
      }
      for (const planet of this.ctx.planetsOf(star)) {
        if (!planetMatches(planet, this.query, this.ctx.statusOf(planet))) continue;
        hits.push({ star, planet, distance });
        this.found++;
      }
    }
    return hits;
  }
}
