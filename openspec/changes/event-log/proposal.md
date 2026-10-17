# Proposal

## Why

The server is the authority for every empire, so it must be able to show what it did. An
append-only record of the commands it applied lets an admin see what happened to an empire,
and proves the server's work can be checked: the founding save plus the logged commands
replay into exactly the stored empire.

## What Changes

- `server/eventLog.mjs`: one JSON line per event in `<DATA_DIR>/events/<playerId>.jsonl`, with
  `at` (server time), `worldTime` (the world time the rules ran at), `turn` (the empire's year
  before the event), `command`, `clientTime`, `ok` and `error`. A file over 2 MB is rotated to
  `<name>.1`, so the log stays bounded. Zero dependencies.
- `server/commands.mjs`: every command the rules applied or refused is logged, with the exact
  world and client times passed to `applyCommand`. The log is an optional dependency and is not
  waited on: a log failure never fails an order. Orders the rules never saw (rate-limited, no
  empire, no simulation) are not logged.
- `server/simTicker.mjs`: when the yearly tick catches an empire up several years at once (after
  the server was down, e.g. during a deploy) it logs an `advance` line, since a replay otherwise
  plays one year at a time.
- A founding (`PUT /api/save` for a player without an empire) appends a `found` line and keeps the
  founding save whole in `<playerId>.founding.json`. A log failure never fails the founding.
- `replay(sim, { founding, events, player, toTurn })` in `server/eventLog.mjs` rebuilds an empire
  from its latest founding and the logged events with the headless `applyCommand` and `advanceSave`.
- The admin portal gets a read-only view of a player's last 50 events
  (`GET /api/admin/players/<id>/events`, and an "Event log" panel on `/admin`).

## Capabilities

### New Capabilities
- `event-log`: append-only, bounded per-empire log of applied events, founding saves kept for
  replay, replay of the log into the stored empire, and a read-only admin view.

## Impact

- `server/eventLog.mjs`, `server/eventLog.test.mjs`, `server/replay.test.mjs` (new).
- `server/commands.mjs`, `server/simTicker.mjs`: optional `events` dependency.
- `server/index.mjs`: one log instance in the data directory; `found` on a new empire.
- `server/admin.mjs`: `events` dependency, events route, panel.

## Limits

- The log does not record the shared world (asteroid fields, NPC empires) or NPC raids, so a
  replay is exact only for an empire whose years did not depend on them.
- Rotation drops the oldest lines: once the `found` line has rotated out, the empire can no
  longer be replayed (replay returns null).
