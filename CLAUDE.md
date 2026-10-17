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
validation, build and a server smoke test, then deploys to **GitHub Pages** (static client)
and **Fly.io** (`server/`: zero-dependency Node server serving the client + `/healthz` +
`/api/info` + the world clock `/api/clock` and tick stream `/api/ticks`; future home of the MMO server).
The world is realtime: one tick per minute = one game year (`server/clock.json`, shared with the client).
The most recent push wins. The Fly job skips
with a notice until `FLY_API_TOKEN` is set and the `falchion` app exists (see
`server/fly.toml`). The only secret needed is `FLY_API_TOKEN`
(Discord secrets get added when the Discord integration is built).
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
