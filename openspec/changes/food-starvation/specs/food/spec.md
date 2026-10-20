## ADDED Requirements

### Requirement: The most populous worlds starve first
When the empire's food stores plus a year's food cannot feed every world, the shortfall SHALL fall on the worlds with the most population first, each taking up to what it eats. A world that goes hungry SHALL not grow that year, and SHALL lose a point of population once its shortfall reaches twice its population.

#### Scenario: A shortfall the size of the biggest world's appetite
- **WHEN** two worlds of population 4 and 2 eat 12 food and the stores hold only 4
- **THEN** the world of 4 goes without 8 and falls to 3, and the world of 2 is fed

### Requirement: The resource ledger totals a resource
The ledger SHALL show each world's or source's net (income less costs) when there is more than one, and a total line adding income, costs and adjustments. For food, it SHALL warn when the stores run dry this year.

#### Scenario: Opening the food ledger with a deficit
- **WHEN** the player opens the food ledger and food made is less than food eaten plus stores
- **THEN** it lists the net of each world, a total, and a warning that the most populous worlds go hungry first
