# Proposal

## Why

Turns pressed by hand do not suit an MMO where many players share one galaxy. Falchion
becomes realtime: the server advances the world one tick per minute, and one tick is one
year of empire time. At base speed a ship crosses one hex (one light year) per minute, so
neighbouring systems are minutes away, the frontier hours, and the far side of the galaxy
weeks: an MMO-scale map.

## What Changes

- The server owns a world clock (`server/clock.json`: shared epoch, 60 000 ms per tick),
  publishes it at `/api/clock`, and pushes every tick to connected clients over
  Server-Sent Events (`/api/ticks`).
- Clients follow the server clock and correct for skew; without a server (static hosting,
  the artifact) the same wall-clock schedule runs locally, so all clients agree on the year.
- End Turn is removed. The top bar shows the year and a countdown to the next one. A
  development build keeps a "+1 yr" button.
- Ship speed is light years per tick; base speed is 1 ly per minute. Ships glide
  continuously between ticks.
- The empire is saved in the browser. On return, missed years are simulated in one batch
  (the most recent week) and summarised in a single dispatch; older years pass
  without simulation (fleets still move, since position is a function of time).
- Live years only report news (arrivals and changed warnings), not routine income lines.
- Lockstep turns (`encounter-lockstep` in `mmo-core-systems`) are superseded: with one
  shared clock, contact needs no special time mode.

## Capabilities

### New Capabilities
- `world-clock`: server-ticked realtime world, client sync, catch-up and persistence.

## Impact

- `server/index.mjs`, `server/clock.json`, `server/Dockerfile`, CI smoke test.
- `src/core/time/WorldTime.ts` (pure), `src/core/fleet/Fleet.ts` (`progressAtTime`).
- `src/app/WorldClock.ts`, `src/app/SaveGame.ts`, `Store.batch`, `GameController.advanceTo`.
- `src/ui/TopBar.ts` and UI wording (years instead of turns).
- Follow-ups: build and research durations, standing orders for fleets while away,
  Discord notifications, server-side authoritative empire state, economy rebalance for
  income accruing every minute.
