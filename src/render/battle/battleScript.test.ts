import { describe, expect, it } from 'vitest';
import { SHIP_CLASSES } from '../../content/shipClasses';
import { resolveRound } from '../../core/combat/Combat';
import { recordRound } from '../../core/combat/BattleRecord';
import { buildScript, fleetMeter, health, landsAt, outcome, sideAt, strength } from './BattleScript';

const classes = new Map(SHIP_CLASSES.map((c) => [c.id, c]));
const A = [{ classId: 'lancer', count: 4 }, { classId: 'railgun-monitor', count: 2 }, { classId: 'missile-barge', count: 3 }, { classId: 'jammer', count: 2 }, { classId: 'repair-tender', count: 1 }, { classId: 'dreadnought', count: 1 }];
const B = [{ classId: 'interceptor', count: 7 }, { classId: 'brawler', count: 4 }, { classId: 'flak-picket', count: 2 }, { classId: 'boarding-corvette', count: 3 }, { classId: 'swarm-carrier', count: 1 }, { classId: 'leviathan', count: 1 }];

/** A round's record as the first fleet keeps it. */
function record(round: number, seed: number, damage?: Record<string, number>) {
  const r = resolveRound({ name: 'A', ships: A, bonuses: { long: 2 } }, { name: 'B', ships: B, bonuses: { short: 2, capture: 2 } }, SHIP_CLASSES, seed, round);
  return recordRound(r.rounds[0].detail!, round, [{ ships: A, damage }, { ships: B }], 0, classes, null);
}

describe('the battle view\'s script of a round', () => {
  it('is the same for the same record and seed (golden seed), different for another seed', () => {
    const rec = record(5, 11);
    const a = buildScript(rec, classes, { seed: 42 }), b = buildScript(rec, classes, { seed: 42 });
    expect(a.events).toEqual(b.events);
    expect(a.ships.map((s) => [s.death, s.cap, s.h0, s.h1])).toEqual(b.ships.map((s) => [s.death, s.cap, s.h0, s.h1]));
    expect(buildScript(rec, classes, { seed: 43 }).events).not.toEqual(a.events);
  });

  it('draws one ship per ship in the fleets, and kills and boards exactly what the rules say', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const rec = record(1 + (seed % 7), seed);
      const sc = buildScript(rec, classes, { seed });
      for (const s of [0, 1] as const) {
        for (const sq of rec.before[s].ships) {
          const mine = sc.ships.filter((x) => x.side === s && x.classId === sq.classId);
          expect(mine.length).toBe(sq.count);
          expect(mine.filter((x) => x.death < Infinity).length).toBe(rec.lostBy[s][sq.classId] ?? 0);
          expect(mine.filter((x) => x.cap < Infinity).length).toBe(rec.takenBy[s][sq.classId] ?? 0);
        }
      }
      // Deaths and boardings fall inside the round.
      for (const sh of sc.ships) {
        if (sh.death < Infinity) expect(sh.death).toBeGreaterThan(0), expect(sh.death).toBeLessThan(sc.R);
        if (sh.cap < Infinity) expect(sideAt(sh, sh.cap + 0.01)).toBe(1 - sh.side);
      }
    }
  });

  it('gives every loss a visible cause: a kill shot that lands as the ship dies, and pods for every boarding', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const sc = buildScript(record(5, seed), classes, { seed });
      for (const sh of sc.ships.filter((x) => x.death < Infinity)) {
        const kills = sc.events.filter((e) => e.kill && e.d === sh.i);
        expect(kills.length).toBeGreaterThan(0);
        for (const e of kills) {
          expect(sc.ships[e.s].side).not.toBe(sh.side);
          expect(Math.abs(landsAt(e) - sh.death)).toBeLessThan(0.45);
        }
      }
      for (const sh of sc.ships.filter((x) => x.cap < Infinity)) {
        const pods = sc.events.filter((e) => e.k === 'pod' && e.d === sh.i);
        expect(pods.length).toBe(3);
        for (const e of pods) expect(e.t0 + e.f).toBeLessThanOrEqual(sh.cap);
      }
    }
  });

  it('fires every weapon kind of the fleets, flak shoots down missiles, and the round\'s jamming shows', () => {
    const sc = buildScript(record(3, 5), classes, { seed: 5 });
    const kinds = new Set(sc.events.map((e) => e.k));
    for (const k of ['beam', 'slug', 'missile', 'drones', 'bolt', 'plasma', 'pulse', 'repair', 'jam'] as const) expect(kinds.has(k)).toBe(true);
    expect(sc.events.some((e) => e.k === 'missile' && (e.icpt ?? 0) > 0)).toBe(true);
    // Events are in time order and nobody fires after dying.
    for (let i = 1; i < sc.events.length; i++) expect(sc.events[i].t0).toBeGreaterThanOrEqual(sc.events[i - 1].t0);
    for (const e of sc.events) if (e.s >= 0 && !e.kill && e.k !== 'pod') expect(e.t0).toBeLessThan(Math.min(sc.ships[e.s].death, sc.ships[e.s].cap));
  });

  it('runs health from the damage going in to the damage coming out, and to nothing as a ship dies', () => {
    const rec = record(5, 9, { lancer: 60 });
    const sc = buildScript(rec, classes, { seed: 9 });
    const lancers = sc.ships.filter((x) => x.side === 0 && x.classId === 'lancer');
    expect(Math.min(...lancers.map((x) => health(x, 0, sc.R)))).toBeLessThan(1);
    for (const sh of sc.ships) {
      expect(health(sh, 0, sc.R)).toBeCloseTo(sh.h0, 5);
      if (sh.death < Infinity) { expect(health(sh, sh.death - 0.01, sc.R)).toBeLessThan(0.1); expect(health(sh, sh.death, sc.R)).toBe(0); }
      else if (sh.cap < Infinity) expect(health(sh, sh.cap, sc.R)).toBeLessThan(0.3);
      else expect(health(sh, sc.R, sc.R)).toBeCloseTo(sh.h1, 5);
    }
  });

  it('meters each fleet\'s strength against its start, with a verdict', () => {
    const rec = record(6, 2);
    const sc = buildScript(rec, classes, { seed: 2 });
    const m0 = fleetMeter(sc, 0, null)!;
    expect(m0.pct[0]).toBeCloseTo(strength(sc, 0, 0) / rec.start[0], 5);
    expect(m0.trend).toBe(0);
    const m1 = fleetMeter(sc, sc.R, null)!;
    expect(m1.pct[0]).toBeLessThanOrEqual(m0.pct[0]);
    expect(['Winning', 'Even fight', 'Losing', 'Victory', 'Defeat']).toContain(m1.verdict[0]);
    expect(fleetMeter(sc, sc.R, 'broke-off')!.verdict).toEqual(['Broke off', 'even']);
    expect(fleetMeter(sc, sc.R, 'pursued')!.verdict[0]).toBe('Pursued');
    expect(outcome(rec, classes)).toBeNull();
    expect(outcome({ ...rec, lostBy: [Object.fromEntries(A.map((x) => [x.classId, x.count])), {}], takenBy: [{}, {}] }, classes)).toBe('defeat');
  });
});
