## ADDED Requirements

### Requirement: A planet looks the same at every distance
The system-view planet and its close-up SHALL draw clouds, haze, storms, lightning and auroras with the same shared code, inputs and clock, so zooming in neither changes their pattern nor removes them.

#### Scenario: Zooming into an aurora world
- **WHEN** the player zooms from the system view down to an aurora world's surface
- **THEN** the cloud pattern stays the same and the aurora curtains stay visible round the poles

### Requirement: Asteroid fields are visible
Every asteroid field SHALL be drawn in its system's view as a belt whose look shows its resource, and whose density shows how much is left.

#### Scenario: A mined-out field
- **WHEN** a field has been mined down
- **THEN** its belt is thinner, and it fills back in as the field refills
