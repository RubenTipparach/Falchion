## ADDED Requirements

### Requirement: Governor focus
The player SHALL choose a governor focus: Balanced, Science, Growth, Industry or Wealth. The governor's building and research choices SHALL follow it.

#### Scenario: Science focus
- **WHEN** the focus is Science and a colony has a free slot
- **THEN** the governor prefers a Research Lab, when it is unlocked

### Requirement: Building in free slots
With building on, each year every colony with a free slot and no building under construction SHALL start the best building for the focus. A building SHALL be started only if the credits left stay at or above the reserve. Food buildings SHALL come first while the empire's food income is below 2 a year. Shipyards SHALL not be built by the governor.

#### Scenario: Keeping the reserve
- **WHEN** a building would leave less than the reserve in credits
- **THEN** the governor does not start it

### Requirement: Picking research
With research on, when no research focus is set the governor SHALL set one: the open node that serves the focus, else the cheapest open node. It SHALL skip exclusive choices.

#### Scenario: Idle science
- **WHEN** research finishes and no focus is set
- **THEN** the governor sets a new focus that year
