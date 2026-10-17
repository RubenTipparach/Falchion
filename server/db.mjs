// The server's database: one SQLite file on the data volume (node:sqlite, built into Node 22, so
// the server stays dependency-free). It holds every empire, server settings, the shared world,
// chat, the activity feed and the event log. Writes are synchronous and the process is the only
// writer (one Fly machine), so each statement is atomic and a crash never leaves half a save.
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { readFile, rename, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

// Loaded with require: Vite (the tests) does not know node:sqlite as a built-in yet.
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite');

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS empires (
    id TEXT PRIMARY KEY,
    record TEXT NOT NULL,
    updated_at INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS docs (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    at INTEGER NOT NULL,
    world_time REAL,
    actor TEXT NOT NULL,
    subject TEXT,
    kind TEXT NOT NULL,
    data TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS events_actor ON events (actor, id);
  CREATE INDEX IF NOT EXISTS events_subject ON events (subject, id) WHERE subject IS NOT NULL;
  CREATE INDEX IF NOT EXISTS events_kind ON events (kind, id);
`;

/** Open (or create) the database at `file` (':memory:' for tests) with its schema. */
export function openDb(file) {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  if (file !== ':memory:') db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;');
  db.exec(SCHEMA);
  return db;
}

/**
 * A named JSON document kept in the database (the shared world, chat, the activity feed): read
 * and write its text. The same shape as `fileDoc`, so modules can be given either.
 */
export function dbDoc(db, key) {
  const get = db.prepare('SELECT value FROM docs WHERE key = ?');
  const put = db.prepare('INSERT INTO docs (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
  return {
    async read() {
      return get.get(key)?.value ?? null;
    },
    async write(text) {
      put.run(key, text);
    },
  };
}

/** The same document in a plain file (tests, and the JSON files from before the database). */
export function fileDoc(path) {
  return {
    async read() {
      try {
        return await readFile(path, 'utf8');
      } catch {
        return null;
      }
    },
    async write(text) {
      await mkdir(dirname(path), { recursive: true });
      const tmp = `${path}.${process.pid}.tmp`;
      await writeFile(tmp, text);
      await rename(tmp, path);
    },
  };
}

/** Copy a JSON file into a database document once, the first time the database lacks it. */
export async function importDoc(doc, legacy) {
  if ((await doc.read()) !== null) return false;
  const text = await legacy.read();
  if (text === null) return false;
  await doc.write(text);
  return true;
}
