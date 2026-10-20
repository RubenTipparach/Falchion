## ADDED Requirements

### Requirement: A surface zoom level below planet view
Zooming further into the focused rocky planet SHALL descend into a close-up of its surface, down to a
few kilometres above the ground, and zooming out SHALL return to planet view without a cut: the
close-up first crossfades in over the planet as the map draws it, from the same camera. The zoom
ladder SHALL show Surface above Planet. Gas giants have no surface view.

#### Scenario: Zooming into a focused planet
- **WHEN** a rocky planet is focused and the player keeps zooming in
- **THEN** the view crossfades into the close-up of that planet and continues down to its surface

#### Scenario: Zooming back out
- **WHEN** the player zooms out from the surface
- **THEN** the view rises back to orbit and blends into planet view, still following the planet

#### Scenario: Gas giants
- **WHEN** a gas giant is focused
- **THEN** the planet card offers no Land button and the zoom stops at planet view

### Requirement: Land from the planet card
The planet card of a rocky planet SHALL offer a Land button that focuses the planet if needed and
flies the camera down to its capital or main city, or, on a world with no settlement, to its best
landing site.

#### Scenario: Landing on the capital
- **WHEN** the player presses Land on their capital planet's card
- **THEN** the camera descends to the capital, which is labelled with the colony's name

### Requirement: The surface shows the game state
The close-up SHALL show the focused planet as planet view draws it (same seed, palette, sea level and
continents). The player's colony SHALL show its capital or main city named after it, one model per
building it has, and towns that grow with its size and buildings. Another empire's world SHALL show
one generic city; an unsettled world, terrain and a survey label.

#### Scenario: A colony with buildings
- **WHEN** the player lands on a colony of theirs with a Research Lab and a Hydroponic Farm
- **THEN** a lab model and a farm model stand near its city, and nothing for buildings it lacks

#### Scenario: A new building appears
- **WHEN** a building finishes on the planet being viewed
- **THEN** its model appears near the city without leaving the view

#### Scenario: An unsettled world
- **WHEN** the player lands on a planet nobody has settled
- **THEN** only terrain is drawn, with a survey label

#### Scenario: Another empire's world
- **WHEN** the player lands on the main world of a system another player or an NPC holds
- **THEN** one generic city stands on it, labelled with its owner

### Requirement: Deterministic surface layout
City, town and building sites SHALL be derived only from the planet id, its biome and the colony,
through seeded hashing (no ambient randomness or time), so the same planet always shows the same
layout. Towns SHALL stand on land, and every building in the content table SHALL have a model.

#### Scenario: Same planet, same layout
- **WHEN** the layout of the same planet and colony is computed twice
- **THEN** both are identical

#### Scenario: Towns on land
- **WHEN** a colony's towns are placed on a world with oceans
- **THEN** every town site lies above sea level

### Requirement: Clickable surface labels
The capital or city, each special building and each town SHALL carry a label drawn like the map's
other labels; clicking one SHALL fly the camera to it. Labels on the far side of the planet SHALL be
hidden.

#### Scenario: Flying to a building
- **WHEN** the player clicks the Research Lab's label
- **THEN** the camera flies to the lab and looks at it from close by

### Requirement: The surface view is cheap when unused and lighter on phones
The surface view SHALL cost nothing while it is not shown and SHALL release its GPU resources when
the player leaves it. On touch-first devices it SHALL use a smaller detail patch, fewer terrain
octaves and a lower pixel ratio, and skip the atmosphere raymarch.

#### Scenario: Leaving the surface
- **WHEN** the player zooms out past planet view or focuses another planet
- **THEN** the surface view's geometry, materials and labels are disposed

#### Scenario: On a phone
- **WHEN** the surface view opens on a touch-first device
- **THEN** it renders with the lighter settings and the map underneath is not drawn while the surface fills the screen
