---
name: solid-principles
description: Apply SOLID design when writing or reviewing any TypeScript in Falchion. Use when creating a new class/module, adding a feature to an existing system, refactoring, or reviewing a diff for coupling problems.
---

# SOLID in Falchion

Falchion is a long-lived MMO. Every system will be extended (new ship styles, new
research branches, new encounter types, PvP). Write code so that extension means
*adding* a module, not editing ten.

## S — Single Responsibility
- One reason to change per module. A file that both computes hex math **and** draws
  lines has two reasons to change: split it (`core/hex` vs `render/map`).
- Rule of thumb: if the description needs "and", split it.
- Domain logic (`src/core/**`) never imports `three`, the DOM, or network code.

## O — Open/Closed
- Extend through **registries and strategies**, not `switch` statements spread
  across the codebase.
  - Ship styles: implement `ShipStyleGenerator`, register it in the
    `ShipGeneratorRegistry`. No other file changes.
  - Encounter types, loot sources, shard sources, map layers: same pattern.
- Data-driven content (tech nodes, loot tables, biomes) lives in plain data files
  so designers can add content without touching logic.

## L — Liskov Substitution
- Any implementation of an interface must be usable wherever the interface is.
  A `MapLayer` that throws in `dispose()` or ignores `update()` breaks the
  `LayerStack` contract.
- Do not narrow inputs or widen outputs in implementations; don't add hidden
  preconditions ("only works if zoom > 3").

## I — Interface Segregation
- Small role interfaces: `Updatable`, `Disposable`, `ZoomAware`, not one
  `GameObject` god-interface.
- Consumers depend on the narrowest interface they need (the HUD needs
  `HexPicker`, not the whole `GalaxyView`).

## D — Dependency Inversion
- High-level policy depends on abstractions: `ResearchService` takes a
  `ShardSource[]`, not concrete `Espionage`/`Telescope` classes.
- Wire concrete implementations in **composition roots** only (`src/app/*`).
- Inject randomness (`Rng`), time (`Clock`) and identity (`IdentityProvider`) —
  never call `Math.random()`, `Date.now()` or Discord APIs from domain code.

## Review checklist
- [ ] Does `src/core` stay free of `three`/DOM imports?
- [ ] Can a new variant be added by registering, without editing a switch?
- [ ] Are dependencies passed in (constructor/params) rather than imported singletons?
- [ ] Is each new interface the smallest one its consumer needs?
- [ ] Is every public function deterministic given its inputs (see `deterministic-simulation`)?
