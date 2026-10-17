# Tasks

## 1. Log

- [x] 1.1 `server/eventLog.mjs`: append, read (last N, spans rotation), found, foundingSave; verify `server/eventLog.test.mjs`
- [x] 1.2 Size cap: rotate to `<name>.1` over 2 MB; serialised writes per player; verify rotation and concurrency tests

## 2. Server and admin

- [x] 2.1 `server/index.mjs`: log `found` with the founding save on a new empire, inside the empire's lock; log failures do not fail the founding
- [x] 2.2 `server/admin.mjs`: read-only `GET /api/admin/players/<id>/events` (last 50) and an "Event log" panel; verify admin tests

## 3. Commands and replay

- [x] 3.1 Log every command the server applies (ok or refused) in `server/commands.mjs`, injecting the log as an optional dependency; verify `server/replay.test.mjs`
- [x] 3.2 Log multi-year catch-ups of the yearly tick (`advance`) in `server/simTicker.mjs`
- [x] 3.3 `replay()` and the replay test: founding save plus logged events, applied with headless `applyCommand` and `advanceSave`, equals the stored save
