## ADDED Requirements

### Requirement: Resource ledger
Clicking a resource in the top bar SHALL show where its yearly income comes from and where its costs go, grouped by source (colonies, mining, government and policies, religion, upkeep), with the stability, famine and storage adjustments. The entries SHALL be recorded by the yearly economy itself, so they always add up to the year's change.

#### Scenario: Credits
- **WHEN** the player clicks Credits
- **THEN** it lists each colony's credits (world, capital, buildings), policies, and fleet upkeep by ship class as costs, and the net per year

### Requirement: Recent spending
Commands that change the stockpile outside the yearly economy SHALL be recorded with what caused them, and the ledger SHALL list the recent ones for the clicked resource.

#### Scenario: Building a ship
- **WHEN** the player builds a Lancer
- **THEN** the credits, metals and crystals ledgers each show the amount it cost, named for the Lancer
