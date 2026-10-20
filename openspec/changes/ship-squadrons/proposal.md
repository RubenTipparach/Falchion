## Why
Battles should look big, and a ship's size should matter in a fight. A "ship" in a fleet stands for a squadron whose number of hulls depends on its size. A squadron that loses hulls fires less. Area weapons (missiles, flak) are better against swarms of small hulls, and beams are better against single huge ones.

## What Changes
- **Ship sizes** (content), with the hulls one ship stands for:
  - fighter 8;
  - frigate 4;
  - destroyer 3;
  - cruiser 2;
  - heavy cruiser 1;
  - capital ship 1 (battleships, carriers, flagships, dreadnoughts).
  - Mining and logistics ships get sizes too.
- **Hull and attack stay per ship (squadron),** so costs and balance hold.
- **Losses cut firepower:** a damaged squadron has lost hulls in proportion to its damage (rounded up: a hull lives until its share is gone). It fires only with the hulls it has left. A one-hull ship fires fully until destroyed.
- **Weapons by target:** each doctrine's damage is spread across the enemy's squadrons and scaled by the target's hull count:
  - barrage and suppression (missiles, drones, flak) do 0.8× against a single hull, rising 0.1× per extra hull to 1.5× against fighters;
  - long-range beams and railguns do 1.3× against a single hull, falling 0.1× per extra hull to 0.6× against fighters;
  - other doctrines do 1×.
- **Battle view:** each ship is drawn as its squadron (1, 2, 3, 4 or 8 hulls in formation). Hulls blow up one by one as the squadron's health falls.
- **Shipyard:** each class shows its size and hulls per ship.

## Impact
- Content: `shipClasses.ts` (size table, `hullsOf`, effectiveness by target size).
- Core: `Combat.ts`.
- Render: `BattleStage.ts`.
- UI: `ShipyardPanel.ts`.
