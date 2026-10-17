# Spec Delta

## Purpose

Gives allowlisted admins a portal to watch and manage the server.

## ADDED Requirements

### Requirement: Allowlisted access
The admin portal and admin API SHALL be available only to signed-in Discord users whose id is in the comma-separated `ADMIN_DISCORD_ID` (or `ADMIN_DISCORD_IDS`) secret; others SHALL be refused and shown their own Discord id.

#### Scenario: Not on the list
- **WHEN** a signed-in player who is not an admin opens /admin
- **THEN** access is refused and the page shows their Discord id

### Requirement: Manage players
Admins SHALL see every player's progress and SHALL be able to reset a player's empire; state-changing requests SHALL require a custom header in addition to the session cookie.

#### Scenario: Reset empire
- **WHEN** an admin resets a player's empire
- **THEN** that player's server save is deleted

### Requirement: Announcements
Admins SHALL be able to publish a short announcement that every player sees as a banner.

#### Scenario: Maintenance notice
- **WHEN** an admin publishes an announcement
- **THEN** players see it within a minute
