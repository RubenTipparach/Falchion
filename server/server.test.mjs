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
