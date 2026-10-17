---
name: deterministic-simulation
description: Rules for deterministic, seed-driven code in Falchion (procedural generation, combat, encounters, loot, lockstep turns). Use whenever code involves randomness, game time, ordering of entities, or anything that must match between server and client.
---

# Deterministic simulation

Falchion's galaxy is 70,000 ly across and is never stored in full: stars, ships
and encounters are regenerated from seeds. Combat is automated and lockstep
encounters must replay identically on every client. Therefore:

1. **No ambient randomness.** Never `Math.random()`. Use `Rng` from
   `src/core/rng` seeded from a stable key, e.g. `hashSeed(galaxySeed, q, r)`.
2. **Derive, don't share.** Give each sub-system its own derived seed
   (`rng.fork('engines')`) so adding a feature doesn't shift every later roll.
3. **No ambient time.** The game is turn-based: pass the turn number as a parameter; nothing advances between turns.
4. **Stable ordering.** Sort by id before iterating sets/maps that affect results.
5. **Integers for authoritative state.** Shard counts, resources, HP are integers;
   floats are fine for visuals only.
6. **Pure resolvers.** `resolve(state, seed) -> result` with no mutation of inputs.
7. **Test with golden seeds.** A test asserting "seed 42 always gives X" catches
   accidental nondeterminism.
