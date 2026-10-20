import { describe, expect, it } from 'vitest';
import { GalaxyModel } from './GalaxyModel';
import { fieldLeft, fieldsOf, homeBelt, REFILL_YEARS, yearsToFull } from './Asteroids';
import { applyEffects, EMPTY_WORLD } from '../world/SharedWorld';

const galaxy = new GalaxyModel();
const seed = galaxy.params.seed;
const stars = Array.from({ length: 400 }, (_, i) => galaxy.nearestStar({ q: -14697 + i * 7, r: 20078 - i * 3 }, 20)).filter((s) => !!s);

describe('asteroid fields', () => {
  it('are the same for everyone: 0 to 3 per system, one resource each, metals the most common', () => {
    const all = stars.flatMap((s) => fieldsOf(s, seed));
    for (const s of stars) {
      expect(fieldsOf(s, seed)).toEqual(fieldsOf(s, seed));
      expect(fieldsOf(s, seed).length).toBeLessThanOrEqual(3);
    }
    const count = (r: string) => all.filter((f) => f.resource === r).length;
    expect(count('metals')).toBeGreaterThan(count('gases'));
    expect(count('gases')).toBeGreaterThan(count('crystals'));
    expect(count('crystals')).toBeGreaterThan(0);
    expect(stars.some((s) => fieldsOf(s, seed).length === 0)).toBe(true);
  });

  it('a home always has metals and gases to mine', () => {
    expect(homeBelt(stars[0]).map((f) => f.resource)).toEqual(['metals', 'gases']);
  });

  it('a mined field refills to full over 24 hours of world years', () => {
    const field = homeBelt(stars[0])[0];
    expect(fieldLeft(field, undefined, 100)).toBe(field.capacity);
    const world = applyEffects(EMPTY_WORLD, [{ kind: 'mined', field, amount: field.capacity, year: 100 }]);
    const state = world.asteroids[field.id];
    expect(fieldLeft(field, state, 100)).toBe(0);
    expect(fieldLeft(field, state, 100 + REFILL_YEARS / 2)).toBe(field.capacity / 2);
    expect(fieldLeft(field, state, 100 + REFILL_YEARS)).toBe(field.capacity);
    expect(yearsToFull(field, state, 100)).toBe(REFILL_YEARS);
    expect(REFILL_YEARS).toBe(24 * 60);
  });

  it('miners drawing on the same field share it: it never goes below empty', () => {
    const field = homeBelt(stars[0])[1];
    const w = applyEffects(EMPTY_WORLD, [
      { kind: 'mined', field, amount: 700, year: 10 },
      { kind: 'mined', field, amount: 700, year: 10 },
    ]);
    expect(w.asteroids[field.id]).toEqual({ left: 0, at: 10 });
  });
});
