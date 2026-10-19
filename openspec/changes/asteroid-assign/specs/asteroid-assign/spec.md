## ADDED Requirements

### Requirement: Assign miners to an asteroid field
The player SHALL be able to click an asteroid field and send any group of mining ships of its resource to work it, the dock's or a fleet's. On station, those miners SHALL mine that field alone while it has rock. The system's other miners SHALL work its other fields. When the field runs dry, the assigned miners SHALL mine the system's other fields.

#### Scenario: Sending a fleet to a field
- **WHEN** the player assigns a fleet of Prospectors to a system's second metals field
- **THEN** the fleet sets course for that system and, on station, mines only that field

#### Scenario: Wrong kind of miner
- **WHEN** the player tries to send miners to a field of another resource, or to a field that does not exist
- **THEN** nothing is sent

### Requirement: Field feedback
An asteroid field SHALL be highlighted under the pointer and while its card is open. A fleet sent to a field SHALL show which field it works on its card.

#### Scenario: Selecting a belt
- **WHEN** the player clicks an asteroid belt in the system view
- **THEN** the belt glows and its card lists the miners that can be assigned to it
