// Falchion server (Fly.io). Serves the built client, health/info endpoints and
// the world clock: the world advances one tick (one game year) per minute and
// every connected client is told over Server-Sent Events. It is the home of the
// authoritative MMO server (change `mmo-core-systems`). Zero dependencies on
// purpose: node:http only.
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { adminIds, createAdmin } from './admin.mjs';
import { createAuth } from './auth.mjs';
import { createChat } from './chat.mjs';
import { createNotifier } from './notifier.mjs';
import { createStore } from './store.mjs';

const here = fileURLToPath(new URL('.', import.meta.url));
const STATIC_DIR = resolve(process.env.STATIC_DIR ?? join(here, '..', 'dist'));
const PORT = Number(process.env.PORT ?? 8080);
const VERSION = process.env.BUILD_SHA ?? 'dev';

// Discord sign-in and per-player saves. Sign-in switches on when the three
// secrets are set (docs/discord.md); saves live in DATA_DIR (a Fly volume).
export const auth = createAuth({
  clientId: process.env.DISCORD_CLIENT_ID,
  clientSecret: process.env.DISCORD_CLIENT_SECRET,
  sessionSecret: process.env.SESSION_SECRET,
  publicUrl: process.env.PUBLIC_URL ?? `http://localhost:${PORT}`,
  // Overridable only for local end-to-end tests against a fake Discord.
  ...(process.env.DISCORD_API_BASE ? { discordApi: process.env.DISCORD_API_BASE } : {}),
  ...(process.env.DISCORD_AUTHORIZE_URL ? { discordAuthorize: process.env.DISCORD_AUTHORIZE_URL } : {}),
});
export const store = createStore(resolve(process.env.DATA_DIR ?? join(here, '..', 'data')));
const MAX_SAVE_BYTES = 3 * 1024 * 1024;
const STARTED_AT = Date.now();
// Same secret as High Frontier: ADMIN_DISCORD_ID (or ADMIN_DISCORD_IDS), comma-separated.
export const admins = adminIds(process.env);
// Channel notifications (optional): DISCORD_WEBHOOK_URL, or DISCORD_BOT_TOKEN + DISCORD_CHANNEL_ID.
// The bot token also lets the server tell players about chat mentions.
export const notifier = createNotifier({
  webhookUrl: process.env.DISCORD_WEBHOOK_URL,
  token: process.env.DISCORD_BOT_TOKEN,
  channelId: process.env.DISCORD_CHANNEL_ID,
  publicUrl: process.env.PUBLIC_URL ?? 'https://falchion.fly.dev',
  ...(process.env.DISCORD_API_BASE ? { api: process.env.DISCORD_API_BASE } : {}),
});
// In-game chat (global + direct messages), presence, and Discord pings for @mentions (server/chat.mjs).
export const chat = createChat({ auth, file: join(store.dir, 'chat.json'), players: () => store.players(), notifier });
const admin = createAdmin({
  auth, store, admins, notifier,
  info: () => ({ version: VERSION, worldTick, listeners: listeners.size, discord: auth.enabled, notifications: notifier.mode, notificationsProblem: notifier.problem, uptimeSec: Math.round((Date.now() - STARTED_AT) / 1000) }),
});

function json(res, status, body) {
  send(res, status, JSON.stringify(body), { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
}

async function readJson(req, limit) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw Object.assign(new Error('too large'), { status: 413 });
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const text = (s, max) => (typeof s === 'string' ? s.replace(/[\u0000-\u001f\u007f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '');

/** An empire's chosen name, ruler and flag, bounded; clients validate flag parts against their tables. */
function publicIdentity(e) {
  if (!e || typeof e !== 'object' || !text(e.name, 40)) return undefined;
  const part = (x) => (typeof x === 'string' && /^[a-z][a-z-]{0,23}$/.test(x) ? x : 'none');
  const colors = Array.isArray(e.flag?.colors) ? e.flag.colors.slice(0, 3).map((c) => (typeof c === 'string' && HEX_COLOR.test(c) ? c : '#10121c')) : [];
  return {
    name: text(e.name, 40), ruler: text(e.ruler, 40), title: text(e.title, 24), capital: text(e.capital, 40),
    flag: { field: part(e.flag?.field), emblem: part(e.flag?.emblem), colors },
  };
}

/** Only what other players may see: identity, home, colony stars and fleets (no stockpiles or research). */
export function publicView(p) {
  const fleets = Array.isArray(p?.fleets) ? p.fleets.slice(0, 50) : [];
  return {
    color: typeof p?.color === 'string' && HEX_COLOR.test(p.color) ? p.color : '#e6b450',
    empire: publicIdentity(p?.empire),
    home: p?.home && Number.isInteger(p.home.q) && Number.isInteger(p.home.r) ? { q: p.home.q, r: p.home.r } : null,
    colonies: Array.isArray(p?.colonies) ? p.colonies.filter((h) => Number.isInteger(h?.q) && Number.isInteger(h?.r)).slice(0, 200).map((h) => ({ q: h.q, r: h.r })) : [],
    fleets: fleets.map((f) => ({ id: String(f.id).slice(0, 64), name: String(f.name).slice(0, 64), movement: f.movement, design: f.design })),
  };
}

async function api(req, res, pathname) {
  const user = auth.userFrom(req);
  if (pathname === '/api/me') return user ? json(res, 200, { ...user, admin: admins.has(user.id) }) : json(res, 401, { authEnabled: auth.enabled, login: '/auth/discord' });
  if (!user) return json(res, 401, { error: 'sign in with Discord first' });
  if (pathname === '/api/save' && req.method === 'GET') {
    const record = await store.load(user.id);
    return record ? json(res, 200, record.save) : json(res, 404, { error: 'no save yet' });
  }
  if (pathname === '/api/save' && req.method === 'PUT') {
    try {
      const body = await readJson(req, MAX_SAVE_BYTES);
      if (!body || typeof body.save !== 'object' || !Number.isInteger(body.save?.turn)) return json(res, 400, { error: 'bad save' });
      const isNew = !(await store.load(user.id));
      await store.save(user.id, { player: user, save: body.save, public: publicView(body.public), updatedAt: Date.now() });
      if (isNew) void notifier.joined(user.name, body.public?.empire?.name);
      return json(res, 200, { ok: true });
    } catch (err) {
      return json(res, err.status ?? 400, { error: err.status === 413 ? 'save too large' : 'bad save' });
    }
  }
  // A player's own news for the Discord channel (battles, colonies, depots); rate-limited.
  if (pathname === '/api/events' && req.method === 'POST') {
    try {
      const { kind, text } = await readJson(req, 2_048);
      return json(res, 200, { posted: await notifier.report(user, kind, text) });
    } catch {
      return json(res, 400, { error: 'bad event' });
    }
  }
  if (pathname === '/api/players' && req.method === 'GET') {
    const players = (await store.players()).filter((p) => p.id !== user.id);
    return json(res, 200, players);
  }
  return json(res, 404, { error: 'not found' });
}

// One clock for server and client (the client imports the same file).
const CLOCK = JSON.parse(readFileSync(join(here, 'clock.json'), 'utf8'));
const tickAt = (ms) => Math.floor((ms - CLOCK.epochMs) / CLOCK.msPerTick);
const tickStartMs = (tick) => CLOCK.epochMs + tick * CLOCK.msPerTick;
export const clockInfo = (now = Date.now()) => {
  const tick = tickAt(now);
  // version lets open clients notice a new deploy and reload.
  return { ...CLOCK, tick, serverNow: now, nextTickAt: tickStartMs(tick + 1), version: VERSION };
};

// Server-Sent Events: every client hears each tick as it happens.
const listeners = new Set();
let worldTick = tickAt(Date.now());
function broadcast(event, data) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of listeners) res.write(msg);
}
function scheduleTick() {
  const wait = Math.max(5, tickStartMs(tickAt(Date.now()) + 1) - Date.now());
  setTimeout(() => {
    worldTick = tickAt(Date.now());
    broadcast('tick', clockInfo());
    scheduleTick();
  }, wait).unref?.();
}
// Proxies drop idle streams; a comment every 20 s keeps them open.
setInterval(() => { for (const res of listeners) res.write(': keep-alive\n\n'); }, 20_000).unref?.();

function streamTicks(req, res) {
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.write(`retry: 3000\nevent: tick\ndata: ${JSON.stringify(clockInfo())}\n\n`);
  listeners.add(res);
  req.on('close', () => listeners.delete(res));
}

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8',
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, headers);
  res.end(body);
}

async function serveStatic(pathname, res) {
  // Resolve inside STATIC_DIR only (no path traversal).
  const rel = normalize(decodeURIComponent(pathname)).replace(/^([/\\])+/, '');
  let file = resolve(STATIC_DIR, rel);
  if (file !== STATIC_DIR && !file.startsWith(STATIC_DIR + sep)) return send(res, 403, 'forbidden');
  try {
    if ((await stat(file)).isDirectory()) file = join(file, 'index.html');
  } catch {
    file = join(STATIC_DIR, 'index.html'); // SPA fallback
  }
  try {
    const body = await readFile(file);
    const immutable = file.startsWith(join(STATIC_DIR, 'assets') + sep);
    send(res, 200, body, {
      'Content-Type': MIME[extname(file)] ?? 'application/octet-stream',
      'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
    });
  } catch {
    send(res, 404, 'not found');
  }
}

export const server = createServer(async (req, res) => {
  const { pathname } = new URL(req.url ?? '/', 'http://localhost');
  if (pathname === '/healthz') return send(res, 200, 'ok', { 'Content-Type': 'text/plain' });
  if (pathname === '/api/info') {
    return send(res, 200, JSON.stringify({ name: 'falchion', version: VERSION, worldTick, listeners: listeners.size, discord: auth.enabled }), { 'Content-Type': 'application/json' });
  }
  if (pathname === '/api/clock') return send(res, 200, JSON.stringify(clockInfo()), { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  if (pathname === '/api/ticks') return streamTicks(req, res);
  if (pathname === '/auth/discord') return auth.enabled ? auth.login(res, new URL(req.url ?? '/', 'http://localhost').searchParams.get('next') ?? '/') : send(res, 404, 'Discord sign-in is not configured on this server (see docs/discord.md).');
  if (await admin(req, res, pathname)) return;
  if (await chat.handle(req, res, pathname)) return;
  if (pathname === '/auth/discord/callback') return auth.enabled ? auth.callback(req, res, new URL(req.url ?? '/', 'http://localhost')) : send(res, 404, 'not configured');
  if (pathname === '/auth/logout') return auth.logout(res);
  if (pathname === '/api/me' || pathname === '/api/save' || pathname === '/api/players' || pathname === '/api/events') return api(req, res, pathname);
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'method not allowed');
  return serveStatic(pathname, res);
});

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  scheduleTick();
  // Write pending chat before the machine stops (deploys send SIGINT/SIGTERM).
  for (const sig of ['SIGINT', 'SIGTERM']) process.once(sig, () => { void chat.flush().finally(() => process.exit(0)); });
  server.listen(PORT, () => console.log(`falchion server on :${PORT} serving ${STATIC_DIR} (${VERSION}), world year ${worldTick}, 1 year per ${CLOCK.msPerTick / 1000}s`));
}
