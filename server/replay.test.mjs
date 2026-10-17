// The event log against the real command pipeline: every order the server applies or refuses is
// logged, and the founding save plus the logged orders replay into exactly the stored empire.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { createCommandService } from './commands.mjs';
import { createEventLog, replay } from './eventLog.mjs';
import { createLocks } from './locks.mjs';
import { createSimTicker } from './simTicker.mjs';
import { encodeCommand } from '../src/sim/commands.ts';
import * as sim from '../src/sim/headless.ts';
import { newEmpireState } from '../src/sim/newEmpireState.ts';
import { GalaxyModel } from '../src/core/galaxy/GalaxyModel.ts';
import { TechTree } from '../src/core/research/TechTree.ts';
import { TECH_NODES } from '../src/content/techTree.ts';
import { SHARD_SOURCES } from '../src/content/shardSources.ts';
import { createWorld } from '../src/app/World.ts';
import { SaveGame } from '../src/app/SaveGame.ts';

const galaxy = new GalaxyModel();
const tree = new TechTree(TECH_NODES, SHARD_SOURCES);
const A = '111111111111111111';
const user = { id: A, name: 'A', avatar: null };
const dir = mkdtempSync(join(tmpdir(), 'falchion-replay-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

function saveFor(id, t0) {
  const world = createWorld(galaxy, id);
  const save = new SaveGame(galaxy.params.seed, null).snapshot(newEmpireState({ galaxy, tree, world, playerName: 'A', t0 }));
  delete save.tab;
  return save;
}

function memoryStore(records = {}) {
  const map = new Map(Object.entries(records));
  return {
    map,
    ids: async () => [...map.keys()],
    load: async (id) => (map.has(id) ? structuredClone(map.get(id)) : null),
    save: async (id, r) => { map.set(id, structuredClone(r)); },
  };
}

describe('the command service logs every order the rules ran', () => {
  const store = () => memoryStore({ [A]: { player: { id: A, name: 'A' }, save: saveFor(A, 600), public: {}, updatedAt: 0 } });
  const service = (s, opts) => createCommandService({ store: s, loadSim: async () => sim, withLock: createLocks(), worldTime: () => 600.25, now: () => 77, ...opts });

  it('logs applied and refused orders with the times the rules ran at', async () => {
    const lines = [];
    const svc = service(store(), { events: { append: (id, e) => { lines.push([id, e]); } } });
    const order = encodeCommand('setOrders', ['survey-1', { autoExplore: true, autoReturn: true }]);
    await svc.apply(user, { command: order, time: 600.2 });
    await svc.apply(user, { command: { name: 'grantShards', args: ['t-fusion', 'exploration', 1e6] } });
    expect(lines).toEqual([
      [A, { at: 77, worldTime: 600.25, turn: 600, command: order, clientTime: 600.2, ok: true, error: undefined }],
      [A, { at: 77, worldTime: 600.25, turn: 600, command: { name: 'grantShards', args: ['t-fusion', 'exploration', 1e6] }, clientTime: undefined, ok: false, error: 'unknown command' }],
    ]);
  });

  it('logs nothing the rules never saw: no empire, or a flood that was turned away', async () => {
    const lines = [];
    const events = { append: (id, e) => { lines.push(e); } };
    expect((await service(memoryStore(), { events }).apply(user, { command: encodeCommand('collectAllLoot', []) })).status).toBe(404);
    const svc = service(store(), { events });
    const flood = await Promise.all(Array.from({ length: 50 }, () => svc.apply(user, { command: encodeCommand('collectAllLoot', []) })));
    expect(flood.filter((r) => r.status === 429).length).toBe(50 - lines.length);
    expect(lines.length).toBe(40);
  });

  it('never fails an order because the log failed', async () => {
    const logged = [];
    const s = store();
    const throwing = service(s, { events: { append: () => { throw new Error('disk full'); } }, log: (m) => logged.push(m) });
    const rejecting = service(s, { events: { append: async () => { throw new Error('disk gone'); } }, log: (m) => logged.push(m) });
    const order = { command: encodeCommand('setOrders', ['survey-1', { autoExplore: true, autoReturn: true }]) };
    expect((await throwing.apply(user, order)).body.ok).toBe(true);
    expect((await rejecting.apply(user, order)).body.ok).toBe(true);
    await new Promise((r) => setTimeout(r, 0));
    expect(logged).toEqual(['event log: disk full', 'event log: disk gone']);
    expect(s.map.get(A).save.loadouts['survey-1'].orders.autoExplore).toBe(true);
  });
});

describe('replay', () => {
  it('rebuilds the stored empire from its founding save and the logged orders', async () => {
    const events = createEventLog({ dir: join(dir, 'a') });
    const founding = saveFor(A, 600);
    const store = memoryStore({ [A]: { player: { id: A, name: 'A' }, save: founding, public: {}, updatedAt: 0 } });
    await events.found(A, { save: founding, worldTime: 600, at: 1 });
    let t = 600;
    const withLock = createLocks();
    const svc = createCommandService({ store, loadSim: async () => sim, withLock, worldTime: () => t, events });
    const ticker = createSimTicker({ store, loadSim: async () => sim, withLock, events });
    const order = (name, args, time) => svc.apply(user, { command: encodeCommand(name, args), ...(time === undefined ? {} : { time }) });
    const home = createWorld(galaxy, A).home;

    t = 600.25;
    expect((await order('setOrders', ['survey-1', { autoExplore: true, autoReturn: true }])).body.ok).toBe(true);
    t = 600.5;
    expect((await order('moveFleet', ['strike-1', home], 600.45)).body.ok).toBe(true);
    await ticker.tick(601);
    t = 601.1;
    await order('setFocus', ['t-lasers']);
    await svc.apply(user, { command: { name: 'grantShards', args: ['t-fusion', 'exploration', 1e6] } }); // refused, still logged
    await ticker.tick(602);
    await ticker.tick(603);
    t = 603.7;
    await order('buildShip', ['prospector']);
    // An order that beats the tick: the year turned but this empire has not played it yet.
    t = 604.05;
    await order('setOrders', ['survey-1', { autoExplore: false, autoReturn: true }]);
    await ticker.tick(604);
    await ticker.tick(605);
    // The server was down for years 606-608: the first order back catches the empire up in one go.
    t = 608.3;
    await order('collectAllLoot', []);
    await ticker.tick(608);
    await ticker.tick(609);
    // Down again for years 610-612, and nobody gives an order: the tick catches up in one go.
    await ticker.tick(613);
    await ticker.tick(614);

    const stored = store.map.get(A).save;
    expect(stored.turn).toBe(614);
    const log = await events.read(A, { limit: Infinity });
    expect(log.map((e) => (typeof e.command === 'string' ? e.command : e.command.name))).toEqual(['found', 'setOrders', 'moveFleet', 'setFocus', 'grantShards', 'buildShip', 'setOrders', 'collectAllLoot', 'advance']);
    expect(log[4]).toMatchObject({ ok: false, turn: 601 });
    expect(log[6]).toMatchObject({ worldTime: 604.05, turn: 603 });
    expect(log[7]).toMatchObject({ worldTime: 608.3, turn: 605 });
    expect(log[8]).toMatchObject({ command: 'advance', worldTime: 613, turn: 609, ok: true });

    const player = { id: A, name: 'A' };
    const rebuilt = replay(sim, { founding: await events.foundingSave(A), events: log, player, toTurn: stored.turn });
    expect(rebuilt).toEqual(stored);
    // The orders matter: leave one out and the empire comes out different.
    const without = replay(sim, { founding: await events.foundingSave(A), events: log.filter((_, i) => i !== 2), player, toTurn: stored.turn });
    expect(without).not.toEqual(stored);
  });

  it('starts from the latest founding, and gives up when the founding has rotated out of the log', async () => {
    const founding = saveFor(A, 700);
    const player = { id: A, name: 'A' };
    const stale = { worldTime: 650.5, turn: 650, command: encodeCommand('collectAllLoot', []), ok: true };
    const found = { command: 'found', worldTime: 700, turn: 700, ok: true };
    const rebuilt = replay(sim, { founding, events: [stale, found], player, toTurn: 702 });
    expect(rebuilt.turn).toBe(702);
    expect(rebuilt).toEqual(sim.advanceSave(sim.advanceSave(founding, player, 701).save, player, 702).save);
    expect(replay(sim, { founding, events: [stale], player, toTurn: 702 })).toBeNull();
    expect(replay(sim, { founding: null, events: [found], player })).toBeNull();
  });
});
