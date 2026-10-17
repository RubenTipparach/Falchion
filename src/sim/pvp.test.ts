import { describe, expect, it } from 'vitest';
import type { Squadron } from '../core/combat/Combat';
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
import { applyCommand, findContacts, resolveContact } from './headless';
import { decodeArgs, encodeCommand } from './commands';
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
  save.loadouts[fleetId] = { ships, supply: 50, ammo: 50, ...(opts.stance ? { orders: { stance: opts.stance } } : {}) };
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
function meet(a: Record<string, any>, b: Record<string, any>, tick = T) {
  return resolveContact(a, player(A), fid(A), b, player(B), fid(B), tick);
}

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
    expect(total(fleetOf(r.saveA, A))).toBeLessThan(6);
    expect(total(fleetOf(r.saveB, B))).toBeLessThan(6);
    expect(news(r.saveA)).toContain(`Strike ${B.slice(-2)} of P${B.slice(-2)}`);
    expect(news(r.saveB)).toContain(`Strike ${A.slice(-2)} of P${A.slice(-2)}`);
    expect(news(r.saveA)).toMatch(/at deep space: (victory|defeat|stalemate)/);
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
    const ab = resolveContact(a(), player(A), 'strike', b(), player(B), 'strike', T)!;
    const ba = resolveContact(b(), player(B), 'strike', a(), player(A), 'strike', T)!;
    expect(ab).not.toBeNull();
    expect(ab.saveA).toEqual(ba.saveB);
    expect(ab.saveB).toEqual(ba.saveA);
  });

  it('the seed does not depend on which empire asks first', () => {
    const a = () => empireWith(A, interceptors(6), HERE, { stance: 'aggressive' });
    const b = () => empireWith(B, interceptors(6), HERE);
    const ab = resolveContact(a(), player(A), fid(A), b(), player(B), fid(B), T)!;
    const ba = resolveContact(b(), player(B), fid(B), a(), player(A), fid(A), T)!;
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
    const contacts = findContacts(players, T);
    expect(contacts).toHaveLength(1);
    expect(contacts[0].a).toEqual({ player: A, fleet: 'x' });
    expect(contacts[0].b.player).toBe(B);
  });

  it('ignores passive pairs, fleets of one player, and fleets not on station', () => {
    expect(findContacts([{ id: A, public: { fleets: [fleet('x', HERE, true)] } }, { id: B, public: { fleets: [fleet('y', HERE, true)] } }], T)).toEqual([]);
    expect(findContacts([{ id: A, public: { fleets: [fleet('x', HERE, true, 'aggressive'), fleet('w', HERE, true)] } }], T)).toEqual([]);
    expect(findContacts([{ id: A, public: { fleets: [fleet('x', HERE, true, 'aggressive')] } }, { id: B, public: { fleets: [fleet('y', HERE, true, undefined, T + 2)] } }], T)).toEqual([]);
  });
});
