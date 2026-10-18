## ADDED Requirements

### Requirement: Slow planetary motion
In the system view, planets SHALL orbit their star and spin at one tenth of their former speeds. A
planet SHALL keep the same spin while the close-up shows it, so the close-up's day and night follow
the planet's own rotation.

#### Scenario: Orbit and spin speed
- **WHEN** the player watches a system for one minute
- **THEN** each planet turns through a tenth of the orbit and spin angles it used to

#### Scenario: Day and night on the ground
- **WHEN** the player is on a planet's surface and the planet turns
- **THEN** the sun moves across the sky at the planet's spin rate, the same as seen from orbit

### Requirement: One major city per point of population
A colony's population SHALL be the whole number `populationOf(colony)`, at least 1. The colony's
world SHALL show that many named major cities, its capital or main city first. Each major city
SHALL be lit at night and reachable by road. Smaller towns MAY stand between them as scenery. The
planet card SHALL show the population and the number of cities. The layout SHALL be deterministic.

#### Scenario: A world of nine
- **WHEN** the player's capital world has a population of 9
- **THEN** its surface shows 9 major cities with the capital first, and its card reads "Pop 9 · 9 cities"

#### Scenario: Same colony, same places
- **WHEN** the layout of the same planet and colony is computed twice
- **THEN** the cities, their names and their positions are identical

### Requirement: Roads connect settlements
Settlements on a colonised world SHALL be connected by a deterministic road network: a minimum
spanning tree plus a few extra links that shorten long detours. Roads SHALL be routed over the
terrain, avoid water where they can and bridge short straits. Settlements across open ocean are not
joined. Roads SHALL be drawn on the ground, show as faint lines from close orbit and be lit at night.

#### Scenario: A road network
- **WHEN** a colony has several settlements on one continent
- **THEN** every one of them can be reached from the main city by road

#### Scenario: Water
- **WHEN** two settlements are separated only by a short strait
- **THEN** the road crosses it as a bridge, and most of every road runs over land

### Requirement: Lights match from orbit to the ground
The system view and the close-up SHALL draw a colonised world's night lights from the same
settlements and roads, so the lights stay in the same places at every zoom level. Any colonised
world SHALL show its lights, and an uncolonised world SHALL show none. Up close, the cities and
their labels SHALL stay visible all the way down.

#### Scenario: Zooming in at night
- **WHEN** the player zooms from planet view to close orbit over the night side of a colony
- **THEN** the lights seen from orbit stay where they were and resolve into cities and roads

#### Scenario: An uncolonised world
- **WHEN** a planet has no colony
- **THEN** its night side shows no city lights

### Requirement: The background turns with the close-up camera
While the close-up drives the camera, the map drawn behind it SHALL be seen from the same viewpoint
as the close-up. The stars, the sun, other planets and orbit lines then turn with the view at every
zoom level.

#### Scenario: Orbiting in close orbit
- **WHEN** the player drags to turn the view while the close-up has taken over the camera and the
  map is still visible
- **THEN** the stars, the sun, the other planets and the orbit lines turn with the planet

### Requirement: No terrain gaps at the horizon
The baked globe and the detail patch SHALL describe the same terrain: the CPU and GPU noise SHALL
pick the same gradients whatever their rounding. Where they meet, the patch SHALL take the globe's
shape. No sky SHALL show through the ground, and no strips of terrain SHALL float above the horizon.

#### Scenario: Looking at the horizon from low altitude
- **WHEN** the player looks toward the horizon from a few kilometres up
- **THEN** the ground is continuous up to the horizon line, with no sky-coloured gaps or floating
  strips

### Requirement: The ground stays put while zooming
Terrain detail SHALL be anchored to the planet. Zooming SHALL fade detail in or out but SHALL NOT
move, rescale or reshuffle features. The detail patch SHALL use no more octaves than its grid can
sample, so resampling the grid does not make features jump.

#### Scenario: Zooming straight down
- **WHEN** the player zooms in over one spot
- **THEN** the hills and hollows seen at one altitude are in the same places at the next, with finer
  detail added

### Requirement: Closing the planet card keeps the view
Closing the planet card SHALL hide it without moving the camera: the planet stays focused, at the
same zoom, in planet view or on its surface. Focusing the planet again or using the city locator
SHALL bring the card back. Leaving planet view is a separate action ("Back to system" or Esc).

#### Scenario: Closing the card on a phone
- **WHEN** the player taps the card's close button while looking at a planet
- **THEN** the card closes and the camera stays where it was

### Requirement: City locator
While a settled planet is focused, in planet view or on its surface and with or without its card, a
city locator SHALL list the planet's major cities, capital first. Picking one SHALL fly the camera
to that city on the surface. It SHALL fit on a phone.

#### Scenario: Jumping to a city
- **WHEN** the player opens the locator and picks the fourth city
- **THEN** the camera flies down to that city

### Requirement: Buildings are found from the planet card
Every distinct building of a colony SHALL stand on its planet's surface as its own model, outside the
city where it can be seen. Each building on the planet card SHALL have a locate button that flies the
camera to it, and a thumbnail slot.

#### Scenario: Locating the temple
- **WHEN** the player presses the locate button on the Temple chip of their capital's card
- **THEN** the camera lands on the planet if needed and flies to the temple's model
