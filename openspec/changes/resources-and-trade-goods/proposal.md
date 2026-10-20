## Why
- **Too many raw materials.** Eleven resources, seven of them minerals (volatiles, ice, rare earths, exotics, dark matter…), are hard to read and to balance, and most do the same job.
- **Trade is abstract.** Trade routes are toggles that pay credits every year with no ships moving. Freighters only count toward a route limit.

## What Changes
- **Three raw materials:**
  - **Metals:** hulls and buildings.
  - **Gases:** fuel and life support.
  - **Crystals:** rarer; advanced ships and technology.
- **Currencies:**
  - **Credits:** money, to build and construct with.
  - **Food:** feeds the population.
  - **Influence and faith:** stay as they are, for government and religion.
- **Trade goods:**
  - Colonies on living worlds make them; a new Manufactory building makes more.
  - Bulk Freighters carry 50 goods each (more with research) and sell them for credits at another world: another of your colonies, an alien world or another empire's world.
    - The price grows with the distance from where the goods were loaded, so long and short runs pay about the same per year.
    - Foreign markets pay more than your own colonies (alien worlds ×1.25, other empires ×1.5).
  - A **trade run** is a standing order: load at your colony nearest the market, sell, come back, repeat, while you are away too.
  - Freighters can also load and sell by hand from the fleet card.
- **Mining ships remapped.** The seven mining hulls each mine one of the three materials. The specialist hulls mine faster than the Prospector (1.2× to 2×).
- **Old saves converted:**
  - Old minerals fold into the new ones: volatiles and ice become gases; rare earths, exotics (×2) and dark matter (×4) become crystals.
  - Trade routes are dropped.
- **Removed:** trade routes, trade partners, the route limit and the routes research bonus. The research bonus becomes freighter cargo.

## Impact
- **Content:**
  - `src/content/resources.ts`: resources, biome yields, legacy map.
  - `buildings.ts`: Manufactory, storage.
  - `shipClasses.ts`: costs, mining remap, rate.
  - `techTree.ts`: cargo bonuses, blurbs.
  - `society.ts`.
- **Core:**
  - `src/core/economy/Trade.ts` (new): cargo and prices.
  - `Economy.ts`: no trade routes; mining rate.
  - `Presence.ts`: cargo and trade orders.
  - Loot and planet caches use the new materials.
- **Sim:**
  - `EmpireSim`: markets, `loadGoods`, `sellGoods`, `tradeRun`, trade runs in standing orders.
  - Commands: `loadGoods`, `sellGoods` and `tradeRun` replace `toggleRoute`.
- **UI:**
  - Top bar shows the new resources.
  - Empire › Trade lists freighters and markets.
  - The fleet card shows cargo with load, sell and trade-run buttons.
  - The star card offers a trade run to its market.
- **Saves:** `upgradeSave` converts old saves on load, in the browser and on the server.
