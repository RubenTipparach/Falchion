// Append-only event log: one JSON line per command the server applies or refuses, one 'found'
// line per founding, and one 'advance' line when the yearly tick catches an empire up several
// years at once, in <dir>/events/<playerId>.jsonl. When a file would grow past MAX_LOG_BYTES it is
// rotated to <name>.1 (the previous .1 is dropped), so the log stays bounded. The founding save
// is kept whole beside it: with the logged commands it replays into the stored empire (replay()).
// Zero dependencies on purpose: node:fs/promises only.
import { appendFile, mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export const MAX_LOG_BYTES = 2 * 1024 * 1024;
export const ADMIN_EVENT_LIMIT = 50;

/** Player ids name files: Discord ids only, as the store accepts them (no dots, no slashes). */
const validId = (id) => typeof id === 'string' && /^\d{5,25}$/.test(id);

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** Keep only the fields a log line carries; anything else from the caller is dropped. */
function toLine(entry, now) {
  const line = {
    at: num(entry.at) ?? now(),
    worldTime: num(entry.worldTime),
    // The save's year when the event was applied: a replay plays the empire to it first.
    turn: Number.isInteger(entry.turn) ? entry.turn : null,
    command: entry.command ?? null,
    clientTime: num(entry.clientTime),
    ok: entry.ok === true,
  };
  if (entry.error != null) line.error = String(entry.error).slice(0, 200);
  return line;
}

/** Parse a log file into lines; a torn or corrupt line is skipped, a missing file is empty. */
async function readLines(path) {
  let text;
  try {
    text = await readFile(path, 'utf8');
  } catch {
    return [];
  }
  const out = [];
  for (const raw of text.split('\n')) {
    if (!raw) continue;
    try {
      out.push(JSON.parse(raw));
    } catch {
      // A partial line from a crash: ignore it.
    }
  }
  return out;
}

/**
 * @param {{ dir: string, maxBytes?: number, now?: () => number }} options
 *   dir is the data directory (events go in <dir>/events); now stamps entries that lack `at`.
 */
export function createEventLog({ dir, maxBytes = MAX_LOG_BYTES, now = Date.now }) {
  const root = join(dir, 'events');
  let made = null;
  const ready = () => (made ??= mkdir(root, { recursive: true }));
  const file = (id) => join(root, `${id}.jsonl`);
  const foundingFile = (id) => join(root, `${id}.founding.json`);

  // Work on one player's log runs one task at a time: lines never interleave and a
  // rotation never races a write. Tasks run in the order they were asked for.
  const queues = new Map();
  const serial = (id, task) => {
    const next = (queues.get(id) ?? Promise.resolve()).then(task);
    const settled = next.catch(() => {});
    queues.set(id, settled);
    void settled.then(() => { if (queues.get(id) === settled) queues.delete(id); });
    return next;
  };

  async function appendLine(id, entry) {
    await ready();
    const path = file(id);
    const line = `${JSON.stringify(toLine(entry, now))}\n`;
    const size = await stat(path).then((s) => s.size, () => 0);
    if (size > 0 && size + Buffer.byteLength(line) > maxBytes) await rename(path, `${path}.1`);
    await appendFile(path, line);
  }

  return {
    dir: root,
    /** Append one applied or refused command: { worldTime, turn, command, clientTime, ok, error?, at? }. */
    append(id, entry) {
      if (!validId(id)) return Promise.reject(new Error('invalid player id'));
      return serial(id, () => appendLine(id, entry));
    },
    /**
     * Log a founding: the founding save is kept whole in <id>.founding.json (a replay starts
     * from it) and a 'found' line is appended. Re-founding replaces the saved founding.
     */
    found(id, { save, worldTime = null, clientTime = null, at }) {
      if (!validId(id)) return Promise.reject(new Error('invalid player id'));
      return serial(id, async () => {
        await ready();
        const tmp = `${foundingFile(id)}.${process.pid}.tmp`;
        await writeFile(tmp, JSON.stringify(save));
        await rename(tmp, foundingFile(id));
        await appendLine(id, { at, worldTime, turn: save?.turn, command: 'found', clientTime, ok: true });
      });
    },
    /** The founding save for a player, or null. */
    foundingSave(id) {
      if (!validId(id)) return Promise.resolve(null);
      return serial(id, async () => {
        try {
          return JSON.parse(await readFile(foundingFile(id), 'utf8'));
        } catch {
          return null;
        }
      });
    },
    /** The last `limit` entries for a player (Infinity for all kept), oldest first, across the rotated .1 file. */
    read(id, { limit = ADMIN_EVENT_LIMIT } = {}) {
      if (!validId(id)) return Promise.resolve([]);
      const n = Math.max(0, Math.floor(limit));
      if (!(n > 0)) return Promise.resolve([]);
      return serial(id, async () => {
        const current = await readLines(file(id));
        if (current.length >= n) return current.slice(-n);
        const older = await readLines(`${file(id)}.1`);
        return [...older, ...current].slice(-n);
      });
    },
  };
}

/**
 * An append for callers that must not wait on the log or fail with it (orders, the yearly tick):
 * the line is queued at once, in call order, and a failure is only reported through `log`.
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

/**
 * Rebuild an empire from its founding save and its log, with the game's own rules (the bundled
 * simulation's advanceSave and applyCommand): before each logged event the empire plays its
 * years one at a time, as the yearly tick does, up to the year the server applied it at; an
 * 'advance' (the tick catching up several years at once) is played in one go to its world year;
 * then on to `toTurn`. Null when the log no longer holds the founding (rotated away) or a step
 * fails. Exact for empires that met nothing from the shared world (asteroid fields, NPCs, raids):
 * the log does not record those.
 *
 * @param {{ advanceSave: Function, applyCommand: Function }} sim
 * @param {{ founding: any, events: any[], player: { id: string, name: string }, toTurn?: number }} input
 */
export function replay(sim, { founding, events, player, toTurn }) {
  const start = events.findLastIndex((e) => e?.command === 'found');
  if (!founding || start < 0) return null;
  let save = founding;
  const playTo = (turn) => {
    while (Number.isInteger(turn) && save.turn < turn) {
      const r = sim.advanceSave(save, player, save.turn + 1);
      if (!r) return false;
      save = r.save;
    }
    return true;
  };
  for (const e of events.slice(start + 1)) {
    if (!playTo(e.turn)) return null;
    if (e.command === 'advance') {
      save = sim.advanceSave(save, player, e.worldTime)?.save ?? save;
      continue;
    }
    const r = sim.applyCommand(save, player, e.worldTime, e.command, e.clientTime ?? undefined);
    if (!r) return null;
    save = r.save;
  }
  return playTo(toTurn) ? save : null;
}
