## ADDED Requirements

### Requirement: No ammunition
Fleets SHALL carry supply only. Battles, raids and planetary assaults SHALL be fought at full firepower, whatever the fleet has done before.

#### Scenario: A long battle
- **WHEN** a long-range fleet fights its fifth round in a row
- **THEN** it fires with the same strength as in its first round

### Requirement: Damage carries over
A fleet SHALL keep the damage its ships took, per ship class, from one round, battle or raid to the next. Each fight SHALL start from that damage. A ship SHALL be destroyed when its damage reaches its hull.

#### Scenario: Battered fleet
- **WHEN** a fleet survives a round with damage on its lancers
- **THEN** the next round starts with that damage, and a smaller blow destroys them

### Requirement: Menders repair
Menders SHALL heal damage on their fleet after each round of a battle and every year, wherever the fleet is.

#### Scenario: Mender between rounds
- **WHEN** a fleet with a Mender ends a round with damaged ships
- **THEN** it starts the next round with less damage

### Requirement: Repair in friendly systems
A fleet on station in a friendly system SHALL repair every year:
- fully at a colony with an Orbital Shipyard;
- 40 hull points per ship class at another colony;
- 15 at a supply depot or an ally's colony.

#### Scenario: Repair at an outpost
- **WHEN** a damaged fleet is on station at a supply depot
- **THEN** it repairs, more slowly than at a shipyard world
