import { describe, expect, it } from 'vitest';
import { BATTLE_LOG_CAP, logBattle, tallyLost, tallyOf, unseenAttacks, type BattleLogEntry } from './BattleLog';

const entry = (year: number, attacked = true): Omit<BattleLogEntry, 'id'> => ({
  year, kind: 'raid', attacked, place: null, ours: 'Home Dock', foe: 'Raiders', foeEmpire: 'Vossk', outcome: 'won', lost: {}, killed: {}, summary: 's',
});

describe('battle log', () => {
  it('keeps the newest first, with unique ids, bounded', () => {
    let log = logBattle(undefined, entry(10));
    log = logBattle(log, entry(10));
    expect(log.map((e) => e.id)).toEqual(['10:raid:1', '10:raid:0']);
    for (let y = 11; y < 11 + BATTLE_LOG_CAP; y++) log = logBattle(log, entry(y));
    expect(log).toHaveLength(BATTLE_LOG_CAP);
    expect(log[0].year).toBe(10 + BATTLE_LOG_CAP);
  });

  it('counts the attacks on us since the entry last read', () => {
    let log = logBattle(undefined, entry(1));
    const seen = log[0].id;
    log = logBattle(log, entry(2, false));
    log = logBattle(log, entry(3));
    log = logBattle(log, entry(4));
    expect(unseenAttacks(log, seen)).toBe(2);
    expect(unseenAttacks(log, null)).toBe(3);
    expect(unseenAttacks(log, log[0].id)).toBe(0);
  });

  it('tallies losses and boarded ships by class', () => {
    expect(tallyLost([{ classId: 'lancer', count: 4 }, { classId: 'jammer', count: 2 }], [{ classId: 'lancer', count: 3 }, { classId: 'jammer', count: 2 }])).toEqual({ lancer: 1 });
    expect(tallyOf([{ classId: 'brawler', count: 1 }, { classId: 'brawler', count: 2 }])).toEqual({ brawler: 3 });
  });
});
