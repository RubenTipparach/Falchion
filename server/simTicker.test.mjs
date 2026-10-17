import { describe, expect, it } from 'vitest';
import { createSimTicker } from './simTicker.mjs';
import { createCommandService } from './commands.mjs';
import { createLocks } from './locks.mjs';
import { oncePerTick } from './markets.mjs';
import { encodeCommand } from '../src/sim/commands.ts';
import * as sim from '../src/sim/headless.ts';
import { newEmpireState } from '../src/sim/newEmpireState.ts';
import { GalaxyModel } from '../src/core/galaxy/GalaxyModel.ts';
import { TechTree } from '../src/core/research/TechTree.ts';
import { TECH_NODES } from '../src/content/techTree.ts';
import { SHARD_SOURCES } from '../src/content/shardSources.ts';
import { createWorld } from '../src/app/World.ts';
import { SaveGame } from '../src/app/SaveGame.ts';
import { planMovement } from '../src/core/fleet/Fleet.ts';

const galaxy = new GalaxyModel();
const tree = new TechTree(TECH_NODES, SHARD_SOURCES);

function saveFor(id, t0) {
  const world = createWorld(galaxy, id);
  const state = newEmpireState({ galaxy, tree, world, playerName: `P${id.slice(-2)}`, t0 });
  const save = new SaveGame(galaxy.params.seed, null).snapshot(state);
  delete save.tab;
  return save;
}

function memoryStore(records) {
  const map = new Map(Object.entries(records));
  return {
    map,
    ids: async () => [...map.keys()],
    load: async (id) => (map.has(id) ? structuredClone(map.get(id)) : null),
    save: async (id, r) => { map.set(id, structuredClone(r)); },
  };
}

describe('the server runs every empire', () => {
  const NOW = 10_000_000;
  const A = '111111111111111111', B = '222222222222222222';

  it('plays every empire forward each world year, tells other players and sends the owner their state', async () => {
    const store = memoryStore({
      [A]: { player: { id: A, name: 'A' }, save: saveFor(A, 500), public: {}, updatedAt: NOW - 10 * 60_000 },
      [B]: { player: { id: B, name: 'B' }, save: saveFor(B, 500), public: {}, updatedAt: NOW - 1_000 },
    });
    const published = [], owners = [];
    const ticker = createSimTicker({ store, loadSim: async () => sim, publish: (p) => published.push(p.id), notifyOwner: (id, save) => owners.push([id, save.turn]), now: () => NOW });
    expect(await ticker.tick(520)).toBe(2);
    expect(store.map.get(A).save.turn).toBe(520);
    expect(store.map.get(B).save.turn).toBe(520);
    expect(store.map.get(A).updatedAt).toBe(NOW - 10 * 60_000); // the owner's last order, unchanged
    expect(store.map.get(A).simulatedAt).toBe(NOW);
    expect(published.sort()).toEqual([A, B]);
    expect(owners).toContainEqual([A, 520]);
    await ticker.tick(521);
    expect(store.map.get(A).save.turn).toBe(521);
  });

  it('does nothing without the bundled simulation, and skips broken saves', async () => {
    const store = memoryStore({ [A]: { player: { id: A, name: 'A' }, save: { turn: 1 }, public: {}, updatedAt: 0 } });
    expect(await createSimTicker({ store, loadSim: async () => null }).tick(520)).toBe(0);
    expect(await createSimTicker({ store, loadSim: async () => sim }).tick(520)).toBe(0);
  });
});

describe('orders are commands the server applies', () => {
  const A = '111111111111111111';
  const user = { id: A, name: 'A', avatar: null };

  function service(store, opts = {}) {
    return createCommandService({ store, loadSim: async () => sim, withLock: createLocks(), worldTime: () => 600.25, ...opts });
  }

  it('applies an order to the server copy, saves it and returns the truth', async () => {
    const store = memoryStore({ [A]: { player: { id: A, name: 'A' }, save: saveFor(A, 600), public: {}, updatedAt: 0 } });
    const published = [];
    const r = await service(store, { publish: (p) => published.push(p.id) }).apply(user, { command: encodeCommand('setOrders', ['survey-1', { autoExplore: true, autoReturn: true }]) });
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
    expect(store.map.get(A).save.loadouts['survey-1'].orders).toEqual({ autoExplore: true, autoReturn: true });
    expect(r.body.save.loadouts['survey-1'].orders.autoExplore).toBe(true);
    expect(published).toEqual([A]);
  });

  it('refuses what the rules refuse, and orders for an empire that does not exist yet', async () => {
    const store = memoryStore({ [A]: { player: { id: A, name: 'A' }, save: saveFor(A, 600), public: {}, updatedAt: 0 } });
    const bad = await service(store).apply(user, { command: { name: 'grantShards', args: ['t-fusion', 'exploration', 1e6] } });
    expect(bad.body.ok).toBe(false);
    expect(store.map.get(A).save.empire.research).toEqual(saveFor(A, 600).empire.research);
    const none = await service(memoryStore({})).apply(user, { command: encodeCommand('collectAllLoot', []) });
    expect(none.status).toBe(404);
  });

  it('applies a quick burst of orders one at a time, in order, and rate-limits a flood', async () => {
    const store = memoryStore({ [A]: { player: { id: A, name: 'A' }, save: saveFor(A, 600), public: {}, updatedAt: 0 } });
    const svc = service(store);
    const results = await Promise.all([true, false, true].map((on) => svc.apply(user, { command: encodeCommand('setOrders', ['survey-1', { autoExplore: on, autoReturn: false }]) })));
    expect(results.every((r) => r.body.ok)).toBe(true);
    expect(store.map.get(A).save.loadouts['survey-1'].orders.autoExplore).toBe(true);
    const flood = await Promise.all(Array.from({ length: 50 }, () => svc.apply(user, { command: encodeCommand('collectAllLoot', []) })));
    expect(flood.some((r) => r.status === 429)).toBe(true);
  });
});

describe("other players' worlds are markets on the server", () => {
  const NOW = 10_000_000;
  const A = '111111111111111111', B = '222222222222222222';
  const homeOf = (id) => createWorld(galaxy, id).home;
  const bPublic = () => ({ color: '#4fd1ff', empire: { name: 'Bee Hive', ruler: 'B', title: 'Queen', capital: 'Hive', flag: null }, home: homeOf(B).hex, colonies: [homeOf(B).hex], fleets: [] });

  it('the ticker reads every empire once a year and plays each against the others', async () => {
    const store = memoryStore({
      [A]: { player: { id: A, name: 'A' }, save: saveFor(A, 500), public: {}, updatedAt: 0 },
      [B]: { player: { id: B, name: 'B' }, save: saveFor(B, 500), public: bPublic(), updatedAt: 0 },
    });
    const calls = [];
    const spy = { ...sim, advanceSave: (save, player, toTurn, world, raids, others) => { calls.push({ id: player.id, others }); return sim.advanceSave(save, player, toTurn, world, raids, others); } };
    expect(await createSimTicker({ store, loadSim: async () => spy }).tick(501)).toBe(2);
    expect(calls.map((c) => c.id).sort()).toEqual([A, B]);
    // One list for the whole year (read before anyone played), with names and public worlds.
    expect(calls[0].others).toBe(calls[1].others);
    expect(calls[0].others.find((o) => o.id === B)).toMatchObject({ id: B, name: 'B', empire: { name: 'Bee Hive' }, home: homeOf(B).hex });
  });

  it("orders see other players' worlds as markets, without touching those players' saves", async () => {
    const store = memoryStore({
      [A]: { player: { id: A, name: 'A' }, save: saveFor(A, 600), public: {}, updatedAt: 0 },
      [B]: { player: { id: B, name: 'B' }, save: saveFor(B, 600), public: bPublic(), updatedAt: 0 },
    });
    const target = homeOf(B);
    const run = encodeCommand('tradeRun', ['dock', target]);
    // Without the other empires the server knows no market there.
    const blind = createCommandService({ store, loadSim: async () => sim, withLock: createLocks(), worldTime: () => 600 });
    await blind.apply({ id: A, name: 'A' }, { command: run });
    expect(Object.values(store.map.get(A).save.loadouts).some((l) => l.orders?.trade)).toBe(false);
    // As store.players() lists them: every empire's public view with its id and name.
    const players = async () => [...store.map.values()].map((r) => ({ ...r.public, id: r.player.id, name: r.player.name }));
    const svc = createCommandService({ store, loadSim: async () => sim, withLock: createLocks(), worldTime: () => 600, others: players });
    const bBefore = structuredClone(store.map.get(B).save);
    const r = await svc.apply({ id: A, name: 'A' }, { command: run });
    expect(r.body.ok).toBe(true);
    const trade = Object.values(r.body.save.loadouts).find((l) => l.orders?.trade);
    expect(trade.orders.trade.to).toBe(target.id);
    expect(store.map.get(B).save).toEqual(bBefore);
  });
});

describe('the other empires are read once a world year for orders', () => {
  it('shares one read per tick, reads again next tick, and retries after a failure', async () => {
    let tick = 1, reads = 0, broken = false;
    const get = oncePerTick(async () => { reads++; if (broken) throw new Error('disk'); return [{ id: 'x' }]; }, () => tick);
    const [a, b] = await Promise.all([get(), get()]);
    expect(a).toBe(b);
    expect(reads).toBe(1);
    tick = 2;
    await get();
    expect(reads).toBe(2);
    tick = 3; broken = true;
    expect(await get()).toEqual([]);
    broken = false;
    expect(await get()).toEqual([{ id: 'x' }]);
    expect(reads).toBe(4);
  });
});

describe('fleets of two players that meet at sea fight in the year', () => {
  const NOW = 10_000_000;
  const A = '111111111111111111', B = '222222222222222222';
  const HERE = { q: 0, r: 0 };

  /** A stored empire with `count` interceptors on station at HERE, aggressive when `stance`. */
  function warSave(id, t0, count, stance) {
    const save = saveFor(id, t0);
    const fleetId = `strike-${id.slice(-2)}`;
    save.fleets.push({ ...save.fleets[0], id: fleetId, name: `Strike ${id.slice(-2)}`, movement: planMovement(HERE, HERE, 0, 1) });
    save.loadouts[fleetId] = { ships: [{ classId: 'interceptor', count }], supply: 50, ammo: 50, ...(stance ? { orders: { stance } } : {}) };
    save.economy.roster.interceptor = (save.economy.roster.interceptor ?? 0) + count;
    return save;
  }
  const shipsOf = (save, id) => (save.loadouts[`strike-${id.slice(-2)}`]?.ships ?? []).reduce((n, x) => n + x.count, 0);
  const fought = (save) => save.dispatches.some((d) => /Battle at|destroyed/.test(d.text));

  it('an aggressive fleet attacks a passive one: both empires keep their losses and are told', async () => {
    const store = memoryStore({
      [A]: { player: { id: A, name: 'A' }, save: warSave(A, 500, 6, undefined), public: {}, updatedAt: NOW },
      [B]: { player: { id: B, name: 'B' }, save: warSave(B, 500, 6, 'aggressive'), public: {}, updatedAt: NOW },
    });
    const owners = [];
    const ticker = createSimTicker({ store, loadSim: async () => sim, publish: () => {}, notifyOwner: (id) => owners.push(id), now: () => NOW });
    await ticker.tick(520);
    expect(fought(store.map.get(A).save)).toBe(true);
    expect(fought(store.map.get(B).save)).toBe(true);
    // A round: at least one ship lost between them.
    expect(shipsOf(store.map.get(A).save, A) + shipsOf(store.map.get(B).save, B)).toBeLessThan(12);
    expect(owners).toEqual(expect.arrayContaining([A, B]));
  });

  it('two passive fleets on one hex do not fight', async () => {
    const store = memoryStore({
      [A]: { player: { id: A, name: 'A' }, save: warSave(A, 500, 6, undefined), public: {}, updatedAt: NOW },
      [B]: { player: { id: B, name: 'B' }, save: warSave(B, 500, 6, undefined), public: {}, updatedAt: NOW },
    });
    await createSimTicker({ store, loadSim: async () => sim, now: () => NOW }).tick(520);
    expect(fought(store.map.get(A).save)).toBe(false);
    expect(fought(store.map.get(B).save)).toBe(false);
    expect(shipsOf(store.map.get(A).save, A)).toBe(6);
  });

  /** A simulation that reports one contact, B's fleet first, and fights it with `resolve`. */
  const stubSim = (resolve) => ({
    advanceSave: () => null,
    findContacts: () => [{ a: { player: B, fleet: 'y' }, b: { player: A, fleet: 'x' } }],
    resolveContact: resolve,
  });

  it('a year\'s battles are fought once, even if the year is ticked again', async () => {
    const store = memoryStore({
      [A]: { player: { id: A, name: 'A' }, save: { turn: 520 }, public: {}, updatedAt: NOW },
      [B]: { player: { id: B, name: 'B' }, save: { turn: 520 }, public: {}, updatedAt: NOW },
    });
    const fought = [];
    const ticker = createSimTicker({ store, loadSim: async () => stubSim((...args) => { fought.push(args[6]); return null; }), now: () => NOW });
    await ticker.tick(520);
    await ticker.tick(520);
    await ticker.tick(521);
    expect(fought).toEqual([520, 521]);
  });

  it('locks the lower id first even when the higher one is listed first, and a command waiting on either still runs', async () => {
    const store = memoryStore({
      [A]: { player: { id: A, name: 'A' }, save: { turn: 520 }, public: {}, updatedAt: NOW },
      [B]: { player: { id: B, name: 'B' }, save: { turn: 520 }, public: {}, updatedAt: NOW },
    });
    const locks = createLocks();
    const keys = [];
    const withLock = (key, fn) => { keys.push(key); return locks(key, fn); };
    const ticking = createSimTicker({ store, loadSim: async () => stubSim(() => null), withLock, now: () => NOW }).tick(520);
    const order = locks(B, async () => 'command');
    await expect(Promise.all([ticking, order])).resolves.toEqual([0, 'command']);
    expect(keys.slice(-2)).toEqual([A, B]); // after each empire's own year
  });

  it('if the second empire cannot be saved, the first is put back: both keep the battle or neither does', async () => {
    const before = { player: { id: A, name: 'A' }, save: { turn: 520, mark: 'before' }, public: {}, updatedAt: NOW };
    const store = memoryStore({ [A]: before, [B]: { player: { id: B, name: 'B' }, save: { turn: 520 }, public: {}, updatedAt: NOW } });
    const save = store.save;
    store.save = async (id, r) => { if (id === A && r.save.mark === 'after') throw new Error('disk full'); return save(id, r); };
    const owners = [], logs = [];
    const battle = () => ({ saveA: { turn: 520, mark: 'after' }, publicA: {}, saveB: { turn: 520, mark: 'after' }, publicB: {} });
    await createSimTicker({ store, loadSim: async () => stubSim(battle), notifyOwner: (id) => owners.push(id), log: (m) => logs.push(m), now: () => NOW }).tick(520);
    expect(store.map.get(B).save.mark).toBeUndefined();
    expect(store.map.get(A)).toEqual(before);
    expect(owners).toEqual([]);
    expect(logs.some((m) => m.includes('disk full'))).toBe(true);
  });

  it('the pair is locked in id order, whichever empire is the aggressor', async () => {
    const store = memoryStore({
      [A]: { player: { id: A, name: 'A' }, save: warSave(A, 500, 6, undefined), public: {}, updatedAt: NOW },
      [B]: { player: { id: B, name: 'B' }, save: warSave(B, 500, 6, 'aggressive'), public: {}, updatedAt: NOW },
    });
    const keys = [];
    await createSimTicker({ store, loadSim: async () => sim, withLock: (key, fn) => { keys.push(key); return fn(); }, now: () => NOW }).tick(520);
    expect(keys.slice(-2)).toEqual([A, B]);
  });
});
