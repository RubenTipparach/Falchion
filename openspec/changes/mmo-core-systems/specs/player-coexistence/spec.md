# Spec Delta

## Purpose

Lets players meet peacefully and cooperate against alien threats in the first, PvE-only iteration.

## ADDED Requirements

### Requirement: No player-versus-player damage
Players SHALL NOT be able to attack, bombard, capture or damage other players' ships or planets.

#### Scenario: Attack order rejected
- **WHEN** a player orders an attack on another player's fleet
- **THEN** the order is rejected

### Requirement: Peaceful contact
When players meet they SHALL be able to exchange greetings, trade resources and share star charts.

#### Scenario: Share charts
- **WHEN** two players agree to share star charts
- **THEN** each receives the other's explored hexes

### Requirement: Co-operative alien attacks
Multiple players' fleets SHALL be able to join the same battle against an alien target, with rewards split by contribution.

#### Scenario: Shared reward
- **WHEN** two players defeat an alien fleet together
- **THEN** each receives loot proportional to damage contributed
