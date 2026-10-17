/**
 * World time. The server advances the world one tick per `msPerTick` (one
 * minute); a tick is one year of game time. Pure: callers pass the time in.
 */
export interface ClockConfig {
  /** Wall-clock ms of tick 0. */
  readonly epochMs: number;
  readonly msPerTick: number;
}

export function tickAt(nowMs: number, c: ClockConfig): number {
  return Math.floor((nowMs - c.epochMs) / c.msPerTick);
}

export function tickStartMs(tick: number, c: ClockConfig): number {
  return c.epochMs + tick * c.msPerTick;
}

/** How far through the current tick we are, in [0, 1). */
export function tickFraction(nowMs: number, c: ClockConfig): number {
  const t = (nowMs - c.epochMs) / c.msPerTick;
  return t - Math.floor(t);
}

export function msUntilNextTick(nowMs: number, c: ClockConfig): number {
  return tickStartMs(tickAt(nowMs, c) + 1, c) - nowMs;
}

/** Real time a number of ticks takes, e.g. "8 min", "2 h 20 min", "3 d 4 h". */
export function formatDuration(ticks: number, c: ClockConfig): string {
  const min = Math.round((ticks * c.msPerTick) / 60_000);
  if (min < 60) return `${Math.max(min, ticks > 0 ? 1 : 0)} min`;
  const h = Math.floor(min / 60), m = min % 60;
  if (h < 24) return m ? `${h} h ${m} min` : `${h} h`;
  const d = Math.floor(h / 24), hh = h % 24;
  return hh ? `${d} d ${hh} h` : `${d} d`;
}

export function formatYear(tick: number): string {
  return `Year ${tick.toLocaleString('en-US')}`;
}

/** Ticks to simulate when catching up after time away, capped to keep loading fast. */
export function catchUpTicks(savedTick: number, nowTick: number, cap: number): { readonly run: number; readonly skipped: number } {
  const missed = Math.max(0, nowTick - savedTick);
  return { run: Math.min(missed, cap), skipped: Math.max(0, missed - cap) };
}
