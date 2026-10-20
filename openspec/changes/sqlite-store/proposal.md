## Why
The server keeps every empire, the shared world, chat and the activity feed as separate JSON files on the volume. That cannot be queried, and it does not scale to an event log of every player action and NPC decision. A single SQLite database is ready to grow with the MMO and still adds no dependency, because `node:sqlite` is built into Node 22.

## What Changes
- **`server/db.mjs` (new):**
  - opens `<DATA_DIR>/falchion.db` (WAL) with the tables `empires`, `settings`, `docs` and `events`;
  - `dbDoc(db, key)` and `fileDoc(path)` give the same read/write interface over a database row or a file.
- **`server/store.mjs`:**
  - empires and settings move to the database;
  - the API is unchanged;
  - one statement per save, so a crash never leaves half a save.
- **Shared world, chat and the activity feed:** each is one document in `docs`, through the `doc` interface. Tests can still give them a file.
- **Migration:** the first start imports the legacy `<id>.json`, `_<setting>.json`, `world.json`, `chat.json` and `activity.json` files once. Anything already in the database is kept.

## Impact
- Server: `server/db.mjs` (new), plus changes to `server/store.mjs`, `server/world.mjs`, `server/chat.mjs`, `server/activity.mjs` and `server/index.mjs`.
- Deploy: there is still one Fly machine and the `falchion_data` volume. The database file lives there.
