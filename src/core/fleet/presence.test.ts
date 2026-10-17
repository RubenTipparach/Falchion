import { describe, expect, it } from 'vitest';
import { hex } from '../hex/Hex';
import { planMovement } from './Fleet';
import { adjustShips, dockedShips, hasShips, isStationed, shipTotal } from './Presence';

describe('fleet presence', () => {
  it('is on station only after arriving', () => {
    const m = planMovement(hex(0, 0), hex(6, 0), 1, 2);
    expect(isStationed(m, 3)).toBe(false);
    expect(isStationed(m, 4)).toBe(true);
  });

  it('docks whatever is not deployed', () => {
    const roster = { cutter: 4, frigate: 6 };
    expect(dockedShips(roster, [{ ships: [{ classId: 'cutter', count: 2 }], supply: 0, ammo: 0 }])).toEqual([
      { classId: 'cutter', count: 2 }, { classId: 'frigate', count: 6 },
    ]);
  });

  it('adds and removes ships', () => {
    const ships = adjustShips([{ classId: 'a', count: 3 }], [{ classId: 'a', count: -3 }, { classId: 'b', count: 2 }]);
    expect(ships).toEqual([{ classId: 'b', count: 2 }]);
    expect(shipTotal(ships)).toBe(2);
    expect(hasShips(ships, [{ classId: 'b', count: 2 }])).toBe(true);
    expect(hasShips(ships, [{ classId: 'a', count: 1 }])).toBe(false);
  });
});
