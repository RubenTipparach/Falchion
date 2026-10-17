## ADDED Requirements

### Requirement: Worlds have a population
Every colony SHALL have a whole-number population of at least 1. A newly colonised or captured world SHALL start at 1, and a new empire's capital at 3. Each point of population SHALL eat 2 food a year.

#### Scenario: A new colony
- **WHEN** a colony ship settles a planet
- **THEN** the colony has population 1 and eats 2 food a year

### Requirement: Growth needs the world's own food surplus
A world SHALL grow only from its own food surplus (what it produces minus what its population eats). The surplus builds its growth progress, and the world SHALL gain 1 population when that progress reaches 10 × its population. Food from other worlds SHALL NOT make it grow. A world SHALL NOT exceed 3 × its planet size.

#### Scenario: Farm world
- **WHEN** a world produces 4 food more than it eats each year
- **THEN** a world of population 1 reaches population 2 after 3 years

#### Scenario: Fed from stores
- **WHEN** a world eats more than it produces and the empire's stores cover the difference
- **THEN** its population neither grows nor declines

### Requirement: Uncovered shortages shrink a world
When the empire's food stores cannot cover a world's shortfall, the uncovered part SHALL be taken from that world's growth progress. When the progress falls to −5 × its population, the world SHALL lose 1 population, never going below 1.

#### Scenario: Starving world
- **WHEN** a world has population 3, eats 6 food a year more than it produces, and the empire has no food left
- **THEN** it loses 1 population within 3 years

### Requirement: Population is shown
The planet card SHALL show a colony's population, its own food balance and its growth progress. The yearly report SHALL say when a world grows or declines.

#### Scenario: Growing world
- **WHEN** a player looks at a colony with a food surplus
- **THEN** the planet card shows its population, its positive food balance and how close it is to the next population
