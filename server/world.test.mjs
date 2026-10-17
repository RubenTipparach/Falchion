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
import { initialNpcState, spawnNpcs } from '../src/core/npc/NpcCatalog.ts';
import { hexDistance } from '../src/core/hex/Hex.ts';

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

  it('runs the NPC year first: raiders that reach an empire are fought in its year, and it is saved', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'falchion-world-'));
    const withLock = createLocks();
    const A = '111111111111111111';
    const rec = record(A, 600);
    const def = spawnNpcs(galaxy, rec.home.hex)[0];
    const tick = 603;
    const npc = initialNpcState(def, 500);
    // A raider fleet already on its way, arriving this year.
    const raiding = { ...npc.fleets[0], mission: 'raid', from: def.home.hex, to: rec.home.hex, depart: tick - hexDistance(def.home.hex, rec.home.hex), target: A };
    const start = { tick: 602, asteroids: {}, npcs: { [def.id]: { ...npc, knownBy: [A], fleets: [raiding] } } };
    const { writeFile } = await import('node:fs/promises');
    await writeFile(join(dir, 'world.json'), JSON.stringify(start));
    const world = createSharedWorld({ file: join(dir, 'world.json'), loadSim: async () => sim, withLock });
    const map = new Map([[A, { ...rec, public: { home: rec.home.hex, colonies: [], fleets: [] } }]]);
    const store = { ids: async () => [...map.keys()], load: async (id) => structuredClone(map.get(id)), save: async (id, r) => { map.set(id, structuredClone(r)); } };
    await createSimTicker({ store, loadSim: async () => sim, withLock, world }).tick(tick);
    const texts = map.get(A).save.dispatches.map((d) => d.text);
    expect(texts.some((t) => t.includes(raiding.name))).toBe(true);
    const after = await world.get();
    expect(after.tick).toBe(tick);
    expect(after.npcs[def.id].fleets.find((f) => f.id === raiding.id)?.mission ?? 'destroyed').not.toBe('raid');
  });

  it('starts empty when there is no world yet, or it is unreadable', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'falchion-world-'));
    const world = createSharedWorld({ file: join(dir, 'none.json'), loadSim: async () => sim, withLock: createLocks() });
    expect(await world.get()).toEqual(sim.EMPTY_WORLD);
    expect(await world.apply([])).toEqual(sim.EMPTY_WORLD);
  });
});
