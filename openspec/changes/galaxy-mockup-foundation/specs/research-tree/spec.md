# Spec Delta

## Purpose

Defines the branching research model: five parallel branches with exclusive choices, analog nodes, and crossovers that let empires migrate between trees over time.

## ADDED Requirements

### Requirement: Parallel branches
Research SHALL be organised into five parallel branches (organic, technological, aesthetic, geometric, utilitarian), each with ordered tiers of nodes and prerequisites.

#### Scenario: Prerequisites
- **WHEN** a node's prerequisites are not all researched
- **THEN** the node cannot be researched

### Requirement: Exclusive choices with analogs
A node MAY belong to an exclusive group; researching one node of a group SHALL lock the others, and each locked node SHALL make its declared analog node available instead.

#### Scenario: Locking
- **WHEN** a player researches node A in an exclusive group with node B
- **THEN** node B becomes locked

#### Scenario: Analog
- **WHEN** node B is locked and declares analog B'
- **THEN** B' is available to research (subject to its own prerequisites)

### Requirement: Crossovers
A crossover node SHALL be reachable from more than one branch; once researched, it SHALL grant access to the nodes of every branch it links.

#### Scenario: Hive Mind crossover
- **WHEN** a player on the organic branch researches Hive Mind
- **THEN** the technological branch nodes that require Hive Mind become available

### Requirement: Node rewards
Each node SHALL declare what it grants: trait tags, ship chassis, ship parts, or stat bonuses.

#### Scenario: Read rewards
- **WHEN** a node's details are shown
- **THEN** its rewards are listed
