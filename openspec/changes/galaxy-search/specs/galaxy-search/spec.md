## ADDED Requirements

### Requirement: Galaxy search
The player SHALL search the galaxy for stars by name, kind and spectral class, and for planets by name, type and status.

Planet status SHALL be one of:
- unsurveyed;
- surveyed;
- settled;
- free.

Results SHALL be ordered nearest first from the chosen origin, the view's centre or home, with their distance.

#### Scenario: Unsurveyed ocean worlds
- **WHEN** the player searches planets of type Ocean with status Unsurveyed
- **THEN** the nearest unsurveyed ocean worlds are listed with their distance, and Go to flies to one

### Requirement: Scan outward in slices
The search SHALL walk hex rings outward from the origin. It SHALL run in time slices so the game keeps running. It SHALL stop at a result limit or radius, and it SHALL be resumable to search further. The same query and origin SHALL give the same results.

#### Scenario: Search further
- **WHEN** a search stops at its radius
- **THEN** Search further continues from the next ring without repeating earlier results
