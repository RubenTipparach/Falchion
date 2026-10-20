// Hourly empire snapshots (change admin-snapshots-and-fog), in the database's `snapshots` table
// (server/db.mjs). Once every SNAPSHOT_INTERVAL_MS of real time (checked on every world tick, and
// measured from the latest snapshot in the table, so a restart never doubles up) every stored
// empire gets a row: the time, the world year, who it is, a summary built for analysis
// (summarizeSave in src/sim/snapshot.ts, documented in docs/snapshots.md) and the whole stored
// record, gzipped, so nothing is lost. Nothing is pruned. Admins export a time range as JSON Lines,
// with the event log of the same range merged in by time (exportLines).
import { gunzipSync, gzipSync } from 'node:zlib';

/** One hour of real time between snapshots (sixty world years). */
export const SNAPSHOT_INTERVAL_MS = 60 * 60 * 1000;
/** Why a snapshot was taken. */
export const SNAPSHOT_REASONS = ['hourly', 'manual', 'reset'];

const parse = (text, fallback = null) => {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
};

/**
 * @param {{
 *   db: import('node:sqlite').DatabaseSync,
 *   store: { ids(): Promise<string[]>, load(id: string): Promise<any> },
 *   loadSim: () => Promise<{ summarize?(save: unknown, player: { id: string, name: string }, world?: unknown): object | null } | null>,
 *   world?: { get(): Promise<any> } | null,
 *   now?: () => number,
 *   intervalMs?: number,
 *   log?: (msg: string) => void,
 * }} deps
 */
export function createSnapshots({ db, store, loadSim, world = null, now = () => Date.now(), intervalMs = SNAPSHOT_INTERVAL_MS, log = () => {} }) {
  const cols = 'id, at, world_year, empire_id, owner, empire_name, reason, summary';
  const q = {
    insert: db.prepare('INSERT INTO snapshots (at, world_year, empire_id, owner, empire_name, reason, summary, state, state_bytes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'),
    latest: db.prepare('SELECT MAX(at) AS at FROM snapshots'),
    stats: db.prepare('SELECT COUNT(*) AS n, COUNT(DISTINCT empire_id) AS empires, MIN(at) AS first, MAX(at) AS last, SUM(state_bytes) AS bytes FROM snapshots'),
    range: db.prepare(`SELECT ${cols} FROM snapshots WHERE at >= ? AND at < ? ORDER BY at, id`),
    rangeState: db.prepare(`SELECT ${cols}, state FROM snapshots WHERE at >= ? AND at < ? ORDER BY at, id`),
    rangeEmpire: db.prepare(`SELECT ${cols} FROM snapshots WHERE at >= ? AND at < ? AND empire_id = ? ORDER BY at, id`),
    rangeEmpireState: db.prepare(`SELECT ${cols}, state FROM snapshots WHERE at >= ? AND at < ? AND empire_id = ? ORDER BY at, id`),
  };
  let taking = null;

  /** Snapshot every stored empire now. Returns how many were recorded. */
  async function takeAll(worldYear, reason = 'manual') {
    if (!SNAPSHOT_REASONS.includes(reason)) throw new Error('invalid reason');
    const sim = await loadSim();
    let shared = null;
    try {
      shared = world ? await world.get() : null;
    } catch {
      // Without the shared world the summaries have no diplomacy; the snapshots are still taken.
    }
    const at = now();
    let taken = 0;
    for (const id of await store.ids()) {
      try {
        const record = await store.load(id);
        if (!record?.save) continue;
        const player = { id, name: String(record.player?.name ?? 'Commander') };
        let summary = null;
        try {
          summary = sim?.summarize ? sim.summarize(record.save, player, shared) : null;
        } catch (err) {
          log(`snapshots: no summary for ${id} (${err?.message ?? err})`);
        }
        summary ??= { v: 0, year: Number.isInteger(record.save.turn) ? record.save.turn : null, error: sim ? 'the save could not be read' : 'no bundled simulation' };
        const json = JSON.stringify(record);
        const name = record.public?.empire?.name ?? record.save?.identity?.name ?? null;
        q.insert.run(at, Number.isFinite(worldYear) ? Math.floor(worldYear) : null, id, player.name, name, reason, JSON.stringify(summary), gzipSync(json), Buffer.byteLength(json));
        taken++;
      } catch (err) {
        log(`snapshots: empire ${id} skipped (${err?.message ?? err})`);
      }
    }
    return taken;
  }

  /** When the next hourly snapshot is due (ms), or now when there has never been one. */
  function nextDue() {
    const last = q.latest.get()?.at;
    return last == null ? now() : Number(last) + intervalMs;
  }

  return {
    intervalMs,
    takeAll,
    nextDue,
    /** Called on every world tick: snapshot every empire when an hour has passed since the latest snapshot. */
    async maybeTake(worldYear) {
      if (taking || now() < nextDue()) return 0;
      taking = takeAll(worldYear, 'hourly');
      try {
        return await taking;
      } finally {
        taking = null;
      }
    },
    /** How many snapshots there are, of how many empires, the first and latest times, and the full states' size. */
    stats() {
      const r = q.stats.get() ?? {};
      return { count: Number(r.n ?? 0), empires: Number(r.empires ?? 0), first: r.first == null ? null : Number(r.first), latest: r.last == null ? null : Number(r.last), stateBytes: Number(r.bytes ?? 0), intervalMs, nextDue: nextDue() };
    },
    /**
     * The snapshots taken from `from` (included) to `to` (excluded), oldest first, one empire's or
     * everyone's; with `includeState`, each with its whole stored record. A generator.
     */
    *range({ from, to, empire = null, includeState = false }) {
      const rows = empire
        ? (includeState ? q.rangeEmpireState : q.rangeEmpire).iterate(from, to, empire)
        : (includeState ? q.rangeState : q.range).iterate(from, to);
      for (const row of rows) yield toSnapshot(row, includeState);
    },
  };
}

/** A row as an export line's object (docs/snapshots.md). */
function toSnapshot(row, includeState) {
  const at = Number(row.at);
  const out = {
    type: 'snapshot', id: Number(row.id), at, time: new Date(at).toISOString(), worldYear: row.world_year == null ? null : Number(row.world_year),
    reason: row.reason, empire: { id: row.empire_id, owner: row.owner ?? null, name: row.empire_name ?? null },
    summary: parse(row.summary, {}),
  };
  if (includeState) out.state = parse(gunzipSync(Buffer.from(row.state)).toString('utf8'));
  return out;
}

/**
 * The export file, line by line (JSON Lines, docs/snapshots.md): a `meta` line, then every
 * snapshot and event-log entry in [from, to), merged in time order (a snapshot before the events of
 * the same millisecond). `empire` narrows both to one empire (the events by or about it).
 * @param {{ snapshots: { range(o: object): Iterable<any> }, events?: { range?(o: object): Iterable<any> } | null, from: number, to: number, empire?: string | null, includeState?: boolean, now?: () => number, summaryVersion?: number }} o
 */
export function* exportLines({ snapshots, events = null, from, to, empire = null, includeState = false, now = () => Date.now(), summaryVersion = 1 }) {
  yield JSON.stringify({
    type: 'meta', exportedAt: new Date(now()).toISOString(), from: new Date(from).toISOString(), to: new Date(to).toISOString(),
    empire, includeState, summaryVersion, docs: 'docs/snapshots.md',
  });
  const a = snapshots.range({ from, to, empire, includeState })[Symbol.iterator]();
  const b = (events?.range ? events.range({ from, to, player: empire }) : [])[Symbol.iterator]();
  let x = a.next(), y = b.next();
  while (!x.done || !y.done) {
    if (!x.done && (y.done || x.value.at <= y.value.at)) {
      yield JSON.stringify(x.value);
      x = a.next();
    } else {
      const e = y.value;
      yield JSON.stringify({ ...e, type: 'event', time: new Date(e.at).toISOString() });
      y = b.next();
    }
  }
}

/**
 * A time from a query string: ms since 1970, or anything Date.parse reads (an ISO string). NaN
 * when it is neither.
 */
export function parseTime(v) {
  if (v === null || v === undefined || v === '') return NaN;
  const n = Number(v);
  if (Number.isFinite(n)) return n;
  return Date.parse(String(v));
}
