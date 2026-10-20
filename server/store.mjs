// Player empires in the database (server/db.mjs): one row per Discord user id holding the record
// { player, save, public, updatedAt }, the save each was founded with (for the server reset), plus
// small server-wide settings. On Fly the database file is
// on a volume (/data) on a single machine, so writes have one owner. Saves from before the database
// (one <id>.json file per player in the data directory) are imported on first start.
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { openDb } from './db.mjs';

/** Discord ids are numeric snowflakes; anything else is refused. */
const validId = (id) => typeof id === 'string' && /^\d{5,25}$/.test(id);

/** The database file in a data directory. */
export const DB_FILE = 'falchion.db';

const parse = (text) => {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

/**
 * @param {string | { db: import('node:sqlite').DatabaseSync, dir: string }} where
 *   the data directory (the database is <dir>/falchion.db), or an open database and its directory.
 */
export function createStore(where) {
  const dir = typeof where === 'string' ? where : where.dir;
  const db = typeof where === 'string' ? openDb(join(dir, DB_FILE)) : where.db;
  const q = {
    get: db.prepare('SELECT record FROM empires WHERE id = ?'),
    put: db.prepare('INSERT INTO empires (id, record, updated_at) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET record = excluded.record, updated_at = excluded.updated_at'),
    del: db.prepare('DELETE FROM empires WHERE id = ?'),
    ids: db.prepare('SELECT id FROM empires ORDER BY id'),
    all: db.prepare('SELECT id, record FROM empires ORDER BY updated_at DESC'),
    getFounding: db.prepare('SELECT at, record FROM foundings WHERE empire_id = ?'),
    putFounding: db.prepare('INSERT INTO foundings (empire_id, at, record) VALUES (?, ?, ?) ON CONFLICT(empire_id) DO UPDATE SET at = excluded.at, record = excluded.record'),
    getSetting: db.prepare('SELECT value FROM settings WHERE key = ?'),
    putSetting: db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'),
  };

  return {
    dir,
    db,
    /** { player, save, public } for a player, or null. */
    async load(id) {
      if (!validId(id)) return null;
      const row = q.get.get(id);
      return row ? parse(row.record) : null;
    },
    /** One statement: a crash never leaves half a save. */
    async save(id, record) {
      if (!validId(id)) throw new Error('invalid player id');
      q.put.run(id, JSON.stringify(record), Number(record?.updatedAt) || 0);
    },
    /** Delete a player's empire (admin "reset empire"). */
    async remove(id) {
      if (!validId(id)) return false;
      return Number(q.del.run(id).changes) > 0;
    },
    /** Every stored player id. */
    async ids() {
      return q.ids.all().map((r) => r.id);
    },
    /** Admin view: every player with progress, last save time and save size, newest first. */
    async summaries() {
      const out = [];
      for (const row of q.all.all()) {
        const r = parse(row.record);
        if (!r) continue;
        out.push({
          id: r.player?.id ?? row.id, name: r.player?.name ?? '?', avatar: r.player?.avatar ?? null,
          year: r.save?.turn ?? null, updatedAt: r.updatedAt ?? 0, bytes: row.record.length,
          colonies: r.save?.economy?.colonies?.length ?? 0, fleets: r.public?.fleets?.length ?? 0, home: r.public?.home ?? null,
        });
      }
      return out;
    },
    /**
     * How an empire was founded: the save it was founded with ({ at, worldYear, save }), kept for
     * the server reset (server/reset.mjs). Founding again replaces it.
     */
    async saveFounding(id, founding) {
      if (!validId(id)) throw new Error('invalid player id');
      q.putFounding.run(id, Number(founding?.at) || 0, JSON.stringify(founding));
    },
    /** An empire's founding, or null (empires founded before foundings were kept have none). */
    async founding(id) {
      if (!validId(id)) return null;
      const row = q.getFounding.get(id);
      return row ? parse(row.record) : null;
    },
    /** Small server-wide settings (e.g. the announcement). */
    async getSetting(key) {
      const row = q.getSetting.get(key);
      return row ? parse(row.value) : null;
    },
    async setSetting(key, value) {
      if (!/^[a-z]+$/.test(key)) throw new Error('invalid setting');
      q.putSetting.run(key, JSON.stringify(value));
    },
    /** Public view of every player: name, avatar, home, colonies and fleets. */
    async players() {
      const out = [];
      for (const row of q.all.all()) {
        const r = parse(row.record);
        if (r?.player?.id && r.public) out.push({ ...r.public, id: r.player.id, name: r.player.name, avatar: r.player.avatar ?? null, updatedAt: r.updatedAt ?? 0 });
      }
      return out;
    },
  };
}

/**
 * Bring saves from before the database into it: every <id>.json in `dir` and the _<setting>.json
 * files, once (an empire or setting already in the database is left alone). Returns how many
 * empires were imported.
 */
export async function importLegacySaves(store, dir = store.dir) {
  let names = [];
  try {
    names = await readdir(dir);
  } catch {
    return 0;
  }
  let imported = 0;
  for (const n of names) {
    const empire = /^(\d{5,25})\.json$/.exec(n);
    const setting = /^_([a-z]+)\.json$/.exec(n);
    if (!empire && !setting) continue;
    const value = parse(await readFile(join(dir, n), 'utf8').catch(() => 'null'));
    if (value === null) continue;
    if (empire && !(await store.load(empire[1]))) {
      await store.save(empire[1], value);
      imported++;
    }
    if (setting && (await store.getSetting(setting[1])) === null) await store.setSetting(setting[1], value);
  }
  return imported;
}
