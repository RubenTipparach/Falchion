# Proposal

## Why
The server is the authority for every empire and runs the NPC empires, so it must be able to show what happened and why. A queryable event log of player actions and NPC decisions lets an admin see what happened to an empire and what the NPCs are up to.

## What Changes
- **`server/eventLog.mjs`** keeps the log in the database's `events` table (`server/db.mjs`).
  - Each row has:
    - `at`: server time;
    - `worldTime`;
    - `actor`: a player id, or `npc:<id>`;
    - `subject`: the player it happened to, if any;
    - `kind`;
    - its data.
  - The table is bounded: the oldest rows are trimmed past 500,000.
- **Player actions recorded:**
  - every command the rules applied or refused (`server/commands.mjs`);
  - foundings;
  - multi-year catch-ups of the yearly tick (`advance`);
  - battles and pursuits between players;
  - first contacts;
  - diplomacy that took effect;
  - NPC empires discovered;
  - NPC worlds captured.
- **NPC decisions recorded:** `stepNpcs` returns what each NPC decided, with a line of text and the player it is aimed at:
  - raider fleets built;
  - garrisons reinforced;
  - raids launched (with the standing behind them);
  - raids striking;
  - fleets home.
- Logging never fails an order or the tick.
- **Admin portal** (read only):
  - an empire's last 50 events, by or about it, including NPC raids on it;
  - the last 100 NPC decisions.
- **Replay is removed:**
  - founding saves are no longer kept;
  - `replay()` and its test are deleted.

## Capabilities

### New Capabilities
- `event-log`: a bounded database log of player actions and NPC decisions, with a read-only admin view.

## Impact
- **Server:**
  - `server/eventLog.mjs` is rewritten on SQLite;
  - `server/eventLog.test.mjs`;
  - `server/replay.test.mjs` is removed;
  - `server/world.mjs` gains a `record` dependency;
  - `server/simTicker.mjs` records battles;
  - `server/admin.mjs` adds the NPC decisions route and panel.
- **Core:** `src/core/npc/NpcSim.ts` returns `decisions`, and `src/sim/headless.ts` `stepWorld` passes them on.
