import { describe, expect, it } from 'vitest';
import { hex, hexDistance } from '../hex/Hex';
import { formatDuration, hexAt, planMovement, travelDays } from './Fleet';

describe('fleet movement', () => {
  it('route has distance+1 adjacent hexes', () => {
    const m = planMovement(hex(0, 0), hex(40, -12), 0, 2);
    expect(m.route.length).toBe(hexDistance(hex(0, 0), hex(40, -12)) + 1);
  });

  it('730 ly at 2 ly/day takes 365 days', () => {
    expect(travelDays(730, 2)).toBe(365);
    expect(formatDuration(365)).toContain('1.0 yr');
  });

  it('is at the middle hex halfway through', () => {
    const m = planMovement(hex(0, 0), hex(20, 0), 100, 4); // 20 ly, 5 days
    expect(hexAt(m, 102.5)).toEqual(m.route[10]);
    expect(hexAt(m, 1e9)).toEqual(hex(20, 0));
  });
});
