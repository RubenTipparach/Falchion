import { describe, expect, it } from 'vitest';
import { SHIP_CLASSES } from '../../content/shipClasses';
import { resolveBattle, type Side } from './Combat';
import { BATTLE_LOG_CAP, REPLAY_CAP, cleanRecords, logBattle, type BattleLogEntry } from './BattleLog';
import { afterRound, battleRecords } from './BattleRecord';

const classes = new Map(SHIP_CLASSES.map((c) => [c.id, c]));
const ids = SHIP_CLASSES.map((c) => c.id);
const fleet = (name: string, picks: number[]): Side => ({ name, ships: picks.map((n, i) => ({ classId: ids[(i * 5) % ids.length], count: n })).filter((s) => s.count > 0) });

describe('battle replays (change battle-replay)', () => {
  it('a raid keeps every round, each starting with the ships the last one left', () => {
    const result = resolveBattle(fleet('Raiders', [6, 3, 2, 4]), fleet('Home Dock', [5, 2, 3, 3]), SHIP_CLASSES, 42);
    for (const index of [0, 1] as const) {
      const recs = battleRecords(result, index, classes);
      expect(recs.length).toBe(result.rounds.length);
      expect(recs.map((r) => r.round)).toEqual(result.rounds.map((r) => r.round));
      // The meter's 100% is the battle's opening strength, every round.
      for (const r of recs) expect(r.start).toEqual(recs[0].start);
      for (let k = 1; k < recs.length; k++) {
        const left = afterRound(recs[k - 1]);
        for (const side of [0, 1] as const) {
          const going: Record<string, number> = {};
          for (const s of recs[k].before[side].ships) going[s.classId] = s.count;
          expect(going).toEqual(left[side]);
        }
      }
    }
  });

  it('recording the rounds leaves the battle as it was', () => {
    const a = fleet('A', [4, 4, 1, 2]), b = fleet('B', [3, 5, 2, 1]);
    const r1 = resolveBattle(a, b, SHIP_CLASSES, 9), r2 = resolveBattle(a, b, SHIP_CLASSES, 9);
    expect(r1).toEqual(r2);
    expect(r1.survivors).toEqual(r2.survivors);
  });

  it('the log keeps replays on its newest entries only', () => {
    const recs = battleRecords(resolveBattle(fleet('R', [6, 3, 2, 4]), fleet('D', [5, 2, 3, 3]), SHIP_CLASSES, 3), 1, classes);
    expect(recs.length).toBeGreaterThan(0);
    const entry = (year: number): Omit<BattleLogEntry, 'id'> => ({ year, kind: 'raid', attacked: true, place: null, ours: 'Dock', foe: 'R', foeEmpire: 'V', outcome: 'won', lost: {}, killed: {}, summary: 's', records: recs });
    let log: BattleLogEntry[] = [];
    for (let y = 1; y <= BATTLE_LOG_CAP + 5; y++) log = logBattle(log, entry(y));
    expect(log).toHaveLength(BATTLE_LOG_CAP);
    expect(log.slice(0, REPLAY_CAP).every((e) => e.records?.length)).toBe(true);
    expect(log.slice(REPLAY_CAP).some((e) => e.records)).toBe(false);
  });

  it('records from the wire are checked', () => {
    const good = battleRecords(resolveBattle(fleet('R', [6, 3, 2, 4]), fleet('D', [5, 2, 3, 3]), SHIP_CLASSES, 3), 0, classes);
    const clean = cleanRecords(good);
    expect(clean).toHaveLength(good.length);
    expect(cleanRecords([...good.slice(0, 3), { round: -1 }, 'junk', null])).toEqual(clean.slice(0, 3));
    expect(cleanRecords('nope')).toEqual([]);
  });
});
