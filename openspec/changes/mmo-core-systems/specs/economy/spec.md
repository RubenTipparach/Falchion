# Spec Delta

## Purpose

Defines how empires earn and spend resources through planets, trade, religion and politics.

## ADDED Requirements

### Requirement: Planet production
Colonised planets SHALL produce resources per game day according to biome and development.

#### Scenario: Daily yield
- **WHEN** one game day passes
- **THEN** each colony adds its yield to the empire stockpile

### Requirement: Trade routes
Players SHALL be able to establish trade routes between systems, including with other players, yielding income that decreases with distance in light years.

#### Scenario: Distance falloff
- **WHEN** two routes of different length carry the same goods
- **THEN** the longer route yields less per day

### Requirement: Religion and politics income
Religion and political systems SHALL be income sources that can spread to other civilisations' planets and generate influence and resources.

#### Scenario: Spread
- **WHEN** a religion is adopted on an alien planet
- **THEN** the founding empire gains influence income from it
