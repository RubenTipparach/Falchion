import { describe, expect, it } from 'vitest';
import { addHaul, planetCache } from './PlanetCache';

const planet = { id: 'x/1', starId: 'x', index: 1, name: 'X II', biome: 'volcanic', size: 3 };

describe('planet cache', () => {
  it('is deterministic per planet', () => {
    expect(planetCache(planet, 1)).toEqual(planetCache(planet, 1));
  });
  it('scales with the biome yields', () => {
    const c = planetCache(planet, 1);
    expect(c.metals).toBeGreaterThan(0);
    expect(c.crystals).toBeGreaterThan(0);
  });
  it('adds hauls', () => {
    expect(addHaul({ metals: 2 }, { metals: 3, ice: 1 })).toEqual({ metals: 5, ice: 1 });
  });
});
