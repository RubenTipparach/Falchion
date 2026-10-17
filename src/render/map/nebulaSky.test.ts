import { describe, expect, it } from 'vitest';
import { hash01 } from '../../core/rng/Rng';
import { NebulaColor, NebulaField, nebulaSeed } from './nebulaField';
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
      field.sample(x, z, 12, a);
      field.sample(x, z, 12, b);
      expect(a).toEqual(b);
      for (const v of [a.r, a.g, a.b]) expect(v).toBeGreaterThanOrEqual(0);
      for (const v of [a.r, a.g, a.b]) expect(v).toBeLessThanOrEqual(1);
      expect(a.a).toBeGreaterThanOrEqual(0);
      expect(a.a).toBeLessThan(1.05);
    }
  });
});

describe('nebula drift', () => {
  const field = new NebulaField(SEED);

  it('drifts subtly: barely changed after a few seconds, more over minutes', () => {
    const a: NebulaColor = { r: 0, g: 0, b: 0, a: 0 }, b: NebulaColor = { r: 0, g: 0, b: 0, a: 0 };
    // Points inside the large clouds (outside them there is nothing to drift).
    const inside: Array<[number, number]> = [];
    for (let i = 0; inside.length < 200 && i < 20000; i++) {
      const x = (i % 141) * 53 - 3000, z = Math.floor(i / 141) * 61 - 3000;
      if (field.sample(x, z, 0, a).a > 0.3) inside.push([x, z]);
    }
    expect(inside.length).toBe(200);
    let minute = 0, hour = 0;
    for (const [x, z] of inside) {
      field.sample(x, z, 0, a);
      field.sample(x, z, 2, b);
      minute += Math.abs(a.a - b.a);
      field.sample(x, z, 300, b);
      hour += Math.abs(a.a - b.a);
    }
    expect(minute / 200).toBeLessThan(0.02); // two seconds
    expect(hour / 200).toBeGreaterThan(minute / 200);
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

  it('stays a dark starfield out in empty space', () => {
    // Find a point with no cloud around it on the map, and one inside a cloud.
    const s: NebulaColor = { r: 0, g: 0, b: 0, a: 0 };
    let empty: [number, number] | null = null, full: [number, number] | null = null;
    for (let i = 0; i < 4000 && !(empty && full); i++) {
      const x = (i % 63) * 97 - 3000, z = Math.floor(i / 63) * 89 - 3000;
      field.sample(x, z, 0, s);
      if (!empty && s.a < 0.05) empty = [x, z];
      if (!full && s.a > 0.6) full = [x, z];
    }
    const lumOf = (sky: Float32Array) => { let l = 0; for (let i = 0; i < sky.length; i += 3) l += 0.3 * sky[i] + 0.55 * sky[i + 1] + 0.15 * sky[i + 2]; return l / (sky.length / 3); };
    const dark = lumOf(paint('empty', empty![0], empty![1]));
    const lit = lumOf(paint('full', full![0], full![1]));
    expect(dark).toBeLessThan(0.06);
    expect(lit).toBeGreaterThan(dark * 3);
  });

  it('never paints black inside a cloud, and the plane is brighter than the poles', () => {
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
    // The large layer sets hue over thousands of ly, so search a wide area.
    for (let i = 0; i < 1600 && spots.length < 2; i++) {
      const x = (i % 40) * 1877 - 37000, z = Math.floor(i / 40) * 1913 - 37000;
      field.sample(x, z, 0, s);
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

describe('nebula follows the spiral arms', () => {
  it('is richer along the arms than in the gaps, sparse in the core and gone past the rim', async () => {
    const { armPresence } = await import('./nebulaField');
    const ring = Array.from({ length: 360 }, (_, i) => armPresence(18_000 * Math.cos(i / 57.3), 18_000 * Math.sin(i / 57.3)));
    expect(Math.max(...ring)).toBeGreaterThan(0.9);
    expect(Math.min(...ring)).toBeLessThan(0.2);
    expect(armPresence(0, 0)).toBeLessThan(0.35);
    expect(armPresence(40_000, 0)).toBe(0);
  });
});
