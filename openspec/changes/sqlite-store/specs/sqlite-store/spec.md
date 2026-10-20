## ADDED Requirements

### Requirement: One database for the server's state
The server SHALL keep player empires, server settings, the shared world, chat, the activity feed and the event log in one SQLite database file in its data directory, using only Node's built-in `node:sqlite`. A save SHALL be written in one statement, so that a crash never leaves a partial save.

#### Scenario: Empire saved and loaded
- **WHEN** a player's empire is saved and the server restarts
- **THEN** loading it returns the same record from the database

### Requirement: Legacy files imported once
On start the server SHALL import empires, settings, the shared world, chat and the activity feed from the JSON files of earlier versions into the database, once. It SHALL NOT overwrite anything the database already holds.

#### Scenario: Upgrade from file saves
- **WHEN** the server starts on a data directory holding `<id>.json` saves and `world.json`, and no database
- **THEN** every empire and the shared world are in the database and play continues unchanged

#### Scenario: Already imported
- **WHEN** the database already holds an empire and an older JSON file for it is still on the volume
- **THEN** the database's empire is kept
