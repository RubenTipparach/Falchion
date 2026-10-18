## ADDED Requirements

### Requirement: Every subject has a rendered thumbnail
Every ship class, building, resource, encounter kind and research node SHALL have a thumbnail rendered in the browser from a three.js model. A ship's thumbnail SHALL come from the game's own ship generator and a building's from the planet view's building model, so a thumbnail always matches what the game draws.

#### Scenario: A new building
- **WHEN** a building is added to the content table with its surface model
- **THEN** its thumbnail exists with no further work

#### Scenario: Research node
- **WHEN** a research node grants a chassis
- **THEN** its thumbnail shows that ship on a plinth in the node's branch colour

### Requirement: One studio, rendered lazily
Thumbnails SHALL be rendered by one offscreen renderer with a fixed camera and lights, framed by the model's bounds, and cached. A panel asking for many thumbnails SHALL get them over several frames, never all in one frame.

#### Scenario: Opening the research tree
- **WHEN** the research panel asks for every node's thumbnail
- **THEN** each image fills in as it is rendered, and a second request for one returns the cached picture at once

### Requirement: Thumbnails are checked by eye
A contact sheet of every thumbnail SHALL be produced by one command, and SHALL be looked at before a change to a model or the studio ships.

#### Scenario: Changing a prop
- **WHEN** a prop model changes
- **THEN** `npm run thumbs` writes the contact sheet and it is viewed before commit

### Requirement: Hand-made art for ships, buildings and research
Every ship class SHALL have a hand-modelled thumbnail painted in the empire's design colours, every building and the capitol a detailed thumbnail model, and every research node that does not show what it unlocks (a ship, a style, a planet) its own prop. A test SHALL fail when one is missing.

#### Scenario: Recolouring a design
- **WHEN** the player changes their design colours
- **THEN** the ship thumbnails render again in the new colours
