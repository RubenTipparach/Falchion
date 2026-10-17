import { describe, expect, it } from 'vitest';
import { hex, hexDistance } from '../hex/Hex';
import { arrivalTurn, formatTurns, hexAt, planMovement, progressAt, routeIndexAt, travelTurns } from './Fleet';

describe('turn-based fleet movement', () => {
  it('route has distance+1 adjacent hexes', () => {
    const m = planMovement(hex(0, 0), hex(40, -12), 0, 2);
    expect(m.route.length).toBe(hexDistance(hex(0, 0), hex(40, -12)) + 1);
    for (let i = 1; i < m.route.length; i++) expect(hexDistance(m.route[i - 1], m.route[i])).toBe(1);
  });

  it('730 ly at 2 ly/turn takes 365 turns; partial turns round up', () => {
    expect(travelTurns(730, 2)).toBe(365);
    expect(travelTurns(7, 2)).toBe(4);
    expect(formatTurns(365)).toBe('365 turns');
  });

  it('advances exactly `speed` hexes per turn and stops at the destination', () => {
    const m = planMovement(hex(0, 0), hex(9, 0), 10, 2); // 9 ly at 2/turn -> 5 turns
    expect(routeIndexAt(m, 10)).toBe(0);
    expect(routeIndexAt(m, 11)).toBe(2);
    expect(routeIndexAt(m, 14)).toBe(8);
    expect(hexAt(m, 15)).toEqual(hex(9, 0));
    expect(arrivalTurn(m)).toBe(15);
    expect(progressAt(m, 1_000)).toBe(1);
  });

  it('position depends only on whole turns', () => {
    const m = planMovement(hex(0, 0), hex(20, 0), 100, 4); // 5 turns
    expect(hexAt(m, 102.5)).toEqual(hexAt(m, 102));
    expect(routeIndexAt(m, 102)).toBe(8);
    expect(progressAt(m, 0)).toBe(0);
  });

  it('rejects fractional speeds and turns', () => {
    expect(() => planMovement(hex(0, 0), hex(1, 0), 0, 1.5)).toThrow();
    expect(() => planMovement(hex(0, 0), hex(1, 0), 0.5, 1)).toThrow();
  });
});
