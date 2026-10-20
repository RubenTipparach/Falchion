## Why
Trade goods pay best at another empire's world (×1.5), but no other player's world is ever a
market: the simulation has a hook for extra markets (`SimDeps.markets`) that nothing feeds. Players
can only sell at their own colonies and at NPC worlds.

## What Changes
- **Other players' worlds are markets.** Every other player's home and colony systems are markets of kind `player`, named "<Star> (<Empire>)" (the account name before founding).
- **One list, everywhere.** `src/core/economy/PlayerMarkets.ts` builds them from the other empires' public views, so the browser and the server agree:
  - your own worlds are never another player's market;
  - a star two other empires share is the market of the lower player id;
  - the views are untrusted: bad hexes are dropped and empire names cleaned.
- **Server:**
  - `advanceSave` and `applyCommand` take the other empires (`others`).
  - The ticker reads every empire once a world year and plays each against that list.
  - Orders use a list read once a world year (`server/markets.mjs`).
- **Browser:** the live players list feeds the markets, so the Trade tab and star cards show them before the server confirms.
- **News:** a sale names the market ("… sold 50 trade goods at Vega (Iron Dominion) for 1234 credits"). Only the seller hears of it; the other player's save is untouched.

## Impact
- **Core:** `PlayerMarkets.ts` (new); `Market.player`.
- **Sim:**
  - `headless.ts` takes `others`.
  - `EmpireSim` sale news names the market.
- **Server:** `simTicker.mjs`, `commands.mjs`, `markets.mjs` (new), `index.mjs`.
- **App:** `main.ts`, `PlayersSetup.ts`.
- No save format change and no new command.
