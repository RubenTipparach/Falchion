import { describe, expect, it } from 'vitest';
import { MEGASTRUCTURES, MEGA_BY_ID, hostsStar } from '../../content/megastructures';
import { BIOME_SCIENCE, BIOME_YIELDS } from '../../content/resources';
import { BIOMES, settleable } from '../../content/biomes';
import { hexDistance } from '../hex/Hex';
import { fieldsOf } from './Asteroids';
import { GalaxyModel, kindOf } from './GalaxyModel';
import { START_CLEARANCE } from './Megastructures';
import { planetsOf } from './Planets';

const g = new GalaxyModel();
const sites = g.megastructures();

describe('megastructures (change megastructures)', () => {
  it('are a few hundred, every type among them, the same every time', () => {
    expect(sites.length).toBeGreaterThan(150);
    expect(sites.length).toBeLessThan(300);
    for (const m of MEGASTRUCTURES) expect(sites.some((s) => s.type === m.id), m.id).toBe(true);
    expect(new GalaxyModel().megastructures()).toEqual(sites);
  });

  it('stand round stars that can host them, apart, and clear of where empires start', () => {
    const start = g.startHex();
    for (const s of sites) {
      const star = g.starAt(s.hex)!;
      expect(star.megastructure).toBe(s.type);
      expect(hostsStar(MEGA_BY_ID[s.type], kindOf(star), star.spectral)).toBe(true);
      expect(hexDistance(s.hex, start)).toBeGreaterThanOrEqual(START_CLEARANCE);
    }
    expect(new Set(sites.map((s) => s.starId)).size).toBe(sites.length);
  });

  it('hold the star and the structure and nothing else', () => {
    for (const s of sites.slice(0, 40)) {
      const star = g.starAt(s.hex)!;
      const worlds = planetsOf(star, g.params.seed);
      expect(worlds).toHaveLength(1);
      expect(worlds[0].biome).toBe(s.type);
      expect(worlds[0].name).toContain(MEGA_BY_ID[s.type].name);
      expect(fieldsOf(star, g.params.seed)).toEqual([]);
      expect(star.planetCount).toBe(1);
    }
  });

  it('can be surveyed for a great cache, but never settled', () => {
    for (const m of MEGASTRUCTURES) {
      expect(settleable(m.id)).toBe(false);
      expect(BIOMES.find((b) => b.id === m.id)?.megastructure).toBe(true);
      expect(Object.keys(BIOME_YIELDS[m.id] ?? {}).length).toBeGreaterThan(0);
      expect(BIOME_SCIENCE[m.id]).toBeGreaterThan(0);
    }
  });
});
