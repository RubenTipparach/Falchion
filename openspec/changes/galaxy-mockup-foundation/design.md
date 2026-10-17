# Design

## Context

Greenfield repo. The mockup runs entirely client-side, but everything under `src/core`
is written so it can later run on an authoritative Node server unchanged
(see proposal.md — Why). Requirements are in `specs/`.

## Goals / Non-Goals

**Goals:**
- Prove navigation from 1 ly to 70,000 ly at interactive frame rates.
- Establish the layering and extension points every later system will reuse.
- Keep all gameplay rules deterministic and unit-tested.

**Non-Goals:**
- Networking, persistence, accounts, Discord (change `mmo-core-systems`).
- Final art; procgen ships are low-poly primitives composed procedurally.

## Decisions

### Layering
`core` (pure rules) ← `content` (data) ← `render` (three.js) / `ui` (DOM) ← `app` (wiring).
Alternative: feature folders mixing logic and rendering — rejected because the server
must import rules without three.js.

### Hex coordinates
Axial `(q, r)` with cube distance, flat-top orientation, size chosen so
neighbour centre distance = 1 world unit = 1 ly. Rounding via cube rounding.
Alternative: offset coordinates — rejected, distance/line math is awkward.

### Galaxy generation
`GalaxyModel.density(x, y)` = core bulge + logarithmic spiral arms + noise, 0..1.
`GalaxyModel.starAt(hex)` hashes `(seed, q, r)` → uniform; star exists if
`u < density * maxStarChance`. Name, spectral class and planets come from a forked
RNG of the same hash. Nothing is stored; regions are generated in cached chunks.

### Addressing
Polar: quadrant = angle / 90°. Rings every 5,000 ly (ring 0 = core, r < 2,500 ly
treated as "Core"). Cells per ring grow with circumference (`8 * ring`) so cells
stay roughly equal in area. Address string: `Beta · Ring 3 · Cell 17 · (q, r)`.

### Rendering and LOD — extension point `MapLayer`
Each overlay implements `MapLayer { object3d; update(view: ViewState): void; dispose() }`
and is added to a `LayerStack`. Layers decide their own opacity from `ViewState`
(altitude, focus, visible width), so the zoom code never special-cases layers.
- `HexGridLayer`: one camera-following quad with a fragment shader drawing an
  infinite hex grid (no per-hex geometry); fades out above the hex threshold.
- `NearStarLayer`: per-hex stars from `GalaxyModel`, generated in 64×64 hex chunks
  around the focus, LRU cached; visible at hex/sector altitudes.
- `GalaxyCloudLayer`: ~120k points sampled once from the density function for the
  far view; fades in as you zoom out.
- `SectorOverlayLayer`: quadrant lines, ring circles, radial cell spokes, labels.
- `TerritoryLayer`, `FleetLayer`: mock empire territory and moving fleets.
Alternative: drawing all hex geometry — impossible at ~4.4 billion hexes.

### Zoom
`ZoomModel`: altitude `h = hMin * exp(z)`, z clamped; wheel adds a constant Δz, which
satisfies the constant-factor requirement. Toggle animates `z` between presets.
Logarithmic depth buffer handles the ~10^6 near/far ratio.

### Ships — extension point `ShipStyleGenerator`
`ShipDesign` is plain data (`style, seed, length, bulk, colors, engines, weapons, traits`).
`ShipGeneratorRegistry.get(style).build(design, rng) → THREE.Group`. Shared
`ShipKit` helpers (hull segments, engines, greebles, mirrored placement) are reused by
all five styles. Trait decorators (`hive-mind`, `shielding`, `stealth`, `ornate`, …)
run after the style generator, so a trait works on every style. Design code:
base64url of compact JSON.

### Research — data in `src/content/techTree.ts`
Nodes: `{ id, branch, tier, shards, requires[], exclusiveGroup?, analogOf?, crossover?: branches[], grants }`.
`ResearchState` (immutable updates) holds shard ledger, researched set and locked set.
Rules: `canResearch`, `availability(node)` (locked / unavailable / available / researchable / researched).
Crossover = a node whose `requires` can be satisfied from any one of several branches
(`requiresAny`), and which later nodes in other branches require.

### Shards — extension point: shard source table
Sources declare `{ id, reachesUnconnected: boolean }`. `grantShards(state, node, source, n)`
enforces the connected rule. Adding a source = one table entry.

### Encounters
`resolveEncounter(seed, planetId, empire) → { kind, outcome, cost, crate }` using
kind weights and per-kind loot tables in `src/content`. Crates are opened with a
forked RNG; cards apply to `ResearchState`/inventory through a small `CardEffect` map.

## Risks / Trade-offs

- [Float precision at 35,000 units] → float32 still gives ~4 mm precision; camera-relative
  shader grid uses focus-relative coordinates.
- [Star chunk generation hitches when panning fast] → chunk budget per frame + LRU cache.
- [Procgen styles look samey] → each style uses its own silhouette rules, not just colours;
  revisit with art direction later.
- [Tech data grows unwieldy] → validator test checks references, cycles, and analog/exclusive consistency.
