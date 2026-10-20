## Why
The top bar shows each resource's stock, but not where it comes from or where it goes. The owner wants to click a resource and see its income, its costs and what it was spent on.

## What Changes
- **One ledger, from the rules themselves.** The yearly economy (`resolveTurn`) records every item it adds as it adds it, with a group and a label:
  - each colony's world, capital bonus, buildings and population;
  - research bonuses and mining ships by class;
  - government, policies and tenets by name;
  - religion and fleet upkeep by class;
  - stability or famine adjustments, and what a full store turned away.

  The panel's total is the game's own total, not a second calculation.
- **A forecast.** Clicking a resource runs next year's economy on the current state, a pure call, and shows the ledger. A building just finished or a ship just built shows at once.
- **Recent one-off changes.** Commands that change the stockpile record what changed and why (`flows` in the save, the 40 newest):
  - building ships and buildings, a supply depot, changing government;
  - loading and selling trade goods, tribute;
  - collecting loot and resource caches, cargo returned from a disbanded fleet;
  - raiders' plunder.
- **The panel:** a popover under the clicked resource (a sheet on a phone) with:
  - the stock and storage cap;
  - the year's net change, then income and costs grouped with subtotals and the adjustments;
  - recent one-off changes.

## Impact
- Core: `Economy.ts` (ledger entries in `TurnReport`, `colonyParts`, `upkeepParts`, named effects).
- Sim: `EmpireSim` records flows and exposes `forecast()`; `GameState.flows` saved.
- UI: `TopBar` resource chips open `ResourceLedger`.
