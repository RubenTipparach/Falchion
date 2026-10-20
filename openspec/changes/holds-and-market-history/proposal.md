## Why
The owner: "I need a stock market graph to track commodity values over time" and "Resources loaded on to ships should not be sellable on the stock market or usable unless they are returned to base". Mining ships out at a distant asteroid field put their ore straight into the stockpile every year, where it could be sold or spent at once; and the exchange showed only today's price.

## What Changes
- **Ship holds:** mining ships away from a friendly base (a colony system or a supply depot) put what they mine into their fleet's hold, up to the hold's size, not the stockpile. A fleet in a friendly system unloads its hold into the stockpile (as storage allows; the rest stays aboard). Ore aboard cannot be sold on an exchange or spent; it is lost if the fleet is. Auto-mining fleets (and mining companies) take a full hold home and go back out. Mining at a friendly system delivers at once, as before.
- **Market history:** the exchange shows a chart of a commodity's price over time on every exchange you have met (an hour, six hours or a day of world time), with a crosshair readout, and each commodity row a small trend line with its change.

## Impact
`src/core/economy/Economy.ts` (miners' holds in `resolveTurn`), `src/core/economy/Exchange.ts` (`priceSeries`), `src/content/logistics.ts` (hold size), `src/sim/EmpireSim.ts` (presence, unloading, hauling home, docking), `src/sim/snapshot.ts` and `docs/snapshots.md` (holds), `src/ui/MarketChart.ts`, `src/ui/panels/EmpirePanel.ts`, `src/ui/panels/FleetsPanel.ts`.
