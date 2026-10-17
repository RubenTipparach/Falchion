---
name: modular-game-systems
description: Architecture guide for adding or extending Falchion game systems (map layers, ship generators, research branches, encounters, combat, economy, Discord). Use before starting any new feature to decide where code goes and which extension point to use.
---

# Modular game systems

## Layering (dependencies point downward only)

```
src/app/      composition roots: wire everything, no logic
src/ui/       DOM panels; talk to services through interfaces
src/render/   three.js views of domain state; read-only on the domain
src/core/     pure deterministic domain: hex, galaxy, research, loot, ships(data)
src/content/  data tables: tech nodes, loot tables, biomes, ship parts
```

`core` must run headless on the server (Node) for authoritative simulation.
Anything `core` produces must be serialisable plain data.

## Extension points (prefer these over new code paths)

| Want to add…              | Do this                                                   |
|---------------------------|-----------------------------------------------------------|
| a ship visual style       | new `ShipStyleGenerator` + register in `ShipGeneratorRegistry` |
| a research branch / node  | edit `src/content/techTree.ts` (data only)                |
| a cross-branch link       | add a `crossover` edge in tech data                       |
| a way to earn shards      | new `ShardSource` id + entry in the source table          |
| a loot / encounter type   | new `EncounterKind` entry + loot table in `src/content`   |
| a map overlay             | new `MapLayer` and add it to the `LayerStack`             |
| a zoom behaviour          | tune `ZoomModel` thresholds, don't special-case layers    |

## Think ahead: what is reusable
- **Hex math** is used by the map, movement, territory, sensors and combat ranges.
- **Seeded RNG + hashing** drives star generation, ship procgen, loot and combat.
- **Shard ledger** is generic progress-by-fragments: research nodes, ship chassis,
  parts and blueprints all use it.
- **Trait tags** (e.g. `hive-mind`) connect research to visuals, abilities and
  economy without those systems knowing each other.
- **Deterministic resolvers** (encounters, combat) share the same
  `(state, seed) -> result` signature so they can run on server and replay on client.

## Feature checklist
1. Write/extend the OpenSpec spec first (`/opsx:propose`).
2. Put rules in `core`, data in `content`, visuals in `render`, controls in `ui`.
3. Add unit tests for `core` changes (`npm test`).
4. Wire it in `src/app`.
