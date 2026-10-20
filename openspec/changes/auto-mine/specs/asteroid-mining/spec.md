## ADDED Requirements

### Requirement: Auto-mine standing order
Fleets with mining ships SHALL offer an Auto-mine standing order, given as a validated command the server applies. Each world year, a fleet on station with the order whose miners have nothing left to mine where they are SHALL move to the nearest system within 80 ly with a field of their resource that has enough left, preferring more left at equal distance, deterministically. Fleets in transit SHALL be left alone.

#### Scenario: Field mined dry
- **WHEN** an auto-mining fleet's field is mined below the threshold, by it or by another empire
- **THEN** it heads for the nearest system in reach with that resource left, and the empire is told where it went

#### Scenario: Field still holds rocks
- **WHEN** an auto-mining fleet's field still has enough left
- **THEN** the fleet stays and keeps mining

#### Scenario: Same answer everywhere
- **WHEN** the browser and the server play the same year for the same empire on the same shared world
- **THEN** they send the fleet to the same system

#### Scenario: Order shown only for miners
- **WHEN** a fleet has no mining ships
- **THEN** its card shows no Auto-mine order, and the order does nothing if set

#### Scenario: Older orders
- **WHEN** a save or browser gives orders without the auto-mine flag
- **THEN** the order reads as off and the fleet's trade run and other orders are kept
