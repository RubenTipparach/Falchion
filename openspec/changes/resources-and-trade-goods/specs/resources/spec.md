## ADDED Requirements

### Requirement: Three raw materials, food, money and trade goods
The empire SHALL hold three raw materials (metals, gases, crystals), food, credits, influence, faith and trade goods. Ships, buildings and research SHALL cost only these. Mining ships SHALL each mine one raw material, and specialist hulls SHALL mine faster than the basic Prospector.

#### Scenario: Reading the stockpile
- **WHEN** a player looks at the top bar
- **THEN** it shows credits, influence, food, trade goods, metals, gases and crystals

### Requirement: Old saves keep their wealth
A save from before the three raw materials SHALL be converted when loaded, in the browser and on the server: volatiles and ice SHALL become gases, and rare earths, exotics (×2) and dark matter (×4) SHALL become crystals. Abstract trade routes SHALL be dropped. Converting an up-to-date save SHALL change nothing.

#### Scenario: An old empire signs in
- **WHEN** a player whose save holds volatiles and rare earths signs in
- **THEN** those amounts appear as gases and crystals, and nothing is lost
