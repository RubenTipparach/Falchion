import { describe, expect, it } from 'vitest';
import { hex, hexDistance } from '../hex/Hex';
import { arrivalTurn, formatTurns, hexAt, planMovement, progressAt, progressAtTime, retime, routeIndexAt, travelTurns } from './Fleet';

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

  it('glides continuously between ticks and lands on the tick position', () => {
    const m = planMovement(hex(0, 0), hex(10, 0), 0, 2);
    expect(progressAtTime(m, 1)).toBeCloseTo(progressAt(m, 1));
    expect(progressAtTime(m, 1.5)).toBeCloseTo(0.3);
    expect(progressAtTime(m, 99)).toBe(1);
  });
});

describe('retime', () => {
  const a = { q: 0, r: 0 }, b = { q: 10, r: 0 };
  it('continues a journey from the hex it has reached, at the new speed', () => {
    const fast = planMovement(a, b, 0, 4);
    const slow = retime(fast, 1, 1);
    expect(slow.route[0]).toEqual({ q: 4, r: 0 });
    expect(slow.departTurn).toBe(1);
    expect(arrivalTurn(slow)).toBe(7);
  });
  it('keeps an arrived fleet where it is and leaves matching speeds alone', () => {
    const done = planMovement(a, b, 0, 4);
    const parked = retime(done, 20, 1);
    expect(parked.route).toEqual([b]);
    expect(arrivalTurn(parked)).toBe(20);
    const same = planMovement(a, b, 0, 1);
    expect(retime(same, 3, 1)).toBe(same);
  });
});
