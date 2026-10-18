## ADDED Requirements

### Requirement: Ship liveries
A ship design SHALL have a livery from the livery table, Plain when none is set. A livery other than Plain SHALL paint part of the hull in the design's secondary colour, with accent trim where the scheme has it. The pattern SHALL be laid in the ship's own frame, scaled to its hull's bounds.

#### Scenario: Racing stripes
- **WHEN** a design has the Racing stripes livery
- **THEN** two stripes in the secondary colour run the length of its hull, whatever the style

### Requirement: Livery in the design
The livery SHALL be part of the design: kept by `setDesign`, saved, and carried by the share code. An unknown livery SHALL be read as Plain. A share code without a livery SHALL still load.

#### Scenario: Old share code
- **WHEN** a share code made before liveries is loaded
- **THEN** the design loads with the Plain livery

### Requirement: Faction liveries
Each NPC faction's ships SHALL wear that faction's livery.

#### Scenario: Meeting a faction
- **WHEN** a player sees an NPC fleet
- **THEN** its ships wear the faction's colours and livery
