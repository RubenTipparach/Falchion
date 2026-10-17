# Falchion

Hex-based, at-scale 4X MMO (three.js + TypeScript, Discord integration planned).

## Commands
- `npm run dev` — Vite dev server for the mockup
- `npm test` — Vitest unit tests (src/core, src/content)
- `npm run typecheck` — `tsc --noEmit`
- `npm run build` — production build
- `npx openspec list` / `npx openspec validate --all` — spec-driven workflow

## CI
GitHub Actions (`.github/workflows/ci.yml`) runs typecheck, tests, spec validation and build on every push to `main` and on every pull request.

## Workflow
Spec first: use `/opsx:propose` → `/opsx:apply` → `/opsx:archive`. Specs live in `openspec/`.

## Architecture rules (see .claude/skills)
- `src/core` is pure and deterministic: no `three`, DOM, `Math.random`, or `Date.now`.
- `src/content` holds data tables (tech tree, loot, biomes). Add content there, not in logic.
- `src/render` draws domain state with three.js; `src/ui` is DOM panels; `src/app` wires them.
- Extend via registries/interfaces (ShipStyleGenerator, MapLayer, ShardSource) — Open/Closed.
- Load `solid-principles`, `modular-game-systems`, `deterministic-simulation`, and
  `testing-practices` skills before designing or reviewing code.
