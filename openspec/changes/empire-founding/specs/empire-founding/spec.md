## ADDED Requirements

### Requirement: Founding an empire
A player without an empire identity SHALL be shown the founding screen before their empire appears to others. On it they SHALL choose an empire name, ruler title and name, capital name, an empire colour, and a flag made of a pattern, an emblem and three colours. A suggested identity, stable per player, SHALL be prefilled.

#### Scenario: New player founds an empire
- **WHEN** a signed-in player with no identity opens the game and confirms the founding screen
- **THEN** the empire takes the chosen name and colour, the capital colony is renamed, the server save is written at once, and other players see the empire's name and flag on the map

#### Scenario: Editing later
- **WHEN** the player clicks their empire in the top bar or Edit in the Empire panel and saves
- **THEN** the new identity replaces the old one everywhere, including other players' maps

### Requirement: Identity is validated everywhere
Identities from saves and from other players SHALL be validated: single-line text bounded to 40 characters (24 for titles), colours in #rrggbb form, and flag parts from the known tables only. Unknown parts SHALL fall back to defaults. An identity without a name SHALL be treated as absent.

#### Scenario: Tampered public view
- **WHEN** another player's public view carries markup in its name or an unknown flag emblem
- **THEN** the map shows the name as plain text and the flag with a known emblem

### Requirement: Equal starts
Every empire SHALL start with exactly one star system, its home, and every fleet SHALL start at 1 light year per minute. Only research SHALL raise fleet speed.

#### Scenario: Saved journey at an old speed
- **WHEN** a saved fleet was travelling faster than the empire's speed
- **THEN** it continues from the hex it had reached at the empire's speed
