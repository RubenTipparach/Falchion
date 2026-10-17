// Server tests: Discord sign-in flow against a fake Discord, and per-player saves.
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { createAuth, parseCookies } from './auth.mjs';
import { createStore } from './store.mjs';

function fakeRes() {
  return {
    status: 0, headers: {}, body: '',
    writeHead(status, headers) { this.status = status; this.headers = headers ?? {}; },
    end(body = '') { this.body = body; },
  };
}
const setCookies = (res) => [].concat(res.headers['Set-Cookie'] ?? []);
const cookieValue = (res, name) => {
  const c = setCookies(res).find((x) => x.startsWith(`${name}=`));
  return c ? decodeURIComponent(c.split(';')[0].slice(name.length + 1)) : undefined;
};

const fakeDiscord = async (url, init) => {
  if (url.endsWith('/oauth2/token')) {
    const body = new URLSearchParams(init.body);
    return { ok: body.get('code') === 'good-code', status: 200, json: async () => ({ access_token: 'tok' }) };
  }
  if (url.endsWith('/users/@me')) return { ok: init.headers.Authorization === 'Bearer tok', status: 200, json: async () => ({ id: '123456789012345678', username: 'ruben', global_name: 'Ruben', avatar: 'abc' }) };
  return { ok: false, status: 404, json: async () => ({}) };
};

const make = () => createAuth({ clientId: 'cid', clientSecret: 'csecret', sessionSecret: 's3cret', publicUrl: 'https://falchion.fly.dev', fetchImpl: fakeDiscord });

describe('discord sign-in', () => {
  it('is off until all three secrets are set', () => {
    expect(createAuth({ clientId: 'x' }).enabled).toBe(false);
    expect(make().enabled).toBe(true);
  });

  it('redirects to Discord with identify scope and a state cookie', () => {
    const res = fakeRes();
    make().login(res);
    const to = new URL(res.headers.Location);
    expect(to.searchParams.get('scope')).toBe('identify');
    expect(to.searchParams.get('redirect_uri')).toBe('https://falchion.fly.dev/auth/discord/callback');
    expect(to.searchParams.get('state')).toBe(cookieValue(res, 'fal_oauth_state'));
  });

  it('signs the player in and the session round-trips', async () => {
    const auth = make();
    const res = fakeRes();
    await auth.callback({ headers: { cookie: 'fal_oauth_state=abc' } }, res, new URL('https://x/auth/discord/callback?code=good-code&state=abc'));
    expect(res.status).toBe(302);
    const session = cookieValue(res, 'fal_session');
    expect(auth.userFrom({ headers: { cookie: `fal_session=${encodeURIComponent(session)}` } })).toEqual({ id: '123456789012345678', name: 'Ruben', avatar: 'https://cdn.discordapp.com/avatars/123456789012345678/abc.png?size=64' });
  });

  it('rejects a mismatched state (CSRF) and tampered sessions', async () => {
    const auth = make();
    const res = fakeRes();
    await auth.callback({ headers: { cookie: 'fal_oauth_state=abc' } }, res, new URL('https://x/cb?code=good-code&state=evil'));
    expect(res.status).toBe(400);
    const forged = Buffer.from(JSON.stringify({ id: '1', name: 'x', exp: Date.now() + 1e9 })).toString('base64url') + '.bad';
    expect(auth.userFrom({ headers: { cookie: `fal_session=${forged}` } })).toBeNull();
  });

  it('parses cookies', () => {
    expect(parseCookies('a=1; b=x%3Dy')).toEqual({ a: '1', b: 'x=y' });
  });
});

describe('player store', () => {
  const dir = mkdtempSync(join(tmpdir(), 'falchion-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('saves and loads by Discord id and lists public views', async () => {
    const store = createStore(dir);
    await store.save('123456789012345678', { player: { id: '123456789012345678', name: 'Ruben' }, save: { turn: 5 }, public: { home: { q: 1, r: 2 }, colonies: [], fleets: [] } });
    expect((await store.load('123456789012345678')).save.turn).toBe(5);
    const players = await store.players();
    expect(players).toHaveLength(1);
    expect(players[0]).toMatchObject({ id: '123456789012345678', name: 'Ruben', home: { q: 1, r: 2 } });
    expect('save' in players[0]).toBe(false);
  });

  it('never touches the filesystem for non-snowflake ids', async () => {
    const store = createStore(dir);
    expect(await store.load('../etc/passwd')).toBeNull();
    await expect(store.save('../../x', { save: {} })).rejects.toThrow();
  });
});

describe('admin portal', async () => {
  const { adminIds, createAdmin } = await import('./admin.mjs');
  const dir = mkdtempSync(join(tmpdir(), 'falchion-admin-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));
  const auth = make();
  const store = createStore(dir);
  const admin = createAdmin({ auth, store, admins: adminIds({ ADMIN_DISCORD_ID: '123456789012345678, 999999999999999999 ,junk' }), info: () => ({ version: 't' }) });
  const as = (id) => ({ headers: { cookie: `fal_session=${encodeURIComponent(auth.issue({ id, name: 'X' }))}` }, method: 'GET' });
  const call = async (req, path) => { const res = fakeRes(); await admin(req, res, path); return res; };

  it('reads the allowlist like High Frontier: a comma-separated ADMIN_DISCORD_ID (or ADMIN_DISCORD_IDS)', () => {
    expect([...adminIds({ ADMIN_DISCORD_ID: '123456789012345678, 999999999999999999 ,junk' })]).toEqual(['123456789012345678', '999999999999999999']);
    expect([...adminIds({ ADMIN_DISCORD_IDS: '111111111111111111' })]).toEqual(['111111111111111111']);
  });

  it('sends signed-out visitors to Discord and refuses non-admins', async () => {
    expect((await call({ headers: {}, method: 'GET' }, '/admin')).headers.Location).toBe('/auth/discord?next=/admin');
    const res = await call(as('555555555555555555'), '/admin');
    expect(res.status).toBe(403);
    expect(res.body).toContain('555555555555555555');
    expect((await call(as('555555555555555555'), '/api/admin/players')).status).toBe(403);
  });

  it('lists players, resets an empire, and needs the admin header to write', async () => {
    await store.save('222222222222222222', { player: { id: '222222222222222222', name: 'Friend' }, save: { turn: 9, economy: { colonies: [{}, {}] } }, public: { fleets: [] }, updatedAt: 1 });
    const list = JSON.parse((await call(as('123456789012345678'), '/api/admin/players')).body);
    expect(list[0]).toMatchObject({ id: '222222222222222222', year: 9, colonies: 2 });
    const noHeader = await call({ ...as('123456789012345678'), method: 'DELETE' }, '/api/admin/players/222222222222222222');
    expect(noHeader.status).toBe(403);
    const ok = await call({ headers: { ...as('123456789012345678').headers, 'x-falchion-admin': '1' }, method: 'DELETE' }, '/api/admin/players/222222222222222222');
    expect(ok.status).toBe(200);
    expect(await store.load('222222222222222222')).toBeNull();
  });

  it('publishes an announcement everyone can read', async () => {
    const req = { headers: { ...as('999999999999999999').headers, 'x-falchion-admin': '1' }, method: 'PUT', async *[Symbol.asyncIterator]() { yield Buffer.from(JSON.stringify({ text: 'Maintenance at 20:00' })); } };
    expect((await call(req, '/api/admin/announcement')).status).toBe(200);
    const pub = await call({ headers: {}, method: 'GET' }, '/api/announcement');
    expect(JSON.parse(pub.body).text).toBe('Maintenance at 20:00');
  });
});

describe('sign-in redirect', async () => {
  const { safeNext } = await import('./auth.mjs');
  it('only returns to paths on this site', () => {
    expect(safeNext('/admin')).toBe('/admin');
    expect(safeNext('//evil.example')).toBe('/');
    expect(safeNext('https://evil.example')).toBe('/');
  });
});
