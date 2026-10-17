// Galaxy activity: a bounded, live log of notable events by every player (empires founded,
// colonies, depots, battles, systems surveyed, comings and goings). Players report their own
// news through POST /api/events; the server adds what it already knows (a first save, chat
// presence). Signed-in players read it at GET /api/activity and hear it live as `activity`
// events on the chat stream. One machine: kept in memory, persisted (debounced, atomic) to
// activity.json like chat.json. Zero dependencies: node: built-ins only.
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { cleanText } from './chat.mjs';

/** Every kind of event, and whether a player may report it themselves. */
export const ACTIVITY_KINDS = {
  found: { reportable: true },
  colony: { reportable: true },
  depot: { reportable: true },
  battle: { reportable: true },
  survey: { reportable: true },
  diplomacy: { reportable: true },
  online: { reportable: false },
  offline: { reportable: false },
};

const MAX_TEXT = 160;
const MAX_PLACE_NAME = 40;
const COORD_LIMIT = 1_000_000;
const HEX_COLOR = /^#[0-9a-f]{6}$/i;

/** An optional place the event links to: a bounded name, named in the text, at integer hex coordinates. */
export function cleanPlace(raw, text) {
  const name = cleanText(raw?.name, MAX_PLACE_NAME);
  const { q, r } = raw ?? {};
  if (!name || !Number.isInteger(q) || !Number.isInteger(r) || Math.abs(q) > COORD_LIMIT || Math.abs(r) > COORD_LIMIT) return null;
  if (!String(text).toLowerCase().includes(name.toLowerCase())) return null;
  return { name, q, r };
}

/** Sliding-window counter: at most `max` hits per key in `windowMs`. */
function limiter(max, windowMs, now) {
  const hits = new Map();
  const live = (key) => (hits.get(key) ?? []).filter((t) => now() - t < windowMs);
  return {
    ok: (key) => { const l = live(key); hits.set(key, l); return l.length < max; },
    hit: (key) => hits.set(key, [...live(key), now()]),
  };
}

/**
 * @param {{
 *   auth: { userFrom: (req: any) => ({ id: string, name: string, avatar?: string | null } | null) },
 *   file: string,
 *   empireOf: (playerId: string) => Promise<{ name: string, color: string } | null>,
 *   broadcast?: (event: string, data: object) => void,
 *   forward?: (user: { id: string, name: string }, kind: string, text: string, place?: { name: string, q: number, r: number }) => Promise<unknown>,
 *   now?: () => number,
 *   keep?: number,
 *   rate?: { max: number, windowMs: number },
 *   presenceRate?: { max: number, windowMs: number },
 *   presenceGraceMs?: number,
 *   foundWindowMs?: number,
 *   saveDelayMs?: number,
 * }} deps
 */
export function createActivity(deps) {
  const {
    auth, file, empireOf, broadcast = () => {}, forward, now = () => Date.now(), keep = 300,
    rate = { max: 20, windowMs: 600_000 }, presenceRate = { max: 6, windowMs: 3_600_000 },
    presenceGraceMs = 30_000, foundWindowMs = 600_000, saveDelayMs = 1_000,
  } = deps;

  let events = []; // oldest first
  let seq = 0;
  const reports = limiter(rate.max, rate.windowMs, now);
  const presenceLimit = limiter(presenceRate.max, presenceRate.windowMs, now);

  // ── Persistence (same pattern as chat.json) ──
  const loaded = (async () => {
    try {
      const data = JSON.parse(await readFile(file, 'utf8'));
      if (Array.isArray(data.events)) events = data.events.slice(-keep);
      seq = Number(data.seq) || 0;
    } catch {
      // No activity yet (or unreadable): start empty.
    }
  })();
  let saveTimer = null;
  let dirty = false;
  let writing = Promise.resolve();
  async function flush() {
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
    if (!dirty) return writing;
    dirty = false;
    const body = JSON.stringify({ seq, events });
    writing = writing.then(async () => {
      try {
        await mkdir(dirname(file), { recursive: true });
        const tmp = `${file}.${process.pid}.tmp`;
        await writeFile(tmp, body);
        await rename(tmp, file);
      } catch (err) {
        console.error('activity save failed:', err.message);
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

  /** Add an event to the log, persist it and tell every connected player. */
  async function record(user, kind, text, place, empire) {
    await loaded;
    const e = empire === undefined ? await empireOf(user.id).catch(() => null) : empire;
    const event = {
      id: `${now().toString(36)}-${(++seq).toString(36)}`,
      at: now(),
      player: { id: user.id, name: cleanText(user.name, 64) || 'Commander' },
      empire: e && cleanText(e.name, 100) ? { name: cleanText(e.name, 100), color: HEX_COLOR.test(e.color) ? e.color : '#e6b450' } : null,
      kind,
      text: cleanText(text, MAX_TEXT),
      ...(place ? { place } : {}),
    };
    events = [...events, event].slice(-keep);
    scheduleSave();
    broadcast('activity', event);
    return event;
  }

  /** A recent `found` event by this player (the client report and the first save both announce it). */
  const foundRecently = (id) => events.some((e) => e.kind === 'found' && e.player.id === id && now() - e.at < foundWindowMs);

  /**
   * A player's own news. Returns { status, body }: 400 for an unknown or server-only kind or
   * empty text, 429 when they report too often, else the stored event.
   */
  async function report(user, input) {
    await loaded;
    const kind = String(input?.kind ?? '');
    if (!Object.hasOwn(ACTIVITY_KINDS, kind) || !ACTIVITY_KINDS[kind].reportable) return { status: 400, body: { error: 'unknown kind' } };
    const text = cleanText(input?.text, MAX_TEXT);
    if (!text) return { status: 400, body: { error: 'empty text' } };
    if (kind === 'found' && foundRecently(user.id)) return { status: 200, body: { duplicate: true } };
    if (!reports.ok(user.id)) return { status: 429, body: { error: 'too many reports: try again later' } };
    reports.hit(user.id);
    const event = await record(user, kind, text, cleanPlace(input?.place, text));
    return { status: 200, body: event };
  }

  /** The server saw a player's first save: their empire is founded. */
  async function founded(user, pub) {
    if (foundRecently(user.id)) return null;
    const name = cleanText(pub?.empire?.name, 100);
    const home = pub?.home;
    const capital = cleanText(pub?.empire?.capital, MAX_PLACE_NAME);
    const text = name ? `founded the ${name}${capital ? ` at ${capital}` : ''}` : 'founded an empire';
    const place = home && capital ? cleanPlace({ name: capital, q: home.q, r: home.r }, text) : null;
    return record(user, 'found', text, place, name ? { name, color: pub?.color } : null);
  }

  // ── Presence (from chat streams): short gaps such as a reload are not news ──
  const leaving = new Map(); // player id -> timer of a pending `offline`
  /** A player's first stream opened (online) or last one closed (offline). */
  function presence(user, online) {
    const pending = leaving.get(user.id);
    if (online) {
      if (pending) { clearTimeout(pending); leaving.delete(user.id); return; } // back within the grace period
      void announce(user, 'online');
      return;
    }
    if (pending) return;
    const t = setTimeout(() => { leaving.delete(user.id); void announce(user, 'offline'); }, presenceGraceMs);
    t.unref?.();
    leaving.set(user.id, t);
  }
  async function announce(user, kind) {
    await loaded;
    const empire = await empireOf(user.id).catch(() => null);
    if (!empire) return null; // not in the galaxy yet: founding is their first news
    if (!presenceLimit.ok(user.id)) return null;
    presenceLimit.hit(user.id);
    return record(user, kind, kind === 'online' ? 'came online' : 'went offline', null, empire);
  }

  /** Newest first. */
  async function recent(limit = keep) {
    await loaded;
    return events.slice(-limit).reverse();
  }

  // ── HTTP ──
  function json(res, status, body) {
    res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(body));
  }
  async function readJson(req, limit = 4_096) {
    let size = 0;
    const chunks = [];
    for await (const c of req) {
      size += c.length;
      if (size > limit) throw new Error('too large');
      chunks.push(c);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  }

  /** Handles GET /api/activity and POST /api/events; returns false for other paths. */
  async function handle(req, res, pathname) {
    if (pathname !== '/api/activity' && pathname !== '/api/events') return false;
    const user = auth.userFrom(req);
    if (!user) { json(res, 401, { error: 'sign in with Discord first' }); return true; }
    if (pathname === '/api/activity' && req.method === 'GET') { json(res, 200, await recent()); return true; }
    if (pathname === '/api/events' && req.method === 'POST') {
      let body;
      try { body = await readJson(req); } catch { json(res, 400, { error: 'bad event' }); return true; }
      const r = await report(user, body);
      // Battles, colonies and depots also go to the Discord channel (the notifier has its own limit).
      const posted = r.status === 200 && !r.body.duplicate && forward ? await forward(user, r.body.kind, r.body.text, r.body.place).catch(() => false) : false;
      json(res, r.status, r.status === 200 ? { ...r.body, posted: Boolean(posted) } : r.body);
      return true;
    }
    json(res, 405, { error: 'method not allowed' });
    return true;
  }

  return {
    handle, report, founded, presence, recent, flush,
    loaded: () => loaded,
    close() {
      if (saveTimer) clearTimeout(saveTimer);
      for (const t of leaving.values()) clearTimeout(t);
      leaving.clear();
    },
  };
}
