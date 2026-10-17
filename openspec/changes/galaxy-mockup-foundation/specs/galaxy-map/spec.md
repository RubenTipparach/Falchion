# Spec Delta

## Purpose

Defines the shared, at-scale galaxy: a hex grid where each hex is one light year, stars generated deterministically from a seed, and a human-readable addressing scheme for locating systems.

## ADDED Requirements

### Requirement: One hex equals one light year
The galaxy SHALL be tiled by flat hexagons where the centre-to-centre distance between adjacent hexes is exactly 1 light year, and the distance between any two hexes SHALL be the hex-step distance in light years.

#### Scenario: Adjacent hexes
- **WHEN** the distance between a hex and any of its six neighbours is requested
- **THEN** the result is 1 light year

#### Scenario: Distance symmetry
- **WHEN** the distance from hex A to hex B and from B to A are requested
- **THEN** both results are equal

### Requirement: Galaxy scale
The galaxy SHALL be a disc approximately 70,000 light years in diameter centred on hex (0,0); hexes beyond the galaxy radius SHALL contain no stars.

#### Scenario: Outside the rim
- **WHEN** the star for a hex 36,000 ly from the centre is requested
- **THEN** no star is returned

### Requirement: Deterministic star generation
Each hex SHALL contain at most one star system, decided only from the galaxy seed and the hex coordinate, with probability following a spiral-arm density with a dense core; the full galaxy SHALL NOT need to be stored.

#### Scenario: Same seed, same star
- **WHEN** the star for the same hex is generated twice with the same galaxy seed
- **THEN** both results are identical (presence, name, spectral class, planet count)

#### Scenario: Arms are denser than gaps
- **WHEN** star counts are sampled over equal areas on a spiral arm and in an inter-arm gap at the same radius
- **THEN** the arm sample contains more stars

### Requirement: Flat galactic plane
All star systems SHALL lie on a single flat plane at the same elevation so that map distance equals travel distance.

#### Scenario: Star elevation
- **WHEN** any generated star's world position is read
- **THEN** its elevation component is 0

### Requirement: Galactic addressing
Every hex SHALL have an address made of quadrant (Alpha, Beta, Gamma, Delta by angle), radial ring (by distance from the core), and radial cell (angular subdivision of that ring), plus the hex coordinate.

#### Scenario: Address of a known hex
- **WHEN** the address of a hex at 12,000 ly from the core in the first angular quadrant is requested
- **THEN** the address names quadrant Alpha, the ring containing 12,000 ly, and a cell index within that ring

#### Scenario: Core address
- **WHEN** the address of hex (0,0) is requested
- **THEN** the address names the galactic core ring
