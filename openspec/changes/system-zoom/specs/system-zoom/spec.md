## ADDED Requirements

### Requirement: Free zoom inside a star system
When a star system is drawn and the point under the cursor (or pinch) is within that system, zooming in SHALL go toward that point and SHALL NOT pull the view back to the star. From further out, zooming in near a star SHALL still bring the view onto it.

#### Scenario: Zooming toward a planet
- **WHEN** the home system is in view and the player zooms in over a planet away from the star
- **THEN** the view closes in on that planet, and the star moves off centre
