import { describe, expect, it } from 'vitest';
import clock from '../../../server/clock.json';
import { catchUpTicks, formatDuration, msUntilNextTick, tickAt, tickFraction, tickStartMs } from './WorldTime';

const c = { epochMs: 1_000_000, msPerTick: 60_000 };

describe('world time', () => {
  it('ticks once a minute from the epoch', () => {
    expect(tickAt(1_000_000, c)).toBe(0);
    expect(tickAt(1_059_999, c)).toBe(0);
    expect(tickAt(1_060_000, c)).toBe(1);
    expect(tickStartMs(3, c)).toBe(1_180_000);
  });

  it('knows how far into a tick it is', () => {
    expect(tickFraction(1_030_000, c)).toBeCloseTo(0.5);
    expect(msUntilNextTick(1_045_000, c)).toBe(15_000);
  });

  it('formats real durations (one year is one minute)', () => {
    expect(formatDuration(8, c)).toBe('8 min');
    expect(formatDuration(70, c)).toBe('1 h 10 min');
    expect(formatDuration(1_800, c)).toBe('1 d 6 h');
  });

  it('caps catch-up after time away', () => {
    expect(catchUpTicks(10, 15, 100)).toEqual({ run: 5, skipped: 0 });
    expect(catchUpTicks(10, 500, 100)).toEqual({ run: 100, skipped: 390 });
    expect(catchUpTicks(10, 5, 100)).toEqual({ run: 0, skipped: 0 });
  });

  it('shares one clock with the server: one tick per minute', () => {
    expect(clock.msPerTick).toBe(60_000);
    expect(Number.isInteger(clock.epochMs)).toBe(true);
  });
});
