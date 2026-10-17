// Event log: append-only JSON lines per player, bounded by rotation, read back oldest
// first; the founding save is kept whole; the admin view is read-only.
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { createAuth } from './auth.mjs';
import { adminIds, createAdmin } from './admin.mjs';
import { createEventLog } from './eventLog.mjs';

const P = '123456789012345678';
const ADMIN = '999999999999999999';
const dir = mkdtempSync(join(tmpdir(), 'falchion-events-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

function fakeRes() {
  return {
    status: 0, headers: {}, body: '',
    writeHead(status, headers) { this.status = status; this.headers = headers ?? {}; },
    end(body = '') { this.body = body; },
  };
}

describe('event log', () => {
  it('appends one JSON line per entry and reads the last N back oldest first', async () => {
    const log = createEventLog({ dir: join(dir, 'a'), now: () => 42 });
    for (let i = 0; i < 5; i++) await log.append(P, { worldTime: i, command: { type: 'move', args: [i] }, clientTime: 7, ok: true });
    const lines = readFileSync(join(dir, 'a', 'events', `${P}.jsonl`), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    expect(lines).toHaveLength(5);
    expect(lines[0]).toEqual({ at: 42, worldTime: 0, turn: null, command: { type: 'move', args: [0] }, clientTime: 7, ok: true });
    expect((await log.read(P, { limit: 2 })).map((e) => e.worldTime)).toEqual([3, 4]);
  });

  it('keeps refused commands with their error text', async () => {
    const log = createEventLog({ dir: join(dir, 'b') });
    await log.append(P, { worldTime: 1, command: 'colonize', ok: false, error: 'no colony ship' });
    const [e] = await log.read(P);
    expect(e).toMatchObject({ command: 'colonize', ok: false, error: 'no colony ship', worldTime: 1 });
    expect(typeof e.at).toBe('number');
  });

  it('reads nothing for an unknown player, and never touches paths built from ids', async () => {
    const log = createEventLog({ dir: join(dir, 'c') });
    expect(await log.read('999999999999999999')).toEqual([]);
    expect(await log.read('../x')).toEqual([]);
    expect(await log.read('abc')).toEqual([]); // the store's ids: Discord snowflakes only
    await expect(log.append('../x', { command: 'x', ok: true })).rejects.toThrow();
    expect(await log.foundingSave('../x')).toBeNull();
  });

  it('rotates a full file to .1 and still reads across both files', async () => {
    const log = createEventLog({ dir: join(dir, 'd'), maxBytes: 600 });
    for (let i = 0; i < 20; i++) await log.append(P, { worldTime: i, command: 'move', ok: true });
    const base = join(dir, 'd', 'events', `${P}.jsonl`);
    expect(existsSync(`${base}.1`)).toBe(true);
    expect(statSync(base).size).toBeLessThanOrEqual(600);
    const last = await log.read(P, { limit: 50 });
    expect(last.length).toBeLessThan(20); // the oldest lines were dropped with the old .1
    expect(last.at(-1).worldTime).toBe(19);
    expect(last.map((e) => e.worldTime)).toEqual(Array.from({ length: last.length }, (_, k) => 20 - last.length + k));
  });

  it('serialises concurrent appends, rotations included: no line is lost, torn or reordered', async () => {
    const log = createEventLog({ dir: join(dir, 'e'), maxBytes: 1200 });
    await Promise.all(Array.from({ length: 60 }, (_, i) => log.append(P, { worldTime: i, command: 'move', ok: true })));
    const all = await log.read(P, { limit: 200 });
    expect(all.at(-1).worldTime).toBe(59);
    expect(all.map((e) => e.worldTime)).toEqual(Array.from({ length: all.length }, (_, k) => 60 - all.length + k));
  });

  it('keeps the founding save whole and logs a found line beside it', async () => {
    const log = createEventLog({ dir: join(dir, 'f'), now: () => 5 });
    const save = { turn: 3, economy: { colonies: [] }, pad: 'x'.repeat(5000) };
    await log.found(P, { save, worldTime: 3 });
    const [e] = await log.read(P);
    expect(e).toMatchObject({ command: 'found', ok: true, worldTime: 3, turn: 3, at: 5 });
    expect(await log.foundingSave(P)).toEqual(save);
    expect(e.pad).toBeUndefined(); // the save lives in its own file, not in the line
  });
});

describe('admin event view', () => {
  const auth = createAuth({ clientId: 'cid', clientSecret: 'csecret', sessionSecret: 's3cret', publicUrl: 'https://falchion.fly.dev' });
  const admin = (log) => createAdmin({ auth, store: {}, admins: adminIds({ ADMIN_DISCORD_ID: ADMIN }), info: () => ({ version: 't' }), events: log });
  const as = (id, extra = {}) => ({ headers: { cookie: `fal_session=${encodeURIComponent(auth.issue({ id, name: 'X' }))}`, ...extra }, method: 'GET' });
  const call = async (handler, req, path) => { const res = fakeRes(); await handler(req, res, path); return res; };

  it('shows an admin the last 50 events, read only', async () => {
    const log = createEventLog({ dir: join(dir, 'g') });
    for (let i = 0; i < 60; i++) await log.append(P, { worldTime: i, command: 'move', ok: true });
    const handler = admin(log);
    const res = await call(handler, as(ADMIN), `/api/admin/players/${P}/events`);
    expect(res.status).toBe(200);
    const events = JSON.parse(res.body);
    expect(events).toHaveLength(50);
    expect(events.at(-1).worldTime).toBe(59);
    // No write route exists for the log: a POST is simply not found.
    const post = await call(handler, { ...as(ADMIN, { 'x-falchion-admin': '1' }), method: 'POST' }, `/api/admin/players/${P}/events`);
    expect(post.status).toBe(404);
  });

  it('refuses signed-out visitors and non-admins', async () => {
    const handler = admin(createEventLog({ dir: join(dir, 'h') }));
    expect((await call(handler, { headers: {}, method: 'GET' }, `/api/admin/players/${P}/events`)).status).toBe(401);
    expect((await call(handler, as('555555555555555555'), `/api/admin/players/${P}/events`)).status).toBe(403);
  });
});
