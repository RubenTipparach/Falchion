# Spec Delta

## Purpose

Lets every player make ships look the way they want with a handful of simple controls, and makes research visibly evolve their ships.

## ADDED Requirements

### Requirement: Simple design controls
The ship designer SHALL expose style, seed (with a randomise action), length, bulk, colour palette (primary, secondary, accent), engine count and weapon count, and SHALL update the preview immediately on change.

#### Scenario: Change colour
- **WHEN** the player changes the primary colour
- **THEN** the preview ship updates to the new colour without other shape changes

#### Scenario: Randomise
- **WHEN** the player presses randomise
- **THEN** a new seed is applied and the preview shows a new shape in the same style

### Requirement: Shareable design code
A ship design SHALL be representable as a compact text code that reproduces the same ship when loaded.

#### Scenario: Round trip
- **WHEN** a design is exported to a code and imported again
- **THEN** the resulting design is identical

### Requirement: Research-driven evolution
Researched nodes SHALL grant trait tags (e.g. hive-mind, shielding) that add visible features to generated ships regardless of style.

#### Scenario: Trait appears
- **WHEN** the player completes a node granting the hive-mind trait
- **THEN** newly generated ships of any style show hive-mind features
