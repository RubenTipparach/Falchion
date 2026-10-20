import { describe, expect, it } from 'vitest';
import { GalaxyModel } from '../galaxy/GalaxyModel';
import { hexDistance, worldToHex } from '../hex/Hex';
import { planSurvey } from './Survey';

describe('survey route', () => {
  const galaxy = new GalaxyModel();
  const from = worldToHex(-15_000, 20_000);

  it('chains the nearest acceptable systems, without repeats, deterministically', () => {
    const route = planSurvey(galaxy, from, 3, (s) => s.planetCount > 0);
    expect(route).toHaveLength(3);
    expect(new Set(route.map((s) => s.id)).size).toBe(3);
    expect(planSurvey(galaxy, from, 3, (s) => s.planetCount > 0)).toEqual(route);
    // Each stop is the nearest acceptable system to the previous one.
    const first = planSurvey(galaxy, route[0].hex, 1, (s) => s.planetCount > 0 && s.id !== route[0].id && hexDistance(s.hex, from) > 0)[0];
    expect(hexDistance(route[0].hex, route[1].hex)).toBeLessThanOrEqual(hexDistance(route[0].hex, first.hex));
  });

  it('skips systems the test rejects and stops when nothing is in reach', () => {
    const route = planSurvey(galaxy, from, 3, (s) => s.planetCount > 0);
    const without = planSurvey(galaxy, from, 3, (s) => s.planetCount > 0 && s.id !== route[0].id);
    expect(without.map((s) => s.id)).not.toContain(route[0].id);
    expect(planSurvey(galaxy, from, 3, () => false)).toEqual([]);
  });
});
