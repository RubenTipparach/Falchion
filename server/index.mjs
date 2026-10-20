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
import { createSnapshots } from './snapshots.mjs';
import { createVision } from './vision.mjs';
import { createReset } from './reset.mjs';
import { clientKey, createCached, createConnectionCap, createRateLimiter } from './throttle.mjs';

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
// Hide systems (change admin-snapshots-and-fog): when on, players see only what they have explored.
let hideSystems = (await store.getSetting('hidesystems')) === true;
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
// Each save's public view reaches the other players at once (server/live.mjs); while systems are
// hidden, each sees only what they can (server/vision.mjs).
export const playerFeed = createPlayerFeed({ broadcast: (event, data, opts) => chat.broadcast(event, data, { ...opts, ...(hideSystems ? { shape: (uid, view) => vision.player(uid, view) } : {}) }) });

function json(res, status, body) {
  send(res, status, JSON.stringify(body), { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
}

// ── Limits (server/throttle.mjs) ──
// Every client (a signed-in player, else an address) gets a bucket for all its API calls, and a
// smaller one for the reads that cost the most; a few live streams each; and the dearest reads
// are cached briefly, so a hundred players polling cost about what one does.
export const limits = {
  /** All of /api and /auth: bursts of 120, then 12 a second. */
  all: createRateLimiter({ capacity: 120, perSecond: 12 }),
  /** The player list, the shared world, the activity feed, your save: bursts of 12, then one every 2 s. */
  reads: createRateLimiter({ capacity: 12, perSecond: 0.5 }),
  /** News a player reports (POST /api/events): bursts of 10, then one every 2 s. */
  reports: createRateLimiter({ capacity: 10, perSecond: 0.5 }),
  /** Open live streams (the world clock, chat) per client: a few tabs' worth. */
  streams: createConnectionCap(6),
};
const HEAVY_READS = new Set(['/api/players', '/api/world', '/api/activity', '/api/save', '/api/online', '/api/vision']);

function tooMany(res, retryAfter) {
  send(res, 429, JSON.stringify({ error: 'too many requests: slow down a moment', retryAfter }), { 'Content-Type': 'application/json', 'Retry-After': String(retryAfter), 'Cache-Control': 'no-store' });
}

/** Every empire's public view, read from the database at most every 5 s (a new empire refreshes it). */
const playersCache = createCached({ ttlMs: 5_000, compute: () => store.players() });

/** The shared world as JSON, made once per version of it (it is replaced, never changed in place). */
let worldJson = { world: null, text: '' };
function sharedWorldJson(world) {
  if (worldJson.world !== world) worldJson = { world, text: JSON.stringify(world) };
  return worldJson.text;
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

const CLASS_ID = /^[a-z0-9][a-z0-9-]{0,39}$/;
/** Class id → number maps in a battle record, bounded. */
function tally(x, max) {
  if (!x || typeof x !== 'object' || Array.isArray(x)) return {};
  const out = {};
  for (const [k, v] of Object.entries(x).slice(0, 40)) if (CLASS_ID.test(k) && typeof v === 'number' && Number.isFinite(v) && v > 0) out[k] = Math.min(v, max);
  return out;
}
const pair = (x, f) => (Array.isArray(x) && x.length === 2 ? [f(x[0]), f(x[1])] : null);
/** The last round of a fleet's battle at sea (src/core/combat/BattleRecord.ts), bounded; dropped when malformed. */
function battleRecord(r) {
  if (!r || typeof r !== 'object' || !Number.isInteger(r.round) || r.round < 1 || r.round > 100000) return undefined;
  const ships = (x) => (Array.isArray(x) ? x.slice(0, 40).filter((s) => typeof s?.classId === 'string' && CLASS_ID.test(s.classId) && Number.isInteger(s.count) && s.count > 0).map((s) => ({ classId: s.classId, count: Math.min(s.count, 100000) })) : []);
  const before = pair(r.before, (f) => ({ ships: ships(f?.ships), damage: tally(f?.damage, 1e9) }));
  const t = (k, max) => pair(r[k], (v) => tally(v, max));
  const num = (lo, hi) => (v) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : lo);
  const out = { round: r.round, before, lostBy: t('lostBy', 100000), takenBy: t('takenBy', 100000), by: t('by', 1e9), jam: pair(r.jam, num(0, 1)), flak: pair(r.flak, num(0, 0.6)), hull: t('hull', 1e9), wounds: t('wounds', 1e9), start: pair(r.start, num(0, 1e9)) };
  return Object.values(out).every((v) => v !== null) ? out : undefined;
}
/** A fleet's battle at sea: who, the round and year, and the round's record so anyone who sees it can watch. */
function publicBattle(b) {
  if (typeof b?.foe !== 'string' || !Number.isInteger(b?.tick)) return undefined;
  const view = battleRecord(b.view);
  return {
    foe: b.foe.slice(0, 160), tick: b.tick,
    ...(Number.isInteger(b.round) && b.round > 0 ? { round: b.round } : {}),
    ...(typeof b.foeName === 'string' ? { foeName: text(b.foeName, 64) } : {}),
    ...(typeof b.foeEmpire === 'string' ? { foeEmpire: text(b.foeEmpire, 100) } : {}),
    ...(view ? { view } : {}),
  };
}

/** Tariffs and companies (change commerce): bounded numbers, short names, at most 40 companies. */
function publicCommerce(c) {
  if (!c || typeof c !== 'object') return undefined;
  const pct = (n) => (Number.isFinite(n) ? Math.max(0, Math.min(50, Math.round(n))) : 0);
  const num = (n, max) => (Number.isFinite(n) ? Math.max(0, Math.min(max, n)) : 0);
  const tariffs = {};
  if (c.tariffs && typeof c.tariffs === 'object') for (const [id, n] of Object.entries(c.tariffs).slice(0, 200)) if (/^[\w-]{1,40}$/.test(id)) tariffs[id] = pct(n);
  const companies = (Array.isArray(c.companies) ? c.companies.slice(0, 40) : [])
    .filter((x) => typeof x?.id === 'string' && /^[\w-]{1,40}$/.test(x.id) && ['trade', 'mining', 'colony'].includes(x.kind))
    .map((x) => ({ id: x.id, name: text(String(x.name ?? 'Company'), 60), kind: x.kind, shares: Math.round(num(x.shares, 10_000)), held: Math.round(num(x.held, 10_000)), price: num(x.price, 1e7), dividend: num(x.dividend, 1e6), ships: Math.round(num(x.ships, 100)) }));
  return { tariff: pct(c.tariff), ...(Object.keys(tariffs).length ? { tariffs } : {}), companies };
}

/** Only what other players may see: identity, home, colony stars, fleets, tariffs and companies (no stockpiles or research). */
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
      // With the round's record, so anyone who sees the battle can watch it.
      ...(publicBattle(f.battle) ? { battle: publicBattle(f.battle) } : {}),
      // The other player's fleet it is chasing, if any.
      ...(typeof f.chase === 'string' ? { chase: f.chase.slice(0, 160) } : {}),
    })),
    ...(publicCommerce(p?.commerce) ? { commerce: publicCommerce(p.commerce) } : {}),
  };
}

async function api(req, res, pathname) {
  const user = auth.userFrom(req);
  // The shared world is public: guests see the same asteroid fields and NPCs. While systems are
  // hidden, each player gets only the NPCs they have met and what they can see of them.
  if (pathname === '/api/world' && req.method === 'GET') {
    const w = await sharedWorld.get();
    const body = hideSystems ? JSON.stringify(await vision.world(user?.id ?? null, w)) : sharedWorldJson(w);
    return send(res, 200, body, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  }
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
        // The founding is kept: the server reset puts the empire back to it (server/reset.mjs).
        await store.saveFounding(user.id, { at: updatedAt, worldYear: worldTick, save: body.save });
        playersCache.invalidate();
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
    const players = (await playersCache.get()).filter((p) => p.id !== user.id);
    return json(res, 200, await vision.players(user.id, players));
  }
  // What the player sees beyond their own empire (change admin-snapshots-and-fog): the hide-systems
  // flag, and the systems their allies have explored and sighted (allies share vision).
  if (pathname === '/api/vision' && req.method === 'GET') {
    return json(res, 200, { hideSystems, ...(await vision.sharedFor(user.id)) });
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
    const year = worldTick;
    void simTicker.tick(year).then(async () => {
      // Once an hour, every empire is snapshotted; while systems are hidden, who sees what is worked out afresh.
      await snapshots.maybeTake(year);
      if (hideSystems) await vision.refresh(chat.online().map((u) => u.id));
    }).catch((err) => console.error(`tick: ${err?.message ?? err}`));
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
// While systems are hidden, each player is sent only the NPCs they have met and what they can see of them.
export const sharedWorld = createSharedWorld({ doc: dbDoc(db, 'world'), loadSim, withLock, broadcast: (event, data) => chat.broadcast(event, data, hideSystems ? { shape: (uid, w) => vision.worldNow(uid, w) } : {}), record: recordEvent });
// What each player can see (change admin-snapshots-and-fog).
export const vision = createVision({ store, loadSim, world: sharedWorld, hidden: () => hideSystems, worldTick: () => worldTick });
// Every empire, once an hour, for analysis (server/snapshots.mjs, docs/snapshots.md).
export const snapshots = createSnapshots({ db, store, loadSim, world: sharedWorld, log: (m) => console.warn(m) });
export const simTicker = createSimTicker({
  store, loadSim, withLock, world: sharedWorld, events,
  publish: (p) => playerFeed.publish(p),
  // The owner's browser shows what the server decided this year.
  notifyOwner: (id, save) => chat.sendTo(id, 'state', { save }),
  publicView: (p) => publicView(p),
  log: (m) => console.warn(m),
});
// The admin's server reset: every empire back to its founding, the shared world fresh (server/reset.mjs).
export const serverReset = createReset({
  store, loadSim, withLock, world: sharedWorld, snapshots, ticker: simTicker, events, worldTick: () => tickAt(Date.now()),
  publicView: (p) => publicView(p),
  publish: (p) => playerFeed.publish(p),
  notifyOwner: (id, save) => chat.sendTo(id, 'state', { save }),
  afterReset: () => { vision.invalidate(); playersCache.invalidate(); },
  log: (m) => console.warn(m),
});
const admin = createAdmin({
  auth, store, admins, notifier, events, snapshots, reset: serverReset,
  hideSystems: {
    get: () => hideSystems,
    async set(on, by) {
      await store.setSetting('hidesystems', on);
      hideSystems = on;
      vision.invalidate();
      if (on) await vision.refresh(chat.online().map((u) => u.id));
      chat.broadcast('settings', { hideSystems: on });
      recordEvent({ actor: by.id, kind: 'setting', worldTime: worldTime(), data: { hideSystems: on, text: `Hide systems turned ${on ? 'on' : 'off'} by ${by.name}` } });
    },
  },
  info: () => ({ version: VERSION, worldTick, listeners: listeners.size, discord: auth.enabled, notifications: notifier.mode, notificationsProblem: notifier.problem, uptimeSec: Math.round((Date.now() - STARTED_AT) / 1000) }),
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

function streamTicks(req, res, key) {
  const release = limits.streams.claim(`ticks:${key}`);
  if (!release) return tooMany(res, 30);
  req.on('close', release);
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
  let key = '';
  if (pathname.startsWith('/api/') || pathname.startsWith('/auth/')) {
    key = clientKey(req, auth.userFrom(req));
    const wait = limits.all.take(key)
      || (HEAVY_READS.has(pathname) && req.method === 'GET' ? limits.reads.take(key) : 0)
      || (pathname === '/api/events' && req.method === 'POST' ? limits.reports.take(key) : 0);
    if (wait) return tooMany(res, wait);
    if (pathname === '/api/chat/stream') {
      const release = limits.streams.claim(`chat:${key}`);
      if (!release) return tooMany(res, 30);
      req.on('close', release);
    }
  }
  if (pathname === '/api/info') {
    return send(res, 200, JSON.stringify({ name: 'falchion', version: VERSION, worldTick, listeners: listeners.size, discord: auth.enabled, hideSystems }), { 'Content-Type': 'application/json' });
  }
  if (pathname === '/api/clock') return send(res, 200, JSON.stringify(clockInfo()), { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  if (pathname === '/api/ticks') return streamTicks(req, res, key);
  if (pathname === '/auth/discord') return auth.enabled ? auth.login(res, new URL(req.url ?? '/', 'http://localhost').searchParams.get('next') ?? '/') : send(res, 404, 'Discord sign-in is not configured on this server (see docs/discord.md).');
  if (await admin(req, res, pathname)) return;
  if (await chat.handle(req, res, pathname)) return;
  // A player's own news (POST /api/events) and the galaxy activity feed (GET /api/activity).
  if (await activity.handle(req, res, pathname)) return;
  if (pathname === '/auth/discord/callback') return auth.enabled ? auth.callback(req, res, new URL(req.url ?? '/', 'http://localhost')) : send(res, 404, 'not configured');
  if (pathname === '/auth/logout') return auth.logout(res);
  if (pathname === '/api/me' || pathname === '/api/world' || pathname === '/api/save' || pathname === '/api/command' || pathname === '/api/players' || pathname === '/api/vision') return api(req, res, pathname);
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'method not allowed');
  return serveStatic(pathname, res);
});

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  scheduleTick();
  // Write pending chat and activity before the machine stops (deploys send SIGINT/SIGTERM).
  for (const sig of ['SIGINT', 'SIGTERM']) process.once(sig, () => { void Promise.all([chat.flush(), activity.flush()]).finally(() => process.exit(0)); });
  server.listen(PORT, () => console.log(`falchion server on :${PORT} serving ${STATIC_DIR} (${VERSION}), world year ${worldTick}, 1 year per ${CLOCK.msPerTick / 1000}s`));
}
