// Event log in the database: player actions and NPC decisions, read back oldest first, bounded;
// the admin view is read-only.
import { describe, expect, it } from 'vitest';
import { createAuth } from './auth.mjs';
import { adminIds, createAdmin } from './admin.mjs';
import { openDb } from './db.mjs';
import { createEventLog, recordSafely } from './eventLog.mjs';

const P = '123456789012345678';
const Q = '223456789012345678';
const ADMIN = '999999999999999999';
const fresh = (opts = {}) => createEventLog({ db: openDb(':memory:'), ...opts });

function fakeRes() {
  return {
    status: 0, headers: {}, body: '',
    writeHead(status, headers) { this.status = status; this.headers = headers ?? {}; },
    end(body = '') { this.body = body; },
  };
}

describe('event log', () => {
  it('records each order applied and reads the last N back oldest first', async () => {
    const log = fresh({ now: () => 42 });
    for (let i = 0; i < 5; i++) await log.append(P, { worldTime: i, command: { name: 'move', args: [i] }, clientTime: 7, ok: true });
    const all = await log.read(P, { limit: 10 });
    expect(all).toHaveLength(5);
    expect(all[0]).toMatchObject({ at: 42, worldTime: 0, actor: P, kind: 'command', turn: null, command: { name: 'move', args: [0] }, clientTime: 7, ok: true });
    expect((await log.read(P, { limit: 2 })).map((e) => e.worldTime)).toEqual([3, 4]);
  });

  it('keeps refused orders with their error text, and foundings and catch-ups by kind', async () => {
    const log = fresh();
    await log.found(P, { worldTime: 1, turn: 1 });
    await log.append(P, { worldTime: 1, command: 'colonize', ok: false, error: 'no colony ship' });
    await log.append(P, { worldTime: 9, turn: 2, command: 'advance', ok: true });
    const [found, refused, advance] = await log.read(P);
    expect(found).toMatchObject({ kind: 'found', turn: 1 });
    expect(refused).toMatchObject({ kind: 'command', command: 'colonize', ok: false, error: 'no colony ship', worldTime: 1 });
    expect(advance).toMatchObject({ kind: 'advance', worldTime: 9 });
    expect(typeof refused.at).toBe('number');
  });

  it('records NPC decisions; a player sees those aimed at them, admins see them all', async () => {
    const log = fresh();
    log.npc('s:1,2:0', 'build', { text: 'Built Raiders I' }, { worldTime: 3 });
    log.npc('s:1,2:0', 'raid', { text: 'Raiders I sets out to raid' }, { subject: P, worldTime: 4 });
    log.npc('g:5,5', 'raid', { text: 'elsewhere' }, { subject: Q, worldTime: 4 });
    expect((await log.read(P)).map((e) => e.text)).toEqual(['Raiders I sets out to raid']);
    expect((await log.npcEvents()).map((e) => e.kind)).toEqual(['build', 'raid', 'raid']);
    expect((await log.npcEvents({ npc: 's:1,2:0' })).map((e) => e.worldTime)).toEqual([3, 4]);
    expect((await log.npcEvents())[0].actor).toBe('npc:s:1,2:0');
  });

  it('refuses unknown actors and kinds, reads nothing for an unknown player', async () => {
    const log = fresh();
    expect(await log.read('999999999999999999')).toEqual([]);
    expect(await log.read('../x')).toEqual([]);
    await expect(log.append('../x', { command: 'x', ok: true })).rejects.toThrow();
    expect(() => log.record({ actor: 'someone', kind: 'x' })).toThrow();
    expect(() => log.record({ actor: P, kind: 'DROP TABLE' })).toThrow();
    // recordSafely reports instead of throwing.
    const errors = [];
    recordSafely(log, (m) => errors.push(m))({ actor: 'local', kind: 'contact' });
    expect(errors).toHaveLength(1);
  });

  it('stays bounded: the oldest rows go once the table passes its cap', async () => {
    const log = fresh({ maxEvents: 100 });
    for (let i = 0; i < 2_500; i++) log.record({ actor: P, kind: 'command', worldTime: i });
    const kept = await log.read(P, { limit: 1_000 });
    expect(kept.length).toBeLessThanOrEqual(1_100);
    expect(kept.at(-1).worldTime).toBe(2_499);
  });
});

describe('admin event view', () => {
  const auth = createAuth({ clientId: 'cid', clientSecret: 'csecret', sessionSecret: 's3cret', publicUrl: 'https://falchion.fly.dev' });
  const admin = (log) => createAdmin({ auth, store: {}, admins: adminIds({ ADMIN_DISCORD_ID: ADMIN }), info: () => ({ version: 't' }), events: log });
  const as = (id, extra = {}) => ({ headers: { cookie: `fal_session=${encodeURIComponent(auth.issue({ id, name: 'X' }))}`, ...extra }, method: 'GET' });
  const call = async (handler, req, path) => { const res = fakeRes(); await handler(req, res, path); return res; };

  it('shows an admin the last 50 events of an empire, and the NPC decisions, read only', async () => {
    const log = fresh();
    for (let i = 0; i < 60; i++) await log.append(P, { worldTime: i, command: 'move', ok: true });
    log.npc('s:0,0:1', 'strike', { text: 'Raiders strike' }, { subject: P, worldTime: 61 });
    const handler = admin(log);
    const res = await call(handler, as(ADMIN), `/api/admin/players/${P}/events`);
    expect(res.status).toBe(200);
    const events = JSON.parse(res.body);
    expect(events).toHaveLength(50);
    expect(events.at(-1)).toMatchObject({ kind: 'strike', worldTime: 61 });
    const npcs = await call(handler, as(ADMIN), '/api/admin/npc-events');
    expect(JSON.parse(npcs.body).map((e) => e.text)).toEqual(['Raiders strike']);
    // No write route exists for the log: a POST is simply not found.
    const post = await call(handler, { ...as(ADMIN, { 'x-falchion-admin': '1' }), method: 'POST' }, `/api/admin/players/${P}/events`);
    expect(post.status).toBe(404);
  });

  it('refuses signed-out visitors and non-admins', async () => {
    const handler = admin(fresh());
    expect((await call(handler, { headers: {}, method: 'GET' }, `/api/admin/players/${P}/events`)).status).toBe(401);
    expect((await call(handler, as('555555555555555555'), `/api/admin/players/${P}/events`)).status).toBe(403);
    expect((await call(handler, as('555555555555555555'), '/api/admin/npc-events')).status).toBe(403);
  });
});
