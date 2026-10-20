## ADDED Requirements

### Requirement: The server runs every empire
The server SHALL advance every signed-in empire through each world tick, whether or not its owner is connected, using the same rules the client uses.

#### Scenario: Owner offline
- **WHEN** a player closes the game for three hours
- **THEN** their empire has kept producing, building and moving every minute, and on return they see the same state as everyone else, with no catch-up limit

### Requirement: Orders are commands the server applies
Signed-in clients SHALL change their empire only by sending named commands with arguments. The server SHALL apply each command to its own copy at the current tick, reject unknown commands and arguments that do not resolve to real stars, planets, fleets or classes, and return the resulting state.

#### Scenario: A move order
- **WHEN** a player right-clicks a star with a fleet selected
- **THEN** the client shows the new course at once, the server applies the same command, and the owner's state matches the server's

#### Scenario: A tampered save
- **WHEN** a client tries to upload a save for an empire that already exists on the server
- **THEN** the server ignores it and keeps its own state
