## ADDED Requirements

### Requirement: Mined ore travels in the hold
Mining ships that are not in a friendly system (one of the empire's colony systems or supply depots) SHALL put what they mine into their fleet's hold, up to the hold's size (each mining ship carries a fixed number of units, more for faster miners), and not into the stockpile. Ore aboard SHALL NOT count toward the stockpile, be sold on an exchange or be spent. Mining in a friendly system SHALL go to the stockpile at once.

#### Scenario: Mining far from home
- **WHEN** a fleet of prospectors mines an asteroid field in a system with no colony or depot for a year
- **THEN** the metals it mined are in its hold, the empire's metals are unchanged, and the exchange cannot sell them

### Requirement: A hold unloads at base
A fleet in a friendly system SHALL unload its hold into the stockpile each year it is there, as much as storage allows; what does not fit SHALL stay aboard. A fleet docked at home SHALL unload all of it. Ore aboard a fleet that is destroyed SHALL be lost.

#### Scenario: Coming home with a full hold
- **WHEN** a mining fleet with 400 metals aboard arrives at a colony system with room for them
- **THEN** the empire's metals rise by 400 and the hold is empty

### Requirement: Miners haul home on their own
An auto-mining fleet, or a mining company's fleet, whose hold is full SHALL head for the nearest friendly system to unload, and then go back out to mine.

#### Scenario: A full hold
- **WHEN** an auto-mining fleet's hold fills at a distant field
- **THEN** it heads for the nearest colony or depot, unloads there, and returns to a field with rock left
