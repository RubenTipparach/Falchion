import { describe, expect, it } from 'vitest';
import { faceOf, floraWindow, listCells, rnd } from './floraCells';

describe('flora cells on the CPU (change surface-perf)', () => {
  it('numbers the cube faces as the shader does', () => {
    const faces = ([[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]] as const).map((d) => floraWindow(d, 0.01, 10).face);
    expect(faces).toEqual([1, 0, 3, 2, 5, 4]);
    expect(faceOf([0.2, 0.9, 0.1]).n).toEqual([0, 1, 0]);
  });

  it('hashes like the shader: deterministic, uniform and different per roll', () => {
    expect(rnd(5, 7, 11, 1)).toBe(rnd(5, 7, 11, 1));
    expect(rnd(5, 7, 11, 1)).not.toBe(rnd(5, 7, 11, 2));
    // Negative cells wrap to unsigned, as uvec3(ivec3(...)) does.
    expect(rnd(-3 >>> 0, 4, 9, 1)).toBeGreaterThanOrEqual(0);
    const xs = Array.from({ length: 4000 }, (_, i) => rnd(i, i * 3, 977, 1));
    const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
    expect(mean).toBeGreaterThan(0.47);
    expect(mean).toBeLessThan(0.53);
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...xs)).toBeLessThan(1);
  });

  it('lists each cell for at most one kind, and only cells whose growth roll is under the fill', () => {
    const k = 40, entries = [{ lo: 0, hi: 0.3 }, { lo: 0.3, hi: 1 }];
    const out = entries.map(() => new Float32Array((k + 2) ** 2 * 3));
    const win = floraWindow([0.3, 0.8, 0.52], 0.0012, k);
    const counts = listCells(win, k, 11, 0.5, entries, out);
    const total = counts[0] + counts[1];
    // About half the window (the fill), shared about 30:70.
    expect(total / (k + 2) ** 2).toBeGreaterThan(0.4);
    expect(total / (k + 2) ** 2).toBeLessThan(0.6);
    expect(counts[0] / total).toBeGreaterThan(0.2);
    expect(counts[0] / total).toBeLessThan(0.4);
    const seen = new Set<string>();
    out.forEach((a, e) => { for (let i = 0; i < counts[e]; i++) { const key = `${a[i * 3]},${a[i * 3 + 1]}`; expect(seen.has(key)).toBe(false); seen.add(key); expect(a[i * 3 + 2]).toBe(win.face); } });
  });
});
