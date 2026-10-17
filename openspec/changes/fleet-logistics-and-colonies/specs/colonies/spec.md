# Spec Delta

## Purpose

Defines colonies as planets the player develops with buildings.

## ADDED Requirements

### Requirement: Building slots
Each colony SHALL have building slots equal to its planet size plus one (the capital two more). Buildings SHALL cost resources and add output: farms add food, mines multiply the planet's mineral yields, trade hubs add credits, labs add science, temples add faith and influence, shipyards allow ship construction. A shipyard SHALL be unique per planet.

#### Scenario: Slots full
- **WHEN** every slot on a colony is used
- **THEN** no further building can be placed there

### Requirement: Food
Every colony SHALL eat food each turn. When the stockpile plus the turn's food income would go below zero, the empire SHALL suffer famine and positive output SHALL be cut.

#### Scenario: Famine
- **WHEN** an empire with no food and no farms ends a turn
- **THEN** the turn report announces famine and income is reduced

### Requirement: Shipyards
Ships SHALL be built at a colony with a shipyard. A ship built at home SHALL join the home dock; a ship built elsewhere SHALL join a group on station in that system.

#### Scenario: Remote yard
- **WHEN** a ship is built at a colony shipyard outside the home system
- **THEN** it appears in a fleet in that colony's system

### Requirement: Settling
A Colony Ark on station SHALL settle an explored, unsettled, non-gas-giant planet in its system, consuming the ark and founding a colony with no buildings.

#### Scenario: Settle
- **WHEN** a fleet carrying a Colony Ark is on station at an explored planet
- **THEN** the player can settle it and it appears among their colonies

### Requirement: Supply depots
A Construction Tender on station in a non-friendly system SHALL build a supply depot for a resource cost, consuming the tender and making the system friendly for resupply.

#### Scenario: Forward depot
- **WHEN** a depot is built at a frontier star
- **THEN** fleets on station there refill supply and ammunition each turn

### Requirement: Exploration caches
A successfully explored planet that is not a colony SHALL hold a one-time resource cache, deterministic per planet, which the player gathers with a Collect resources action.

#### Scenario: Collect once
- **WHEN** the player collects a system's resources twice
- **THEN** the second collection yields nothing from the same planets
