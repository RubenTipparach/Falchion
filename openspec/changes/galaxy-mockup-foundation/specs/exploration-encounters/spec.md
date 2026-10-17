# Spec Delta

## Purpose

Exploring planets yields risky encounters (trade, battle, relations, anomalies) that resolve deterministically and reward loot crates of cards.

## ADDED Requirements

### Requirement: Deterministic encounters
Visiting an unexplored planet SHALL produce an encounter of a kind (trade, battle, relations, anomaly, derelict) and outcome determined only by the galaxy seed, the planet, and the exploring empire's state.

#### Scenario: Replay
- **WHEN** the same encounter is resolved twice with the same inputs
- **THEN** the kind, outcome and rewards are identical

### Requirement: Encounter risk
Encounters SHALL be able to fail or cost the explorer (lost ships, damage, reputation), with risk depending on encounter kind.

#### Scenario: Failure
- **WHEN** an encounter outcome is a failure
- **THEN** a cost is reported and fewer or no rewards are given

### Requirement: Loot crates of cards
Successful encounters SHALL award a loot crate containing cards of rarity common, rare, epic or legendary; cards SHALL be research shards, ship chassis, ship parts, or raw materials.

#### Scenario: Open crate
- **WHEN** a player opens a loot crate
- **THEN** each card's type, rarity and amount is revealed and applied to the empire

#### Scenario: Shard cards
- **WHEN** a card grants research shards
- **THEN** they are added to that node's shard progress
