import { describe, expect, it } from 'vitest';
import { hex, hexSpiral, worldToHex } from '../hex/Hex';
import { Rng } from '../rng/Rng';
import { DEFAULT_GALAXY, GalaxyModel } from './GalaxyModel';
import { planetsOf } from './Planets';

const galaxy = new GalaxyModel();

function countStars(cx: number, cz: number, radius: number): number {
  return hexSpiral(worldToHex(cx, cz), radius).filter((h) => galaxy.starAt(h)).length;
}

describe('GalaxyModel', () => {
  it('is ~70,000 ly across', () => {
    expect(DEFAULT_GALAXY.radius * 2).toBe(70_000);
  });

  it('generates the same star for the same seed and hex', () => {
    let found = 0;
    for (const h of hexSpiral(hex(800, -300), 20)) {
      const a = galaxy.starAt(h);
      expect(a).toEqual(galaxy.starAt(h));
      if (a) found++;
    }
    expect(found).toBeGreaterThan(0);
  });

  it('has no stars outside the rim', () => {
    for (const h of hexSpiral(worldToHex(36_000, 0), 10)) expect(galaxy.starAt(h)).toBeNull();
  });

  it('spiral arms are denser than the gaps at the same radius', () => {
    const r = 10_000;
    let best = { d: -1, a: 0 }, worst = { d: 2, a: 0 };
    for (let i = 0; i < 360; i++) {
      const a = (i / 360) * Math.PI * 2;
      const d = galaxy.density(r * Math.cos(a), r * Math.sin(a));
      if (d > best.d) best = { d, a };
      if (d < worst.d) worst = { d, a };
    }
    const arm = countStars(r * Math.cos(best.a), r * Math.sin(best.a), 25);
    const gap = countStars(r * Math.cos(worst.a), r * Math.sin(worst.a), 25);
    expect(arm).toBeGreaterThan(gap);
  });

  it('places every star on the flat plane (elevation 0)', () => {
    for (const h of hexSpiral(hex(0, 0), 15)) {
      const s = galaxy.starAt(h);
      if (s) expect(s.position.y).toBe(0);
    }
  });

  it('samples density deterministically', () => {
    expect(galaxy.sampleDensity(50, new Rng(1))).toEqual(galaxy.sampleDensity(50, new Rng(1)));
  });

  it('derives planets deterministically', () => {
    const star = hexSpiral(hex(0, 0), 20).map((h) => galaxy.starAt(h)).find((s) => s && s.planetCount > 0)!;
    expect(planetsOf(star, 1)).toEqual(planetsOf(star, 1));
    expect(planetsOf(star, 1).length).toBe(star.planetCount);
  });

  it('finds the nearest star deterministically', () => {
    const s = galaxy.nearestStar(worldToHex(15_000, 3_000), 80);
    expect(s).not.toBeNull();
    expect(galaxy.nearestStar(worldToHex(15_000, 3_000), 80)).toEqual(s);
  });
});
