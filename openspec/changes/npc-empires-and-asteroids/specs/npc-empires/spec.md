## ADDED Requirements

### Requirement: NPC empires are everywhere but alive only once discovered
The galaxy SHALL hold NPC empires generated from its seed: two or three near every player's home and a few hundred elsewhere. An NPC SHALL NOT be simulated until a player discovers it by bringing a fleet within range of its territory; spawn NPCs are known from the start. Once discovered, an NPC SHALL be the same for every player.

#### Scenario: First contact
- **WHEN** a player's fleet comes within range of an undiscovered NPC's territory
- **THEN** the NPC becomes active for the whole galaxy, the player gets a first-contact dispatch, and its territory and fleets appear on every player's map who knows it

#### Scenario: Undiscovered NPCs cost nothing
- **WHEN** no player has come near an NPC
- **THEN** it has no state and is not simulated

### Requirement: Players fight NPCs
Active NPCs SHALL build raider fleets that raid the empires that know them. An NPC fleet that meets a player fleet SHALL fight it, and one that reaches an undefended colony system SHALL steal resources. Players SHALL be able to attack known NPC fleets and worlds from the War Room with a fleet at the target, and a captured world SHALL become their colony. The server SHALL resolve every battle deterministically, and both sides SHALL keep the outcome.

#### Scenario: Raiders strike a fleet
- **WHEN** an NPC raider fleet arrives in the hex where a player's fleet is stationed
- **THEN** a battle is fought, both sides lose ships accordingly, and the player sees the outcome in their dispatches

#### Scenario: A player attacks an NPC world
- **WHEN** a player engages an NPC colony from the War Room with a fleet in that system and wins the assault
- **THEN** the world becomes the player's colony and no longer belongs to the NPC, for everyone
