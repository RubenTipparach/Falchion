import { describe, expect, it } from 'vitest';
import { hex, hexDistance, hexLine, hexNeighbors, hexRing, hexSpiral, hexToWorld, worldToHex } from './Hex';

describe('hex math', () => {
  it('every neighbour is 1 ly away, both in steps and in world units', () => {
    const c = hex(3, -7);
    const cw = hexToWorld(c);
    for (const n of hexNeighbors(c)) {
      expect(hexDistance(c, n)).toBe(1);
      const nw = hexToWorld(n);
      expect(Math.hypot(nw.x - cw.x, nw.z - cw.z)).toBeCloseTo(1, 10);
    }
  });

  it('distance is symmetric', () => {
    const a = hex(10, -4);
    const b = hex(-25, 31);
    expect(hexDistance(a, b)).toBe(hexDistance(b, a));
  });

  it('world round trip', () => {
    for (const h of hexSpiral(hex(100, -50), 4)) {
      const w = hexToWorld(h);
      expect(worldToHex(w.x, w.z)).toEqual(h);
    }
  });

  it('line has distance+1 contiguous hexes', () => {
    const a = hex(0, 0);
    const b = hex(17, -9);
    const line = hexLine(a, b);
    expect(line.length).toBe(hexDistance(a, b) + 1);
    for (let i = 1; i < line.length; i++) expect(hexDistance(line[i - 1], line[i])).toBe(1);
  });

  it('spiral size is 3r(r+1)+1', () => {
    expect(hexSpiral(hex(0, 0), 3).length).toBe(37);
  });

  it('ring has 6r hexes all at distance r', () => {
    const c = hex(5, 5);
    const ring = hexRing(c, 4);
    expect(ring.length).toBe(24);
    ring.forEach((h) => expect(hexDistance(c, h)).toBe(4));
  });
});
