## Context
The server runs every empire (`server/simTicker.mjs`) and keeps everything in one SQLite file. The galaxy is procedural: every client can generate every star from the seed, so "hiding" a system means not drawing it and not sending what other empires and NPCs have there, not withholding the star itself.

## Decisions

### Vision is derived, and only `visited` is stored
`src/core/visibility/Vision.ts` derives a player's vision from their save:
- **explored**: the home system, every colony's system, every supply depot, every system with a surveyed planet, and every system in `visited` (a ship of theirs passed through it or stopped in it, recorded by `EmpireSim.step` from each fleet's route between one year and the next);
- **sighted**: stars within `SIGHT_RANGE` (2 ly) of an explored system or of one of their fleets, and within their territory (5 ly of home, 3 ly of a colony).
Allies (an `alliance` relation in the shared world) share vision: the server sends a player their allies' explored and sighted systems (`GET /api/vision`). A star then shows as `explored`, `sighted`, `fogged` (neither, flag off) or `hidden` (neither, flag on). Rules never read vision: the simulation is the same on the server and the client whatever a player can see.

### The lens
The client wraps vision in a `StarLens` (`src/app/Vision.ts`): `sight(star)`, `see(star)` (the star as the player knows it: `null` when hidden, a megastructure system masked to an ordinary star until explored) and a `version` that changes when vision does. Views take the lens, never the raw galaxy, for anything a player picks or reads: `NearStarLayer` (dots and names), `FogOfWarLayer` (what clears the fog), `MegaBeaconLayer`, `SystemLayer` (`SystemEvents.see`), galaxy search (`ScanContext.see`), selection, hover, the attractor and right-click targets in `GameController`, and links (`Router`). The rules (`EmpireSim.planets`, `describe`) stay on the raw galaxy; masking the star object a view passes in is enough, because a star's planets are generated from it.

### Fog of war is a screen-space mask
`FogOfWarLayer` renders, before each frame (`MapLayer.prerender`), soft discs at every explored and sighted system and every own fleet into a quarter-resolution render target with max blending, using the map camera. A camera-following plane then draws drifting fog (fractal noise at a zoom-quantised scale, so it does not swim) whose opacity is `1 - mask`, with a faint rim where explored space ends. It is drawn in the opaque pass after the stars (render order -4) so ships, territory, the grid and labels stay above it, and it fades out in the system view.

### Server-side filtering
With the flag on, `server/vision.mjs` caches each player's visible star ids (own and allies', refreshed every world year and on demand) and filters what is sent: other players' home and colonies outside it and fleets not within `FLEET_SIGHT` of it (`/api/players`, live `player` events), NPC empires the player has not met and NPC worlds and fleets outside it (`/api/world`, live `world` events). The chat stream's `broadcast` takes a per-recipient `shape(uid, data)` for this. The server's own reads (markets, contacts, NPC targets) are never filtered.

### Snapshots
`server/snapshots.mjs` checks on every world tick whether `SNAPSHOT_INTERVAL_MS` has passed since the latest snapshot in the table (so a restart does not double up) and records one row per empire: `at`, `world_year`, `empire_id`, `owner`, `empire_name`, `reason` (`hourly`, `manual`, `reset`), `summary` (JSON, `summarizeSave` in `src/sim/snapshot.ts`, schema version 1, documented field by field in `docs/snapshots.md`) and `state` (the whole stored record, gzipped with `node:zlib`). Export streams JSON Lines: a `meta` line, then `snapshot` and `event` lines merged by time.

### Reset
`server/reset.mjs` takes a `reset` snapshot of every empire, then, with the yearly tick held off (`simTicker.exclusive`) and each empire locked in turn, replaces each save with `refoundSave` (headless): `newEmpireState` for its home at the current world year, with `setIdentity(identity, founding)` from its founding choices (the `foundings` row, else read from its current save). The shared world is replaced by `EMPTY_WORLD` at the current year. Owners are sent their new state, everyone the new world; `reset` and `reset-empire` events are logged.
