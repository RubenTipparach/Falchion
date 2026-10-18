## ADDED Requirements

### Requirement: Exchanges of met empires
Every NPC faction the player knows and every player they have met SHALL run an exchange where food, trade goods, metals, gases and crystals are bought and sold for credits at once. Prices SHALL be deterministic from the exchange, the resource and the year. Buying SHALL cost 10% above the price and selling pay 10% below it, plus the owner's tariff.

#### Scenario: A stranger's exchange
- **WHEN** the player has not met an empire
- **THEN** its exchange is not offered

#### Scenario: Selling metals
- **WHEN** the player sells 100 metals on a known faction's exchange
- **THEN** they receive 100 × price × 0.9 × (1 − the faction's tariff) credits, rounded, and lose 100 metals

### Requirement: Market pressure
The player's own trades SHALL move their price on that exchange: buying raises it and selling lowers it in proportion to the amount, and the effect SHALL fade a little every year.

#### Scenario: A big purchase
- **WHEN** the player buys 500 crystals on one exchange
- **THEN** the next purchase there costs more per crystal than the first did

### Requirement: Shipping versus exchange
The Trade tab SHALL show, for trade goods on each exchange, what the exchange pays and what a freighter run from the nearest colony to that empire's nearest world would pay, with the years it takes.

#### Scenario: Comparing
- **WHEN** the player looks at a faction's exchange
- **THEN** the exchange price per good and the freighter price per good are shown side by side

### Requirement: Tariffs
The player SHALL set a tariff from 0 to 50%, and a different one for any player. Other players SHALL pay it when they trade on the player's exchange or sell goods at the player's worlds, and the tariff SHALL reach the player through the shared world. NPC factions SHALL charge tariffs that fall as the player's standing with them rises.

#### Scenario: A foreign freighter
- **WHEN** another player sells goods at the player's world with a 20% tariff
- **THEN** the seller receives 20% less and the player receives that 20% the next year

### Requirement: Chartered companies
Building a freighter, mining ship or colony ark with charter on (the default) SHALL found a company owning that ship as its fleet. The state SHALL hold 60 of 100 shares and receive 40% of the ship's value. Company ships SHALL not be in the state's roster, cost the state no upkeep, and take no player orders.

#### Scenario: Chartering a freighter
- **WHEN** a Bulk Freighter built with charter on is launched
- **THEN** a trading company with a one-freighter fleet exists and the state holds 60 shares

### Requirement: Companies at work
Companies SHALL run their fleets each year:
- a trading company buys trade goods from the state and sells them on the best route it knows;
- a mining company mines on its own and is paid a contract price by the state for its ore;
- a colony company settles the best surveyed world in reach for a settlement fee.

#### Scenario: A mining contract
- **WHEN** a mining company's ships mine 9 metals in a year
- **THEN** the state's metals rise by 9 and it pays the company the contract price for them

### Requirement: Company accounts
Each year a company SHALL pay its ships' upkeep and 15% tax on profit to the state, pay half of the rest as dividends per share, and keep the remainder. A company at least three years old whose last ten years add up to a profit, with enough credits, SHALL buy another ship of its kind, up to eight. A company with no ships that cannot buy one SHALL be wound up.

#### Scenario: Growth
- **WHEN** a trading company's last ten years add up to a profit and it holds more than a freighter's value
- **THEN** it buys a freighter and its fleet grows by one

### Requirement: Stock market
The player SHALL be able to buy and sell shares, paying a 2% fee:
- of their own companies, from the float;
- of companies of players they have met;
- of the NPC corporations of factions they know.

Shares of another player's companies SHALL be recorded in the shared world, and that player's companies SHALL pay those holders' dividends through it.

#### Scenario: Buying another player's shares
- **WHEN** the player buys 10 shares of another player's company
- **THEN** they pay 10 × price × 1.02 and receive that company's dividends on 10 shares each year after

### Requirement: Reusable colony arks
A colony ark SHALL NOT be used up by settling. Each ark SHALL carry one colony's worth of colonists. Settling SHALL take them and all of that ark's supply. An ark SHALL load colonists only at a system with a colony of population 2 or more, which loses one.

#### Scenario: Settling and reloading
- **WHEN** an ark settles a planet
- **THEN** the ark remains, empty and out of supply, and must load colonists at a populated colony before it can settle again

### Requirement: Colonist floors
The player SHALL set the population a colony must have before an ark takes one of its people: one floor for the empire (at least 2, default 2) and, optionally, a different floor for any colony. Every ark, the player's or a colony company's, SHALL load colonists only from colonies at or above their floor.

#### Scenario: A floor of four
- **WHEN** the empire's floor is 4 and the capital has population 3
- **THEN** an ark leaving the dock takes no colonists from it
