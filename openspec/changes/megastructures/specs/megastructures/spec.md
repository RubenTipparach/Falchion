## ADDED Requirements

### Requirement: A few hundred megastructures
The galaxy SHALL hold fewer than three hundred megastructures of eleven types, placed from the galaxy seed so everyone sees the same ones. Each SHALL stand round a star that can host its type, on a star that never had planets. Sites SHALL keep apart from each other and clear of where empires start.

#### Scenario: Same galaxy, same structures
- **WHEN** two players load the same galaxy
- **THEN** the same megastructures stand round the same stars

### Requirement: Nothing but the star and the structure
A megastructure system SHALL hold its star and the structure and nothing else: no planets, no asteroid fields and no comets. The structure SHALL be the system's one world. It can be surveyed for a one-time cache and science, and SHALL never be settled or landed on.

#### Scenario: Visiting a ringworld
- **WHEN** the player opens a ringworld's system
- **THEN** the system view shows the star and the ring, its card offers a survey, and there is nothing to mine or settle

### Requirement: Seen across the galaxy
Each megastructure SHALL be marked on the galaxy map in its type's colour and named when zoomed in. Clicking it SHALL open it. Search SHALL find megastructures by type at any distance, nearest first.

#### Scenario: Finding the nearest Dyson sphere
- **WHEN** the player searches for Dyson spheres
- **THEN** every Dyson sphere is listed, nearest first, and Go to flies to it
