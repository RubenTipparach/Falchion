# Spec Delta

## Purpose

Makes the scale of the galaxy tangible: fleets travel hex by hex and players see distance in light years and arrival time in game time.

## ADDED Requirements

### Requirement: Hex path
A fleet's route between two hexes SHALL be a contiguous path of hexes whose length equals the hex distance between them.

#### Scenario: Route length
- **WHEN** a route from A to B is computed
- **THEN** it contains distance(A,B)+1 hexes, each adjacent to the next

### Requirement: Travel time estimate
Travel time SHALL equal distance in light years divided by the fleet's speed in light years per game day, and SHALL be shown in human units (days, years).

#### Scenario: ETA display
- **WHEN** a fleet with speed 2 ly/day targets a star 730 ly away
- **THEN** the ETA shown is 365 game days (about 1 year)

### Requirement: Async progress
A moving fleet's position SHALL be derived from departure time, route and speed, so it can be computed for any game time without per-tick simulation.

#### Scenario: Position at time
- **WHEN** the fleet position is queried halfway through its travel time
- **THEN** the fleet is on the hex at the middle of its route
