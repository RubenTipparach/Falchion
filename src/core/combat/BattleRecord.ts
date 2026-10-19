import type { ShipClassDef } from '../../content/shipClasses';
import { bandOf, type Band, type BattleResult, type RoundDetail, type Squadron, type Tally } from './Combat';

/** A fleet as it went into a round: its ships and the damage each class group carried (hull points). */
export interface ForceView {
  readonly ships: readonly Squadron[];
  readonly damage?: Tally;
}

type Pair<T> = readonly [T, T];

/**
 * The last round of a battle at sea, as a client draws it. Side 0 is the fleet whose save (or
 * public view) holds the record; side 1 is the fleet it fought. Small, plain data: it goes in
 * saves and in the public view.
 */
export interface BattleRecord {
  readonly round: number;
  /** Both fleets going into the round. */
  readonly before: Pair<ForceView>;
  readonly lostBy: Pair<Tally>;
  readonly takenBy: Pair<Tally>;
  /** Damage each side dealt, by doctrine. */
  readonly by: Pair<Tally>;
  readonly jam: Pair<number>;
  readonly flak: Pair<number>;
  /** Hull points of one ship of each class. */
  readonly hull: Pair<Tally>;
  /** Damage each class group carried at the end of the round (hull points). */
  readonly wounds: Pair<Tally>;
  /** Each fleet's fighting strength when the battle began (see strengthOf): the meter's 100%. */
  readonly start: Pair<number>;
}

/** What a ship is worth in a fight: its hull plus its guns. */
export const shipValue = (def: Pick<ShipClassDef, 'hull' | 'attack'>): number => def.hull + def.attack * 4;

/** A force's fighting strength at full health. */
export function strengthOf(ships: readonly Squadron[], classes: ReadonlyMap<string, ShipClassDef>): number {
  return ships.reduce((s, x) => s + (classes.has(x.classId) ? x.count * shipValue(classes.get(x.classId)!) : 0), 0);
}

const swap = <T>(p: Pair<T>, flip: boolean): Pair<T> => (flip ? [p[1], p[0]] : p);

/**
 * The record of a round for the fleet on side `index` of it: that fleet becomes side 0. `before`
 * is already ordered that way (this fleet, then the other). `start` carries over from the
 * battle's earlier rounds (null on round 1: the fleets as they went in).
 */
export function recordRound(detail: RoundDetail, round: number, before: Pair<ForceView>, index: 0 | 1, classes: ReadonlyMap<string, ShipClassDef>, start: Pair<number> | null): BattleRecord {
  const flip = index === 1;
  const clean = (f: ForceView): ForceView => ({ ships: f.ships.filter((s) => s.count > 0).map((s) => ({ classId: s.classId, count: s.count })), ...(f.damage && Object.keys(f.damage).length ? { damage: { ...f.damage } } : {}) });
  return {
    round,
    before: [clean(before[0]), clean(before[1])],
    lostBy: swap(detail.lostBy, flip),
    takenBy: swap(detail.takenBy, flip),
    by: swap(detail.by, flip),
    jam: swap(detail.jam, flip),
    flak: swap(detail.flak, flip),
    hull: swap(detail.hull, flip),
    wounds: swap(detail.wounds, flip),
    start: start ?? [strengthOf(before[0].ships, classes), strengthOf(before[1].ships, classes)],
  };
}

/**
 * Every round of a whole battle (resolveBattle: a raid, an assault's fight in orbit) as the battle
 * view replays it, the fleet on side `index` as side 0. Rounds without a breakdown are skipped.
 */
export function battleRecords(result: BattleResult, index: 0 | 1, classes: ReadonlyMap<string, ShipClassDef>): BattleRecord[] {
  const out: BattleRecord[] = [];
  for (const r of result.rounds) {
    if (!r.detail || !r.before) continue;
    const before: Pair<ForceView> = index === 0 ? [r.before[0], r.before[1]] : [r.before[1], r.before[0]];
    out.push(recordRound(r.detail, r.round, before, index, classes, out[0]?.start ?? null));
  }
  return out;
}

/** The same round seen from the other fleet. */
export function flipRecord(r: BattleRecord): BattleRecord {
  return {
    round: r.round, before: swap(r.before, true), lostBy: swap(r.lostBy, true), takenBy: swap(r.takenBy, true), by: swap(r.by, true),
    jam: swap(r.jam, true), flak: swap(r.flak, true), hull: swap(r.hull, true), wounds: swap(r.wounds, true), start: swap(r.start, true),
  };
}

export const bandOfRecord = (r: BattleRecord): Band => bandOf(r.round);

/** Ships each side has left after the round, by class (boarded ships change sides). */
export function afterRound(r: BattleRecord): Pair<Tally> {
  const side = (i: 0 | 1): Tally => {
    const out: Record<string, number> = {};
    for (const s of r.before[i].ships) {
      const n = s.count - (r.lostBy[i][s.classId] ?? 0) - (r.takenBy[i][s.classId] ?? 0);
      if (n > 0) out[s.classId] = n;
    }
    for (const [id, n] of Object.entries(r.takenBy[i === 0 ? 1 : 0])) out[id] = (out[id] ?? 0) + n;
    return out;
  };
  return [side(0), side(1)];
}

/**
 * Health (1 = undamaged) of each of `count` ships of a class whose group carries `damage` hull
 * points, most damaged first: damage fills one hull at a time (a ship never shows as empty while
 * it still flies), any left over is spread evenly.
 */
export function shipHealths(count: number, hull: number, damage: number): number[] {
  if (count <= 0) return [];
  const h = Math.max(1, hull);
  let left = Math.max(0, damage);
  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    const d = Math.min(left, h * 0.92);
    left -= d;
    out.push(1 - d / h);
  }
  if (left > 0) for (let i = 0; i < count; i++) out[i] = Math.max(0.04, out[i] - left / (h * count));
  return out.map((x) => Math.round(x * 1000) / 1000);
}

/** Health of a class group as a whole: 1 − damage / (count × hull). */
export const classHealth = (count: number, hull: number, damage: number): number => (count > 0 ? Math.min(1, Math.max(0, 1 - damage / (count * Math.max(1, hull)))) : 0);

// ── Untrusted input: another player's public view ──────────────────────

const ID = /^[a-z0-9][a-z0-9-]{0,39}$/;
const MAX_KEYS = 40;
const MAX_COUNT = 100_000;

function cleanTally(x: unknown, max: number): Tally {
  if (!x || typeof x !== 'object' || Array.isArray(x)) return {};
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(x as Record<string, unknown>).slice(0, MAX_KEYS)) {
    if (ID.test(k) && typeof v === 'number' && Number.isFinite(v) && v > 0) out[k] = Math.min(v, max);
  }
  return out;
}

function cleanShips(x: unknown): Squadron[] {
  if (!Array.isArray(x)) return [];
  return x.slice(0, MAX_KEYS)
    .filter((s): s is Squadron => !!s && typeof s.classId === 'string' && ID.test(s.classId) && Number.isInteger(s.count) && s.count > 0)
    .map((s) => ({ classId: s.classId, count: Math.min(s.count, MAX_COUNT) }));
}

const pairOf = <T>(x: unknown, f: (v: unknown) => T): Pair<T> | null => (Array.isArray(x) && x.length === 2 ? [f(x[0]), f(x[1])] : null);
const unit = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 1);
const amount = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.min(v, 1e9) : 0);

/** A battle record from another player (or an old save), checked and bounded; null when unusable. */
export function cleanBattleRecord(x: unknown): BattleRecord | null {
  const r = x as Record<string, unknown> | null;
  if (!r || typeof r !== 'object' || !Number.isInteger(r.round) || (r.round as number) < 1 || (r.round as number) > 100_000) return null;
  const before = pairOf(r.before, (f) => {
    const ff = (f ?? {}) as Record<string, unknown>;
    const damage = cleanTally(ff.damage, 1e9);
    return { ships: cleanShips(ff.ships), ...(Object.keys(damage).length ? { damage } : {}) } as ForceView;
  });
  const tally = (key: string, max: number) => pairOf(r[key], (v) => cleanTally(v, max));
  const lostBy = tally('lostBy', MAX_COUNT), takenBy = tally('takenBy', MAX_COUNT), by = tally('by', 1e9), hull = tally('hull', 1e9), wounds = tally('wounds', 1e9);
  const jam = pairOf(r.jam, unit), flak = pairOf(r.flak, unit), start = pairOf(r.start, amount);
  if (!before || !lostBy || !takenBy || !by || !hull || !wounds || !jam || !flak || !start) return null;
  if (!before[0].ships.length || !before[1].ships.length) return null;
  return { round: r.round as number, before, lostBy, takenBy, by, jam, flak: [Math.min(0.6, flak[0]), Math.min(0.6, flak[1])], hull, wounds, start };
}
