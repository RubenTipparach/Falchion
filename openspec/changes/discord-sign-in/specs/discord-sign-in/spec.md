# Spec Delta

## Purpose

Lets friends sign in with Discord, keep their empire on the server, and see each other in one galaxy.

## ADDED Requirements

### Requirement: Discord sign-in
The server SHALL offer Discord OAuth2 sign-in with the `identify` scope only, verify a state value against a short-lived cookie, and keep the session in a signed, HttpOnly cookie. It SHALL store only the Discord user id, display name and avatar.

#### Scenario: Forged session
- **WHEN** a request carries a session cookie whose signature does not match
- **THEN** the player is treated as signed out

### Requirement: Server saves
A signed-in player's empire SHALL be saved on the server under their Discord id and loaded on any device; the client SHALL use whichever of the server and local saves is further along.

#### Scenario: New device
- **WHEN** a player signs in on a second device
- **THEN** their empire continues from the server save

### Requirement: Shared galaxy
Each signed-in player SHALL get their own home system, and other players' homes, colony stars and fleets SHALL be shown on the map; their stockpiles, research and orders SHALL NOT be shared.

#### Scenario: A friend nearby
- **WHEN** two friends have signed in
- **THEN** each sees the other's empire marker and fleets on the map

### Requirement: Guest play
Without sign-in the game SHALL run as a guest saved in the browser only.

#### Scenario: Static hosting
- **WHEN** the game is opened where no Falchion server answers
- **THEN** it starts as a guest with no sign-in screen
