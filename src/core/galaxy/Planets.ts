import { BASE_BIOMES, REFINEMENTS, type RefineContext } from '../../content/biomes';
import { MEGA_BY_ID } from '../../content/megastructures';
import { Rng, hashSeed } from '../rng/Rng';
import { kindOf, type StarSystem } from './GalaxyModel';

export interface Planet {
  readonly id: string;
  readonly starId: string;
  readonly index: number;
  readonly name: string;
  readonly biome: string;
  readonly size: number;
}

const NUMERALS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX'];

/**
 * Planets are derived on demand from the star, never stored. The first roll (biome, size) is the
 * original one and never changes; a second roll of its own may refine the biome into a newer type
 * (change worlds-and-stars), so an existing world only changes if it is refined.
 */
export function planetsOf(star: StarSystem, galaxySeed: number): Planet[] {
  // A megastructure system (change megastructures): the structure is its one world.
  if (star.megastructure) return [{ id: `${star.id}/0`, starId: star.id, index: 0, name: `${star.name} ${MEGA_BY_ID[star.megastructure].name}`, biome: star.megastructure, size: 5 }];
  const rng = new Rng(hashSeed(galaxySeed, 'planets', star.id));
  const weights = BASE_BIOMES.map((b) => [b.id, b.weight] as const);
  return Array.from({ length: star.planetCount }, (_, i) => {
    const base = rng.weighted(weights);
    const size = rng.int(1, 5);
    const id = `${star.id}/${i}`;
    return {
      id, starId: star.id, index: i, name: `${star.name} ${NUMERALS[i]}`, size,
      biome: refineBiome(base, { starKind: kindOf(star), spectral: star.spectral, index: i, count: star.planetCount }, hashSeed(galaxySeed, 'refine', id)),
    };
  });
}

/** The first matching refinement whose chance comes up, or the base biome. */
export function refineBiome(base: string, ctx: RefineContext, seed: number): string {
  const rng = new Rng(seed);
  for (const r of REFINEMENTS) {
    // Every rule draws, matching or not, so adding a rule later only shifts rolls after it.
    const roll = rng.next();
    if (r.from.includes(base) && roll < r.chance(ctx)) return r.to;
  }
  return base;
}

/** A planet with a fixed biome (a colony keeps the type it was settled as; city-world capitals). */
export function withBiome<P extends Planet>(planet: P, biome: string | undefined): P {
  return biome && biome !== planet.biome ? { ...planet, biome } : planet;
}

/** What a choir world's machines broadcast (the same fragment for everyone). */
export function broadcastOf(planet: Pick<Planet, 'id'>, fragments: readonly string[]): string {
  return fragments[new Rng(hashSeed(planet.id, 'choir')).int(0, fragments.length - 1)];
}
