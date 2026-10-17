# Spec Delta

## Purpose

Controls territorial expansion through planet biomes: empires start in their home biome and research unlocks adjacent biomes.

## ADDED Requirements

### Requirement: Home biome
Each empire SHALL start on a planet whose biome becomes its home biome and is colonisable from the start.

#### Scenario: Start
- **WHEN** a new empire is founded on an ocean world
- **THEN** ocean planets are colonisable

### Requirement: Adjacent biome unlocks
Biomes SHALL form an adjacency graph; research SHALL unlock only biomes adjacent to one already unlocked.

#### Scenario: Non-adjacent
- **WHEN** a player tries to research a biome not adjacent to any unlocked biome
- **THEN** it is unavailable

### Requirement: Territory
Colonised systems SHALL claim surrounding hexes as territory within a radius that grows with development.

#### Scenario: Claim
- **WHEN** a system is colonised
- **THEN** hexes within its claim radius become the empire's territory
