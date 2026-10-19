## ADDED Requirements

### Requirement: Landforms agree in every view
Craters, canyons, volcanoes and a locked world's basin SHALL be one function of the planet's look and seed, in a CPU copy and a GLSL copy that agree. The system view, the close-up's globe and its detail patch SHALL show the same landforms in the same places.

#### Scenario: A crater seen from orbit is there on landing
- **WHEN** the player zooms from the system view to the ground of a cratered world
- **THEN** the craters seen from orbit are where the close-up's ground dips into them

### Requirement: Airless worlds are cratered and canyoned
Barren, desert, ice, rust, diamond, dead machine and bone worlds SHALL carry craters, canyons or both. Canyon worlds SHALL be carved across most of their surface.

#### Scenario: A canyon world
- **WHEN** the player looks at a canyon world from orbit
- **THEN** canyon networks cover most of its face

### Requirement: Volcanic worlds have volcanoes
Volcanic and magma worlds SHALL have whole volcanic cones, each with a glowing caldera and lava rivers down its flanks, in every view.

#### Scenario: Volcanoes from orbit
- **WHEN** the player looks at a volcanic world in the system view
- **THEN** glowing calderas with rivers of lava stand out across it

### Requirement: Locked worlds face their star
A tidally locked (eyeball) world SHALL keep its sea basin facing its star and not spin. Its far side SHALL be frozen, in the system view, its thumbnail and the close-up.

#### Scenario: Eyeball world
- **WHEN** the player views an eyeball world
- **THEN** its open sea faces the star and the rest of it is ice

### Requirement: Patterns up close
City, dead machine, choir and bone patterns SHALL be drawn in the close-up as from orbit, with finer detail as the camera comes down. A bone world's bones and fallen trunks SHALL be visible only near the ground.

#### Scenario: Landing on a bone world
- **WHEN** the camera comes down to a bone world's ground
- **THEN** bones and dead trunks are scattered across it, small beside the terrain

### Requirement: Planet audit
`npm run planets` SHALL write a contact sheet with every planet type shown four ways: in the system view, from orbit, from mid range and close to the ground.

#### Scenario: Checking a change
- **WHEN** a planet look or shader changes
- **THEN** the sheet shows every type in all four views
