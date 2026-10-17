# Falchion

Hex-based, at-scale 4X MMO (three.js + TypeScript, Discord integration planned).

## Commands
- `npm run dev` — Vite dev server for the game
- `npm test` — Vitest unit tests (src/core, src/content)
- `npm run typecheck` — `tsc --noEmit`
- `npm run build` — production build
- `npx openspec list` / `npx openspec validate --all` — spec-driven workflow

## CI / deploy
`.github/workflows/deploy.yml` runs on every push to every branch: typecheck, tests, spec
validation, build and a server smoke test, then deploys to **Fly.io**, the one and only server
(`server/`: zero-dependency Node server serving the client + `/healthz` +
`/api/info` + the world clock `/api/clock` and tick stream `/api/ticks`; future home of the MMO server).
The world is realtime: one tick per minute = one game year (`server/clock.json`, shared with the client).
The server runs every empire (full authority): each world year it plays every empire forward with the
game's own rules (`src/sim/headless.ts`, bundled by `npm run build:sim` into `server/sim/`, driven by
`server/simTicker.mjs`) and pushes the owner their state. Orders are commands (`src/sim/commands.ts`,
`POST /api/command`, `server/commands.mjs`): the browser applies each at once, the server validates and
applies it, and the browser adopts the server's answer (`src/app/Authority.ts`). A save is uploaded only
to found a new empire. Any new player action must be added to `COMMANDS`. Local multiplayer dev:
run the server, then `FALCHION_SERVER=http://localhost:8080 npm run dev`.
The most recent push wins. The Fly job skips
with a notice until `FLY_API_TOKEN` is set and the `falchion` app exists (see
`server/fly.toml`). Secrets: `FLY_API_TOKEN`, plus `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET` and
`SESSION_SECRET` for Discord sign-in, optional `ADMIN_DISCORD_ID` (admin portal) and
`DISCORD_WEBHOOK_URL` or `DISCORD_BOT_TOKEN` + `DISCORD_CHANNEL_ID` (channel notifications) (CI stages them onto Fly; see `docs/discord.md`). Player saves
live on the `falchion_data` Fly volume (one machine).
Pattern mirrors RubenTipparach/high-frontier-fan-game.

## Workflow
Spec first: use `/opsx:propose` → `/opsx:apply` → `/opsx:archive`. Specs live in `openspec/`.

## Architecture rules (see .claude/skills)
- `src/core` is pure and deterministic: no `three`, DOM, `Math.random`, or `Date.now`.
- `src/content` holds data tables (tech tree, loot, biomes). Add content there, not in logic.
- `src/render` draws domain state with three.js; `src/ui` is DOM panels; `src/app` wires them.
- Extend via registries/interfaces (ShipStyleGenerator, MapLayer, ShardSource) — Open/Closed.
- Load `solid-principles`, `modular-game-systems`, `deterministic-simulation`, and
  `testing-practices` skills before designing or reviewing code.
- Load `procedural-geometry` before adding or changing ship styles, traits, parts or any
  procedural mesh: solid parts must face outward (a test checks every generated ship).
