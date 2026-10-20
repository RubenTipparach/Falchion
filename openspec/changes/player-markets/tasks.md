## 1. Rules
- [x] 1.1 `PlayerMarkets.ts`: other players' worlds as `player` markets (validated, deterministic, self excluded)
- [x] 1.2 Sale news names the market (seller only)

## 2. Server
- [x] 2.1 `advanceSave` / `applyCommand` take `others`
- [x] 2.2 The ticker reads every empire once a year and passes the list
- [x] 2.3 Orders read the other empires once a world year (`oncePerTick`)

## 3. Browser
- [x] 3.1 The live players list feeds `SimDeps.markets` (Trade tab, star cards)

## 4. Checks
- [x] 4.1 Tests: market list, a trade run to another player's colony sells at the `player` price, the ticker and orders pass the others, the per-tick read
