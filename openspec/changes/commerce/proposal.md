## Why
The economy is run by hand: each freighter, miner and colony ship needs orders, and trade goods can
only be sold by carrying them. The owner wants a market economy that runs on its own:
- an exchange for resources, which costs more than shipping;
- tariffs;
- civilian ships that form companies which grow when they make money;
- a stock market in those companies;
- colony ships that are reused instead of used up.

## What Changes
- **Exchanges.** Every empire you have met (an NPC faction you know, or a player you have had first contact with) runs an exchange.
  - **What it trades:** food, trade goods, metals, gases and crystals, for credits, at once, with no ship.
  - **How prices are set:** each exchange's price for a resource comes from a base price, the exchange's own taste (cheap where its worlds make it) and a slow drift over the years.
  - **Spread:** buying costs 10% above that price and selling pays 10% below it.
  - **Tariff:** the owner's tariff is added on top of the spread.
  - **Your own trading moves your prices:** buying a lot raises your price there, selling lowers it, and the effect fades over the years.
  - **Shipping vs. exchange:** the Trade tab shows what freighters would get for the same goods.
- **Tariffs.** You set a tariff (0–50%) that other players pay when they trade on your exchange or sell goods at your worlds.
  - It can be set per player.
  - Their tariff payments reach you through the shared world.
  - NPC factions charge their own tariffs, lower the better you stand with them.
- **Companies.** A freighter, mining ship or colony ark built with "charter a company" (the default) founds a company that owns that ship as its own fleet and runs it.
  - **Ownership:** the state keeps 60 of its 100 shares and floats the rest, getting 40% of the ship's value back.
  - **Trading companies** buy trade goods from the state and sell them on the best route they know.
  - **Mining companies** mine on their own and sell their ore to the state at a contract price.
  - **Colony companies** settle the best surveyed worlds nearby for a settlement fee.
  - **Yearly accounts:** each year a company pays its ships' upkeep and 15% corporate tax to the state. It pays out half of what is left as dividends and keeps the rest.
  - **Growth:** with a profitable record (its last ten years add up to a profit) and enough in the bank, it buys another ship, up to eight.
  - **Bankruptcy:** a company that loses its last ship and cannot buy another is wound up.
  - **Control:** company ships are not the state's (no state upkeep, no orders), and their fleets show who runs them.
- **Stock market.** You can buy and sell shares (2% fee):
  - **Your own companies:** from their float.
  - **Other players' companies:** from their float, once you have met them. Dividends reach you through the shared world.
  - **NPC corporations:** two per faction you know, whose prices rise and fall over the years and which pay a steady dividend.
- **Colony arks are not used up.** An ark carries one colony's worth of colonists.
  - **Settling:** it takes the colonists and all of that ark's supply.
  - **Reloading:** the ark must return to a friendly system to resupply and load colonists from a colony of yours with population 2 or more (that colony loses one).
  - **Loading on departure:** arks leaving the dock take colonists from the capital.
  - **Old saves:** arks already in flight in old saves are given colonists.

## Impact
- **Core:**
  - `src/core/economy/Exchange.ts` (prices, quotes, pressure);
  - `Companies.ts` (company year, share price, growth);
  - `Corporations.ts` (NPC corporations);
  - `src/content/commerce.ts` (base prices, rates, names).
  - `resolveTurn` takes transfers (company dividends and taxes, NPC dividends, payouts) and pays mining contracts.
- **Shared world:**
  - `stakes`: other players' shares in a player's companies.
  - `payouts`: tariffs and dividends owed to a player.
  - New effects: `stake`, `payout`, `claim`.
- **Sim:**
  - **New commands:** `buyResource`, `sellResource`, `setTariff`, `buyShares`, `sellShares`, `embark`.
  - **Changed commands:** `buildShip` takes `charter`.
  - **Company automation** in the year.
  - **Ark rework:** `Loadout.colonists`.
  - **Save:** a new saved field, `commerce`.
- **Public view:** each empire publishes its companies and tariffs; `server/index.mjs` `publicView` cleans them.
- **UI:**
  - Trade tab: the exchange, the shipping comparison and tariffs.
  - A new Companies tab: your companies and the stock market.
  - Shipyard: a "Charter a company" toggle.
  - Fleets: company fleets are read-only.
  - The resource ledger shows a Companies group.
