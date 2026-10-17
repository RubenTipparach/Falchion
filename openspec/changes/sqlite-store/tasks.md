## 1. Database
- [x] 1.1 `server/db.mjs`: openDb (schema, WAL), dbDoc, fileDoc, importDoc
- [x] 1.2 `server/store.mjs` on the `empires`/`settings` tables, same API; `importLegacySaves`; verify store tests
- [x] 1.3 Shared world, chat and activity take a `doc`; index imports their legacy files; verify their tests and the server smoke test
