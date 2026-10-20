import { describe, expect, it } from 'vitest';
import { orientation } from '../geometry/orientation';
import { Rng } from '../../core/rng/Rng';
import { rockGeometry } from './AsteroidBelts';
import { BELT_MARGIN, maxRocks, placeBelts, visibleRocks, type OrbitSlot } from './beltLayout';

/** Orbits laid out as SystemLayer does: a first orbit, 0.04 ly apart, a little jitter. */
function orbitsFor(seed: number, count: number, first = 0.06): OrbitSlot[] {
  const rng = new Rng(seed);
  return Array.from({ length: count }, (_, i) => ({
    radius: first + i * 0.04 + rng.range(-0.005, 0.005),
    extent: rng.range(0.004, 0.016) * (rng.chance(0.2) ? 2.3 : 1.2),
  }));
}

describe('asteroid belt layout', () => {
  it('never puts a belt on a planet orbit or over a planet', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const count = seed % 10;
      const orbits = orbitsFor(seed, count);
      const ids = Array.from({ length: 1 + (seed % 5) }, (_, i) => `s${seed}#${i}`);
      const places = placeBelts(orbits, 0.012, 0.06, ids);
      expect(places).toHaveLength(ids.length);
      for (const b of places) {
        expect(b.halfWidth).toBeGreaterThan(0);
        for (const o of orbits) {
          // Clear of the orbit line and of the planet (and its rings), with a margin.
          expect(Math.abs(b.radius - o.radius) - b.halfWidth - o.extent).toBeGreaterThanOrEqual(BELT_MARGIN - 1e-9);
        }
        expect(b.radius - b.halfWidth).toBeGreaterThan(0.012);
      }
      // Belts do not overlap each other.
      const sorted = [...places].sort((a, b) => a.radius - b.radius);
      for (let i = 1; i < sorted.length; i++) expect(sorted[i].radius - sorted[i].halfWidth).toBeGreaterThan(sorted[i - 1].radius + sorted[i - 1].halfWidth);
    }
  });

  it('is the same for the same fields, in any order', () => {
    const orbits = orbitsFor(7, 6);
    const a = placeBelts(orbits, 0.012, 0.06, ['x#0', 'x#1', 'x#home-metals']);
    const b = placeBelts(orbits, 0.012, 0.06, ['x#home-metals', 'x#0', 'x#1']);
    expect(b).toEqual([a[2], a[0], a[1]]);
  });

  it('shows rocks in proportion to what the field has left', () => {
    const max = maxRocks('metals', 2400);
    expect(max).toBeLessThanOrEqual(400);
    expect(visibleRocks(2400, 2400, max)).toBe(max);
    expect(visibleRocks(1200, 2400, max)).toBeCloseTo(max * 0.52, -1);
    expect(visibleRocks(0, 2400, max)).toBeGreaterThan(0);
    expect(visibleRocks(0, 2400, max)).toBeLessThan(max * 0.1);
    let last = -1;
    for (let left = 0; left <= 2400; left += 100) {
      const n = visibleRocks(left, 2400, max);
      expect(n).toBeGreaterThanOrEqual(last);
      last = n;
    }
    // Small fields draw fewer rocks; every belt stays a few hundred at most.
    expect(maxRocks('crystals', 150)).toBeLessThan(maxRocks('crystals', 600));
    for (const r of ['metals', 'gases', 'crystals'] as const) expect(maxRocks(r, 100_000)).toBeLessThanOrEqual(400);
  });

  it('rock templates face outward', () => {
    for (const r of ['metals', 'gases', 'crystals'] as const) {
      for (let seed = 1; seed < 20; seed++) {
        const o = orientation(rockGeometry(r, seed));
        expect(o.outward).toBeGreaterThan(0.5);
        expect(o.normals).toBeGreaterThan(0.5);
      }
    }
  });
});
