# Spec Delta

## Purpose

Uses Discord as the identity, launch and social layer: players sign in with Discord, play inside a Discord Activity, and guilds act as alliances.

## ADDED Requirements

### Requirement: Discord sign-in
Players SHALL authenticate with Discord OAuth2; the game SHALL store only the Discord user id, display name and avatar.

#### Scenario: First login
- **WHEN** a new Discord user signs in
- **THEN** an empire is created and linked to their Discord id

### Requirement: Discord Activity
The client SHALL run as a Discord Embedded App (Activity) as well as a standalone web page.

#### Scenario: Launch in voice channel
- **WHEN** a user launches Falchion from a Discord voice channel
- **THEN** the game loads with that user signed in

### Requirement: Event notifications
Important async events (fleet arrival, encounter results, lockstep contact) SHALL be deliverable to the player via Discord DM or a guild channel, configurable per player.

#### Scenario: Contact alert
- **WHEN** a lockstep zone opens involving the player
- **THEN** the player receives a Discord notification
