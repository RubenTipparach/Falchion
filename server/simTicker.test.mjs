import { describe, expect, it } from 'vitest';
import { createSimTicker } from './simTicker.mjs';
import { createCommandService } from './commands.mjs';
import { createLocks } from './locks.mjs';
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
