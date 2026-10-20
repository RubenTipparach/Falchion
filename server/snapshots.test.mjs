// Hourly empire snapshots, their export (JSON Lines with the event log merged in by time) and the
// admin routes for them (change admin-snapshots-and-fog).
import { describe, expect, it } from 'vitest';
import { gunzipSync } from 'node:zlib';
import { createAuth } from './auth.mjs';
import { adminIds, createAdmin } from './admin.mjs';
import { openDb } from './db.mjs';
import { createEventLog } from './eventLog.mjs';
import { createSnapshots, exportLines, parseTime, SNAPSHOT_INTERVAL_MS } from './snapshots.mjs';
import { createStore } from './store.mjs';
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
const A = '111111111111111111', B = '222222222222222222', ADMIN = '999999999999999999';
const HOUR = SNAPSHOT_INTERVAL_MS;

function recordFor(id, name, t0) {
  const world = createWorld(galaxy, id);
  const state = newEmpireState({ galaxy, tree, world, playerName: name, t0 });
  const save = new SaveGame(galaxy.params.seed, null).snapshot(state);
  delete save.tab;
  return { player: { id, name }, save, public: { empire: { name: `${name} Empire` } }, updatedAt: 1 };
}

async function setup() {
  const db = openDb(':memory:');
  const store = createStore({ db, dir: '/nonexistent' });
  await store.save(A, recordFor(A, 'Ana', 500));
  await store.save(B, recordFor(B, 'Ben', 500));
  let t = 10 * HOUR;
  const clock = { now: () => t, set: (v) => { t = v; } };
  const snapshots = createSnapshots({ db, store, loadSim: async () => sim, now: clock.now });
  const events = createEventLog({ db, now: clock.now });
  return { db, store, clock, snapshots, events };
}

describe('hourly empire snapshots', () => {
  it('records every empire once an hour, measured from the latest snapshot', async () => {
    const { clock, snapshots } = await setup();
    expect(await snapshots.maybeTake(500)).toBe(2);
    clock.set(10 * HOUR + 20 * 60_000);
    expect(await snapshots.maybeTake(520)).toBe(0); // twenty minutes later: not yet
    clock.set(11 * HOUR);
    expect(await snapshots.maybeTake(560)).toBe(2);
    expect(snapshots.stats()).toMatchObject({ count: 4, empires: 2, first: 10 * HOUR, latest: 11 * HOUR, nextDue: 12 * HOUR, intervalMs: HOUR });
  });

  it('a restart does not double up: the hour runs from the latest row in the database', async () => {
    const { db, store, clock, snapshots } = await setup();
    await snapshots.maybeTake(500);
    clock.set(10 * HOUR + 30 * 60_000);
    const again = createSnapshots({ db, store, loadSim: async () => sim, now: clock.now });
    expect(await again.maybeTake(530)).toBe(0);
  });

  it('keeps who, when, why, a documented summary and the whole record (gzipped)', async () => {
    const { db, snapshots } = await setup();
    await snapshots.takeAll(500, 'manual');
    const rows = [...snapshots.range({ from: 0, to: Infinity, includeState: true })];
    expect(rows).toHaveLength(2);
    const a = rows.find((r) => r.empire.id === A);
    expect(a).toMatchObject({ type: 'snapshot', worldYear: 500, reason: 'manual', empire: { id: A, owner: 'Ana', name: 'Ana Empire' }, at: 10 * HOUR });
    expect(a.time).toBe(new Date(10 * HOUR).toISOString());
    expect(a.summary).toMatchObject({ v: 1, year: 500, population: { worlds: expect.any(Number) }, ships: { total: expect.any(Number) } });
    expect(a.state.save.turn).toBe(500);
    // In the table the record is compressed.
    const raw = db.prepare('SELECT state, state_bytes FROM snapshots WHERE empire_id = ?').get(A);
    expect(JSON.parse(gunzipSync(Buffer.from(raw.state)).toString()).player.id).toBe(A);
    expect(raw.state.length).toBeLessThan(raw.state_bytes);
    // Without asking, the export carries no state.
    expect([...snapshots.range({ from: 0, to: Infinity })][0].state).toBeUndefined();
  });

  it('still records a snapshot without the bundled simulation', async () => {
    const { db, store, clock } = await setup();
    const bare = createSnapshots({ db, store, loadSim: async () => null, now: clock.now });
    expect(await bare.takeAll(500, 'hourly')).toBe(2);
    expect([...bare.range({ from: 0, to: Infinity })][0].summary).toMatchObject({ v: 0, year: 500, error: 'no bundled simulation' });
  });
});

describe('snapshot export', () => {
  it('a time range keeps only the snapshots and events inside it, merged by time, with a meta line first', async () => {
    const { clock, snapshots, events } = await setup();
    const at = (h) => 10 * HOUR + h * HOUR;
    clock.set(at(-0.5)); await snapshots.takeAll(470, 'hourly'); // 09:30
    clock.set(at(0.25)); events.record({ actor: A, kind: 'command', data: { command: { name: 'moveFleet' }, ok: true } });
    clock.set(at(0.5)); await snapshots.takeAll(530, 'hourly'); // 10:30
    clock.set(at(0.75)); events.record({ actor: 'npc:c:1,1', subject: B, kind: 'raid', data: { text: 'Raiders out' } });
    clock.set(at(1.5)); await snapshots.takeAll(590, 'hourly'); // 11:30
    const lines = [...exportLines({ snapshots, events, from: at(0), to: at(1), now: () => 0 })].map((l) => JSON.parse(l));
    expect(lines[0]).toMatchObject({ type: 'meta', from: new Date(at(0)).toISOString(), to: new Date(at(1)).toISOString(), empire: null, summaryVersion: 1 });
    expect(lines.slice(1).map((l) => [l.type, l.worldYear ?? l.kind])).toEqual([['event', 'command'], ['snapshot', 530], ['snapshot', 530], ['event', 'raid']]);
    expect(lines[1]).toMatchObject({ type: 'event', actor: A, command: { name: 'moveFleet' }, time: new Date(at(0.25)).toISOString() });
    // One empire: its snapshots, and the events by or about it.
    const onlyB = [...exportLines({ snapshots, events, from: 0, to: at(2), empire: B })].map((l) => JSON.parse(l)).slice(1);
    expect(onlyB.filter((l) => l.type === 'snapshot').every((l) => l.empire.id === B)).toBe(true);
    expect(onlyB.filter((l) => l.type === 'snapshot')).toHaveLength(3);
    expect(onlyB.filter((l) => l.type === 'event').map((l) => l.kind)).toEqual(['raid']);
  });

  it('reads times as ms or ISO', () => {
    expect(parseTime('1700000000000')).toBe(1_700_000_000_000);
    expect(parseTime('2026-10-20T10:00:00.000Z')).toBe(Date.parse('2026-10-20T10:00:00.000Z'));
    expect(parseTime('soon')).toBeNaN();
    expect(parseTime('')).toBeNaN();
  });
});

describe('admin snapshot routes', () => {
  const auth = createAuth({ clientId: 'cid', clientSecret: 'csecret', sessionSecret: 's3cret', publicUrl: 'https://falchion.fly.dev' });
  const as = (id, extra = {}, method = 'GET', url = '/') => ({ headers: { cookie: `fal_session=${encodeURIComponent(auth.issue({ id, name: 'Admin' }))}`, ...extra }, method, url });
  function fakeRes() {
    return {
      status: 0, headers: {}, body: '',
      writeHead(status, headers) { this.status = status; this.headers = headers ?? {}; },
      write(chunk) { this.body += chunk; return true; },
      end(body = '') { this.body += body; },
    };
  }
  const call = async (handler, req, path) => { const res = fakeRes(); await handler(req, res, path); return res; };

  it('shows the summary, takes one now, and exports a range as a JSON Lines download', async () => {
    const { store, snapshots, events, clock } = await setup();
    const handler = createAdmin({ auth, store, admins: adminIds({ ADMIN_DISCORD_ID: ADMIN }), info: () => ({ worldTick: 777 }), events, snapshots, now: clock.now });
    const taken = await call(handler, as(ADMIN, { 'x-falchion-admin': '1' }, 'POST'), '/api/admin/snapshots');
    expect(taken.status).toBe(200);
    expect(JSON.parse(taken.body)).toMatchObject({ taken: 2, count: 2, empires: 2 });
    const stats = JSON.parse((await call(handler, as(ADMIN), '/api/admin/snapshots')).body);
    expect(stats).toMatchObject({ count: 2, latest: 10 * HOUR });
    const from = new Date(10 * HOUR - 1000).toISOString(), to = new Date(10 * HOUR + 1000).toISOString();
    const res = await call(handler, as(ADMIN, {}, 'GET', `/api/admin/snapshots/export?from=${from}&to=${to}&empire=${A}&state=1`), '/api/admin/snapshots/export');
    expect(res.status).toBe(200);
    expect(res.headers['Content-Type']).toMatch(/ndjson/);
    expect(res.headers['Content-Disposition']).toMatch(/attachment; filename="falchion-snapshots-.*\.jsonl"/);
    const lines = res.body.trim().split('\n').map((l) => JSON.parse(l));
    expect(lines.map((l) => l.type)).toEqual(['meta', 'snapshot']);
    expect(lines[1]).toMatchObject({ worldYear: 777, reason: 'manual', empire: { id: A } });
    expect(lines[1].state.player.id).toBe(A);
  });

  it('refuses a bad range and non-admins', async () => {
    const { store, snapshots } = await setup();
    const handler = createAdmin({ auth, store, admins: adminIds({ ADMIN_DISCORD_ID: ADMIN }), info: () => ({}), snapshots });
    expect((await call(handler, as(ADMIN, {}, 'GET', '/api/admin/snapshots/export?from=2026-10-20&to=2026-10-01'), '/api/admin/snapshots/export')).status).toBe(400);
    expect((await call(handler, as(ADMIN, {}, 'GET', '/api/admin/snapshots/export?from=whenever'), '/api/admin/snapshots/export')).status).toBe(400);
    expect((await call(handler, as('555555555555555555', {}, 'GET', '/api/admin/snapshots/export'), '/api/admin/snapshots/export')).status).toBe(403);
    expect((await call(handler, as('555555555555555555'), '/api/admin/snapshots')).status).toBe(403);
    expect((await call(handler, { headers: {}, method: 'GET', url: '/' }, '/api/admin/snapshots')).status).toBe(401);
    // Taking one is a write: it needs the admin header.
    expect((await call(handler, as(ADMIN, {}, 'POST'), '/api/admin/snapshots')).status).toBe(403);
  });
});
