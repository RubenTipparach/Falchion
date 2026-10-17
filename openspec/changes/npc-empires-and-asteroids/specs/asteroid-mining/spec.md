## ADDED Requirements

### Requirement: Mining ships mine asteroid fields, which deplete and refill
Systems SHALL have zero to three asteroid fields, each holding one resource. Mining ships SHALL mine only the fields of their resource in the system where they are, faster than planets were mined, and a field SHALL never give more than it holds. A field SHALL refill to full over 24 real hours (1,440 world years). Depletion SHALL be shared by everyone mining the same field.

#### Scenario: Mining a field dry
- **WHEN** mining ships keep working a field until it is empty
- **THEN** they stop yielding from it and go idle, and the star card shows when it will refill

#### Scenario: No asteroids of the right kind
- **WHEN** a mining ship is in a system with no field of its resource
- **THEN** it is idle and the empire is told why
