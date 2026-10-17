# Proposal

## Why

Falchion has no code yet. Before building servers and multiplayer, we need a playable
mockup that proves the three hardest-to-change foundations: an at-scale hex galaxy
(1 hex = 1 light year, ~70,000 ly across) that can be navigated from a single hex to
the whole galaxy, a procedural ship look that every player can customise simply, and
a branching research model fed by shards. Everything later (combat, economy, PvP)
builds on these.

## What Changes

- Add a seeded, deterministic galaxy generated on demand: spiral-arm density, one star
  slot per hex, stars on a flat plane at equal elevation.
- Add a galactic addressing scheme (quadrant → radial ring → radial cell → hex) so
  players can say where their planets are without coordinates.
- Add exponential zoom with level-of-detail: hexes only drawn when zoomed in; quadrant
  and radial-cell overlays when zoomed out; a toggle to jump between hex and galaxy views.
- Add fleet travel along hex paths with distance in light years and ETA in game time.
- Add procedural ships in five styles (organic, technological, aesthetic/classic,
  simple geometry, utilitarian) behind a pluggable generator registry.
- Add a simple ship designer: style, seed, proportions, colours, part counts.
- Add a research tree with five parallel branches, exclusive choices that lock nodes
  but open analog nodes, and crossover nodes (e.g. Hive Mind between organic and
  technological) that give access to another branch.
- Add shard-based research progress (e.g. 1/10, 1/100, 1/500) with shard sources
  (science, exploration, espionage, reverse engineering, distant observation).
- Add exploration encounters that resolve deterministically and award loot crates of
  cards (research shards, chassis, parts, raw materials).
- Research unlocks trait tags that visibly change generated ships ("ships evolve").

Out of scope: servers, persistence, multiplayer sync, combat, economy, biome expansion,
Discord (see change `mmo-core-systems`); PvP and monetisation entirely.

## Capabilities

### New Capabilities
- `galaxy-map`: seeded galaxy, hex grid at 1 ly per hex, star placement, galactic addressing.
- `map-navigation`: exponential zoom, LOD of hexes vs quadrant/radial overlays, view toggle, selection.
- `fleet-movement`: hex-path travel, distance in ly and ETA in game time.
- `ship-procgen`: deterministic procedural ship models in five styles via a pluggable registry.
- `ship-customization`: player-facing ship design parameters and research-driven evolution.
- `research-tree`: branches, prerequisites, exclusive locks with analogs, crossovers.
- `research-shards`: fragment-based progress and the sources that grant shards.
- `exploration-encounters`: deterministic encounters and loot crates of cards.

### Modified Capabilities
(none — greenfield)

## Impact

- New TypeScript project (Vite, three.js, Vitest).
- New source tree `src/core`, `src/content`, `src/render`, `src/ui`, `src/app`.
- Extension points introduced: `ShipStyleGenerator` registry, `MapLayer` stack,
  shard source table, encounter/loot tables, tech-tree content data.
