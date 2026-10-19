import { describe, expect, it } from 'vitest';
import { MEGA_SURFACE_TYPES, citiesNear, groundHeight, hasMegaSurface, megaGround, octavesAt, onHabitatLand, rawHeight } from './MegaGround';

describe('megastructure ground (change mega-surfaces)', () => {
  it('is the same for everyone', () => {
    for (const t of MEGA_SURFACE_TYPES) {
      const a = megaGround(t, 1234), b = megaGround(t, 1234);
      expect(a).toEqual(b);
      expect(groundHeight(a, 120, -40, 9)).toBe(groundHeight(b, 120, -40, 9));
    }
  });

  it('lands on dry land, in the capital', () => {
    for (const t of MEGA_SURFACE_TYPES) {
      for (const seed of [1, 2, 3, 99, 4242]) {
        const def = megaGround(t, seed);
        expect(rawHeight(def, 0, 0, 7)).toBeGreaterThan(0);
        const cities = citiesNear(def, 0, 0, def.cityCellKm * 2);
        expect(cities.some((c) => c.x === 0 && c.z === 0)).toBe(true);
      }
    }
  });

  it('puts cities on land, flattened to their level', () => {
    const def = megaGround('ringworld', 7);
    const cities = citiesNear(def, 0, 0, 3000);
    expect(cities.length).toBeGreaterThan(5);
    for (const c of cities) {
      expect(c.level).toBeGreaterThan(0);
      expect(groundHeight(def, c.x, c.z, 9, cities)).toBeCloseTo(c.level, 6);
    }
  });

  it('adds detail closer in', () => {
    const def = megaGround('dyson-sphere', 5);
    expect(octavesAt(def, 0.05)).toBeGreaterThan(octavesAt(def, 5));
    expect(octavesAt(def, 5)).toBeGreaterThan(octavesAt(def, 500));
    expect(octavesAt(def, 1e9)).toBe(1);
  });

  it('a habitat has three land strips, the landing site on one, its cities clear of the windows', () => {
    const def = megaGround('dyson-swarm', 11);
    const c = 2 * Math.PI * def.radiusKm;
    expect(onHabitatLand(def, 0)).toBe(true);
    expect(onHabitatLand(def, c / 6)).toBe(false);
    expect(onHabitatLand(def, c / 3)).toBe(true);
    const land = Array.from({ length: 600 }, (_, i) => onHabitatLand(def, (i / 600) * c)).filter(Boolean).length;
    expect(land).toBeGreaterThan(280);
    expect(land).toBeLessThan(320);
    for (const city of citiesNear(def, 0, 0, 40)) expect(onHabitatLand(def, city.x)).toBe(true);
  });

  it('knows which structures can be landed on', () => {
    expect(hasMegaSurface('ringworld')).toBe(true);
    expect(hasMegaSurface('matrioshka-brain')).toBe(false);
  });
});
