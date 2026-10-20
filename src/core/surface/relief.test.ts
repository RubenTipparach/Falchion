import { describe, expect, it } from 'vitest';
import { PLANET_LOOKS } from '../../content/planetLooks';
import { CRATER_LAYERS, canyonCut, craterLayer, craters, lockedEye, volcanoes } from './Relief';
import { rawHeight, surfaceLookOf } from './Terrain';

/** Even-ish directions over the sphere (a Fibonacci spiral). */
const dirs = (n: number): [number, number, number][] =>
  Array.from({ length: n }, (_, i) => {
    const y = 1 - (2 * (i + 0.5)) / n, r = Math.sqrt(1 - y * y), t = i * 2.399963;
    return [r * Math.cos(t), y, r * Math.sin(t)];
  });

describe('relief landforms (change planet-audit)', () => {
  it('craters dig bowls below the ground and raise rims, the same every time', () => {
    const look = surfaceLookOf(PLANET_LOOKS.barren, 7);
    const hs = dirs(4000).map(([x, y, z]) => craters(x * look.detail + look.seed[0], y * look.detail + look.seed[1], z * look.detail + look.seed[2], 7));
    expect(Math.min(...hs)).toBeLessThan(-0.15);
    expect(Math.max(...hs)).toBeGreaterThan(0.02);
    // Most of a barren world lies in or round a crater.
    expect(hs.filter((h) => h !== 0).length / hs.length).toBeGreaterThan(0.5);
    expect(craters(1.5, 2.5, 3.5, 7)).toBe(craters(1.5, 2.5, 3.5, 7));
  });

  it('searching only the cells a crater can reach changes nothing (change surface-perf)', () => {
    let n = 0;
    for (const [scale, salt, density] of CRATER_LAYERS) {
      for (const [x, y, z] of dirs(3000)) {
        const p = [x * 3.7 * scale + 5.1, y * 3.7 * scale - 2.3, z * 3.7 * scale + 8.9] as const;
        expect(craterLayer(...p, salt, density)).toBe(craterLayer(...p, salt, density, true));
        if (craterLayer(...p, salt, density) !== 0) n++;
      }
    }
    expect(n).toBeGreaterThan(3000);
  });

  it('canyons cut 0..1, and a canyon world is cut across far more of its surface', () => {
    const share = (s: number) => {
      const cuts = dirs(3000).map(([x, y, z]) => canyonCut(x * 2.4 + 3, y * 2.4 - 5, z * 2.4 + 9, s));
      expect(Math.min(...cuts)).toBeGreaterThanOrEqual(0);
      expect(Math.max(...cuts)).toBeLessThanOrEqual(1);
      return cuts.filter((c) => c > 0.3).length / cuts.length;
    };
    expect(share(1.6)).toBeGreaterThan(share(0.4) * 1.5);
  });

  it('volcanoes stand on a volcanic world as whole cones, with lava at the summits', () => {
    const look = surfaceLookOf(PLANET_LOOKS.volcanic, 12345);
    const v = dirs(6000).map(([x, y, z]) => volcanoes(x * look.detail + look.seed[0], y * look.detail + look.seed[1], z * look.detail + look.seed[2], ...look.seed, look.detail));
    const on = v.filter(([h]) => h > 0.05).length / v.length;
    expect(on).toBeGreaterThan(0.15);
    expect(on).toBeLessThan(0.6);
    expect(Math.max(...v.map(([h]) => h))).toBeGreaterThan(0.5);
    expect(v.some(([, lava]) => lava > 0.7)).toBe(true);
    // Only volcanic worlds raise them.
    const barren = surfaceLookOf(PLANET_LOOKS.barren, 12345);
    expect(barren.volcanoes).toBe(false);
  });

  it("a locked world's sea fills the sunward basin at +x", () => {
    expect(lockedEye(1, 0, 0.6)).toBe(1);
    expect(lockedEye(-1, 0, 0.6)).toBe(0);
    const look = surfaceLookOf(PLANET_LOOKS.eyeball, 3);
    expect(look.locked).toBeDefined();
    const sun = rawHeight(look, 1, 0, 0), night = rawHeight(look, -1, 0, 0);
    expect(sun).toBeLessThan(look.sea);
    expect(night).toBeGreaterThan(sun);
  });
});
