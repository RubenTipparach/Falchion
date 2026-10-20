import { describe, expect, it } from 'vitest';
import { planetLayout } from '../planetLayouts';
import { CityLife } from './CityLife';
import { FULL_QUALITY, SurfaceTerrain } from './SurfaceTerrain';

describe('city life (change city-life)', () => {
  const colony = { owner: 'own' as const, name: 'Aurelia', capital: true, size: 4, pop: 9, buildings: ['shipyard', 'farm', 'mine'] };
  const { look, layout } = planetLayout({ id: 'life:terran/2', biome: 'terran' }, colony);
  const terrain = new SurfaceTerrain(look, layout.settlements, FULL_QUALITY, null);

  it('fills a capital with traffic, people, lamps, sky cars and shuttles, the same every time', () => {
    const a = new CityLife(layout, terrain, false), b = new CityLife(layout, terrain, false);
    expect(a.counts).toEqual(b.counts);
    expect(a.counts.car).toBeGreaterThan(300);
    expect(a.counts.person).toBeGreaterThan(500);
    expect(a.counts.lamp).toBeGreaterThan(500);
    expect(a.counts.flyer).toBeGreaterThan(50);
    expect(a.counts.shuttle).toBeGreaterThan(3);
    // Phones get a lighter city.
    const lite = new CityLife(layout, terrain, true);
    expect(lite.counts.car).toBeLessThan(a.counts.car * 0.7);
  });

  it('keeps every street car inside its city', () => {
    const life = new CityLife(layout, terrain, false);
    const mesh = life.group.children[0] as unknown as { geometry: { getAttribute(n: string): { array: Float32Array; count: number } } };
    const path = mesh.geometry.getAttribute('aPath'), aux = mesh.geometry.getAttribute('aAux');
    const R = Math.max(...layout.settlements.map((s) => s.radius));
    for (let i = 0; i < path.count; i++) {
      const [mode, , off, L] = path.array.slice(i * 4, i * 4 + 4);
      if (mode !== 0) continue;
      const mid = aux.array[i * 4];
      expect(Math.hypot(Math.abs(mid) + L, off)).toBeLessThan(R * 1.01);
    }
  });
});
