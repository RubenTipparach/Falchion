## ADDED Requirements

### Requirement: Other players' worlds are markets for trade goods
Every other player's home and colony systems SHALL be markets of kind `player`, named after the star and the empire, and SHALL pay the `player` price. A player's own worlds SHALL NOT be another player's market. Other players' views SHALL be treated as untrusted: invalid hexes are ignored and names cleaned of markup.

#### Scenario: Selling at another player's colony
- **WHEN** a player's freighters on a trade run reach another player's colony system
- **THEN** they sell their goods there at the `player` price

#### Scenario: A hostile empire name
- **WHEN** another player's empire name contains markup
- **THEN** the market's name shows it as plain text without angle brackets

### Requirement: The browser and the server agree on the markets
The server SHALL play every empire's year and apply every order against the other empires' public views, and the browser SHALL build the same markets from the live players list, so a trade run the browser shows is one the server accepts. The server SHALL read the other empires at most once per world year for orders.

#### Scenario: Starting a run before the server confirms
- **WHEN** a player starts a trade run to another player's colony from the Trade tab
- **THEN** the run starts at once in the browser and the server accepts the same order

#### Scenario: The yearly tick
- **WHEN** the server plays a world year
- **THEN** each empire plays against one list of the other empires read once that year

### Requirement: Only the seller hears of a sale
A sale at another player's world SHALL add a dispatch for the seller naming the market and the credits earned, and SHALL NOT change the other player's save.

#### Scenario: News of a sale
- **WHEN** a freighter sells at another player's world
- **THEN** the seller's dispatches name the star and that empire, and the other player's save is unchanged
