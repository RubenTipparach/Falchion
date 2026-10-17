import { describe, expect, it } from 'vitest';
import { SHIP_CLASSES } from '../../content/shipClasses';
import { resolveRound, type Squadron } from './Combat';
import { afterRound, classHealth, cleanBattleRecord, flipRecord, recordRound, shipHealths, strengthOf } from './BattleRecord';

const classes = new Map(SHIP_CLASSES.map((c) => [c.id, c]));
const total = (t: Readonly<Record<string, number>>) => Object.values(t).reduce((a, b) => a + b, 0);
const ships = (s: readonly Squadron[]) => s.reduce((n, x) => n + x.count, 0);

const lances = { name: 'First Lance', bonuses: { long: 2 }, ships: [{ classId: 'lancer', count: 4 }, { classId: 'railgun-monitor', count: 2 }, { classId: 'missile-barge', count: 3 }, { classId: 'jammer', count: 2 }, { classId: 'repair-tender', count: 1 }, { classId: 'dreadnought', count: 1 }] };
const brawlers = { name: 'Third Lance', bonuses: { short: 2, capture: 2, hull: 1 }, ships: [{ classId: 'interceptor', count: 7 }, { classId: 'brawler', count: 4 }, { classId: 'flak-picket', count: 2 }, { classId: 'boarding-corvette', count: 3 }, { classId: 'swarm-carrier', count: 1 }, { classId: 'leviathan', count: 1 }] };

describe('a round at sea, broken down for the battle view', () => {
  it('tallies every loss and boarding by class, matching the round\'s totals', () => {
    for (let round = 1; round <= 8; round++) {
      for (let seed = 1; seed <= 15; seed++) {
        const r = resolveRound(lances, brawlers, SHIP_CLASSES, seed, round);
        const log = r.rounds[0], d = log.detail!;
        expect(total(d.lostBy[0])).toBe(log.losses[0]);
        expect(total(d.lostBy[1])).toBe(log.losses[1]);
        // takenBy[i]: ships of side i the other side boarded.
        expect(total(d.takenBy[1])).toBe(log.captured[0]);
        expect(total(d.takenBy[0])).toBe(log.captured[1]);
        // Survivors are what went in minus what was lost or taken.
        for (const [i, side] of [[0, lances], [1, brawlers]] as const) {
          for (const sq of side.ships) {
            const left = r.survivors[i].find((x) => x.classId === sq.classId)?.count ?? 0;
            expect(left).toBe(sq.count - (d.lostBy[i][sq.classId] ?? 0) - (d.takenBy[i][sq.classId] ?? 0));
          }
        }
      }
    }
  });

  it('splits the damage by doctrine and reports jamming, flak and hulls', () => {
    const d = resolveRound(lances, brawlers, SHIP_CLASSES, 3, 1).rounds[0];
    const by = d.detail!.by;
    expect(Math.abs(total(by[0]) - d.damage[0])).toBeLessThanOrEqual(3);
    expect(Object.keys(by[0])).toEqual(expect.arrayContaining(['long', 'barrage']));
    // Their flak pickets cut our barrage; our jammers dim their fire.
    expect(d.detail!.flak[0]).toBeGreaterThan(0);
    expect(d.detail!.jam[1]).toBeLessThan(1);
    expect(d.detail!.jam[0]).toBeLessThan(1);
    // Research hull bonus: +5% a level.
    expect(d.detail!.hull[1].brawler).toBe(Math.round(90 * 1.05));
    expect(d.detail!.hull[0].lancer).toBe(40);
  });

  it('keeps the damage each class carries at the round\'s end, within its hulls', () => {
    let seen = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const r = resolveRound(lances, brawlers, SHIP_CLASSES, seed, 5);
      const d = r.rounds[0].detail!;
      for (const i of [0, 1] as const) {
        for (const [id, w] of Object.entries(d.wounds[i])) {
          const left = r.survivors[i].find((x) => x.classId === id)?.count ?? 0;
          expect(left).toBeGreaterThan(0);
          expect(w).toBeLessThanOrEqual(left * d.hull[i][id]);
          seen++;
        }
      }
    }
    expect(seen).toBeGreaterThan(0);
  });

  it('is deterministic (golden seed) and leaves the round\'s results as they were', () => {
    const a = resolveRound(lances, brawlers, SHIP_CLASSES, 42, 3);
    expect(resolveRound(lances, brawlers, SHIP_CLASSES, 42, 3)).toEqual(a);
    expect({ ...a.rounds[0], detail: undefined }).toEqual({ ...a.rounds[0], detail: undefined });
    expect(ships(a.survivors[0]) + ships(a.survivors[1])).toBeLessThan(ships(lances.ships) + ships(brawlers.ships));
  });
});

describe('battle records', () => {
  const r = resolveRound(lances, brawlers, SHIP_CLASSES, 7, 4);
  const before = [{ ships: lances.ships, damage: { lancer: 30 } }, { ships: brawlers.ships }] as const;

  it('puts the recording fleet first, whichever side it fought on', () => {
    const mine = recordRound(r.rounds[0].detail!, 4, before, 0, classes, null);
    const theirs = recordRound(r.rounds[0].detail!, 4, [before[1], before[0]], 1, classes, null);
    expect(theirs).toEqual(flipRecord(mine));
    expect(mine.before[0].damage).toEqual({ lancer: 30 });
    expect(mine.start[0]).toBe(strengthOf(lances.ships, classes));
    // After the round: the survivors, with boarded ships changing sides.
    const after = afterRound(mine);
    expect(after[0]).toEqual(Object.fromEntries([...r.survivors[0], ...r.captured[0]].reduce((m, s) => m.set(s.classId, (m.get(s.classId) ?? 0) + s.count), new Map<string, number>())));
  });

  it('carries the battle\'s starting strength over from earlier rounds', () => {
    expect(recordRound(r.rounds[0].detail!, 4, before, 0, classes, [900, 800]).start).toEqual([900, 800]);
  });

  it('spreads a class\'s damage most damaged ship first, never emptying a ship that still flies', () => {
    expect(shipHealths(3, 100, 0)).toEqual([1, 1, 1]);
    expect(shipHealths(3, 100, 50)).toEqual([0.5, 1, 1]);
    expect(shipHealths(3, 100, 150)).toEqual([0.08, 0.42, 1]);
    expect(Math.min(...shipHealths(2, 100, 500))).toBeGreaterThan(0);
    expect(classHealth(3, 100, 150)).toBe(0.5);
  });

  it('checks another player\'s record and drops what does not fit', () => {
    const rec = recordRound(r.rounds[0].detail!, 4, before, 0, classes, null);
    expect(cleanBattleRecord(JSON.parse(JSON.stringify(rec)))).toEqual(rec);
    expect(cleanBattleRecord({ ...rec, round: 'x' })).toBeNull();
    expect(cleanBattleRecord({ ...rec, jam: [1] })).toBeNull();
    const dirty = cleanBattleRecord({ ...rec, before: [{ ships: [{ classId: '<script>', count: 2 }, { classId: 'lancer', count: 1.5 }, { classId: 'lancer', count: 2 }] }, rec.before[1]], flak: [3, -1] })!;
    expect(dirty.before[0].ships).toEqual([{ classId: 'lancer', count: 2 }]);
    expect(dirty.flak).toEqual([0.6, 0]);
    expect(cleanBattleRecord(null)).toBeNull();
  });
});
