# Spec Delta

## Purpose

Makes the scale of the galaxy tangible in a turn-based game: fleets travel hex by hex, a whole number of light years per turn, and players see distance in light years and arrival time in turns.

## ADDED Requirements

### Requirement: Turn-based time
Game time SHALL advance only in discrete turns; nothing on the map moves between turns.

#### Scenario: No real-time drift
- **WHEN** the player does not end the turn
- **THEN** no fleet changes hex, regardless of how much real time passes

#### Scenario: End turn
- **WHEN** the player ends the turn
- **THEN** the turn counter increases by one and every moving fleet advances

### Requirement: Hex path
A fleet's route between two hexes SHALL be a contiguous path of hexes whose length equals the hex distance between them.

#### Scenario: Route length
- **WHEN** a route from A to B is computed
- **THEN** it contains distance(A,B)+1 hexes, each adjacent to the next

### Requirement: Movement per turn
A fleet SHALL advance exactly its speed, a whole number of hexes (light years), along its route each turn, stopping at the destination.

#### Scenario: One turn of movement
- **WHEN** a turn ends for a fleet with speed 2 that has not arrived
- **THEN** it is 2 hexes further along its route (or at the destination if closer)

### Requirement: Travel time in turns
Travel time SHALL be the distance in light years divided by speed in light years per turn, rounded up to whole turns, and SHALL be shown in turns.

#### Scenario: ETA display
- **WHEN** a fleet with speed 2 ly/turn targets a star 730 ly away
- **THEN** the ETA shown is 365 turns

### Requirement: Derived position
A fleet's position SHALL be derived from its departure turn, route and speed, so it can be computed for any turn without simulating each turn.

#### Scenario: Position at a turn
- **WHEN** the position of a fleet with speed 4 is queried 2 turns after departure
- **THEN** it is on the 9th hex of its route (index 8)

### Requirement: Straight-line presentation
A moving fleet SHALL be drawn on the straight line from its origin to its destination with a constant heading, gliding to its new position when a turn ends.

#### Scenario: No wobble
- **WHEN** a fleet moves along a route whose hexes zigzag
- **THEN** the ship is drawn moving along a straight line and does not change heading
