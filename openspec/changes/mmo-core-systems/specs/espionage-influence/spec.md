# Spec Delta

## Purpose

Adds spying and influence as ways to gain research shards and income, including from nodes outside one's own tree.

## ADDED Requirements

### Requirement: Espionage operations
Players SHALL be able to run spy operations against alien civilisations that yield research shards for the target's nodes, with a deterministic success chance.

#### Scenario: Successful theft
- **WHEN** a spy operation succeeds against a civilisation with node X
- **THEN** the player receives espionage shards for node X

### Requirement: Influence
Influence SHALL accumulate from religion, politics and relations and SHALL be spendable on diplomatic actions.

#### Scenario: Spend influence
- **WHEN** a player spends influence on a trade agreement
- **THEN** the influence balance decreases by the action cost
