// The server reset: every empire back to its founding at the current world year, the shared world
// fresh, snapshots and the event log kept (change admin-snapshots-and-fog).
import { describe, expect, it } from 'vitest';
import { createAuth } from './auth.mjs';
import { adminIds, createAdmin } from './admin.mjs';
import { dbDoc, openDb } from './db.mjs';
import { createEventLog } from './eventLog.mjs';
import { createLocks } from './locks.mjs';
import { createReset } from './reset.mjs';
import { createSimTicker } from './simTicker.mjs';
import { createSnapshots } from './snapshots.mjs';
import { createStore } from './store.mjs';
import { createSharedWorld } from './world.mjs';
import * as sim from '../src/sim/headless.ts';
import { newEmpireState } from '../src/sim/newEmpireState.ts';
import { GalaxyModel } from '../src/core/galaxy/GalaxyModel.ts';
import { TechTree } from '../src/core/research/TechTree.ts';
import { TECH_NODES } from '../src/content/techTree.ts';
import { SHARD_SOURCES } from '../src/content/shardSources.ts';
import { HERALDRY } from '../src/content/heraldry.ts';
import { suggestIdentity } from '../src/core/empire/Identity.ts';
import { createWorld } from '../src/app/World.ts';
import { SaveGame } from '../src/app/SaveGame.ts';

const galaxy = new GalaxyModel();
const tree = new TechTree(TECH_NODES, SHARD_SOURCES);
const A = '111111111111111111', B = '222222222222222222', ADMIN = '999999999999999999';

function foundedSave(id, name, t0) {
  const world = createWorld(galaxy, id);
  const identity = suggestIdentity(galaxy.params.seed, name, 'Capital', HERALDRY);
  const state = { ...newEmpireState({ galaxy, tree, world, playerName: name, t0 }), identity };
  const save = new SaveGame(galaxy.params.seed, null).snapshot(state);
  delete save.tab;
  return { save, identity, home: world.home };
}

async function setup() {
  const db = openDb(':memory:');
  const store = createStore({ db, dir: '/nonexistent' });
  const withLock = createLocks();
  const events = createEventLog({ db });
  const world = createSharedWorld({ doc: dbDoc(db, 'world'), loadSim: async () => sim, withLock, record: (e) => events.record(e) });
  const snapshots = createSnapshots({ db, store, loadSim: async () => sim, world });
  const ticker = createSimTicker({ store, loadSim: async () => sim, withLock, world, events });
  // A was founded with this server keeping its founding; B before foundings were kept.
  const a = foundedSave(A, 'Ana', 1_000), b = foundedSave(B, 'Ben', 1_000);
  await store.save(A, { player: { id: A, name: 'Ana' }, save: a.save, public: {}, updatedAt: 1 });
  await store.saveFounding(A, { at: 1, worldYear: 1_000, save: a.save });
  await store.save(B, { player: { id: B, name: 'Ben' }, save: b.save, public: {}, updatedAt: 1 });
  // They play on for a while, and become allies.
  await ticker.tick(1_150);
  await world.apply([{ kind: 'contact', a: A, b: B, at: 1_100 }, { kind: 'diplomacy', by: A, other: B, action: 'propose-alliance', at: 1_100 }, { kind: 'diplomacy', by: B, other: A, action: 'accept', at: 1_101 }]);
  expect((await world.get()).relations[`${A}|${B}`].status).toBe('alliance');
  let tick = 2_000;
  const notified = [], published = [];
  const reset = createReset({
    store, loadSim: async () => sim, withLock, world, snapshots, ticker, events, worldTick: () => tick,
    notifyOwner: (id, save) => notified.push([id, save.turn]), publish: (p) => published.push(p.id),
  });
  return { db, store, world, snapshots, events, ticker, reset, a, b, notified, published, setTick: (t) => { tick = t; } };
}

describe('server reset', () => {
  it('puts every empire back to its founding at the current year, keeping who it is', async () => {
    const { store, reset, a, b, notified, published } = await setup();
    expect((await store.load(A)).save.turn).toBe(1_150);
    const r = await reset.run({ id: ADMIN, name: 'Admin' });
    expect(r).toMatchObject({ worldYear: 2_000, empires: 2, skipped: [], snapshots: 2 });
    for (const [id, f] of [[A, a], [B, b]]) {
      const { save } = await store.load(id);
      expect(save.turn).toBe(2_000);
      expect(save.identity.name).toBe(f.identity.name);
      expect(save.identity.flag).toEqual(f.identity.flag);
      expect(save.home.id).toBe(f.home.id);
      expect(save.economy.colonies).toEqual(newEmpireState({ galaxy, tree, world: createWorld(galaxy, id), playerName: id === A ? 'Ana' : 'Ben', t0: 2_000 }).economy.colonies.map((c) => (c.capital ? { ...c, name: f.identity.capital } : c)));
      expect(Object.keys(save.explored)).toEqual([]);
      expect(save.visited).toEqual([f.home.id]);
    }
    expect(notified.sort()).toEqual([[A, 2_000], [B, 2_000]]);
    expect(published.sort()).toEqual([A, B]);
    // The record keeps its player and says when it was reset.
    expect((await store.load(A))).toMatchObject({ player: { id: A, name: 'Ana' }, resetAt: expect.any(Number) });
  });

  it('starts the shared world fresh, keeps snapshots and the event log, and logs the reset', async () => {
    const { world, snapshots, events, reset } = await setup();
    await snapshots.takeAll(1_150, 'hourly');
    const before = (await events.read(A, { limit: 1000 })).length;
    await reset.run({ id: ADMIN, name: 'Admin' });
    const w = await world.get();
    expect(w).toEqual({ ...sim.EMPTY_WORLD, tick: 2_000 });
    const rows = [...snapshots.range({ from: 0, to: Infinity })];
    expect(rows.map((s) => s.reason).sort()).toEqual(['hourly', 'hourly', 'reset', 'reset']);
    // The reset snapshot is the state just before.
    expect(rows.find((s) => s.reason === 'reset' && s.empire.id === A).summary.year).toBe(1_150);
    const after = await events.read(A, { limit: 1000 });
    expect(after.length).toBe(before + 1);
    expect(after.at(-1)).toMatchObject({ kind: 'reset-empire', actor: ADMIN, subject: A, founding: 'kept' });
    expect((await events.read(B, { limit: 1000 })).at(-1)).toMatchObject({ kind: 'reset-empire', founding: 'from-save' });
    const all = [...events.range({ from: 0, to: Infinity })];
    expect(all.at(-1)).toMatchObject({ kind: 'reset', actor: ADMIN, empires: 2 });
  });

  it('the empires play on from their new start', async () => {
    const { store, ticker, reset } = await setup();
    await reset.run({ id: ADMIN, name: 'Admin' });
    await ticker.tick(2_001);
    expect((await store.load(A)).save.turn).toBe(2_001);
  });

  it('needs the typed confirmation in the admin portal', async () => {
    const { store, reset } = await setup();
    const auth = createAuth({ clientId: 'cid', clientSecret: 'csecret', sessionSecret: 's3cret', publicUrl: 'https://falchion.fly.dev' });
    const handler = createAdmin({ auth, store, admins: adminIds({ ADMIN_DISCORD_ID: ADMIN }), info: () => ({}), reset });
    const post = (body, id = ADMIN) => {
      const res = { status: 0, headers: {}, body: '', writeHead(s, h) { this.status = s; this.headers = h; }, end(b = '') { this.body = b; } };
      const req = { method: 'POST', url: '/api/admin/reset', headers: { cookie: `fal_session=${encodeURIComponent(auth.issue({ id, name: 'Admin' }))}`, 'x-falchion-admin': '1' }, async *[Symbol.asyncIterator]() { yield Buffer.from(JSON.stringify(body)); } };
      return handler(req, res, '/api/admin/reset').then(() => res);
    };
    expect((await post({ confirm: 'reset' })).status).toBe(400);
    expect((await store.load(A)).save.turn).toBe(1_150);
    expect((await post({ confirm: 'RESET' }, '555555555555555555')).status).toBe(403);
    const ok = await post({ confirm: 'RESET' });
    expect(ok.status).toBe(200);
    expect(JSON.parse(ok.body)).toMatchObject({ ok: true, empires: 2 });
    expect((await store.load(A)).save.turn).toBe(2_000);
  });

  it('holds the yearly tick off while it runs', async () => {
    const { store, ticker } = await setup();
    let release;
    const gate = new Promise((r) => { release = r; });
    const run = ticker.exclusive(async () => { await gate; return 'done'; });
    // A world year arriving meanwhile is skipped: nothing plays while the reset runs.
    const year = ticker.tick(1_151);
    release();
    expect(await run).toBe('done');
    expect(await year).toBe(0);
    expect((await store.load(A)).save.turn).toBe(1_150);
    // The next one plays as usual.
    expect(await ticker.tick(1_152)).toBe(2);
  });
});
