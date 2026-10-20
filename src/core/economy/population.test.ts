import { describe, expect, it } from 'vitest';
import { DECLINE_PER_POP, growthNeeded, growWorld, popCap, populationOf } from './Population';

/** Years of a world at a fixed food balance (and uncovered shortfall). */
function years(colony: { pop?: number; growth?: number; size?: number }, n: number, balance: number, uncovered = 0) {
  let c = colony;
  for (let i = 0; i < n; i++) c = growWorld(c, balance, uncovered).colony;
  return c;
}

describe('population', () => {
  it('is at least 1, and an unset population is 1', () => {
    expect(populationOf({})).toBe(1);
    expect(populationOf({ pop: 0 })).toBe(1);
    expect(populationOf({ pop: 4.7 })).toBe(4);
  });

  it('grows only from its own surplus: pop 1 with +4 food reaches pop 2 in 3 years', () => {
    expect(years({ pop: 1, size: 4 }, 2, 4).pop ?? 1).toBe(1);
    expect(years({ pop: 1, size: 4 }, 3, 4).pop).toBe(2);
    // Larger populations need more: the next point costs 10 × pop.
    expect(growthNeeded(5)).toBe(50);
  });

  it('a shortfall the stores cover keeps it as it is', () => {
    const c = years({ pop: 3, growth: 7, size: 4 }, 10, -4, 0);
    expect(c).toMatchObject({ pop: 3, growth: 7 });
  });

  it('an uncovered shortfall shrinks it, never below 1', () => {
    // A world of 3 that goes without 6 a year loses a point in a year (at −2 × pop), and another the next.
    expect(years({ pop: 3, size: 4 }, 1, -6, 6).pop).toBe(2);
    expect(years({ pop: 3, size: 4 }, 2, -6, 6).pop).toBe(1);
    expect(years({ pop: 1, size: 4 }, 20, -6, 6).pop).toBe(1);
    expect(DECLINE_PER_POP).toBe(2);
  });

  it('a world that goes hungry does not grow, even from its own surplus', () => {
    expect(years({ pop: 3, growth: 25, size: 4 }, 1, 8, 4)).toMatchObject({ pop: 3, growth: -4 });
  });

  it('stops at the world\'s cap (3 × planet size)', () => {
    expect(popCap({ size: 2 })).toBe(6);
    expect(years({ pop: 6, size: 2 }, 50, 20).pop).toBe(6);
  });
});
