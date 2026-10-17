// Player saves on disk: one JSON file per Discord user id. On Fly the directory
// is a volume (/data) on a single machine, so writes have one owner.
import { mkdir, readdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/** Discord ids are numeric snowflakes; anything else never reaches the filesystem. */
const validId = (id) => typeof id === 'string' && /^\d{5,25}$/.test(id);

export function createStore(dir) {
  const ready = mkdir(dir, { recursive: true });
  const file = (id) => join(dir, `${id}.json`);

  return {
    dir,
    /** { player, save, public } for a player, or null. */
    async load(id) {
      if (!validId(id)) return null;
      await ready;
      try {
        return JSON.parse(await readFile(file(id), 'utf8'));
      } catch {
        return null;
      }
    },
    /** Write atomically (temp file + rename) so a crash never leaves half a save. */
    async save(id, record) {
      if (!validId(id)) throw new Error('invalid player id');
      await ready;
      const tmp = `${file(id)}.${process.pid}.tmp`;
      await writeFile(tmp, JSON.stringify(record));
      await rename(tmp, file(id));
    },
    /** Public view of every player: name, avatar, home, colonies and fleets. */
    async players() {
      await ready;
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
