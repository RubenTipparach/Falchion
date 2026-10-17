// Player saves on disk: one JSON file per Discord user id. On Fly the directory
// is a volume (/data) on a single machine, so writes have one owner.
import { mkdir, readdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/** Discord ids are numeric snowflakes; anything else never reaches the filesystem. */
const validId = (id) => typeof id === 'string' && /^\d{5,25}$/.test(id);

export function createStore(dir) {
  // Created on first real use (never as a floating promise, so a store that is only asked
  // about invalid ids never touches the disk).
  let made = null;
  const ready = () => (made ??= mkdir(dir, { recursive: true }));
  const file = (id) => join(dir, `${id}.json`);

  return {
    dir,
    /** { player, save, public } for a player, or null. */
    async load(id) {
      if (!validId(id)) return null;
      await ready();
      try {
        return JSON.parse(await readFile(file(id), 'utf8'));
      } catch {
        return null;
      }
    },
    /** Write atomically (temp file + rename) so a crash never leaves half a save. */
    async save(id, record) {
      if (!validId(id)) throw new Error('invalid player id');
      await ready();
      const tmp = `${file(id)}.${process.pid}.tmp`;
      await writeFile(tmp, JSON.stringify(record));
      await rename(tmp, file(id));
    },
    /** Delete a player's save (admin "reset empire"). */
    async remove(id) {
      if (!validId(id)) return false;
      await ready();
      try {
        await unlink(file(id));
        return true;
      } catch {
        return false;
      }
    },
    /** Admin view: every player with progress, last save time and save size. */
    async summaries() {
      await ready();
      const names = (await readdir(dir)).filter((n) => /^\d{5,25}\.json$/.test(n));
      const out = [];
      for (const n of names) {
        try {
          const raw = await readFile(join(dir, n), 'utf8');
          const r = JSON.parse(raw);
          out.push({
            id: r.player?.id ?? n.replace('.json', ''), name: r.player?.name ?? '?', avatar: r.player?.avatar ?? null,
            year: r.save?.turn ?? null, updatedAt: r.updatedAt ?? 0, bytes: raw.length,
            colonies: r.save?.economy?.colonies?.length ?? 0, fleets: r.public?.fleets?.length ?? 0, home: r.public?.home ?? null,
          });
        } catch {
          // Being replaced or corrupt: skip.
        }
      }
      return out.sort((a, b) => b.updatedAt - a.updatedAt);
    },
    /** Small server-wide settings (e.g. the announcement), kept beside the saves. */
    async getSetting(key) {
      await ready();
      try {
        return JSON.parse(await readFile(join(dir, `_${key}.json`), 'utf8'));
      } catch {
        return null;
      }
    },
    async setSetting(key, value) {
      if (!/^[a-z]+$/.test(key)) throw new Error('invalid setting');
      await ready();
      const tmp = join(dir, `_${key}.json.${process.pid}.tmp`);
      await writeFile(tmp, JSON.stringify(value));
      await rename(tmp, join(dir, `_${key}.json`));
    },
    /** Public view of every player: name, avatar, home, colonies and fleets. */
    async players() {
      await ready();
      const names = (await readdir(dir)).filter((n) => /^\d{5,25}\.json$/.test(n));
      const out = [];
      for (const n of names) {
        try {
          const r = JSON.parse(await readFile(join(dir, n), 'utf8'));
          if (r?.player?.id && r.public) out.push({ ...r.public, id: r.player.id, name: r.player.name, avatar: r.player.avatar ?? null, updatedAt: r.updatedAt ?? 0 });
        } catch {
          // A file being replaced or corrupt: skip it this time.
        }
      }
      return out;
    },
  };
}
