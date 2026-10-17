import { describe, expect, it } from 'vitest';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSharedWorld } from './world.mjs';
import { createSimTicker } from './simTicker.mjs';
import { createLocks } from './locks.mjs';
import * as sim from '../src/sim/headless.ts';
import { newEmpireState } from '../src/sim/newEmpireState.ts';
import { GalaxyModel } from '../src/core/galaxy/GalaxyModel.ts';
import { TechTree } from '../src/core/research/TechTree.ts';
import { TECH_NODES } from '../src/content/techTree.ts';
import { SHARD_SOURCES } from '../src/content/shardSources.ts';
import { createWorld } from '../src/app/World.ts';
import { SaveGame } from '../src/app/SaveGame.ts';
import { homeBelt } from '../src/core/galaxy/Asteroids.ts';

const galaxy = new GalaxyModel();
const tree = new TechTree(TECH_NODES, SHARD_SOURCES);

function record(id, t0) {
  const world = createWorld(galaxy, id);
  const state = newEmpireState({ galaxy, tree, world, playerName: `P${id.slice(-2)}`, t0 });
  const save = new SaveGame(galaxy.params.seed, null).snapshot(state);
  delete save.tab;
  return { player: { id, name: 'A' }, save, public: {}, updatedAt: 0, home: state.home };
}

describe('the shared world on the server', () => {
  it('applies what each empire mined each year, keeps it in world.json and tells everyone', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'falchion-world-'));
    const sent = [];
    const withLock = createLocks();
    let t = 0;
    const world = createSharedWorld({ file: join(dir, 'world.json'), loadSim: async () => sim, withLock, broadcast: (event, data) => sent.push([event, data]), now: () => (t += 5_000) });
    const A = '111111111111111111';
    const rec = record(A, 500);
    const map = new Map([[A, rec]]);
    const store = { ids: async () => [...map.keys()], load: async (id) => structuredClone(map.get(id)), save: async (id, r) => { map.set(id, structuredClone(r)); } };
    const ticker = createSimTicker({ store, loadSim: async () => sim, withLock, world });
    expect(await ticker.tick(503)).toBe(1);
    const belt = homeBelt(rec.home)[0];
    const now = await world.get();
    expect(now.asteroids[belt.id].left).toBeLessThan(belt.capacity);
    expect(JSON.parse(await readFile(join(dir, 'world.json'), 'utf8'))).toEqual(now);
    expect(sent.at(-1)[0]).toBe('world');
    // A restart reads it back.
    const again = createSharedWorld({ file: join(dir, 'world.json'), loadSim: async () => sim, withLock });
    expect(await again.get()).toEqual(now);
  });

  it('starts empty when there is no world yet, or it is unreadable', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'falchion-world-'));
    const world = createSharedWorld({ file: join(dir, 'none.json'), loadSim: async () => sim, withLock: createLocks() });
    expect(await world.get()).toEqual(sim.EMPTY_WORLD);
    expect(await world.apply([])).toEqual(sim.EMPTY_WORLD);
  });
});
