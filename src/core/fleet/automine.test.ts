import { describe, expect, it } from 'vitest';
import { GalaxyModel } from '../galaxy/GalaxyModel';
import { hexDistance, hexRing, worldToHex } from '../hex/Hex';
import { DRY_FIELD, minedBy, nearestMine, stockFor } from './AutoMine';

describe('auto-mine search', () => {
  const galaxy = new GalaxyModel();
  const from = worldToHex(-15_000, 20_000);

  it('lists the resources a group mines, once each and in a fixed order', () => {
    const mines = (id: string) => ({ a: 'metals', b: 'gases', c: 'metals' } as const)[id as 'a'];
    expect(minedBy([{ classId: 'c', count: 2 }, { classId: 'b', count: 1 }, { classId: 'a', count: 1 }, { classId: 'x', count: 4 }], mines)).toEqual(['gases', 'metals']);
    expect(minedBy([{ classId: 'a', count: 0 }], mines)).toEqual([]);
  });

  it('counts only fields of the resources that are not mined out', () => {
    const f = (resource: 'metals' | 'gases', left: number) => ({ field: { resource }, left });
    expect(stockFor([f('metals', 100), f('metals', DRY_FIELD - 1), f('gases', 50)], ['metals'])).toBe(100);
    expect(stockFor([f('metals', DRY_FIELD - 1)], ['metals'])).toBe(0);
  });

  it('finds the nearest system with stock, preferring more left at the same distance, deterministically', () => {
    const stock = (s: { hex: { q: number } }) => (Math.abs(s.hex.q) % 3) * 10;
    const found = nearestMine(galaxy, from, stock)!;
    expect(found).toBeTruthy();
    expect(nearestMine(galaxy, from, stock)).toEqual(found);
    const d = hexDistance(from, found.hex);
    // No system nearer has any; at the same distance none has more (ties: the lower id).
    expect(nearestMine(galaxy, from, (s) => (hexDistance(from, s.hex) < d ? stock(s) : 0))).toBeNull();
    for (const h of hexRing(from, d)) {
      const s = galaxy.starAt(h);
      if (!s || s.id === found.id) continue;
      expect(stock(s)).toBeLessThanOrEqual(stock(found));
      if (stock(s) === stock(found)) expect(found.id < s.id).toBe(true);
    }
  });

  it('ignores where it starts and gives up beyond its reach', () => {
    expect(nearestMine(galaxy, from, () => 0)).toBeNull();
    const first = nearestMine(galaxy, from, () => 1)!;
    expect(hexDistance(from, first.hex)).toBeGreaterThan(0);
    expect(nearestMine(galaxy, from, () => 1, hexDistance(from, first.hex) - 1)).toBeNull();
  });
});
