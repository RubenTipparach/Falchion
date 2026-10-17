// Chat server tests: sign-in and CSRF guards, rate limit, DM privacy, presence,
// persistence, and Discord notifications for @mentions against a fake Discord.
import { EventEmitter } from 'node:events';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { createAuth } from './auth.mjs';
import { cleanText, createChat } from './chat.mjs';
import { createNotifier } from './notifier.mjs';

const A = { id: '111111111111111111', name: 'Ruben', avatar: null };
const B = { id: '222222222222222222', name: 'Friend', avatar: null };
const C = { id: '333333333333333333', name: 'Third', avatar: null };
const auth = createAuth({ clientId: 'cid', clientSecret: 'csecret', sessionSecret: 's3cret', publicUrl: 'https://falchion.fly.dev' });
const cookie = (u) => `fal_session=${encodeURIComponent(auth.issue(u))}`;
const dirs = [];
afterAll(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

function fakeRes() {
  return {
    status: 0, headers: {}, body: '',
    writeHead(status, headers) { this.status = status; this.headers = headers ?? {}; },
    end(body = '') { this.body = body; },
  };
}

/** A chat with three known players, a fake clock and a fake Discord that records calls. */
function setup({ dmOk = true } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'falchion-chat-'));
  dirs.push(dir);
  const clock = { t: 1_000_000 };
  const discord = [];
  const fetchImpl = async (url, init) => {
    discord.push({ url, body: JSON.parse(init.body) });
    if (url.endsWith('/users/@me/channels')) return { ok: dmOk, status: dmOk ? 200 : 403, json: async () => ({ id: '900000000000000009' }) };
    return { ok: true, status: 200, json: async () => ({}) };
  };
  const notifier = createNotifier({ token: 'bot', channelId: '123456789012345678', fetchImpl, now: () => clock.t, publicUrl: 'https://falchion.fly.dev' });
  const file = join(dir, 'chat.json');
  const chat = createChat({ auth, file, players: async () => [A, B, C], notifier, now: () => clock.t, saveDelayMs: 5 });
  return { chat, clock, discord, file };
}

const req = (user, method = 'GET', body, headers = {}) => Object.assign(new EventEmitter(), {
  method, headers: { ...(user ? { cookie: cookie(user) } : {}), ...headers },
  async *[Symbol.asyncIterator]() { if (body !== undefined) yield Buffer.from(JSON.stringify(body)); },
});
async function call(chat, r, path) {
  const res = fakeRes();
  expect(await chat.handle(r, res, path)).toBe(true);
  return { status: res.status, body: res.body ? JSON.parse(res.body) : null };
}
const say = (chat, user, msg) => call(chat, req(user, 'POST', msg, { 'x-falchion': '1' }), '/api/chat');

/** An open chat stream: the events it received, and a way to close it. */
async function listen(chat, user) {
  const r = req(user);
  const events = [];
  const res = {
    writeHead() {}, end() {},
    write(chunk) {
      const m = /^event: (\w+)\ndata: (.*)\n\n$/s.exec(chunk);
      if (m) events.push({ event: m[1], data: JSON.parse(m[2]) });
    },
  };
  await chat.handle(r, res, '/api/chat/stream');
  return { events, messages: () => events.filter((e) => e.event === 'message').map((e) => e.data), close: () => r.emit('close') };
}

describe('in-game chat', () => {
  it('needs sign-in for every chat endpoint', async () => {
    const { chat } = setup();
    for (const path of ['/api/chat', '/api/chat/stream', '/api/online']) expect((await call(chat, req(null), path)).status).toBe(401);
    expect((await call(chat, req(null, 'POST', { to: 'global', text: 'hi' }, { 'x-falchion': '1' }), '/api/chat')).status).toBe(401);
    expect(await chat.handle(req(A), fakeRes(), '/api/save')).toBe(false);
    chat.close();
  });

  it('refuses posts without the X-Falchion header (CSRF)', async () => {
    const { chat } = setup();
    expect((await call(chat, req(A, 'POST', { to: 'global', text: 'hi' }), '/api/chat')).status).toBe(403);
    expect((await say(chat, A, { to: 'global', text: 'hi' })).status).toBe(200);
    chat.close();
  });

  it('delivers global messages live, cleaned, and keeps them in history', async () => {
    const { chat } = setup();
    const b = await listen(chat, B);
    const r = await say(chat, A, { to: 'global', text: '  hello\n\u202eworld\u0007 ' + 'x'.repeat(600) });
    expect(r.status).toBe(200);
    expect(r.body.text.startsWith('hello world x')).toBe(true);
    expect(r.body.text.length).toBe(500);
    expect(r.body.from).toEqual(A);
    expect(b.messages().map((m) => m.id)).toEqual([r.body.id]);
    const hist = await call(chat, req(C), '/api/chat');
    expect(hist.body.global.map((m) => m.id)).toEqual([r.body.id]);
    expect(hist.body.me.id).toBe(C.id);
    expect((await say(chat, A, { to: 'global', text: ' \n ' })).status).toBe(400);
    expect(cleanText('a\r\nb\u2028c')).toBe('a b c');
    b.close();
    chat.close();
  });

  it('limits each player to 5 messages every 10 seconds', async () => {
    const { chat, clock } = setup();
    for (let i = 0; i < 5; i++) expect((await say(chat, A, { to: 'global', text: `m${i}` })).status).toBe(200);
    expect((await say(chat, A, { to: 'global', text: 'too many' })).status).toBe(429);
    expect((await say(chat, B, { to: 'global', text: 'other player is fine' })).status).toBe(200);
    clock.t += 10_001;
    expect((await say(chat, A, { to: 'global', text: 'later' })).status).toBe(200);
    chat.close();
  });

  it('keeps direct messages private to the two players', async () => {
    const { chat } = setup();
    const b = await listen(chat, B);
    const c = await listen(chat, C);
    const dm = await say(chat, A, { to: B.id, text: 'secret plan' });
    expect(dm.status).toBe(200);
    expect(b.messages().map((m) => m.text)).toEqual(['secret plan']);
    expect(c.messages()).toEqual([]);
    expect((await call(chat, req(C), '/api/chat')).body.dms).toEqual([]);
    expect((await call(chat, req(B), '/api/chat')).body.dms.map((m) => m.text)).toEqual(['secret plan']);
    expect((await call(chat, req(A), '/api/chat')).body.dms.map((m) => m.text)).toEqual(['secret plan']);
    expect((await say(chat, A, { to: '999999999999999999', text: 'who?' })).status).toBe(400);
    expect((await say(chat, A, { to: A.id, text: 'me' })).status).toBe(400);
    expect((await say(chat, A, { to: '../x', text: 'x' })).status).toBe(400);
    b.close();
    c.close();
    chat.close();
  });

  it('tracks who is online by open streams, across tabs', async () => {
    const { chat } = setup();
    const a1 = await listen(chat, A);
    const a2 = await listen(chat, A);
    const b = await listen(chat, B);
    expect((await call(chat, req(C), '/api/online')).body.map((p) => p.id).sort()).toEqual([A.id, B.id]);
    expect(a1.events.filter((e) => e.event === 'presence').at(-1).data.online).toHaveLength(2);
    a1.close();
    expect(chat.online().map((p) => p.id).sort()).toEqual([A.id, B.id]);
    a2.close();
    expect(chat.online().map((p) => p.id)).toEqual([B.id]);
    expect(b.events.filter((e) => e.event === 'presence').at(-1).data.online.map((p) => p.id)).toEqual([B.id]);
    b.close();
    chat.close();
  });

  it('keeps only known mentions and places named in the text', async () => {
    const { chat } = setup();
    const r = await say(chat, A, {
      to: 'global', text: 'Fleet to Vela II, @Friend',
      mentions: [B.id, '999999999999999999', A.id, 'junk'],
      places: [{ name: 'Vela II', q: 3, r: -4 }, { name: 'Elsewhere', q: 1, r: 1 }, { name: 'Vela II', q: 1.5, r: 0 }, { name: 'x'.repeat(80), q: 0, r: 0 }],
    });
    expect(r.body.mentions).toEqual([B.id]);
    expect(r.body.places).toEqual([{ name: 'Vela II', q: 3, r: -4 }]);
    const dm = await say(chat, A, { to: B.id, text: 'hi @Third', mentions: [C.id] });
    expect(dm.body.mentions).toEqual([]); // a DM cannot pull in a third player
    chat.close();
  });

  it('tells mentioned players who are not in the game on Discord, by bot DM', async () => {
    const { chat, discord } = setup();
    const c = await listen(chat, C); // C is in the game: no Discord ping for them
    await say(chat, A, { to: 'global', text: 'Help at Vela, @Friend @Third', mentions: [B.id, C.id] });
    await chat.settled();
    expect(discord.map((d) => d.url)).toEqual(['https://discord.com/api/v10/users/@me/channels', 'https://discord.com/api/v10/channels/900000000000000009/messages']);
    expect(discord[0].body).toEqual({ recipient_id: B.id });
    expect(discord[1].body.content).toBe('**Ruben** mentioned you in Falchion: Help at Vela, @Friend @Third — https://falchion.fly.dev');
    expect(discord[1].body.allowed_mentions).toEqual({ parse: [] });
    c.close();
    chat.close();
  });

  it('falls back to a channel post that pings only the player, without private text', async () => {
    const { chat, discord } = setup({ dmOk: false });
    await say(chat, A, { to: 'global', text: '@Friend look', mentions: [B.id] });
    await chat.settled();
    const ping = discord.find((d) => d.url.endsWith('/channels/123456789012345678/messages'));
    expect(ping.body.content).toBe(`<@${B.id}> **Ruben** mentioned you in Falchion: @Friend look — https://falchion.fly.dev`);
    expect(ping.body.allowed_mentions).toEqual({ users: [B.id] });
    discord.length = 0;
    await say(chat, A, { to: C.id, text: 'private stuff' }); // C is away: told, but the channel never sees the text
    await chat.settled();
    const dmPing = discord.find((d) => d.url.endsWith('/channels/123456789012345678/messages'));
    expect(dmPing.body.content).toBe(`<@${C.id}> **Ruben** sent you a direct message in Falchion — https://falchion.fly.dev`);
    chat.close();
  });

  it('rate-limits mention notifications per sender and per recipient', async () => {
    const n = createNotifier({ token: 'bot', fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ id: '900000000000000009' }) }), mentionsPerSender: 2, mentionsPerRecipient: 3 });
    const from = { id: A.id, name: 'Ruben' };
    expect(await n.mention({ from, to: B.id, text: 'a' })).toBe('dm');
    expect(await n.mention({ from, to: C.id, text: 'b' })).toBe('dm');
    expect(await n.mention({ from, to: B.id, text: 'c' })).toBe(false); // sender used up
    expect(await n.mention({ from: { id: C.id, name: 'T' }, to: B.id, text: 'd' })).toBe('dm');
    expect(await n.mention({ from: { id: '444444444444444444', name: 'U' }, to: B.id, text: 'e' })).toBe('dm');
    expect(await n.mention({ from: { id: '555555555555555555', name: 'V' }, to: B.id, text: 'f' })).toBe(false); // recipient used up
    expect(await n.mention({ from: { id: '666666666666666666', name: 'W' }, to: '666666666666666666', text: 'self' })).toBe(false);
    expect(createNotifier({}).canNotifyPlayers).toBe(false);
  });

  it('persists messages atomically and loads them on start', async () => {
    const { chat, file } = setup();
    await say(chat, A, { to: 'global', text: 'remember me' });
    await say(chat, A, { to: B.id, text: 'and this' });
    await chat.flush();
    chat.close();
    expect(JSON.parse(readFileSync(file, 'utf8')).global[0].text).toBe('remember me');
    const again = createChat({ auth, file, players: async () => [A, B, C] });
    const hist = await again.history(B.id);
    expect(hist.global.map((m) => m.text)).toEqual(['remember me']);
    expect(hist.dms.map((m) => m.text)).toEqual(['and this']);
    const next = await again.post(A, { to: 'global', text: 'new' });
    expect(hist.global.some((m) => m.id === next.body.id)).toBe(false);
    again.close();
  });
});
