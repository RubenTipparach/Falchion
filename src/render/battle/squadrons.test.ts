import { describe, expect, it } from 'vitest';
import { hullsOf, SHIP_CLASSES } from '../../content/shipClasses';
import { resolveRound } from '../../core/combat/Combat';
import { recordRound } from '../../core/combat/BattleRecord';
import { buildScript, health } from './BattleScript';
import { hullLosses } from './BattleStage';

const classes = new Map(SHIP_CLASSES.map((c) => [c.id, c]));
const A = [{ classId: 'lancer', count: 4 }, { classId: 'missile-barge', count: 3 }, { classId: 'dreadnought', count: 1 }];
const B = [{ classId: 'interceptor', count: 7 }, { classId: 'brawler', count: 4 }, { classId: 'leviathan', count: 1 }];

describe('squadrons in the battle view', () => {
  const script = (seed: number) => {
    const r = resolveRound({ name: 'A', ships: A }, { name: 'B', ships: B }, SHIP_CLASSES, seed, 5);
    return buildScript(recordRound(r.rounds[0].detail!, 5, [{ ships: A, damage: { lancer: 30 } }, { ships: B }], 0, classes, null), classes, { seed });
  };

  it('a squadron keeps ceil(hulls × health) hulls as it is worn down, and loses them all when destroyed', () => {
    for (let seed = 1; seed <= 6; seed++) {
      const sc = script(seed);
      for (const sh of sc.ships) {
        const n = hullsOf(sh.classId), end = hullLosses(sh, n, sc.R);
        expect(end).toHaveLength(n);
        const at = (t: number) => end.filter((e) => e > t).length;
        // Before the round: hulls already lost to carried damage are gone.
        expect(at(0)).toBe(Math.max(1, Math.ceil(n * health(sh, 0, sc.R) - 1e-9)));
        if (sh.death < Infinity) expect(at(sh.death + 2)).toBe(0);
        else expect(at(sc.R)).toBeGreaterThanOrEqual(1);
        // Hulls never come back.
        for (let t = 0; t < sc.R; t += 1) expect(at(t + 1)).toBeLessThanOrEqual(at(t));
      }
    }
  });

  it('a damaged frigate squadron starts the round short of hulls; a dreadnought is one hull', () => {
    const sc = script(3);
    const lancer = sc.ships.find((s) => s.side === 0 && s.classId === 'lancer' && health(s, 0, sc.R) < 1)!;
    expect(hullLosses(lancer, 4, sc.R).filter((e) => e === -Infinity).length).toBeGreaterThan(0);
    expect(hullsOf('dreadnought')).toBe(1);
  });
});
