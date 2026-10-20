import { describe, expect, it } from 'vitest';
import { PLANET_LOOKS } from '../../content/planetLooks';
import { bakeFace, radiusOfHeight, shapedHeight } from './GlobeBake';
import { surfaceLookOf } from './Terrain';

describe('the globe bake (change surface-perf)', () => {
  const look = surfaceLookOf(PLANET_LOOKS.terran, 1234);
  it('bakes a face whose vertices stand on the ground and whose normals point out', () => {
    const f = bakeFace({ look, plateaus: [], pit: null, cells: 8, face: 2, amp: 0.02 });
    expect(f.height.length).toBe(81);
    expect(f.index.length).toBe(8 * 8 * 6);
    for (let i = 0; i < 81; i++) {
      const x = f.position[i * 3], y = f.position[i * 3 + 1], z = f.position[i * 3 + 2];
      const r = Math.hypot(x, y, z);
      expect(r).toBeCloseTo(radiusOfHeight(look, shapedHeight(look, [], null, x / r, y / r, z / r), 0.02), 5);
      expect(x * f.normal[i * 3] + y * f.normal[i * 3 + 1] + z * f.normal[i * 3 + 2]).toBeGreaterThan(0);
    }
  });

  it('flattens a plateau and digs the pit', () => {
    const dir = [0, 0, 1] as const;
    expect(shapedHeight(look, [{ dir, flatIn: 0.05, flatOut: 0.1, level: 0.42 }], null, 0, 0, 1)).toBeCloseTo(0.42, 6);
    expect(shapedHeight(look, [], { dir, radius: 0.01, depth: 0.05 }, 0, 0, 1)).toBeLessThan(shapedHeight(look, [], null, 0, 0, 1));
  });
});
