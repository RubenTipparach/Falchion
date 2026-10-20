## ADDED Requirements

### Requirement: Players hold relations with each other
Every pair of players SHALL have a relation: neutral by default, war or alliance. Relations SHALL live in the shared world held by the server, so both players and everyone else see the same relation.

#### Scenario: Strangers
- **WHEN** two players have never dealt with each other
- **THEN** their relation is neutral

### Requirement: War is declared, peace and alliances are agreed
A player SHALL be able to declare war on a neutral or allied player; hostilities SHALL begin one year after the declaration. Peace (from war) and alliance (from neutral) SHALL be proposed by one player and take effect only when the other accepts; either may decline or withdraw. Either ally SHALL be able to break an alliance, returning to neutral.

#### Scenario: Declaring war
- **WHEN** a player declares war on a neutral player
- **THEN** both are told, and their fleets can fight from the next year

#### Scenario: Making peace
- **WHEN** one side proposes peace and the other accepts
- **THEN** the relation returns to neutral and their fleets stop fighting

### Requirement: Only empires at war fight
Fleets of two players SHALL fight at sea only when their empires are at war, whether they meet on station or one chases the other. Neutral and allied fleets SHALL pass each other, and a fleet SHALL be ordered to chase only a fleet of an empire it is at war with.

#### Scenario: Aggressive but at peace
- **WHEN** an aggressive fleet meets a neutral player's fleet on the same hex
- **THEN** no battle is fought

### Requirement: Allies resupply in each other's systems
An ally's colony systems SHALL count as friendly systems for the other ally's fleets.

#### Scenario: Resupply at an ally's world
- **WHEN** a fleet is on station in an allied player's colony system
- **THEN** it refills supply and ammunition as in its own systems
