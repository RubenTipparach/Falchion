import { describe, expect, it } from 'vitest';
import { createSimTicker, PLAYING_GRACE_MS } from './simTicker.mjs';
import * as sim from '../src/sim/headless.ts';
import { newEmpireState } from '../src/sim/newEmpireState.ts';
import { GalaxyModel } from '../src/core/galaxy/GalaxyModel.ts';
import { TechTree } from '../src/core/research/TechTree.ts';
import { TECH_NODES } from '../src/content/techTree.ts';
import { SHARD_SOURCES } from '../src/content/shardSources.ts';
import { createWorld, tradePartners } from '../src/app/World.ts';
import { SaveGame } from '../src/app/SaveGame.ts';

const galaxy = new GalaxyModel();
const tree = new TechTree(TECH_NODES, SHARD_SOURCES);

function saveFor(id, t0) {
  const world = createWorld(galaxy, id);
  const state = newEmpireState({ galaxy, tree, world, partners: tradePartners(world, world.home), playerName: `P${id.slice(-2)}`, t0 });
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

describe('empires keep playing while their owners are away', () => {
  const NOW = 10_000_000;
  const AWAY = '111111111111111111', PLAYING = '222222222222222222', ONLINE = '333333333333333333';

  it('plays away empires to the world year, leaves playing ones to their browsers, and tells everyone', async () => {
    const store = memoryStore({
      [AWAY]: { player: { id: AWAY, name: 'Away' }, save: saveFor(AWAY, 500), public: {}, updatedAt: NOW - 10 * 60_000 },
      [PLAYING]: { player: { id: PLAYING, name: 'Playing' }, save: saveFor(PLAYING, 500), public: {}, updatedAt: NOW - 30_000 },
      [ONLINE]: { player: { id: ONLINE, name: 'Online' }, save: saveFor(ONLINE, 500), public: {}, updatedAt: NOW - PLAYING_GRACE_MS * 2 },
    });
    const published = [];
    const ticker = createSimTicker({ store, loadSim: async () => sim, isOnline: (id) => id === ONLINE, publish: (p) => published.push(p), now: () => NOW });
    expect(await ticker.tick(520)).toBe(1);
    expect(store.map.get(AWAY).save.turn).toBe(520);
    expect(store.map.get(AWAY).updatedAt).toBe(NOW - 10 * 60_000); // still the owner's last save time
    expect(store.map.get(AWAY).simulatedAt).toBe(NOW);
    expect(store.map.get(PLAYING).save.turn).toBe(500);
    expect(store.map.get(ONLINE).save.turn).toBe(500);
    expect(published.map((p) => p.id)).toEqual([AWAY]);
    expect(published[0].fleets.length).toBeGreaterThan(0);
    // Next year: one more.
    await ticker.tick(521);
    expect(store.map.get(AWAY).save.turn).toBe(521);
  });

  it('never overwrites a save the owner wrote while the server was working', async () => {
    const store = memoryStore({ [AWAY]: { player: { id: AWAY, name: 'Away' }, save: saveFor(AWAY, 500), public: {}, updatedAt: NOW - 600_000 } });
    const slowSim = { advanceSave: (...a) => { store.map.set(AWAY, { ...store.map.get(AWAY), updatedAt: NOW, save: { ...store.map.get(AWAY).save, turn: 999 } }); return sim.advanceSave(...a); } };
    const ticker = createSimTicker({ store, loadSim: async () => slowSim, isOnline: () => false, now: () => NOW });
    expect(await ticker.tick(520)).toBe(0);
    expect(store.map.get(AWAY).save.turn).toBe(999);
  });

  it('does nothing without the bundled simulation, and skips broken saves', async () => {
    const store = memoryStore({ [AWAY]: { player: { id: AWAY, name: 'Away' }, save: { turn: 1 }, public: {}, updatedAt: 0 } });
    expect(await createSimTicker({ store, loadSim: async () => null, isOnline: () => false }).tick(520)).toBe(0);
    expect(await createSimTicker({ store, loadSim: async () => sim, isOnline: () => false }).tick(520)).toBe(0);
  });
});
