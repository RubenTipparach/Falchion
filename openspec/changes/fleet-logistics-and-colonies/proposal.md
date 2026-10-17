# Proposal

## Why

Falchion is moving from a mockup to the playable game. Ships currently act from anywhere:
the empire explores, fights, mines and spies without a ship on location, so space never
matters. Planets are only a biome line in a list. The game needs logistics (supply and
ammunition), presence (ships act where they are) and colonies the player develops.

## What Changes

- Every ship carries **supply**; exploring a planet spends supply of a ship on station in
  that system. Survey Cutters carry far more supply than other hulls.
- Armed ships carry **ammunition**; a battle spends it and low ammunition lowers
  firepower. Ammunition regenerates slowly away from home.
- Fleets in a **friendly system** (own territory, a colony, or a supply depot) refill
  supply and ammunition every turn. Fleets can return home and dock.
- **Presence**: exploration, combat, mining, settling, construction, missionaries and
  spy networks only work with a ship at that location.
- **Colonies** are real planets with building slots by size: farm, mine, trade hub,
  shipyard, research lab, temple. Colonies eat food; famine cuts output.
- Ships are built at a colony with a shipyard and start in that system.
- **Colony Arks** settle explored worlds; **Construction Tenders** build supply depots.
- One-time **resource caches** on newly explored planets, gathered with a Collect
  resources button (colonies are excluded).
- UI: Fleets panel, supply and ammunition gauges, location buttons that zoom to a
  planet or fleet, route dashes that rescale with zoom, opaque planets.

## Capabilities

### New Capabilities
- `fleet-logistics`: supply, ammunition, resupply, presence rules for fleets.
- `colonies`: planet buildings, food, shipyards, settling and supply depots.

## Impact

- `src/core/fleet/Logistics.ts`, `src/core/fleet/Presence.ts` (new, pure, tested).
- `src/core/economy/Economy.ts`: colony buildings, food, presence-aware mining/missions/spies.
- `src/core/combat/Combat.ts`: `firepower` multiplier on a side.
- `src/content/logistics.ts`, `src/content/buildings.ts` (new data tables); two new ship classes.
- `src/app`, `src/ui`: fleets, groups, colonies; `src/render`: dash rescaling, background draw order.
