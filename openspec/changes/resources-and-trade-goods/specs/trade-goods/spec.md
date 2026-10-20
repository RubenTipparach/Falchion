## ADDED Requirements

### Requirement: Colonies make trade goods
Colonies on living worlds SHALL make trade goods each year, and a Manufactory SHALL add more.

#### Scenario: Building a Manufactory
- **WHEN** a colony finishes a Manufactory
- **THEN** the empire makes four more trade goods a year

### Requirement: Freighters sell goods at other worlds
A fleet with Bulk Freighters SHALL load goods at one of its empire's colony systems (50 per freighter, more with research) and SHALL sell them for credits at a market: another of its colonies, an alien world or another empire's world, but not where they were loaded. The price per good SHALL grow with the distance from where the goods were loaded, and foreign markets SHALL pay more than the empire's own colonies.

#### Scenario: Selling abroad
- **WHEN** a freighter loaded at home sells its goods at an alien world 30 ly away
- **THEN** the empire gains more credits than the same goods would fetch at its own colony 30 ly away

#### Scenario: No selling where goods were loaded
- **WHEN** a freighter tries to sell goods in the system it loaded them in
- **THEN** nothing is sold

### Requirement: Trade runs keep going while the player is away
A player SHALL be able to start a trade run to a market with freighters from the dock or with a freighter fleet. The fleet SHALL load at the player's colony nearest the market, sell at the market, return and repeat, every world year the server runs the empire, until the player stops it.

#### Scenario: A trade run while offline
- **WHEN** a player starts a trade run and goes offline
- **THEN** the freighters keep carrying and selling goods, and the credits are there when the player returns
