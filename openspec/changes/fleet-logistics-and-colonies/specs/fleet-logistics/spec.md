# Spec Delta

## Purpose

Defines how ships carry supply and ammunition and where they can act.

## ADDED Requirements

### Requirement: Supply for exploration
Every ship SHALL carry supply. Exploring a planet SHALL spend supply (1 plus half the planet size, rounded down) from a group of ships on station in that planet's system, and SHALL be refused when no group there has enough.

#### Scenario: Out of supply
- **WHEN** the only fleet in a system has less supply than a planet costs
- **THEN** the planet cannot be explored until the fleet resupplies or another ship arrives

#### Scenario: Survey hulls
- **WHEN** a fleet of Survey Cutters and a fleet of warships of equal size each start with full supply
- **THEN** the Survey Cutters can explore several times as many planets

### Requirement: Ammunition for combat
Armed ships SHALL carry ammunition. A battle SHALL spend the strike group's ammunition, and damage SHALL scale with the share of the needed ammunition on hand, down to 15% with empty magazines.

#### Scenario: Low ammunition
- **WHEN** a strike group fights with half the ammunition it needs
- **THEN** it deals half damage

### Requirement: Resupply
A fleet on station in a friendly system (own territory, a colony system, or a supply depot) SHALL refill supply and ammunition fully each turn. Elsewhere, ammunition SHALL regenerate slowly and supply SHALL not.

#### Scenario: Return home
- **WHEN** a fleet with empty stores returns home and a turn ends
- **THEN** its supply and ammunition are full

### Requirement: Presence
Exploration, combat, settling and construction SHALL require ships on station at that location. Mining ships SHALL only mine minerals present where they are. Missionaries and spy networks SHALL only operate while a ship is inside the target empire's territory.

#### Scenario: Spy network without a ship
- **WHEN** a spy network targets an empire with none of the player's ships in its territory
- **THEN** it steals nothing that turn and the turn report says why

### Requirement: Losses take stores with them
When a group loses ships, its remaining supply and ammunition SHALL shrink in proportion to the capacity lost; ships added to a group SHALL arrive fully stocked.

#### Scenario: Heavy losses
- **WHEN** a group loses half its ammunition capacity in a battle
- **THEN** its remaining ammunition is halved as well
