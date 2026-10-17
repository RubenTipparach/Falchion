// The event log, in the database's `events` table (server/db.mjs): what players did (every order
// the server applied or refused, foundings, multi-year catch-ups, battles, diplomacy, first
// contacts) and what the NPC empires decided (fleets built, raids launched and struck, worlds
// garrisoned, captured). Each row has an actor (a player id, or `npc:<id>`), optionally a subject
// (the player it happened to), a kind, and its data. Bounded: the oldest rows go once the table
// passes MAX_EVENTS. Admins read it; nothing rewrites a row.

export const MAX_EVENTS = 500_000;
export const ADMIN_EVENT_LIMIT = 50;
/** Rows inserted between trims of the oldest. */
const TRIM_EVERY = 1_000;

/** Player ids are Discord ids, as the store accepts them. */
const validId = (id) => typeof id === 'string' && /^\d{5,25}$/.test(id);
const validActor = (a) => validId(a) || (typeof a === 'string' && /^npc:[\w:,./-]{1,80}$/.test(a));

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** Keep only the fields a command line carries; anything else from the caller is dropped. */
function commandData(entry) {
  const data = {
    turn: Number.isInteger(entry.turn) ? entry.turn : null,
    command: entry.command ?? null,
    clientTime: num(entry.clientTime),
    ok: entry.ok === true,
  };
  if (entry.error != null) data.error = String(entry.error).slice(0, 200);
  return data;
}

const parse = (text) => {
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
};

/** A row as callers see it: { id, at, worldTime, actor, subject?, kind, ...data }. */
const toEvent = (row) => ({
  ...parse(row.data), id: Number(row.id), at: Number(row.at), worldTime: row.world_time ?? null, actor: row.actor,
  ...(row.subject ? { subject: row.subject } : {}), kind: row.kind,
});

/**
 * @param {{ db: import('node:sqlite').DatabaseSync, now?: () => number, maxEvents?: number }} options
 */
export function createEventLog({ db, now = Date.now, maxEvents = MAX_EVENTS }) {
  const q = {
    insert: db.prepare('INSERT INTO events (at, world_time, actor, subject, kind, data) VALUES (?, ?, ?, ?, ?, ?)'),
    forPlayer: db.prepare('SELECT * FROM events WHERE actor = ? OR subject = ? ORDER BY id DESC LIMIT ?'),
    npcs: db.prepare("SELECT * FROM events WHERE actor LIKE 'npc:%' ORDER BY id DESC LIMIT ?"),
    actor: db.prepare('SELECT * FROM events WHERE actor = ? ORDER BY id DESC LIMIT ?'),
    trim: db.prepare('DELETE FROM events WHERE id <= (SELECT MAX(id) FROM events) - ?'),
  };
  let sinceTrim = 0;

  /** Record one event; synchronous (one statement). Returns its row id. */
  function record({ actor, subject = null, kind, worldTime = null, at, data = {} }) {
    if (!validActor(actor)) throw new Error('invalid actor');
    if (typeof kind !== 'string' || !/^[a-z][\w-]{0,39}$/.test(kind)) throw new Error('invalid kind');
    const r = q.insert.run(num(at) ?? now(), num(worldTime), actor, validId(subject) ? subject : null, kind, JSON.stringify(data));
    if (++sinceTrim >= TRIM_EVERY) {
      sinceTrim = 0;
      q.trim.run(maxEvents);
    }
    return Number(r.lastInsertRowid);
  }
  const limitOf = (limit) => Math.max(0, Math.min(1_000, Math.floor(Number(limit) || 0)));

  return {
    record,
    /** One order the rules applied or refused, or a catch-up ('advance'): { worldTime, turn, command, clientTime, ok, error?, at? }. */
    append(id, entry) {
      if (!validId(id)) return Promise.reject(new Error('invalid player id'));
      const kind = entry.command === 'advance' ? 'advance' : 'command';
      record({ actor: id, kind, worldTime: entry.worldTime, at: entry.at, data: commandData(entry) });
      return Promise.resolve();
    },
    /** A new empire was founded. */
    found(id, { worldTime = null, turn = null, at } = {}) {
      if (!validId(id)) return Promise.reject(new Error('invalid player id'));
      record({ actor: id, kind: 'found', worldTime, at, data: { turn: Number.isInteger(turn) ? turn : null, ok: true } });
      return Promise.resolve();
    },
    /** An NPC empire's decision; `subject` is the player it is aimed at, if any. */
    npc(npcId, kind, data = {}, { subject = null, worldTime = null } = {}) {
      return record({ actor: `npc:${npcId}`, subject, kind, worldTime, data });
    },
    /** The last `limit` events by or about a player, oldest first. */
    read(id, { limit = ADMIN_EVENT_LIMIT } = {}) {
      if (!validId(id)) return Promise.resolve([]);
      const n = limitOf(limit);
      return Promise.resolve(n ? q.forPlayer.all(id, id, n).reverse().map(toEvent) : []);
    },
    /** The last `limit` NPC decisions (all NPCs, or one), oldest first. */
    npcEvents({ limit = ADMIN_EVENT_LIMIT, npc = null } = {}) {
      const n = limitOf(limit);
      if (!n) return Promise.resolve([]);
      const rows = npc ? q.actor.all(`npc:${npc}`, n) : q.npcs.all(n);
      return Promise.resolve(rows.reverse().map(toEvent));
    },
  };
}

/**
 * An append for callers that must not wait on the log or fail with it (orders, the yearly tick):
 * a failure is only reported through `log`.
 * @param {{ append(id: string, entry: object): Promise<void> | void } | null} events
 * @param {(msg: string) => void} log
 */
export function appendSafely(events, log) {
  return (id, entry) => {
    if (!events) return;
    const failed = (err) => log(`event log: ${err?.message ?? err}`);
    try {
      void Promise.resolve(events.append(id, entry)).catch(failed);
    } catch (err) {
      failed(err);
    }
  };
}

/** Like appendSafely, for any event (`record`): never throws, reports failures through `log`. */
export function recordSafely(events, log) {
  return (event) => {
    if (!events?.record) return;
    try {
      events.record(event);
    } catch (err) {
      log(`event log: ${err?.message ?? err}`);
    }
  };
}
