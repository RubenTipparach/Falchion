import { describe, expect, it } from 'vitest';
import { hex, hexSpiral, worldToHex } from '../hex/Hex';
import { Rng } from '../rng/Rng';
import { CORE_OUTER, DEFAULT_GALAXY, GalaxyModel, coreShape } from './GalaxyModel';
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

describe('galactic core', () => {
  const galaxy = new GalaxyModel();
  const { bulgeRadius, pitch, arms, radius } = galaxy.params;
  const noise = (galaxy as unknown as { valueNoise(x: number, y: number): number }).valueNoise.bind(galaxy);
  const smooth = (e0: number, e1: number, x: number) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
  // The density formula from before the core existed (round bulge, arms to the centre).
  const before = (x: number, z: number) => {
    const r = Math.hypot(x, z);
    if (r >= radius) return 0;
    const phase = arms * (Math.atan2(z, x) - Math.log(Math.max(r, 1) / 1_500) / Math.tan(pitch));
    const arm = (0.5 + 0.5 * Math.cos(phase)) ** 3;
    const v = Math.exp(-((r / bulgeRadius) ** 2)) + Math.exp(-r / 14_000) * (0.07 + 0.93 * arm) * (1 - smooth(radius * 0.8, radius, r)) * (0.75 + 0.5 * noise(x / 900, z / 900));
    return Math.min(1, Math.max(0, v));
  };

  it('leaves the disc beyond the core exactly as it was, so saved homes keep their stars', () => {
    for (let i = 0; i < 300; i++) {
      const a = i * 0.731, r = bulgeRadius * CORE_OUTER + 1 + i * 100;
      const x = r * Math.cos(a), z = r * Math.sin(a);
      expect(galaxy.density(x, z)).toBe(before(x, z));
    }
  });

  it('has a bright oval core with no spiral winding into the centre', () => {
    // Around a small circle the density barely varies (no arms), and the core is bright.
    const ring = Array.from({ length: 72 }, (_, i) => galaxy.density(bulgeRadius * 0.3 * Math.cos(i / 11.46), bulgeRadius * 0.3 * Math.sin(i / 11.46)));
    expect(Math.min(...ring)).toBeGreaterThan(0.85);
    // Oval: brighter along its long axis than across it, at the same distance.
    const axis = Math.log((bulgeRadius * 1.15) / 1_500) / Math.tan(pitch);
    const onAxis = coreShape(bulgeRadius * Math.cos(axis), bulgeRadius * Math.sin(axis), bulgeRadius, bulgeRadius, pitch);
    const across = coreShape(-bulgeRadius * Math.sin(axis), bulgeRadius * Math.cos(axis), bulgeRadius, bulgeRadius, pitch);
    expect(onAxis.oval).toBeGreaterThan(across.oval * 1.5);
    expect(onAxis.armFade).toBeLessThan(1);
  });
});
