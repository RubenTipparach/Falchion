// Galaxy activity and live players: sign-in, kind validation, rate limits, persistence,
// presence with a grace period, and (through the real server over HTTP) that a save's public
// view reaches the other players' live streams but not the sender's.
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EventEmitter } from 'node:events';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cleanPlace, createActivity } from './activity.mjs';
import { createAuth } from './auth.mjs';
import { createPlayerFeed } from './live.mjs';

const A = { id: '111111111111111111', name: 'Ruben', avatar: null };
const B = { id: '222222222222222222', name: 'Friend', avatar: null };
const C = { id: '333333333333333333', name: 'Third', avatar: null };
const dirs = [];
const tmp = () => { const d = mkdtempSync(join(tmpdir(), 'falchion-activity-')); dirs.push(d); return d; };
afterAll(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

const auth = createAuth({ clientId: 'cid', clientSecret: 'csecret', sessionSecret: 's3cret', publicUrl: 'https://falchion.fly.dev' });
const cookie = (u) => `fal_session=${encodeURIComponent(auth.issue(u))}`;
const EMPIRES = { [A.id]: { name: 'Solar Union', color: '#ff8800' }, [B.id]: { name: 'Vela Pact', color: '#33aaff' } };

function setup(opts = {}) {
  const file = join(tmp(), 'activity.json');
  const clock = { t: 5_000_000 };
  const sent = [];
  const forwarded = [];
  const activity = createActivity({
    auth, file, empireOf: async (id) => EMPIRES[id] ?? null, now: () => clock.t, saveDelayMs: 5,
    broadcast: (event, data) => sent.push({ event, data }),
    forward: async (user, kind, text) => { forwarded.push({ user: user.id, kind, text }); return true; },
    ...opts,
  });
  return { activity, file, clock, sent, forwarded };
}

function fakeRes() {
  return {
    status: 0, body: '',
    writeHead(status) { this.status = status; },
    end(body = '') { this.body = body; },
  };
}
const fakeReq = (user, method = 'GET', body) => Object.assign(new EventEmitter(), {
  method, headers: user ? { cookie: cookie(user) } : {},
  async *[Symbol.asyncIterator]() { if (body !== undefined) yield Buffer.from(JSON.stringify(body)); },
});
async function call(activity, r, path) {
  const res = fakeRes();
  expect(await activity.handle(r, res, path)).toBe(true);
  return { status: res.status, body: res.body ? JSON.parse(res.body) : null };
}
const post = (activity, user, body) => call(activity, fakeReq(user, 'POST', body), '/api/events');

describe('galaxy activity feed', () => {
  it('needs sign-in to read or report', async () => {
    const { activity } = setup();
    expect((await call(activity, fakeReq(null), '/api/activity')).status).toBe(401);
    expect((await post(activity, null, { kind: 'colony', text: 'settled Vela II' })).status).toBe(401);
    expect(await activity.handle(fakeReq(A), fakeRes(), '/api/save')).toBe(false);
    activity.close();
  });

  it('accepts only reportable kinds and cleans the text', async () => {
    const { activity, sent, forwarded } = setup();
    for (const kind of ['nonsense', 'online', 'offline', '__proto__', 'toString', undefined]) expect((await post(activity, A, { kind, text: 'hello' })).status).toBe(400);
    expect((await post(activity, A, { kind: 'survey', text: ' \n ' })).status).toBe(400);
    const r = await post(activity, A, { kind: 'colony', text: 'settled  Vela II\n<b>in</b> Karon‮ ' + 'x'.repeat(300), place: { name: 'Vela II', q: 3, r: -4 } });
    expect(r.status).toBe(200);
    expect(r.body.text.startsWith('settled Vela II <b>in</b> Karon x')).toBe(true); // cleaned to one bounded line; the client renders it as text
    expect(r.body.text.length).toBe(160);
    expect(r.body).toMatchObject({ kind: 'colony', player: { id: A.id, name: 'Ruben' }, empire: EMPIRES[A.id], place: { name: 'Vela II', q: 3, r: -4 }, posted: true });
    expect(sent.map((s) => s.event)).toEqual(['activity']);
    expect(forwarded).toEqual([{ user: A.id, kind: 'colony', text: r.body.text }]);
    const survey = await post(activity, A, { kind: 'survey', text: 'fully surveyed Karon', place: { name: 'Elsewhere', q: 1, r: 1 } });
    expect(survey.body.place).toBeUndefined(); // a place must be named in the text
    expect(cleanPlace({ name: 'Karon', q: 1.5, r: 0 }, 'Karon')).toBeNull();
    expect(cleanPlace({ name: 'Karon', q: 2_000_000, r: 0 }, 'Karon')).toBeNull();
    const list = await call(activity, fakeReq(B), '/api/activity');
    expect(list.body.map((e) => e.kind)).toEqual(['survey', 'colony']); // newest first
    activity.close();
  });

  it('limits how often each player reports', async () => {
    const { activity, clock } = setup({ rate: { max: 3, windowMs: 60_000 } });
    for (let i = 0; i < 3; i++) expect((await post(activity, A, { kind: 'survey', text: `surveyed ${i}` })).status).toBe(200);
    expect((await post(activity, A, { kind: 'survey', text: 'one too many' })).status).toBe(429);
    expect((await post(activity, B, { kind: 'survey', text: 'another player is fine' })).status).toBe(200);
    clock.t += 60_001;
    expect((await post(activity, A, { kind: 'survey', text: 'later' })).status).toBe(200);
    activity.close();
  });

  it('announces a founding once, whether the client or the first save says it first', async () => {
    const { activity, clock } = setup();
    const first = await post(activity, A, { kind: 'found', text: 'founded the Solar Union at Sol', place: { name: 'Sol', q: 0, r: 0 } });
    expect(first.body.kind).toBe('found');
    expect(await activity.founded(A, { color: '#ff8800', empire: { name: 'Solar Union', capital: 'Aurelia' }, home: { q: 0, r: 0 } })).toBeNull();
    expect((await post(activity, A, { kind: 'found', text: 'founded again' })).body.duplicate).toBe(true);
    const viaSave = await activity.founded(B, { color: '#33aaff', empire: { name: 'Vela Pact', capital: 'Nova' }, home: { q: 5, r: -2 } });
    expect(viaSave).toMatchObject({ kind: 'found', text: 'founded the Vela Pact at Nova', place: { name: 'Nova', q: 5, r: -2 }, empire: { name: 'Vela Pact', color: '#33aaff' } });
    clock.t += 600_001;
    expect((await post(activity, A, { kind: 'found', text: 'founded the Solar Union anew' })).body.kind).toBe('found');
    activity.close();
  });

  it('logs comings and goings, ignoring short gaps and players not yet in the galaxy', async () => {
    const { activity, sent } = setup({ presenceGraceMs: 20 });
    activity.presence(A, true);
    activity.presence(C, true); // no empire yet
    await new Promise((r) => setTimeout(r, 5));
    activity.presence(A, false);
    activity.presence(A, true); // a reload: back within the grace period
    await new Promise((r) => setTimeout(r, 40));
    activity.presence(A, false);
    await new Promise((r) => setTimeout(r, 40));
    expect(sent.map((s) => `${s.data.player.name} ${s.data.text}`)).toEqual(['Ruben came online', 'Ruben went offline']);
    activity.close();
  });

  it('persists the last events atomically and loads them on start', async () => {
    const { activity, file } = setup({ keep: 3 });
    for (const n of ['one', 'two', 'three', 'four']) await post(activity, A, { kind: 'survey', text: `surveyed ${n}` });
    await activity.flush();
    activity.close();
    expect(JSON.parse(readFileSync(file, 'utf8')).events.map((e) => e.text)).toEqual(['surveyed two', 'surveyed three', 'surveyed four']);
    const again = createActivity({ auth, file, empireOf: async () => null });
    expect((await again.recent()).map((e) => e.text)).toEqual(['surveyed four', 'surveyed three', 'surveyed two']);
    const next = await again.report(B, { kind: 'depot', text: 'built a depot' });
    expect((await again.recent()).some((e) => e.id === next.body.id && e.text === 'surveyed four')).toBe(false); // ids stay unique
    again.close();
  });
});

describe('live player feed', () => {
  it('coalesces a burst of saves from one player into at most one push per interval', async () => {
    const out = [];
    const feed = createPlayerFeed({ broadcast: (event, data, opts) => out.push({ event, id: data.id, n: data.n, except: opts.except }), minIntervalMs: 30 });
    feed.publish({ id: A.id, n: 1 });
    feed.publish({ id: A.id, n: 2 });
    feed.publish({ id: A.id, n: 3 });
    feed.publish({ id: B.id, n: 1 });
    expect(out).toEqual([{ event: 'player', id: A.id, n: 1, except: A.id }, { event: 'player', id: B.id, n: 1, except: B.id }]);
    await new Promise((r) => setTimeout(r, 60));
    expect(out.at(-1)).toEqual({ event: 'player', id: A.id, n: 3, except: A.id }); // the latest wins
    expect(out).toHaveLength(3);
    feed.close();
  });
});

describe('server: other players live over the chat stream', () => {
  let srv;
  let base;
  beforeAll(async () => {
    Object.assign(process.env, { DATA_DIR: tmp(), DISCORD_CLIENT_ID: 'cid', DISCORD_CLIENT_SECRET: 'csecret', SESSION_SECRET: 's3cret', PUBLIC_URL: 'https://falchion.fly.dev' });
    srv = await import('./index.mjs');
    await new Promise((r) => srv.server.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${srv.server.address().port}`;
  });
  afterAll(() => { srv.server.closeAllConnections?.(); srv.server.close(); srv.chat.close(); srv.activity.close(); srv.playerFeed.close(); });

  const userCookie = (u) => `fal_session=${encodeURIComponent(srv.auth.issue(u))}`;
  const http = async (user, method, path, body) => {
    const res = await fetch(`${base}${path}`, { method, headers: { ...(user ? { cookie: userCookie(user) } : {}), 'Content-Type': 'application/json' }, body: body && JSON.stringify(body) });
    return { status: res.status, body: await res.json().catch(() => null) };
  };
  /** An open live stream: parsed events, and a way to close it. */
  const listen = (user) => new Promise((resolve) => {
    const events = [];
    const req = request(`${base}/api/chat/stream`, { headers: { cookie: userCookie(user) } }, (res) => {
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
      resolve({ events, of: (name) => events.filter((e) => e.event === name).map((e) => e.data), close: () => req.destroy() });
    });
    req.end();
  });
  const until = async (fn, ms = 2_000) => {
    const end = Date.now() + ms;
    while (!fn() && Date.now() < end) await new Promise((r) => setTimeout(r, 10));
    return fn();
  };
  const save = (turn, fleets) => ({
    save: { turn },
    public: { color: '#ff8800', empire: { name: 'Solar Union', ruler: 'Ruben', title: 'Consul', capital: 'Aurelia', flag: { field: 'solid', emblem: 'star', colors: ['#ff8800', '#111111', '#ffffff'] } }, home: { q: 4, r: -2 }, colonies: [{ q: 4, r: -2 }], fleets },
  });

  it('needs sign-in for the feed and for reports', async () => {
    expect((await http(null, 'GET', '/api/activity')).status).toBe(401);
    expect((await http(null, 'POST', '/api/events', { kind: 'colony', text: 'x' })).status).toBe(401);
    expect((await http(A, 'POST', '/api/events', { kind: 'bogus', text: 'x' })).status).toBe(400);
  });

  it('sends a saved public view to the other players at once, never back to the sender', async () => {
    const a = await listen(A);
    const b = await listen(B);
    const c = await listen(C);
    const fleet = { id: 'scout-1', name: 'Scout Wing I', movement: { route: [{ q: 4, r: -2 }, { q: 5, r: -2 }], departTurn: 10, speed: 1 }, design: { style: 'classic' } };
    expect((await http(A, 'PUT', '/api/save', save(10, [fleet]))).status).toBe(200);
    expect(await until(() => b.of('player').length > 0 && c.of('player').length > 0)).toBe(true);
    const seen = b.of('player')[0];
    expect(seen).toMatchObject({ id: A.id, name: 'Ruben', home: { q: 4, r: -2 }, empire: { name: 'Solar Union' }, fleets: [{ id: 'scout-1', name: 'Scout Wing I' }] });
    expect(seen.updatedAt).toBeGreaterThan(0);
    // The first save founds the empire: everyone hears about it in the activity feed.
    expect(await until(() => b.of('activity').some((e) => e.kind === 'found'))).toBe(true);
    expect(b.of('activity').find((e) => e.kind === 'found')).toMatchObject({ player: { id: A.id }, text: 'founded the Solar Union at Aurelia', place: { name: 'Aurelia', q: 4, r: -2 } });
    expect(a.of('player')).toEqual([]);
    // A reported colony reaches the feed over HTTP and live.
    const colony = await http(A, 'POST', '/api/events', { kind: 'colony', text: 'settled Vela II in Karon', place: { name: 'Karon', q: 6, r: -3 } });
    expect(colony.status).toBe(200);
    expect(await until(() => b.of('activity').some((e) => e.id === colony.body.id))).toBe(true);
    expect((await http(B, 'GET', '/api/activity')).body.map((e) => e.kind)).toEqual(['colony', 'found']);
    a.close();
    b.close();
    c.close();
  });
});
