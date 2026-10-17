# Spec Delta

## Purpose

Lets players meet, fight each other (PvP is on), trade and cooperate against alien threats.

## ADDED Requirements

### Requirement: Player-versus-player combat
Players SHALL be able to attack other players' fleets and planets with ships on station at the same location, using the same deterministic combat resolution as alien targets.

#### Scenario: Attack another player's fleet
- **WHEN** a player's warships on station at a star engage another player's fleet there
- **THEN** the battle resolves deterministically and both sides take losses

### Requirement: Diplomacy on contact
When players meet they SHALL be able to exchange greetings, trade resources and share star charts.

#### Scenario: Share charts
- **WHEN** two players agree to share star charts
- **THEN** each receives the other's explored hexes

### Requirement: Co-operative alien attacks
Multiple players' fleets SHALL be able to join the same battle against an alien target, with rewards split by contribution.

#### Scenario: Shared reward
- **WHEN** two players defeat an alien fleet together
- **THEN** each receives loot proportional to damage contributed
