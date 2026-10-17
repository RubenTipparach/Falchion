# Spec Delta

## Purpose

Defines the realtime world clock: one tick per minute, one tick per game year.

## ADDED Requirements

### Requirement: Server-ticked world
The server SHALL advance the world one tick every 60 seconds from a fixed epoch, and each tick SHALL be one year of game time. The server SHALL publish the clock and push each tick to connected clients.

#### Scenario: Tick pushed
- **WHEN** a minute boundary passes
- **THEN** every connected client receives a tick event carrying the new tick number and the server time

### Requirement: Shared year
Clients SHALL derive the year from the same epoch and tick length as the server, correcting for clock skew when connected, so that all clients agree on the current year with or without a server.

#### Scenario: Static hosting
- **WHEN** the client runs where no Falchion server answers `/api/clock`
- **THEN** it runs the same schedule locally and shows that the clock is local

### Requirement: Travel in real time
A ship SHALL travel its speed in light years per tick; at base speed one light year takes one minute. Ships SHALL be drawn moving continuously between ticks and SHALL occupy their route hex for the current tick.

#### Scenario: Neighbouring system
- **WHEN** a speed-1 fleet is sent 8 light years
- **THEN** it arrives 8 ticks (8 minutes) later

### Requirement: Catch-up after time away
The client SHALL save the empire, and on return SHALL simulate the missed years in order, capped at the most recent week of ticks, summarising them in one dispatch. Older years beyond the cap SHALL pass without simulating the economy.

#### Scenario: Away for an afternoon
- **WHEN** a player returns after three hours
- **THEN** 180 years are resolved before play continues and one dispatch reports the income and arrivals

#### Scenario: Away for longer than the cap
- **WHEN** a player returns after more than a week
- **THEN** one week of years is simulated and the dispatch says how many years were not simulated
