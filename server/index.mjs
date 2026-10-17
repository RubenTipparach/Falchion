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
import { createActivity } from './activity.mjs';
import { adminIds, createAdmin } from './admin.mjs';
import { createAuth } from './auth.mjs';
import { createChat } from './chat.mjs';
import { dbDoc, fileDoc, importDoc } from './db.mjs';
import { createEventLog, recordSafely } from './eventLog.mjs';
import { createPlayerFeed } from './live.mjs';
import { createNotifier } from './notifier.mjs';
import { linkPreview, withPreview } from './links.mjs';
import { createSimTicker } from './simTicker.mjs';
import { createCommandService } from './commands.mjs';
import { createLocks } from './locks.mjs';
import { oncePerTick } from './markets.mjs';
import { createStore, importLegacySaves } from './store.mjs';
import { createSharedWorld } from './world.mjs';

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
// One SQLite database on the volume holds everything (<DATA_DIR>/falchion.db, server/db.mjs).
export const store = createStore(resolve(process.env.DATA_DIR ?? join(here, '..', 'data')));
const db = store.db;
// The JSON files of earlier versions are imported once.
const importedSaves = await importLegacySaves(store);
for (const name of ['world', 'chat', 'activity']) {
  if (await importDoc(dbDoc(db, name), fileDoc(join(store.dir, `${name}.json`)))) console.log(`database: imported ${name}.json`);
}
if (importedSaves) console.log(`database: imported ${importedSaves} empires from their save files`);
// What players did and what the NPC empires decided, for admins (server/eventLog.mjs).
export const events = createEventLog({ db });
const recordEvent = recordSafely(events, (m) => console.error(m));
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
// Its stream is each signed-in player's one live connection: galaxy activity and other players'
// public views travel on it too.
export const chat = createChat({
  auth, doc: dbDoc(db, 'chat'), players: () => store.players(), notifier,
  onPresence: (user, online) => activity.presence(user, online),
});
// Galaxy activity feed: everyone's notable news, live (server/activity.mjs).
export const activity = createActivity({
  auth, doc: dbDoc(db, 'activity'),
  empireOf: async (id) => {
    const pub = (await store.load(id))?.public;
    return pub ? { name: pub.empire?.name ?? '', color: pub.color } : null;
  },
  broadcast: (event, data) => chat.broadcast(event, data),
  forward: (user, kind, text, place) => notifier.report(user, kind, text, place),
});
// Each save's public view reaches the other players at once (server/live.mjs).
export const playerFeed = createPlayerFeed({ broadcast: (event, data, opts) => chat.broadcast(event, data, opts) });
const admin = createAdmin({
  auth, store, admins, notifier, events,
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
  if (!e || typeof e !== 'object' || !text(e.name, 100)) return undefined;
  const part = (x) => (typeof x === 'string' && /^[a-z][a-z-]{0,23}$/.test(x) ? x : 'none');
  const colors = Array.isArray(e.flag?.colors) ? e.flag.colors.slice(0, 3).map((c) => (typeof c === 'string' && HEX_COLOR.test(c) ? c : '#10121c')) : [];
  return {
    name: text(e.name, 100), ruler: text(e.ruler, 40), title: text(e.title, 24), capital: text(e.capital, 40),
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
    fleets: fleets.map((f) => ({
      id: String(f.id).slice(0, 64), name: String(f.name).slice(0, 64), movement: f.movement, design: f.design,
      // Whether it has warships, and whether it attacks what it meets at sea (anything else is passive).
      armed: f.armed === true, ...(f.stance === 'aggressive' ? { stance: 'aggressive' } : {}),
      // The fleet it last fought at sea, and the year: how the server tells a pursuit from an escape.
      ...(typeof f.battle?.foe === 'string' && Number.isInteger(f.battle?.tick) ? { battle: { foe: f.battle.foe.slice(0, 160), tick: f.battle.tick } } : {}),
      // The other player's fleet it is chasing, if any.
      ...(typeof f.chase === 'string' ? { chase: f.chase.slice(0, 160) } : {}),
    })),
  };
}

async function api(req, res, pathname) {
  const user = auth.userFrom(req);
  // The shared world is public: guests see the same asteroid fields and NPCs.
  if (pathname === '/api/world' && req.method === 'GET') return json(res, 200, await sharedWorld.get());
  if (pathname === '/api/me') return user ? json(res, 200, { ...user, admin: admins.has(user.id) }) : json(res, 401, { authEnabled: auth.enabled, login: '/auth/discord' });
  if (!user) return json(res, 401, { error: 'sign in with Discord first' });
  if (pathname === '/api/save' && req.method === 'GET') {
    const record = await store.load(user.id);
    return record ? json(res, 200, record.save) : json(res, 404, { error: 'no save yet' });
  }
  // The server runs every empire: a save is uploaded once, to start a new empire. After that
  // the empire changes only through commands (POST /api/command) and the yearly tick.
  if (pathname === '/api/save' && req.method === 'PUT') {
    try {
      const body = await readJson(req, MAX_SAVE_BYTES);
      if (!body || typeof body.save !== 'object' || !Number.isInteger(body.save?.turn)) return json(res, 400, { error: 'bad save' });
      return await withLock(user.id, async () => {
        const existing = await store.load(user.id);
        if (existing?.save) return json(res, 409, { error: 'this empire is run by the server', save: existing.save });
        const pub = publicView(body.public);
        const updatedAt = Date.now();
        await store.save(user.id, { player: user, save: body.save, public: pub, updatedAt });
        playerFeed.publish({ ...pub, id: user.id, name: user.name, avatar: user.avatar ?? null, updatedAt });
        // A log failure never fails the founding.
        events.found(user.id, { worldTime: worldTime(), turn: body.save.turn, at: updatedAt }).catch((err) => console.error(`event log: ${err?.message ?? err}`));
        void notifier.joined(user.name, body.public?.empire?.name);
        void activity.founded(user, pub);
        return json(res, 200, { ok: true });
      });
    } catch (err) {
      return json(res, err.status ?? 400, { error: err.status === 413 ? 'save too large' : 'bad save' });
    }
  }
  // Abandon your empire and start again (the Empire panel's reset).
  if (pathname === '/api/save' && req.method === 'DELETE') {
    await withLock(user.id, () => store.remove(user.id));
    return json(res, 200, { ok: true });
  }
  if (pathname === '/api/command' && req.method === 'POST') {
    try {
      const body = await readJson(req, 64 * 1024);
      const r = await commands.apply(user, body);
      return json(res, r.status, r.body);
    } catch (err) {
      return json(res, err.status ?? 400, { ok: false, error: 'bad command' });
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
    void simTicker.tick(worldTick);
    scheduleTick();
  }, wait).unref?.();
}

// Empires keep playing while their owners are away (see simTicker.mjs). The simulation is
// bundled into ./sim/ by `npm run build:sim` (CI and the Docker image build it).
let simWarned = false;
const loadSim = async () => {
  try {
    return await import('./sim/headless.mjs');
  } catch {
    if (!simWarned) console.warn('No bundled simulation (run npm run build:sim): empires only advance while their owners play.');
    simWarned = true;
    return null;
  }
};
// The server runs every empire: one writer per empire at a time (orders and the yearly tick).
const withLock = createLocks();
/** World time in years, fractional (one year per tick). */
const worldTime = () => (Date.now() - CLOCK.epochMs) / CLOCK.msPerTick;
// The galaxy everyone shares: mined asteroid fields and discovered NPC empires (server/world.mjs).
export const sharedWorld = createSharedWorld({ doc: dbDoc(db, 'world'), loadSim, withLock, broadcast: (event, data) => chat.broadcast(event, data), record: recordEvent });
export const simTicker = createSimTicker({
  store, loadSim, withLock, world: sharedWorld, events,
  publish: (p) => playerFeed.publish(p),
  // The owner's browser shows what the server decided this year.
  notifyOwner: (id, save) => chat.sendTo(id, 'state', { save }),
  publicView: (p) => publicView(p),
  log: (m) => console.warn(m),
});
// Other players' worlds are markets: orders read the other empires once a world year.
const otherEmpires = oncePerTick(() => store.players(), () => worldTick);
export const commands = createCommandService({
  store, loadSim, withLock, worldTime, world: sharedWorld, others: otherEmpires, events,
  log: (m) => console.error(m),
  publish: (p) => playerFeed.publish(p),
  publicView: (p) => publicView(p),
});
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
  // A hotlink: the game's page, titled after the place so it unfurls well in Discord.
  const preview = linkPreview(pathname);
  if (preview) {
    try {
      const html = await readFile(join(STATIC_DIR, 'index.html'), 'utf8');
      const url = `${(process.env.PUBLIC_URL ?? 'https://falchion.fly.dev').replace(/\/$/, '')}${pathname}`;
      return send(res, 200, withPreview(html, preview, url), { 'Content-Type': MIME['.html'], 'Cache-Control': 'no-cache' });
    } catch {
      return send(res, 404, 'not found');
    }
  }
  // Resolve inside STATIC_DIR only (no path traversal).
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return send(res, 400, 'bad path');
  }
  const rel = normalize(decoded).replace(/^([/\\])+/, '');
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
  // A player's own news (POST /api/events) and the galaxy activity feed (GET /api/activity).
  if (await activity.handle(req, res, pathname)) return;
  if (pathname === '/auth/discord/callback') return auth.enabled ? auth.callback(req, res, new URL(req.url ?? '/', 'http://localhost')) : send(res, 404, 'not configured');
  if (pathname === '/auth/logout') return auth.logout(res);
  if (pathname === '/api/me' || pathname === '/api/world' || pathname === '/api/save' || pathname === '/api/command' || pathname === '/api/players') return api(req, res, pathname);
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'method not allowed');
  return serveStatic(pathname, res);
});

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  scheduleTick();
  // Write pending chat and activity before the machine stops (deploys send SIGINT/SIGTERM).
  for (const sig of ['SIGINT', 'SIGTERM']) process.once(sig, () => { void Promise.all([chat.flush(), activity.flush()]).finally(() => process.exit(0)); });
  server.listen(PORT, () => console.log(`falchion server on :${PORT} serving ${STATIC_DIR} (${VERSION}), world year ${worldTick}, 1 year per ${CLOCK.msPerTick / 1000}s`));
}
