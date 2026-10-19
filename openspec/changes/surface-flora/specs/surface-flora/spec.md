## ADDED Requirements

### Requirement: Every surface has its own flora and props
Each planet type with a surface SHALL show its own props on the ground in the surface view:
- **living worlds:** trees in groves and grass;
- **swamps:** swamp trees and reeds;
- **rocky worlds:** boulders and stones;
- **bone worlds:** bones, ribcages and dead trees;
- **city worlds:** city blocks;
- **other types:** their own set.

Gas giants and megastructures SHALL have none.

#### Scenario: Landing in a jungle
- **WHEN** the camera comes down to a jungle world's ground
- **THEN** jungle trees, palms, ferns and grass cover it

### Requirement: Props stand on the ground, the same for everyone
Props SHALL stand on the ground exactly as it is drawn, at every level of detail. They SHALL be placed from the planet and a fixed grid, so the same props stand in the same places on every visit and for every player.

Props SHALL keep out of:
- water, except plants that grow in the shallows;
- cities.

Living props SHALL also keep out of:
- ice caps;
- snowy peaks;
- a locked world's frozen side.

#### Scenario: Coming back to a grove
- **WHEN** the player leaves a forest and comes back to it
- **THEN** the same trees stand in the same places

### Requirement: Props come with the zoom
Large props SHALL appear as the camera comes within about a tenth of a radius, and small props near the ground. Props SHALL grow in rather than pop.

#### Scenario: Descending to a meadow
- **WHEN** the camera descends toward a terran world's plains
- **THEN** groves appear first, then grass and stones as the ground nears
