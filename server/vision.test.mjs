// Hidden systems: what the server sends each player, the flag itself, and allies sharing vision
// (change admin-snapshots-and-fog).
import { EventEmitter } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createAuth } from './auth.mjs';
import { createChat } from './chat.mjs';
import { openDb } from './db.mjs';
import { createStore } from './store.mjs';
import { createVision } from './vision.mjs';
import * as sim from '../src/sim/headless.ts';
import { newEmpireState } from '../src/sim/newEmpireState.ts';
import { GalaxyModel } from '../src/core/galaxy/GalaxyModel.ts';
import { TechTree } from '../src/core/research/TechTree.ts';
import { TECH_NODES } from '../src/content/techTree.ts';
import { SHARD_SOURCES } from '../src/content/shardSources.ts';
import { createWorld } from '../src/app/World.ts';
import { SaveGame } from '../src/app/SaveGame.ts';
import { publicEmpire, colorFor } from '../src/app/ServerSync.ts';

const galaxy = new GalaxyModel();
const tree = new TechTree(TECH_NODES, SHARD_SOURCES);
const A = '111111111111111111', B = '222222222222222222', C = '333333333333333333';

function recordFor(id, name, t0) {
  const world = createWorld(galaxy, id);
  const state = newEmpireState({ galaxy, tree, world, playerName: name, t0 });
  const save = new SaveGame(galaxy.params.seed, null).snapshot(state);
  delete save.tab;
  return { player: { id, name }, save, public: publicEmpire(state, colorFor(id)), updatedAt: 1, home: world.home };
}

async function setup() {
  const store = createStore({ db: openDb(':memory:'), dir: '/nonexistent' });
  const records = { [A]: recordFor(A, 'Ana', 500), [B]: recordFor(B, 'Ben', 500), [C]: recordFor(C, 'Cy', 500) };
  for (const [id, r] of Object.entries(records)) await store.save(id, r);
  const flag = { on: true };
  let shared = { ...sim.EMPTY_WORLD, tick: 500, npcs: {}, relations: {} };
  const world = { get: async () => shared };
  const vision = createVision({ store, loadSim: async () => sim, world, hidden: () => flag.on, worldTick: () => 500 });
  const list = (viewer) => Object.entries(records).filter(([id]) => id !== viewer).map(([id, r]) => ({ ...r.public, id, name: r.player.name }));
  return { store, records, flag, vision, list, setWorld: (w) => { shared = w; vision.invalidate(); } };
}

describe('what the server sends while systems are hidden', () => {
  it('leaves out other empires’ worlds and fleets the player cannot see', async () => {
    const { vision, list, records } = await setup();
    const seen = await vision.players(A, list(A));
    const b = seen.find((p) => p.id === B);
    // Homes hundreds of light years apart: nothing of B's is in A's sight.
    expect(b.home).toBeNull();
    expect(b.colonies).toEqual([]);
    expect(b.fleets).toEqual([]);
    // Identity is kept: the Players drawer still lists the empire.
    expect(b.color).toBe(records[B].public.color);
    expect(b.name).toBe('Ben');
  });

  it('with the flag off, everything is sent as before', async () => {
    const { vision, list, flag } = await setup();
    flag.on = false;
    const all = list(A);
    expect(await vision.players(A, all)).toBe(all);
    const w = { ...sim.EMPTY_WORLD, npcs: { x: { knownBy: [], colonies: [], fleets: [] } } };
    expect(await vision.world(A, w)).toBe(w);
  });

  it('allies share vision: an ally’s explored systems are seen', async () => {
    const { vision, list, setWorld, records } = await setup();
    setWorld({ ...sim.EMPTY_WORLD, tick: 500, npcs: {}, relations: { [`${A}|${B}`]: { status: 'alliance', since: 400 } } });
    const b = (await vision.players(A, list(A))).find((p) => p.id === B);
    expect(b.home).toEqual(records[B].home.hex);
    expect(b.fleets.length).toBeGreaterThan(0);
    // Not C: no alliance with C.
    const c = (await vision.players(A, list(A))).find((p) => p.id === C);
    expect(c.home).toBeNull();
    const shared = await vision.sharedFor(A);
    expect(shared.allies).toEqual([B]);
    expect(shared.explored).toContain(records[B].home.id);
    expect(shared.explored).not.toContain(records[A].home.id);
  });

  it('the shared world: only NPC empires the player has met, and what of them the player can see', async () => {
    const { vision, records } = await setup();
    const home = records[A].home.hex;
    const w = {
      ...sim.EMPTY_WORLD, tick: 500,
      npcs: {
        met: { id: 'met', discoveredAt: 1, knownBy: [A], lastBuilt: 0, built: 0, colonies: [{ starId: records[A].home.id, garrison: [] }, { starId: '0,0', garrison: [] }], fleets: [{ id: 'f', name: 'Raiders', ships: [], mission: 'raid', from: home, to: home, depart: 400 }] },
        stranger: { id: 'stranger', discoveredAt: 1, knownBy: [B], lastBuilt: 0, built: 0, colonies: [], fleets: [] },
      },
    };
    const out = await vision.world(A, w);
    expect(Object.keys(out.npcs)).toEqual(['met']);
    expect(out.npcs.met.colonies.map((c) => c.starId)).toEqual([records[A].home.id]);
    expect(out.npcs.met.fleets).toHaveLength(1);
    // A guest has met nobody.
    expect(Object.keys((await vision.world(null, w)).npcs)).toEqual([]);
  });

  it('live pushes use the vision worked out after each world year', async () => {
    const { vision, records } = await setup();
    const view = { ...records[B].public, id: B };
    // Before the rules are even loaded, nothing is pushed at all.
    expect(vision.player(A, view)).toBeNull();
    await vision.refresh([A]);
    expect(vision.player(A, view).home).toBeNull();
    const mine = { ...records[A].public, id: A };
    expect(vision.player(A, mine).home).toEqual(records[A].home.hex);
  });
});

describe('the live stream shapes what each player receives', () => {
  const auth = createAuth({ clientId: 'cid', clientSecret: 'csecret', sessionSecret: 's3cret', publicUrl: 'https://falchion.fly.dev' });
  const dir = mkdtempSync(join(tmpdir(), 'falchion-vision-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('broadcast with a shape sends each player their own version, and nothing for null', async () => {
    const chat = createChat({ auth, file: join(dir, 'chat.json'), players: async () => [] });
    const streams = {};
    for (const id of [A, B, C]) {
      const events = [];
      const req = Object.assign(new EventEmitter(), { method: 'GET', headers: { cookie: `fal_session=${encodeURIComponent(auth.issue({ id, name: id.slice(0, 1) }))}` } });
      const res = { writeHead() {}, end() {}, write(chunk) { const m = /^event: (\w+)\ndata: (.*)\n\n$/s.exec(chunk); if (m) events.push({ event: m[1], data: JSON.parse(m[2]) }); } };
      await chat.handle(req, res, '/api/chat/stream');
      streams[id] = events;
    }
    chat.broadcast('player', { id: A, colonies: [1, 2] }, { except: A, shape: (uid, d) => (uid === C ? null : { ...d, colonies: uid === B ? [1] : d.colonies }) });
    const of = (id) => streams[id].filter((e) => e.event === 'player').map((e) => e.data);
    expect(of(A)).toEqual([]);
    expect(of(B)).toEqual([{ id: A, colonies: [1] }]);
    expect(of(C)).toEqual([]);
    chat.close();
  });
});

describe('the hide-systems flag on the server', () => {
  const ADMIN = { id: '999999999999999999', name: 'Admin' };
  let srv, base;
  beforeAll(async () => {
    Object.assign(process.env, { DATA_DIR: mkdtempSync(join(tmpdir(), 'falchion-flag-')), DISCORD_CLIENT_ID: 'cid', DISCORD_CLIENT_SECRET: 'csecret', SESSION_SECRET: 's3cret', PUBLIC_URL: 'https://falchion.fly.dev', ADMIN_DISCORD_ID: ADMIN.id });
    srv = await import('./index.mjs');
    await new Promise((r) => srv.server.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${srv.server.address().port}`;
  });
  afterAll(() => { srv.server.closeAllConnections?.(); srv.server.close(); srv.chat.close(); srv.activity.close(); srv.playerFeed.close(); });
  const cookie = (u) => `fal_session=${encodeURIComponent(srv.auth.issue(u))}`;
  const http = async (user, method, path, body, headers = {}) => {
    const res = await fetch(`${base}${path}`, { method, headers: { ...(user ? { cookie: cookie(user) } : {}), 'Content-Type': 'application/json', ...headers }, body: body && JSON.stringify(body) });
    return { status: res.status, body: await res.json().catch(() => null) };
  };
  const listen = (user) => new Promise((resolve) => {
    const events = [];
    const req = request(`${base}/api/chat/stream`, { headers: { cookie: cookie(user) } }, (res) => {
      let buf = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        buf += chunk;
        let i;
        while ((i = buf.indexOf('\n\n')) >= 0) {
          const block = buf.slice(0, i);
          buf = buf.slice(i + 2);
          const ev = /^event: (\w+)$/m.exec(block)?.[1];
          const data = /^data: (.*)$/m.exec(block)?.[1];
          if (ev && data) events.push({ event: ev, data: JSON.parse(data) });
        }
      });
      resolve({ of: (name) => events.filter((e) => e.event === name).map((e) => e.data), close: () => req.destroy() });
    });
    req.end();
  });
  const until = async (fn, ms = 2_000) => {
    const end = Date.now() + ms;
    while (!fn() && Date.now() < end) await new Promise((r) => setTimeout(r, 10));
    return fn();
  };

  it('is off at first, persisted when an admin turns it on, and reaches clients', async () => {
    expect((await http(null, 'GET', '/api/info')).body.hideSystems).toBe(false);
    const player = await listen({ id: A, name: 'Ana' });
    expect((await http({ id: A, name: 'Ana' }, 'PUT', '/api/admin/settings', { hideSystems: true }, { 'x-falchion-admin': '1' })).status).toBe(403);
    expect((await http(ADMIN, 'PUT', '/api/admin/settings', { hideSystems: 'yes' }, { 'x-falchion-admin': '1' })).status).toBe(400);
    const on = await http(ADMIN, 'PUT', '/api/admin/settings', { hideSystems: true }, { 'x-falchion-admin': '1' });
    expect(on).toMatchObject({ status: 200, body: { hideSystems: true } });
    expect(await until(() => player.of('settings').length > 0)).toBe(true);
    expect(player.of('settings')[0]).toEqual({ hideSystems: true });
    expect((await http(null, 'GET', '/api/info')).body.hideSystems).toBe(true);
    expect((await http({ id: A, name: 'Ana' }, 'GET', '/api/vision')).body).toMatchObject({ hideSystems: true, allies: [], explored: [], sighted: [] });
    expect((await http(null, 'GET', '/api/vision')).status).toBe(401);
    expect(await srv.store.getSetting('hidesystems')).toBe(true);
    expect((await http(ADMIN, 'GET', '/api/admin/overview')).body.hideSystems).toBe(true);
    await http(ADMIN, 'PUT', '/api/admin/settings', { hideSystems: false }, { 'x-falchion-admin': '1' });
    expect((await http(null, 'GET', '/api/info')).body.hideSystems).toBe(false);
    player.close();
  });

  it('keeps an empire’s founding when it is founded', async () => {
    const save = recordFor(B, 'Ben', 700).save;
    expect((await http({ id: B, name: 'Ben' }, 'PUT', '/api/save', { save, public: {} })).status).toBe(200);
    const f = await srv.store.founding(B);
    expect(f.save.turn).toBe(700);
    expect(f.at).toBeGreaterThan(0);
  });
});
