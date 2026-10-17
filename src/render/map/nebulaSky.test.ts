import { describe, expect, it } from 'vitest';
import { hash01 } from '../../core/rng/Rng';
import { NebulaColor, NebulaField, nebulaDetail, nebulaSeed } from './nebulaField';
import { NebulaSkyPainter } from './nebulaSky';

const SEED = 1337;

/** Unit directions spread evenly over the sphere (Fibonacci lattice). */
function sphere(n: number): Float32Array {
  const out = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const y = 1 - (2 * (i + 0.5)) / n, r = Math.sqrt(1 - y * y), th = i * 2.399963;
    out.set([r * Math.cos(th), y, r * Math.sin(th)], i * 3);
  }
  return out;
}

const hue = (c: { r: number; g: number; b: number }) => Math.atan2(Math.sqrt(3) * (c.g - c.b), 2 * c.r - c.g - c.b);
const angleBetween = (a: number, b: number) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

describe('NebulaField', () => {
  const field = new NebulaField(SEED);

  it('hashes lattice points like core hash01 (top 24 bits, offset lattice), as the shader does', () => {
    const s = nebulaSeed(SEED);
    expect(s).toBeLessThan(1 << 24);
    for (const [x, y] of [[0, 0], [-3, 7], [160, -151], [5521, -9000]]) expect(field.hash(x, y)).toBe(Math.floor(hash01(s, x + 2 ** 30, y + 2 ** 30) * 2 ** 24) / 2 ** 24);
  });

  it('is deterministic and stays in colour range', () => {
    const a: NebulaColor = { r: 0, g: 0, b: 0, a: 0 }, b: NebulaColor = { r: 0, g: 0, b: 0, a: 0 };
    for (let i = 0; i < 50; i++) {
      const x = (i - 25) * 731.3, z = (i % 7) * -911.7;
      field.sample(x, z, 12, 0, a);
      field.sample(x, z, 12, 0, b);
      expect(a).toEqual(b);
      for (const v of [a.r, a.g, a.b]) expect(v).toBeGreaterThanOrEqual(0);
      for (const v of [a.r, a.g, a.b]) expect(v).toBeLessThanOrEqual(1);
      expect(a.a).toBeGreaterThanOrEqual(0);
      expect(a.a).toBeLessThan(1.05);
    }
  });
});

describe('nebula is one field at every zoom', () => {
  const field = new NebulaField(SEED);

  it("keeps a region's hue whether zoomed out (little detail) or in (full detail)", () => {
    const far: NebulaColor = { r: 0, g: 0, b: 0, a: 0 }, near: NebulaColor = { r: 0, g: 0, b: 0, a: 0 };
    let checked = 0;
    for (let i = 0; i < 300; i++) {
      const x = (i % 17) * 1291 - 11000, z = Math.floor(i / 17) * 1187 - 11000;
      field.sample(x, z, 0, nebulaDetail(20_000), far);
      field.sample(x, z, 0, nebulaDetail(50), near);
      if (far.a < 0.3 || near.a < 0.3) continue;
      checked++;
      expect(angleBetween(hue(far), hue(near))).toBeLessThan(0.35);
    }
    expect(checked).toBeGreaterThan(30);
  });

  it('adds detail as the view zooms in', () => {
    expect(nebulaDetail(50)).toBe(1);
    expect(nebulaDetail(2_000)).toBeLessThan(nebulaDetail(750));
    expect(nebulaDetail(30_000)).toBeCloseTo(0.15);
  });
});

describe('NebulaSkyPainter', () => {
  const field = new NebulaField(SEED);
  const dirs = sphere(4000);
  const painter = new NebulaSkyPainter(field, SEED, dirs);
  const paint = (id: string, x: number, z: number) => painter.paint({ id, x, z }, 0, new Float32Array(dirs.length));

  it('is deterministic per anchor, and varies between stars', () => {
    const a = paint('s1', 100, 200), b = paint('s1', 100, 200), c = paint('s2', 100, 200);
    expect(a).toEqual(b);
    expect(c).not.toEqual(a);
  });

  it('never paints black, and the plane is brighter than the poles', () => {
    const sky = paint('s1', -4000, 2500);
    let plane = 0, poles = 0, np = 0, nq = 0;
    for (let i = 0; i < dirs.length; i += 3) {
      const lum = 0.3 * sky[i] + 0.55 * sky[i + 1] + 0.15 * sky[i + 2];
      expect(lum).toBeGreaterThan(0.02);
      if (Math.abs(dirs[i + 1]) < 0.15) { plane += lum; np++; }
      if (Math.abs(dirs[i + 1]) > 0.9) { poles += lum; nq++; }
    }
    expect(plane / np).toBeGreaterThan(poles / nq);
  });

  it('takes the hue of the map nebula around the anchor', () => {
    // Find two spots whose local map colours differ strongly in hue.
    const s: NebulaColor = { r: 0, g: 0, b: 0, a: 0 };
    const spots: Array<{ x: number; z: number; h: number }> = [];
    for (let i = 0; i < 400 && spots.length < 2; i++) {
      const x = (i % 20) * 977 - 9000, z = Math.floor(i / 20) * 1013 - 9000;
      field.sample(x, z, 0, 1, s);
      if (s.a < 0.4) continue;
      const h = hue(s);
      if (!spots.length || angleBetween(h, spots[0].h) > 1.2) spots.push({ x, z, h });
    }
    expect(spots.length).toBe(2);
    for (const spot of spots) {
      const sky = paint(`at${spot.x},${spot.z}`, spot.x, spot.z);
      const mean = { r: 0, g: 0, b: 0 };
      for (let i = 0; i < sky.length; i += 3) { mean.r += sky[i]; mean.g += sky[i + 1]; mean.b += sky[i + 2]; }
      expect(angleBetween(hue(mean), spot.h)).toBeLessThan(0.6);
    }
  });

  it('paints a 10k-vertex sky quickly', () => {
    const big = sphere(10_242);
    const p = new NebulaSkyPainter(field, SEED, big);
    const out = new Float32Array(big.length);
    p.paint({ id: 'warm', x: 0, z: 0 }, 0, out); // warm up the JIT
    const t0 = performance.now();
    p.paint({ id: 'timed', x: 5000, z: -3000 }, 0, out);
    const ms = performance.now() - t0;
    console.log(`sky paint: ${ms.toFixed(1)} ms`);
    expect(ms).toBeLessThan(250); // generous for slow CI; ~10-30 ms in a browser
  });
});
