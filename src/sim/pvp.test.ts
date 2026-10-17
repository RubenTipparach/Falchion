import { describe, expect, it } from 'vitest';
import { resolveRound, type Squadron } from '../core/combat/Combat';
import { SHIP_CLASSES } from '../content/shipClasses';
import { planMovement } from '../core/fleet/Fleet';
import { GalaxyModel } from '../core/galaxy/GalaxyModel';
import type { Hex } from '../core/hex/Hex';
import { TechTree } from '../core/research/TechTree';
import { TECH_NODES } from '../content/techTree';
import { SHARD_SOURCES } from '../content/shardSources';
import { createWorld } from '../app/World';
import { Store } from '../app/Store';
import type { GameState } from '../app/GameState';
import { SaveGame } from '../app/SaveGame';
import { advanceSave, applyCommand, findContacts, findPursuits, resolveContact, resolvePursuit } from './headless';
import { decodeArgs, encodeCommand } from './commands';
import { applyEffects, EMPTY_WORLD } from '../core/world/SharedWorld';
import { newEmpireState } from './newEmpireState';
import type { EmpireSim } from './EmpireSim';

const galaxy = new GalaxyModel();
const tree = new TechTree(TECH_NODES, SHARD_SOURCES);
const T = 5_000;
const HERE: Hex = { q: 0, r: 0 };
const A = '111111111111111111';
const B = '222222222222222222';

/** A new empire's save with one extra fleet of `ships` on `hex` (on station from `departs`). */
function empireWith(id: string, ships: Squadron[], hex: Hex, opts: { stance?: 'aggressive'; departs?: number } = {}): Record<string, any> {
  const world = createWorld(galaxy, id);
  const store = new Store<GameState>(newEmpireState({ galaxy, tree, world, playerName: `P${id.slice(-2)}`, t0: T }));
  const save: Record<string, any> = new SaveGame(galaxy.params.seed, null).snapshot(store.state);
  delete save.tab;
  const fleetId = `strike-${id.slice(-2)}`;
  save.fleets.push({ ...save.fleets[0], id: fleetId, name: `Strike ${id.slice(-2)}`, movement: planMovement(hex, hex, opts.departs ?? 0, 1) });
  save.loadouts[fleetId] = { ships, supply: 50, ...(opts.stance ? { orders: { stance: opts.stance } } : {}) };
  for (const x of ships) save.economy.roster[x.classId] = (save.economy.roster[x.classId] ?? 0) + x.count;
  return save;
}

const fid = (id: string) => `strike-${id.slice(-2)}`;
const player = (id: string) => ({ id, name: `P${id.slice(-2)}` });
/** A returned save, as the loose record it is (the rules keep its shape). */
const asSave = (save: Record<string, unknown>) => save as Record<string, any>;
const news = (save: Record<string, unknown>): string => asSave(save).dispatches.map((d: { text: string }) => d.text).join('\n');
const loadoutOf = (save: Record<string, unknown>, id: string) => asSave(save).loadouts[fid(id)];

/** The ships a fleet still has (none once it is wiped out and disbanded). */
const fleetOf = (save: Record<string, any>, id: string) => (save.loadouts[fid(id)]?.ships ?? []) as Squadron[];
const total = (ships: Squadron[]) => ships.reduce((n, x) => n + x.count, 0);
const interceptors = (n: number): Squadron[] => [{ classId: 'interceptor', count: n }];

/** The save with one of its fleets given another id (ids are only unique within an empire). */
function renameFleet(save: Record<string, any>, from: string, to: string): Record<string, any> {
  save.fleets = save.fleets.map((f: { id: string }) => (f.id === from ? { ...f, id: to } : f));
  const { [from]: l, ...rest } = save.loadouts;
  save.loadouts = { ...rest, [to]: l };
  return save;
}

/** Resolve a contact between the two empires' fleets at `HERE` in year `tick`. */
/** A and B have been at war for a long time (fleets fight only at war). */
const WAR = applyEffects(EMPTY_WORLD, [{ kind: 'contact', a: A, b: B, at: 0 }, { kind: 'diplomacy', by: A, other: B, action: 'declare-war', at: 0 }]);

function meet(a: Record<string, any>, b: Record<string, any>, tick = T) {
  return resolveContact(a, player(A), fid(A), b, player(B), fid(B), tick, WAR);
}

describe('a battle at sea is a round a year until one side is gone or breaks off', () => {
  /** Both empires one year on, then the next round. */
  const nextYear = (r: NonNullable<ReturnType<typeof meet>>, tick: number) => {
    const a = advanceSave(r.saveA, player(A), tick + 1)!.save;
    const b = advanceSave(r.saveB, player(B), tick + 1)!.save;
    return { a, b, r: meet(a, b, tick + 1) };
  };

  it('every round costs at least one ship, and the rounds count up', () => {
    let r = meet(empireWith(A, interceptors(8), HERE, { stance: 'aggressive' }), empireWith(B, interceptors(8), HERE))!;
    let left = total(fleetOf(r.saveA, A)) + total(fleetOf(r.saveB, B));
    expect(left).toBeLessThan(16);
    expect((asSave(r.saveA).loadouts[fid(A)] as { battle: { round: number } }).battle.round).toBe(1);
    let reached = 1;
    for (let tick = T, round = 2; r && round <= 4; tick++, round++) {
      const next = nextYear(r, tick);
      if (!next.r) break; // one side is gone
      r = next.r;
      reached = round;
      const now = total(fleetOf(r.saveA, A)) + total(fleetOf(r.saveB, B));
      expect(now).toBeLessThan(left);
      left = now;
      expect(news(r.saveA)).toMatch(new RegExp(`round ${round}|destroyed`));
    }
    expect(reached).toBeGreaterThanOrEqual(2);
  });

  it('either side can retreat at any time: the battle ends there', () => {
    const r = meet(empireWith(A, interceptors(8), HERE, { stance: 'aggressive' }), empireWith(B, interceptors(8), HERE))!;
    // B breaks off between ticks: an order the server applies at once.
    const fled = applyCommand(r.saveB, player(B), T + 0.5, encodeCommand('retreat', [fid(B)]))!;
    expect(fled.ok).toBe(true);
    expect(news(fled.save)).toContain('retreats to');
    const a = advanceSave(r.saveA, player(A), T + 1)!.save;
    const b = advanceSave(fled.save, player(B), T + 1)!.save;
    expect(meet(a, b, T + 1)).toBeNull();
  });
});

describe('chases: a faster fleet catches up, a slower one only when its quarry stops', () => {
  const FAR = { q: 40, r: 0 };
  const DRIVES = ['t-fusion', 't-warp-lanes'];
  type Side = { save: Record<string, any>; public: unknown };
  const asOther = (id: string, side: Side) => [{ ...(side.public as object), id, name: `P${id.slice(-2)}` }];

  /** A (warships, `aDrives`) and B (`bDrives`) on station together; B sets off for FAR; A is told to chase it. */
  function setUp(aDrives: string[], bDrives: string[]) {
    const a0 = empireWith(A, interceptors(6), HERE);
    a0.empire.research.researched.push(...aDrives);
    const b0 = empireWith(B, interceptors(6), HERE);
    b0.empire.research.researched.push(...bDrives);
    const pubOf = (save: Record<string, any>, id: string) => advanceSave(save, player(id), T + 0)?.public ?? applyCommand(save, player(id), T, { name: 'setFocus', args: [null] })!.public;
    let b: Side = { save: b0, public: pubOf(b0, B) };
    const moved = applyCommand(b.save, player(B), T, encodeCommand('moveFleetToHex', [fid(B), FAR, 'far away', false]))!;
    // B set off a few years ago: it has a head start.
    const head = planMovement(HERE, FAR, T - 6, (moved.save.fleets as Array<{ id: string; movement: { speed: number } }>).find((f) => f.id === fid(B))!.movement.speed);
    const withHead = <F extends { id: string }>(fs: F[]) => fs.map((f) => (f.id === fid(B) ? { ...f, movement: head } : f));
    b = { save: { ...moved.save, fleets: withHead(moved.save.fleets as never) }, public: { ...(moved.public as object), fleets: withHead((moved.public as unknown as { fleets: never }).fleets) } };
    const ordered = applyCommand(a0, player(A), T, encodeCommand('chase', [fid(A), `${B}:${fid(B)}`]), undefined, WAR, asOther(B, b))!;
    expect(ordered.ok).toBe(true);
    expect(loadoutOf(ordered.save, A).orders.chase).toBe(`${B}:${fid(B)}`);
    return { a: { save: ordered.save, public: ordered.public } as Side, b };
  }

  /** Play both empires year by year until the chaser catches the quarry (or `years` pass). */
  function run(a: Side, b: Side, years: number, onYear: (tick: number, b: Side) => Side = (_, x) => x) {
    for (let tick = T + 1; tick <= T + years; tick++) {
      const na = advanceSave(a.save, player(A), tick, WAR, [], asOther(B, b))!;
      const nb = advanceSave(b.save, player(B), tick, WAR, [], asOther(A, a))!;
      a = { save: na.save, public: na.public };
      b = onYear(tick, { save: nb.save, public: nb.public });
      const players = [{ id: A, public: a.public as never }, { id: B, public: b.public as never }];
      const caught = findPursuits(players, tick, findContacts(players, tick, WAR), WAR);
      if (caught.length) return { tick, caught: caught[0], a, b };
    }
    return null;
  }

  it('a faster chaser runs its quarry down on the way, then they fight where they meet', () => {
    const { a, b } = setUp(DRIVES, []);
    const hit = run(a, b, 20)!;
    expect(hit).not.toBeNull();
    expect(hit.tick).toBeGreaterThan(T + 1); // it had to close the gap first
    expect(hit.caught.a).toEqual({ player: A, fleet: fid(A) });
    const r = resolvePursuit(hit.a.save, player(A), fid(A), hit.b.save, player(B), fid(B), hit.tick, WAR)!;
    expect(r).not.toBeNull();
    expect(news(r.saveB)).toContain('Overtaken while breaking off');
    expect(news(r.saveA)).toMatch(/round 1|destroyed/);
  });

  it('a slower chaser does not catch a fleet that keeps moving, but does once it stops long enough', () => {
    const { a, b } = setUp([], DRIVES);
    expect(run(a, b, 12)).toBeNull();
    // The quarry reaches FAR and stays there: the slow chaser arrives in the end.
    expect(run(a, b, 80)).not.toBeNull();
  });

  it('any other course ends the chase', () => {
    const { a } = setUp(DRIVES, []);
    const r = applyCommand(a.save, player(A), T + 0.5, encodeCommand('moveFleetToHex', [fid(A), { q: -5, r: 5 }, 'elsewhere', false]))!;
    expect(loadoutOf(r.save, A).orders.chase).toBeUndefined();
  });

  it('an aggressive fleet gives chase on its own when its foe breaks off', () => {
    const r = meet(empireWith(A, interceptors(8), HERE, { stance: 'aggressive' }), empireWith(B, interceptors(8), HERE))!;
    const fled = applyCommand(r.saveB, player(B), T + 0.5, encodeCommand('retreat', [fid(B)]))!;
    const a = advanceSave(r.saveA, player(A), T + 1, WAR, [], asOther(B, { save: fled.save, public: fled.public }))!;
    expect(loadoutOf(a.save, A).orders.chase).toBe(`${B}:${fid(B)}`);
    expect(news(a.save)).toContain('gives chase');
  });
});

describe('a single round', () => {
  const side = (n: number, name: string) => ({ name, ships: [{ classId: 'lancer', count: n }] });
  it('always destroys at least one ship, the same way for the same seed', () => {
    for (let seed = 1; seed < 40; seed++) {
      const r = resolveRound(side(1, 'a'), side(1, 'b'), SHIP_CLASSES, seed, 1);
      expect(r.rounds[0].losses[0] + r.rounds[0].losses[1]).toBeGreaterThanOrEqual(1);
      expect(resolveRound(side(1, 'a'), side(1, 'b'), SHIP_CLASSES, seed, 1)).toEqual(r);
    }
  });
  it('fleets close from long to short range over the rounds', () => {
    expect(resolveRound(side(5, 'a'), side(5, 'b'), SHIP_CLASSES, 7, 1).rounds[0].band).toBe('long');
    expect(resolveRound(side(5, 'a'), side(5, 'b'), SHIP_CLASSES, 7, 6).rounds[0].band).toBe('short');
  });
});

describe('a battle at sea needs an aggressive armed fleet', () => {
  it('passive fleets pass each other: no battle', () => {
    expect(meet(empireWith(A, interceptors(4), HERE), empireWith(B, interceptors(4), HERE))).toBeNull();
  });

  it('an aggressive armed fleet attacks a passive one on the same hex', () => {
    const r = meet(empireWith(A, interceptors(4), HERE, { stance: 'aggressive' }), empireWith(B, interceptors(4), HERE));
    expect(r).not.toBeNull();
  });

  it('an aggressive fleet with no warships starts nothing', () => {
    const freighters: Squadron[] = [{ classId: 'bulk-freighter', count: 3 }];
    expect(meet(empireWith(A, freighters, HERE, { stance: 'aggressive' }), empireWith(B, interceptors(4), HERE))).toBeNull();
  });

  it('fleets on different hexes, or not yet on station, do not meet', () => {
    const apart = { q: 2, r: 0 };
    expect(meet(empireWith(A, interceptors(4), HERE, { stance: 'aggressive' }), empireWith(B, interceptors(4), apart))).toBeNull();
    expect(meet(empireWith(A, interceptors(4), HERE, { stance: 'aggressive' }), empireWith(B, interceptors(4), HERE, { departs: T + 3 }))).toBeNull();
  });
});

describe('a battle belongs to the year both empires have reached', () => {
  it('an empire that has not played to the year (or has played past it) does not fight in it', () => {
    const a = empireWith(A, interceptors(4), HERE, { stance: 'aggressive' });
    const b = empireWith(B, interceptors(4), HERE);
    expect(meet({ ...a, turn: T - 1 }, b)).toBeNull();
    expect(meet(a, { ...b, turn: T + 1 })).toBeNull();
  });
});

describe('both sides of a battle lose ships and hear about it', () => {
  it('each empire keeps its own losses, and each dispatch names the other fleet', () => {
    const a = empireWith(A, interceptors(6), HERE, { stance: 'aggressive' });
    const b = empireWith(B, interceptors(6), HERE);
    const r = meet(a, b)!;
    // One round: at least one ship is lost between them.
    expect(total(fleetOf(r.saveA, A)) + total(fleetOf(r.saveB, B))).toBeLessThan(12);
    expect(news(r.saveA)).toContain(`Strike ${B.slice(-2)} of P${B.slice(-2)}`);
    expect(news(r.saveB)).toContain(`Strike ${A.slice(-2)} of P${A.slice(-2)}`);
    expect(news(r.saveA)).toMatch(/at deep space, round 1/);
    // The empire's roster loses the same ships, and a fleet wiped out is gone from the map.
    for (const [save, id, before] of [[r.saveA, A, a], [r.saveB, B, b]] as const) {
      const left = total(fleetOf(save, id));
      expect(asSave(save).economy.roster.interceptor).toBe(before.economy.roster.interceptor - (6 - left));
      const pub = (save === r.saveA ? r.publicA : r.publicB).fleets.find((f) => f.id === fid(id));
      expect(pub?.armed ?? false).toBe(left > 0);
    }
  });

  it('another player\'s names in the dispatch are bounded', () => {
    const b = empireWith(B, interceptors(6), HERE);
    b.fleets = b.fleets.map((f: { id: string }) => (f.id === fid(B) ? { ...f, name: 'X'.repeat(500) } : f));
    const r = meet(empireWith(A, interceptors(6), HERE, { stance: 'aggressive' }), b)!;
    expect(news(r.saveA)).toContain(` ${'X'.repeat(64)} of `);
    expect(news(r.saveA)).not.toContain('X'.repeat(65));
  });

  it('the saves it returns are ready for the server to store (no tab, the owner kept)', () => {
    const r = meet(empireWith(A, interceptors(6), HERE, { stance: 'aggressive' }), empireWith(B, interceptors(6), HERE))!;
    expect(r.saveA.tab).toBeUndefined();
    expect(r.saveA.turn).toBe(T);
    expect(r.publicA.fleets.every((f) => f.armed !== undefined)).toBe(true);
  });
});

describe('the same contact always resolves the same way', () => {
  it('the battle is deterministic in both fleets and the year', () => {
    const a = () => empireWith(A, interceptors(6), HERE, { stance: 'aggressive' });
    const b = () => empireWith(B, interceptors(6), HERE);
    expect(meet(a(), b(), T)).toEqual(meet(a(), b(), T));
    const later = (save: Record<string, any>) => ({ ...save, turn: T + 1 });
    const next = meet(later(a()), later(b()), T + 1);
    expect(next).not.toBeNull();
    expect(meet(a(), b(), T)).not.toEqual(next);
  });

  it('fleets with the same id in two empires still fight the same battle whichever asks', () => {
    const a = () => { const s = empireWith(A, interceptors(6), HERE, { stance: 'aggressive' }); return renameFleet(s, fid(A), 'strike'); };
    const b = () => { const s = empireWith(B, interceptors(6), HERE, { stance: 'aggressive' }); return renameFleet(s, fid(B), 'strike'); };
    const ab = resolveContact(a(), player(A), 'strike', b(), player(B), 'strike', T, WAR)!;
    const ba = resolveContact(b(), player(B), 'strike', a(), player(A), 'strike', T, WAR)!;
    expect(ab).not.toBeNull();
    expect(ab.saveA).toEqual(ba.saveB);
    expect(ab.saveB).toEqual(ba.saveA);
  });

  it('the seed does not depend on which empire asks first', () => {
    const a = () => empireWith(A, interceptors(6), HERE, { stance: 'aggressive' });
    const b = () => empireWith(B, interceptors(6), HERE);
    const ab = resolveContact(a(), player(A), fid(A), b(), player(B), fid(B), T, WAR)!;
    const ba = resolveContact(b(), player(B), fid(B), a(), player(A), fid(A), T, WAR)!;
    // In the swapped call the first save is B's: compare each empire with its own save.
    expect(total(fleetOf(ab.saveA, A))).toBe(total(fleetOf(ba.saveB, A)));
    expect(total(fleetOf(ab.saveB, B))).toBe(total(fleetOf(ba.saveA, B)));
  });
});

describe('orders carry the stance', () => {
  it('the codec sends an aggressive stance and leaves a passive fleet without one', () => {
    const sim = undefined as unknown as EmpireSim;
    const aggressive = decodeArgs(encodeCommand('setOrders', [fid(A), { autoExplore: false, autoReturn: true, stance: 'aggressive' }]), sim);
    expect(aggressive.args[1]).toEqual({ autoExplore: false, autoReturn: true, autoMine: false, stance: 'aggressive' });
    const passive = decodeArgs(encodeCommand('setOrders', [fid(A), { autoExplore: true, autoReturn: false }]), sim);
    expect('stance' in (passive.args[1] as object)).toBe(false);
  });

  it('the server keeps the stance an order sets, and clears it when the order drops it', () => {
    const save = empireWith(A, interceptors(4), HERE);
    const on = applyCommand(save, player(A), T, encodeCommand('setOrders', [fid(A), { autoExplore: false, autoReturn: false, stance: 'aggressive' }]))!;
    expect(on.ok).toBe(true);
    expect(loadoutOf(on.save, A).orders.stance).toBe('aggressive');
    const off = applyCommand(on.save, player(A), T, encodeCommand('setOrders', [fid(A), { autoExplore: false, autoReturn: false }]))!;
    expect(loadoutOf(off.save, A).orders.stance).toBeUndefined();
  });

  it('a fleet with no warships cannot be set aggressive', () => {
    const save = empireWith(A, [{ classId: 'bulk-freighter', count: 2 }], HERE);
    const r = applyCommand(save, player(A), T, encodeCommand('setOrders', [fid(A), { autoExplore: false, autoReturn: false, stance: 'aggressive' }]))!;
    expect(r.ok).toBe(true);
    expect(loadoutOf(r.save, A).orders.stance).toBeUndefined();
  });

  it('an old save without a stance is passive, and its public fleets say so', () => {
    const save = empireWith(A, interceptors(4), HERE);
    delete save.loadouts[fid(A)].orders;
    const r = applyCommand(save, player(A), T, encodeCommand('collectAllLoot', []))!;
    const pub = r.public.fleets.find((f) => f.id === fid(A))!;
    expect(pub.armed).toBe(true);
    expect(pub.stance).toBeUndefined();
  });
});

describe('finding contacts in the stored public views', () => {
  const fleet = (id: string, hex: Hex, armed: boolean, stance?: string, departs = 0) => ({ id, movement: planMovement(hex, hex, departs, 1), armed, ...(stance ? { stance } : {}) });

  it('pairs fleets of different players on one hex, at most once per fleet', () => {
    const players = [
      { id: A, public: { fleets: [fleet('x', HERE, true, 'aggressive')] } },
      { id: B, public: { fleets: [fleet('y', HERE, true), fleet('z', HERE, true)] } },
    ];
    const contacts = findContacts(players, T, WAR);
    expect(contacts).toHaveLength(1);
    expect(contacts[0].a).toEqual({ player: A, fleet: 'x' });
    expect(contacts[0].b.player).toBe(B);
  });

  it('ignores passive pairs, fleets of one player, and fleets not on station', () => {
    expect(findContacts([{ id: A, public: { fleets: [fleet('x', HERE, true)] } }, { id: B, public: { fleets: [fleet('y', HERE, true)] } }], T, WAR)).toEqual([]);
    expect(findContacts([{ id: A, public: { fleets: [fleet('x', HERE, true, 'aggressive'), fleet('w', HERE, true)] } }], T, WAR)).toEqual([]);
    expect(findContacts([{ id: A, public: { fleets: [fleet('x', HERE, true, 'aggressive')] } }, { id: B, public: { fleets: [fleet('y', HERE, true, undefined, T + 2)] } }], T, WAR)).toEqual([]);
  });
});

describe('damage carries over, Menders and friendly systems repair it', () => {
  const lancers: Squadron[] = [{ classId: 'lancer', count: 6 }];
  const hullOf = (id: string) => SHIP_CLASSES.find((c) => c.id === id)!.hull;

  it('a round leaves damage on the survivors, and the next round starts from it', () => {
    const a = empireWith(A, lancers, HERE, { stance: 'aggressive' });
    const b = empireWith(B, interceptors(8), HERE);
    const r = meet(a, b)!;
    const carried = [loadoutOf(r.saveA, A)?.damage, loadoutOf(r.saveB, B)?.damage].filter(Boolean);
    expect(carried.length).toBeGreaterThan(0);
    for (const d of carried) for (const [id, v] of Object.entries(d as Record<string, number>)) expect(v).toBeLessThan(hullOf(id));
  });

  it('Menders patch their fleet between rounds', () => {
    const plain = resolveRound({ name: 'A', ships: lancers, damage: { lancer: 30 } }, { name: 'B', ships: [{ classId: 'flak-picket', count: 1 }] }, SHIP_CLASSES, 3, 1);
    const mended = resolveRound({ name: 'A', ships: [...lancers, { classId: 'repair-tender', count: 2 }], damage: { lancer: 30 } }, { name: 'B', ships: [{ classId: 'flak-picket', count: 1 }] }, SHIP_CLASSES, 3, 1);
    expect(mended.damage[0].lancer ?? 0).toBeLessThan(plain.damage[0].lancer ?? 0);
  });

  it('repairs fully at a shipyard world, not at all in deep space', () => {
    const at = (hex: Hex) => {
      const s = empireWith(A, lancers, hex);
      s.loadouts[fid(A)] = { ...s.loadouts[fid(A)], damage: { lancer: 40 } };
      return advanceSave(s, player(A), T + 1)!.save as Record<string, any>;
    };
    const home = empireWith(A, [], HERE).home.hex;
    expect(at(home).loadouts[fid(A)].damage).toBeUndefined();
    expect(at(HERE).loadouts[fid(A)].damage).toEqual({ lancer: 40 });
  });

  it('repairs slowly at an outpost (a supply depot): 15 hull points a year', () => {
    const star = galaxy.nearestStar({ q: 40, r: -20 })!;
    const s = empireWith(A, lancers, star.hex);
    s.depots = [star.id];
    s.loadouts[fid(A)] = { ...s.loadouts[fid(A)], damage: { lancer: 40 } };
    const next = advanceSave(s, player(A), T + 1)!.save as Record<string, any>;
    expect(next.loadouts[fid(A)].damage).toEqual({ lancer: 25 });
  });

  it('old saves lose their ammunition', () => {
    const s = empireWith(A, lancers, HERE);
    s.loadouts[fid(A)] = { ...s.loadouts[fid(A)], ammo: 12 };
    s.dockSpent = { supply: 0, ammo: 3 };
    const next = advanceSave(s, player(A), T + 1)!.save as Record<string, any>;
    expect('ammo' in next.loadouts[fid(A)]).toBe(false);
    expect('ammo' in next.dockSpent).toBe(false);
  });
});
