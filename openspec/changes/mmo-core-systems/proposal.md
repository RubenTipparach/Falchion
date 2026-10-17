# Proposal

## Why

The mockup (`galaxy-mockup-foundation`) proves the map, ships and research. To become an
MMO, Falchion needs an authoritative server, the four X's beyond exploration, a rule for
what happens when async players meet, and Discord as the social/identity layer.

## What Changes

- Authoritative, deterministic automated combat against aliens (PvE), including
  bombardment, planetary assault and ship capture that yields tech fragments.
- Async time by default; when fleets of different players come within an encounter
  radius, a deterministic lockstep turn system takes over that zone.
- Peaceful player encounters and co-operative attacks on alien targets. **No PvP.**
- Biome-based expansion: start biome, research unlocks adjacent biomes.
- Economy: planets, trade routes, religion, politics as income sources.
- Espionage and influence as shard and income sources.
- Discord integration: sign-in, Discord Activity launch, server-as-alliance, event feed.

Out of scope: PvP modes, monetisation, mobile clients.

## Capabilities

### New Capabilities
- `combat-resolution`: automated deterministic fleet combat, bombardment, assault, capture.
- `encounter-lockstep`: switching a region from async time to lockstep turns when players meet.
- `player-coexistence`: peaceful contact, co-op targets, shared reward rules.
- `biome-expansion`: home biome, adjacency graph, colonisation rules.
- `economy`: resource production, trade, religion and politics income.
- `espionage-influence`: spy operations and influence as shard/income sources.
- `discord-integration`: identity, Activity launch, guild alliances, notifications.

### Modified Capabilities
(none)

## Impact

- New `server/` package reusing `src/core` for authoritative simulation.
- New extension points: `Ability` registry (combat), `IncomeSource` registry (economy),
  `IdentityProvider` and `Notifier` interfaces (Discord), `TimeAuthority` (async/lockstep).
