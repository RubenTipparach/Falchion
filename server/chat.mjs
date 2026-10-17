// In-game chat: a global channel plus direct messages between two players, live over
// Server-Sent Events. Who is online = who has a chat stream open (any number of tabs).
// Players @mentioned while not in the game hear about it on Discord (notifier.mention).
// One machine, so state lives in memory and is persisted (debounced, atomic) to chat.json.
// Zero dependencies: node: built-ins only.
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

const ID = /^\d{5,25}$/;
const MAX_TEXT = 500;
const MAX_PLACES = 10;
const MAX_MENTIONS = 10;
const MAX_PLACE_NAME = 40;
const COORD_LIMIT = 1_000_000;

/** One line of plain text: no control, line-separator or bidi-override characters, bounded. */
export function cleanText(s, max = MAX_TEXT) {
  return String(s ?? '')
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2066-\u2069\ufeff]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

const fold = (s) => s.toLowerCase();

/** Places the sender attached: bounded, integer hexes, and named in the text. */
function validPlaces(raw, text) {
  if (!Array.isArray(raw)) return [];
  const hay = fold(text);
  const out = [];
  for (const p of raw.slice(0, MAX_PLACES)) {
    const name = cleanText(p?.name, MAX_PLACE_NAME);
    const { q, r } = p ?? {};
    if (!name || !Number.isInteger(q) || !Number.isInteger(r) || Math.abs(q) > COORD_LIMIT || Math.abs(r) > COORD_LIMIT) continue;
    if (!hay.includes(fold(name)) || out.some((x) => x.name === name && x.q === q && x.r === r)) continue;
    out.push({ name, q, r });
  }
  return out;
}

const pairKey = (a, b) => (a < b ? `${a}:${b}` : `${b}:${a}`);
const visibleTo = (m, uid) => m.to === 'global' || m.to === uid || m.from.id === uid;

/**
 * @param {{
 *   auth: { userFrom: (req: any) => ({ id: string, name: string, avatar: string | null } | null) },
 *   file: string,
 *   players: () => Promise<Array<{ id: string, name: string, avatar?: string | null }>>,
 *   notifier?: { mention: (m: object) => Promise<unknown> },
 *   onPresence?: (user: { id: string, name: string, avatar: string | null }, online: boolean) => void,
 *   now?: () => number,
 *   rate?: { max: number, windowMs: number },
 *   keep?: { global: number, dm: number },
 *   saveDelayMs?: number,
 *   keepAliveMs?: number,
 * }} deps
 */
export function createChat(deps) {
  const {
    auth, file, players, notifier, onPresence = () => {}, now = () => Date.now(),
    rate = { max: 5, windowMs: 10_000 }, keep = { global: 300, dm: 200 }, saveDelayMs = 1_000, keepAliveMs = 20_000,
  } = deps;

  let global = [];
  const dms = new Map(); // pair key -> messages
  let seq = 0;
  const sent = new Map(); // user id -> recent post times
  const clients = new Map(); // user id -> { user, conns: Set<res> }
  let pending = Promise.resolve(); // Discord notifications of the latest message (tests await it)

  // ── Persistence ──
  const loaded = (async () => {
    try {
      const data = JSON.parse(await readFile(file, 'utf8'));
      if (Array.isArray(data.global)) global = data.global.slice(-keep.global);
      for (const [k, list] of Object.entries(data.dms ?? {})) if (Array.isArray(list)) dms.set(k, list.slice(-keep.dm));
      seq = Number(data.seq) || 0;
    } catch {
      // No chat yet (or unreadable): start empty.
    }
  })();
  let saveTimer = null;
  let dirty = false;
  let writing = Promise.resolve();
  /** Write pending changes now (no-op when nothing changed). */
  async function flush() {
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
    if (!dirty) return writing;
    dirty = false;
    const body = JSON.stringify({ seq, global, dms: Object.fromEntries(dms) });
    writing = writing.then(async () => {
      try {
        await mkdir(dirname(file), { recursive: true });
        const tmp = `${file}.${process.pid}.tmp`;
        await writeFile(tmp, body);
        await rename(tmp, file);
      } catch (err) {
        console.error('chat save failed:', err.message);
      }
    });
    return writing;
  }
  const scheduleSave = () => {
    dirty = true;
    if (saveTimer) return;
    saveTimer = setTimeout(() => { saveTimer = null; void flush(); }, saveDelayMs);
    saveTimer.unref?.();
  };

  // ── Players and presence ──
  let known = { at: -Infinity, list: [] };
  async function knownPlayers() {
    if (now() - known.at > 15_000) {
      try {
        known = { at: now(), list: (await players()).map((p) => ({ id: String(p.id), name: String(p.name ?? ''), avatar: p.avatar ?? null })) };
      } catch {
        // Keep the last list.
      }
    }
    const byId = new Map(known.list.map((p) => [p.id, p]));
    for (const { user } of clients.values()) byId.set(user.id, user);
    return byId;
  }

  const online = () => [...clients.values()].map(({ user }) => ({ id: user.id, name: user.name, avatar: user.avatar ?? null }));

  function send(res, event, data) {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  }
  function broadcastPresence() {
    const list = online();
    for (const { conns } of clients.values()) for (const res of conns) send(res, 'presence', { online: list });
  }
  function deliver(msg) {
    for (const [uid, { conns }] of clients) if (visibleTo(msg, uid)) for (const res of conns) send(res, 'message', msg);
  }
  const keepAlive = setInterval(() => {
    for (const { conns } of clients.values()) for (const res of conns) res.write(': keep-alive\n\n');
  }, keepAliveMs);
  keepAlive.unref?.();

  function stream(req, res, user) {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    res.write('retry: 3000\n\n');
    const me = { id: user.id, name: cleanText(user.name, 64) || 'Commander', avatar: user.avatar ?? null };
    let entry = clients.get(user.id);
    const arrived = !entry;
    if (!entry) clients.set(user.id, (entry = { user: me, conns: new Set() }));
    entry.user = me;
    entry.conns.add(res);
    if (arrived) { broadcastPresence(); onPresence(me, true); }
    else send(res, 'presence', { online: online() });
    req.on('close', () => {
      const e = clients.get(user.id);
      if (!e) return;
      e.conns.delete(res);
      if (e.conns.size === 0) { clients.delete(user.id); broadcastPresence(); onPresence(e.user, false); }
    });
  }

  /**
   * The chat stream is every signed-in player's one live connection: other systems (galaxy
   * activity, other players' public views) send their events through it. `except` skips one player.
   */
  function broadcast(event, data, { except } = {}) {
    for (const [uid, { conns }] of clients) if (uid !== except) for (const res of conns) send(res, event, data);
  }

  // ── Posting ──
  function allow(uid) {
    const t = now();
    const list = (sent.get(uid) ?? []).filter((x) => t - x < rate.windowMs);
    sent.set(uid, list);
    return list.length < rate.max;
  }

  /** Validate and store a message from `user`. Returns { status, body }. */
  async function post(user, input) {
    await loaded;
    const text = cleanText(input?.text);
    if (!text) return { status: 400, body: { error: 'empty message' } };
    const to = input?.to === 'global' ? 'global' : String(input?.to ?? '');
    const people = await knownPlayers();
    if (to !== 'global' && (!ID.test(to) || to === user.id || !people.has(to))) return { status: 400, body: { error: 'unknown recipient' } };
    if (!allow(user.id)) return { status: 429, body: { error: 'slow down: at most 5 messages every 10 seconds' } };
    sent.get(user.id).push(now());
    // Mentions: known players only; a direct message can mention only its recipient.
    const rawMentions = Array.isArray(input?.mentions) ? input.mentions.map(String) : [];
    const mentions = [...new Set(rawMentions)].filter((id) => id !== user.id && people.has(id) && (to === 'global' || id === to)).slice(0, MAX_MENTIONS);
    const msg = {
      id: `${now().toString(36)}-${(++seq).toString(36)}`,
      at: now(),
      from: { id: user.id, name: cleanText(user.name, 64) || 'Commander', avatar: user.avatar ?? null },
      to, text, mentions, places: validPlaces(input?.places, text),
    };
    if (to === 'global') global = [...global, msg].slice(-keep.global);
    else { const k = pairKey(user.id, to); dms.set(k, [...(dms.get(k) ?? []), msg].slice(-keep.dm)); }
    scheduleSave();
    deliver(msg);
    // Players not in the game hear about mentions (and direct messages) on Discord.
    const away = new Set(mentions.filter((id) => !clients.has(id)));
    if (to !== 'global' && !clients.has(to)) away.add(to);
    if (notifier && away.size) {
      pending = Promise.all([...away].map((id) => notifier.mention({ from: msg.from, to: id, text, private: to !== 'global' }).catch(() => false)));
    }
    return { status: 200, body: msg };
  }

  /** Recent global messages and this player's direct messages. */
  async function history(uid) {
    await loaded;
    const mine = [];
    for (const [k, list] of dms) if (k.split(':').includes(uid)) mine.push(...list);
    mine.sort((a, b) => a.at - b.at);
    return { global, dms: mine, online: online() };
  }

  // ── HTTP ──
  function json(res, status, body) {
    res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(body));
  }
  async function readJson(req, limit = 8_192) {
    let size = 0;
    const chunks = [];
    for await (const c of req) {
      size += c.length;
      if (size > limit) throw new Error('too large');
      chunks.push(c);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  }

  /** Handles /api/chat, /api/chat/stream and /api/online; returns false for other paths. */
  async function handle(req, res, pathname) {
    if (pathname !== '/api/chat' && pathname !== '/api/chat/stream' && pathname !== '/api/online') return false;
    const user = auth.userFrom(req);
    if (!user) { json(res, 401, { error: 'sign in with Discord to chat' }); return true; }
    if (pathname === '/api/online' && req.method === 'GET') { json(res, 200, online()); return true; }
    if (pathname === '/api/chat/stream' && req.method === 'GET') { await loaded; stream(req, res, user); return true; }
    if (pathname === '/api/chat' && req.method === 'GET') { json(res, 200, { me: user, ...(await history(user.id)) }); return true; }
    if (pathname === '/api/chat' && req.method === 'POST') {
      // A custom header a cross-site form cannot send (CSRF guard on top of SameSite=Lax).
      if (req.headers['x-falchion'] !== '1') { json(res, 403, { error: 'missing X-Falchion header' }); return true; }
      let body;
      try { body = await readJson(req); } catch { json(res, 400, { error: 'bad message' }); return true; }
      const r = await post(user, body);
      json(res, r.status, r.body);
      return true;
    }
    json(res, 405, { error: 'method not allowed' });
    return true;
  }

  return {
    handle, post, history, online, flush, broadcast,
    /** Resolves when Discord notifications for the latest message are done. */
    settled: () => pending,
    loaded: () => loaded,
    close() { clearInterval(keepAlive); if (saveTimer) clearTimeout(saveTimer); },
  };
}
