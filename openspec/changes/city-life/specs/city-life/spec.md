## ADDED Requirements

### Requirement: Cities are alive
A settled world's cities SHALL show:
- cars moving in lanes on their streets, avenues and ring roads, lit at night;
- flying cars in sky lanes above them;
- shuttles rising from the city toward its orbital shipyard;
- people walking the pavements;
- street lamps along the streets.

All of it SHALL move on the GPU, and nothing smaller than half a pixel SHALL be drawn.

#### Scenario: A capital at night, close up
- **WHEN** the camera is near a capital's streets on its night side
- **THEN** cars show headlights and tail lights in their lanes, the lamps light pools on the street, and people walk the pavements

#### Scenario: From orbit
- **WHEN** the camera is far above the city
- **THEN** no car, person or lamp too small to see is drawn

### Requirement: A city world reaches the horizon
A city world's close-up SHALL draw towers out to about half a planet radius, with sky traffic in lanes between them. Its streets SHALL be laid out in districts, fractal blocks, circular plazas and diagonal boulevards.

#### Scenario: Looking across a city world
- **WHEN** the camera is a few hundred kilometres above a city world
- **THEN** towers stand to the horizon, not in a patch round the point looked at
