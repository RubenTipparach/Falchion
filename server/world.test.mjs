import { describe, expect, it } from 'vitest';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSharedWorld } from './world.mjs';
import { dbDoc, openDb } from './db.mjs';
import { createEventLog } from './eventLog.mjs';
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
    const log = createEventLog({ db: openDb(':memory:') });
    const world = createSharedWorld({ file: join(dir, 'world.json'), loadSim: async () => sim, withLock, record: log.record });
    const map = new Map([[A, { ...rec, public: { home: rec.home.hex, colonies: [], fleets: [] } }]]);
    const store = { ids: async () => [...map.keys()], load: async (id) => structuredClone(map.get(id)), save: async (id, r) => { map.set(id, structuredClone(r)); } };
    await createSimTicker({ store, loadSim: async () => sim, withLock, world }).tick(tick);
    const texts = map.get(A).save.dispatches.map((d) => d.text);
    expect(texts.some((t) => t.includes(raiding.name))).toBe(true);
    const after = await world.get();
    expect(after.tick).toBe(tick);
    expect(after.npcs[def.id].fleets.find((f) => f.id === raiding.id)?.mission ?? 'destroyed').not.toBe('raid');
    // The NPC's decision is in the event log, aimed at the empire it struck.
    const logged = await log.read(A);
    expect(logged).toEqual(expect.arrayContaining([expect.objectContaining({ actor: `npc:${def.id}`, kind: 'strike', subject: A, worldTime: tick })]));
  });

  it('keeps the world in the database; empires that come near each other meet, and it is logged', async () => {
    const db = openDb(':memory:');
    const log = createEventLog({ db });
    const withLock = createLocks();
    const world = createSharedWorld({ doc: dbDoc(db, 'world'), loadSim: async () => sim, withLock, record: log.record });
    const A = '111111111111111111', B = '222222222222222222';
    const a = record(A, 700), b = record(B, 700);
    // A's scout sits beside B's home.
    const near = { q: b.home.hex.q + 1, r: b.home.hex.r };
    a.save.fleets = a.save.fleets.map((f) => (f.id === 'scout-1' ? { ...f, movement: { route: [near], departTurn: 0, speed: 1 } } : f));
    const map = new Map([[A, a], [B, b]]);
    const store = { ids: async () => [...map.keys()], load: async (id) => structuredClone(map.get(id)), save: async (id, r) => { map.set(id, structuredClone(r)); } };
    await createSimTicker({ store, loadSim: async () => sim, withLock, world }).tick(701);
    const met = await world.get();
    expect(Object.keys(met.contacts ?? {})).toEqual([`${A}|${B}`]);
    expect(JSON.parse(db.prepare("SELECT value FROM docs WHERE key = 'world'").get().value).contacts).toEqual(met.contacts);
    expect(await log.read(B)).toEqual(expect.arrayContaining([expect.objectContaining({ actor: A, subject: B, kind: 'contact', worldTime: 701 })]));
    // B hears of it in its next year.
    await createSimTicker({ store, loadSim: async () => sim, withLock, world }).tick(702);
    expect(map.get(B).save.dispatches.map((d) => d.text).join('\n')).toContain('First contact with');
  });

  it('starts empty when there is no world yet, or it is unreadable', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'falchion-world-'));
    const world = createSharedWorld({ file: join(dir, 'none.json'), loadSim: async () => sim, withLock: createLocks() });
    expect(await world.get()).toEqual(sim.EMPTY_WORLD);
    expect(await world.apply([])).toEqual(sim.EMPTY_WORLD);
  });
});
