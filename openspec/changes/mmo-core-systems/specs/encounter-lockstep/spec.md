# Spec Delta

## Purpose

Defines how the turn-based, asynchronous, at-scale world switches to synchronised lockstep turns when players actually meet, and back again.

## ADDED Requirements

### Requirement: Asynchronous turns by default
The world SHALL advance in turns on a server schedule; players submit orders whenever they are online, and a world turn SHALL resolve without waiting for players outside a lockstep zone.

#### Scenario: Offline arrival
- **WHEN** a world turn resolves a fleet's arrival while its owner is offline
- **THEN** the arrival is applied and reported when the owner next connects

### Requirement: Lockstep zone on contact
When fleets of two or more players come within the encounter radius, the server SHALL open a lockstep zone where time advances in discrete turns only after all participants submit orders or a turn timer expires.

#### Scenario: Contact
- **WHEN** two players' fleets come within the encounter radius
- **THEN** a lockstep zone opens and both players are notified

#### Scenario: Turn timeout
- **WHEN** a participant does not submit orders before the turn timer
- **THEN** their fleets hold position and the turn resolves

### Requirement: Lockstep precedence
Inside a lockstep zone, lockstep turns SHALL take precedence over the scheduled world turn for every entity in the zone; the zone SHALL close when no two players remain within the radius.

#### Scenario: Zone closes
- **WHEN** fleets separate beyond the radius
- **THEN** the zone closes and entities resume scheduled world turns
