import { describe, expect, it } from 'vitest';
import { populationOf } from './Population';

describe('population', () => {
  it('is a whole number, at least 1', () => {
    expect(populationOf({})).toBe(1);
    expect(populationOf({ pop: 9 })).toBe(9);
    expect(populationOf({ pop: 4.7 })).toBe(4);
    expect(populationOf({ pop: 0 })).toBe(1);
    expect(populationOf({ pop: -3 })).toBe(1);
  });
});
