# Spec Delta

## Purpose

Defines how the async, at-scale world switches to a synchronised lockstep turn system when players actually meet, and back again.

## ADDED Requirements

### Requirement: Async by default
Player actions SHALL be scheduled in game time and resolved asynchronously; players SHALL NOT need to be online at the same time.

#### Scenario: Offline arrival
- **WHEN** a fleet arrives while its owner is offline
- **THEN** arrival is resolved and reported when the owner next connects

### Requirement: Lockstep zone on contact
When fleets of two or more players come within the encounter radius, the server SHALL open a lockstep zone where time advances in discrete turns only after all participants submit orders or a turn timer expires.

#### Scenario: Contact
- **WHEN** two players' fleets come within the encounter radius
- **THEN** a lockstep zone opens and both players are notified

#### Scenario: Turn timeout
- **WHEN** a participant does not submit orders before the turn timer
- **THEN** their fleets hold position and the turn resolves

### Requirement: Lockstep precedence
Inside a lockstep zone, lockstep turns SHALL take precedence over async scheduling for every entity in the zone; the zone SHALL close when no two players remain within the radius.

#### Scenario: Zone closes
- **WHEN** fleets separate beyond the radius
- **THEN** the zone closes and entities resume async time
