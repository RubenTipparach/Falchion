# Tasks

## 1. Setup

- [x] 1.1 Create Vite + TypeScript + three.js + Vitest project; verify `npm run typecheck`, `npm test`, `npm run build` run
- [x] 1.2 Add project skills, CLAUDE.md and OpenSpec config; verify `npx openspec validate --all` passes

## 2. Core: hex and RNG

- [x] 2.1 Implement seeded RNG and hashing in `src/core/rng`; verify `rng.test.ts` golden-seed and fork-independence tests pass
- [x] 2.2 Implement axial hex math (distance, neighbours, line, pixel conversion, rounding) in `src/core/hex`; verify `hex.test.ts` (neighbour distance = 1 ly, symmetry, round trip)

## 3. Core: galaxy

- [x] 3.1 Implement `GalaxyModel` density and deterministic `starAt`; verify `galaxy.test.ts` (determinism, rim empty, arms denser, elevation 0, nearest star)
- [x] 3.2 Implement galactic addressing; verify `address.test.ts` (quadrants, core ring, cell index)
- [x] 3.3 Implement turn-based fleet route, ETA and position; verify `fleet.test.ts` (route length, 730 ly at 2 ly/turn = 365 turns, exactly `speed` hexes per turn, whole turns only)

## 4. Core: research, shards, encounters

- [x] 4.1 Add tech tree content with five branches, exclusive groups, analogs and Hive Mind crossover; verify the content validator cases in `research.test.ts` (references, no cycles, five roots)
- [x] 4.2 Implement research rules (prerequisites, locks, analogs, crossovers); verify `research.test.ts`
- [x] 4.3 Implement shard ledger and source rules; verify `shards` cases in `research.test.ts`
- [x] 4.4 Implement encounter resolution and loot crates; verify `encounters.test.ts` (replay determinism, failure cost, shard cards apply)
- [x] 4.5 Implement `ShipDesign` data, defaults and design code; verify `shipDesign.test.ts` round trip

## 5. Rendering and UI

- [x] 5.1 Implement `ZoomModel` (exponential, clamped); verify `zoom.test.ts`
- [x] 5.2 Implement `LayerStack` with hex grid, near stars, galaxy cloud, sector overlay, territory and fleet layers; verify visually that hexes appear only zoomed in and quadrants/rings when zoomed out
- [x] 5.3 Implement view toggle (button + G) and star selection info panel; verify manually by toggling and clicking a star
- [x] 5.8 Implement End Turn (button + Enter) and straight-line fleet drawing with fixed heading; verify a fleet glides in a straight line one turn at a time and nothing moves between turns
- [x] 5.4 Implement `ShipGeneratorRegistry` and five style generators plus trait decorators; verify `shipGenerators.test.ts` (five styles, deterministic part layout) and visual preview
- [x] 5.5 Implement Shipyard panel controls and design code import/export; verify colour change and randomise in the preview
- [x] 5.6 Implement Research panel (branches, locks, analogs, crossovers, shard progress, shard source buttons); verify manually
- [x] 5.7 Implement Explore panel (encounter + crate opening with cards); verify manually

## 6. Integration

- [x] 6.1 Screenshot hex view, galaxy view and panels with Playwright; verify no console errors

## Workflow follow-up

- Archive the change after review (`/opsx:archive galaxy-mockup-foundation`).
