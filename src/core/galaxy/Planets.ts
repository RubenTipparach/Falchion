import { BIOMES } from '../../content/biomes';
import { Rng, hashSeed } from '../rng/Rng';
import type { StarSystem } from './GalaxyModel';

export interface Planet {
  readonly id: string;
  readonly starId: string;
  readonly index: number;
  readonly name: string;
  readonly biome: string;
  readonly size: number;
}

const NUMERALS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX'];

/** Planets are derived on demand from the star, never stored. */
export function planetsOf(star: StarSystem, galaxySeed: number): Planet[] {
  const rng = new Rng(hashSeed(galaxySeed, 'planets', star.id));
  const weights = BIOMES.map((b) => [b.id, b.weight] as const);
  return Array.from({ length: star.planetCount }, (_, i) => ({
    id: `${star.id}/${i}`,
    starId: star.id,
    index: i,
    name: `${star.name} ${NUMERALS[i]}`,
    biome: rng.weighted(weights),
    size: rng.int(1, 5),
  }));
}
