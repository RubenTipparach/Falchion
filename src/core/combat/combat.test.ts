import { describe, expect, it } from 'vitest';
import { hullsOf, SHIP_CLASSES, SHIP_SIZES, vsHulls } from '../../content/shipClasses';
import { resolveAssault, resolveBattle, resolveRound, spreadFire } from './Combat';

const vosskBonuses = { short: 3, capture: 2, hull: 1 };
const raiders = { name: 'Vossk Raiders', bonuses: vosskBonuses, ships: [{ classId: 'brawler', count: 4 }, { classId: 'boarding-corvette', count: 2 }, { classId: 'interceptor', count: 3 }] };

describe('combat', () => {
  it('is deterministic', () => {
    const me = { name: 'Me', ships: [{ classId: 'lancer', count: 6 }] };
    expect(resolveBattle(me, raiders, SHIP_CLASSES, 7)).toEqual(resolveBattle(me, raiders, SHIP_CLASSES, 7));
  });

  it('long range wins early rounds, short range wins late ones', () => {
    const lancers = { name: 'L', ships: [{ classId: 'lancer', count: 5 }] };
    const brawlers = { name: 'B', ships: [{ classId: 'interceptor', count: 7 }] };
    const r = resolveBattle(lancers, brawlers, SHIP_CLASSES, 1).rounds;
    expect(r[0].damage[0]).toBeGreaterThan(r[0].damage[1]);
    const late = r.find((x) => x.band === 'short');
    if (late) expect(late.damage[1]).toBeGreaterThan(late.damage[0] * 0.8);
  });

  it('damage carries in and out of a battle: a battered fleet does worse', () => {
    const me = { name: 'Me', ships: [{ classId: 'lancer', count: 6 }] };
    const fresh = resolveBattle(me, raiders, SHIP_CLASSES, 7);
    const lancerHull = SHIP_CLASSES.find((c) => c.id === 'lancer')!.hull;
    const battered = resolveBattle({ ...me, damage: { lancer: lancerHull - 2 } }, raiders, SHIP_CLASSES, 7);
    const left = (r: typeof fresh) => r.survivors[0].reduce((n, x) => n + x.count, 0);
    expect(left(battered)).toBeLessThanOrEqual(left(fresh));
    // What the survivors carry out never kills a ship by itself.
    for (const [id, d] of Object.entries(fresh.damage[0])) expect(d).toBeLessThan(SHIP_CLASSES.find((c) => c.id === id)!.hull);
  });

  it('suppression blunts barrage', () => {
    const barges = { name: 'B', ships: [{ classId: 'missile-barge', count: 6 }] };
    const plain = resolveBattle(barges, { name: 'T', ships: [{ classId: 'railgun-monitor', count: 4 }] }, SHIP_CLASSES, 3);
    const flak = resolveBattle(barges, { name: 'T', ships: [{ classId: 'railgun-monitor', count: 4 }, { classId: 'flak-picket', count: 4 }] }, SHIP_CLASSES, 3);
    expect(flak.rounds[0].damage[0]).toBeLessThan(plain.rounds[0].damage[0]);
  });

  it('capture ships take crippled hulls', () => {
    const me = { name: 'Me', ships: [{ classId: 'lancer', count: 6 }, { classId: 'tractor-tender', count: 4 }, { classId: 'boarding-corvette', count: 4 }] };
    const r = resolveBattle(me, raiders, SHIP_CLASSES, 11);
    expect(r.captured[0].reduce((s, x) => s + x.count, 0)).toBeGreaterThan(0);
  });

  it('planet assault needs siege then troops', () => {
    const outpost = { name: 'Ixal Outpost', defense: 260, troops: 30, garrison: { name: 'Ixal Guard', bonuses: vosskBonuses, ships: [{ classId: 'brawler', count: 2 }] } };
    const noTroops = resolveAssault({ name: 'Me', ships: [{ classId: 'lancer', count: 6 }, { classId: 'bombard', count: 3 }] }, outpost, SHIP_CLASSES, 2);
    expect(noTroops.captured).toBe(false);
    const full = resolveAssault({ name: 'Me', ships: [{ classId: 'lancer', count: 6 }, { classId: 'bombard', count: 4 }, { classId: 'drop-ship', count: 4 }] }, outpost, SHIP_CLASSES, 2);
    expect(full.phaseReached).toBe('ground');
    expect(full.captured).toBe(true);
  });
});

describe('a round at sea', () => {
  it('boarders take ships this round\'s fire crippled, once the fleets are close', () => {
    const boarders = { name: 'Vossk', bonuses: vosskBonuses, ships: [{ classId: 'boarding-corvette', count: 12 }, { classId: 'brawler', count: 6 }] };
    const prey = { name: 'Convoy', ships: [{ classId: 'interceptor', count: 10 }] };
    let taken = 0;
    for (let seed = 1; seed <= 20; seed++) taken += resolveRound(boarders, prey, SHIP_CLASSES, seed, 6).rounds[0].captured[0];
    expect(taken).toBeGreaterThan(0);
    // At long range nobody boards.
    expect(resolveRound(boarders, prey, SHIP_CLASSES, 1, 1).rounds[0].captured).toEqual([0, 0]);
  });
});

describe('ships are squadrons by size', () => {
  it('every class has a size; fighters fly in eights, frigates in fours, capital ships alone', () => {
    for (const c of SHIP_CLASSES) expect(SHIP_SIZES[c.id], c.id).toBeDefined();
    expect([hullsOf('interceptor'), hullsOf('lancer'), hullsOf('railgun-monitor'), hullsOf('brawler'), hullsOf('planet-cracker'), hullsOf('dreadnought')]).toEqual([8, 4, 3, 2, 1, 1]);
  });

  it('a squadron that has lost hulls fires less; a one-hull ship fires fully until it dies', () => {
    const foe = { name: 'F', ships: [{ classId: 'brawler', count: 2 }] };
    const fire = (side: Parameters<typeof resolveRound>[0]) => resolveRound(side, foe, SHIP_CLASSES, 5, 1).rounds[0].damage[0];
    const lancer = { name: 'L', ships: [{ classId: 'lancer', count: 1 }] };
    expect(fire({ ...lancer, damage: { lancer: 25 } })).toBeLessThanOrEqual(fire(lancer) * 0.5 + 1e-6);
    const dread = { name: 'D', ships: [{ classId: 'dreadnought', count: 1 }] };
    expect(fire({ ...dread, damage: { dreadnought: 300 } })).toBeCloseTo(fire(dread), 6);
  });

  it('missiles and flak tear through swarms; beams through capital ships', () => {
    const fighters = [{ classId: 'interceptor', count: 1 }], capital = [{ classId: 'dreadnought', count: 1 }];
    const missiles = { barrage: 100 }, flak = { suppression: 100 }, beams = { long: 100 }, guns = { short: 100 };
    expect(spreadFire(missiles, fighters)[0]).toBeGreaterThan(spreadFire(missiles, capital)[0] * 1.8);
    expect(spreadFire(flak, fighters)[0]).toBeGreaterThan(spreadFire(flak, capital)[0]);
    expect(spreadFire(beams, capital)[0]).toBeGreaterThan(spreadFire(beams, fighters)[0] * 2);
    expect(spreadFire(guns, capital)[0]).toBe(spreadFire(guns, fighters)[0]);
    // Split by numbers across a mixed fleet, each part at its own rate.
    const mixed = spreadFire(missiles, [...fighters, ...capital]);
    expect(mixed[0]).toBeCloseTo(75, 6);
    expect(mixed[1]).toBeCloseTo(40, 6);
    expect(vsHulls('barrage', 8)).toBe(1.5);
    expect(vsHulls('long', 1)).toBe(1.3);
    expect(vsHulls('short', 4)).toBe(1);
  });
});
