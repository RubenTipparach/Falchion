# Spec Delta

## Purpose

Research progresses by collecting shards (fragments) of a node from many sources, so knowledge can be gathered through science, exploration, espionage and reverse engineering.

## ADDED Requirements

### Requirement: Shard requirements
Each node SHALL require a whole number of shards (for example 10, 100 or 500) and SHALL become researchable only when that many shards are collected and its prerequisites and lock rules allow it.

#### Scenario: Complete shards
- **WHEN** a node requiring 100 shards has 100 collected and its prerequisites are met
- **THEN** it can be researched

#### Scenario: Incomplete shards
- **WHEN** a node has fewer shards than required
- **THEN** it cannot be researched and its progress fraction is shown

### Requirement: Shard sources
Shards SHALL be earnable from science facilities and exploration for connected nodes, and from espionage, reverse engineering captured ships, and distant observation (probes, telescopes) for any node including unconnected ones.

#### Scenario: Unconnected via espionage
- **WHEN** espionage grants shards for a node with unmet prerequisites
- **THEN** the shards are recorded against that node

#### Scenario: Science restricted to connected
- **WHEN** science facilities produce shards
- **THEN** they are only applied to nodes whose prerequisites are met

### Requirement: Locked nodes keep shards
Shards collected for a locked node SHALL be retained and SHALL NOT make it researchable while locked.

#### Scenario: Locked progress
- **WHEN** a locked node has all its shards
- **THEN** it still cannot be researched
