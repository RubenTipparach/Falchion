## ADDED Requirements

### Requirement: Empires meet by coming near each other
Two players SHALL meet (first contact) when, in a world year, a fleet (on station or under way) or a world of one is within 2 hexes of a fleet or a world of the other. The server SHALL record each first contact once in the shared world, with the world year it happened.

#### Scenario: A scout near a stranger's home
- **WHEN** a player's scout comes within 2 hexes of another player's home world, and they had not met
- **THEN** the two players have met from that year, and both are told in their next year

#### Scenario: Far apart
- **WHEN** two players' fleets and worlds stay more than 2 hexes apart
- **THEN** they have not met

### Requirement: No diplomacy before first contact
A player SHALL NOT be able to declare war, propose or answer peace or an alliance, or break an alliance with a player they have not met. The order SHALL be refused with the reason. Players with a relation recorded before first contact existed SHALL count as having met.

#### Scenario: Declaring war on a stranger
- **WHEN** a player declares war on a player they have never met
- **THEN** nothing changes and the player is told they have not met them yet

### Requirement: Relations show met empires
Empire › Relations SHALL list only the players you have met, with how many others you have not met yet. The Players panel SHALL mark players not yet met.

#### Scenario: Two strangers in the galaxy
- **WHEN** a player has met one other player and not two others
- **THEN** Relations lists the one, and says two empires are not met yet
