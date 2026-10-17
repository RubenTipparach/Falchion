# Tasks

## 1. Log
- [x] 1.1 `server/eventLog.mjs` on the database `events` table: `record`, `append`, `found`, `npc`, `read` (by or about a player), `npcEvents`, trimming past the cap; verify `server/eventLog.test.mjs`
- [x] 1.2 Remove replay: no founding saves, no `replay()`, delete `server/replay.test.mjs`

## 2. What is recorded
- [x] 2.1 Commands applied or refused (`server/commands.mjs`), foundings, multi-year catch-ups
- [x] 2.2 NPC decisions: `stepNpcs` returns `decisions`; `server/world.mjs` records them, plus discoveries, captures, diplomacy and first contacts; verify `server/world.test.mjs`
- [x] 2.3 Battles and pursuits between players (`server/simTicker.mjs`)

## 3. Admin
- [x] 3.1 Read-only `GET /api/admin/players/<id>/events` and `GET /api/admin/npc-events`, and the "Event log" and "NPC decisions" panels; verify admin tests
