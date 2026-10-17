# Spec Delta

## Purpose

Resolves fights between player fleets and alien forces automatically and deterministically, so outcomes depend on fleet composition and technology rather than reflexes.

## ADDED Requirements

### Requirement: Automated deterministic combat
Combat SHALL resolve without player input from the participating fleets, their technology and a battle seed; the same inputs SHALL always produce the same battle log and result.

#### Scenario: Replay battle
- **WHEN** a battle is resolved twice with identical inputs
- **THEN** both battle logs are identical

### Requirement: Abilities from warship technology
Warship parts SHALL grant abilities (e.g. shields, point defence, cloaking, boarding) with counters, so fleets must adapt to enemy technology to survive.

#### Scenario: Counter
- **WHEN** a fleet with point defence fights a missile-heavy fleet
- **THEN** missile damage is reduced according to the counter rule

### Requirement: Bombardment and assault
Fleets SHALL be able to bombard a planet to reduce its defences and launch an assault to capture it once defences are depleted.

#### Scenario: Assault blocked
- **WHEN** an assault is launched against a planet with remaining defences above the threshold
- **THEN** the assault fails with losses

### Requirement: Ship capture yields tech fragments
Disabled enemy ships SHALL be capturable by boarding; captured ships SHALL yield research shards for the enemy's nodes via reverse engineering, including nodes outside the captor's branches.

#### Scenario: Reverse engineering
- **WHEN** a player captures an alien ship built with node X
- **THEN** the player receives reverse-engineering shards for node X
