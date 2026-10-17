# Spec Delta

## Purpose

Defines the server's event log: what it records of players and NPC empires, how it is bounded and how an admin reads it.

## ADDED Requirements

### Requirement: Events recorded in the database
The server SHALL record events as rows of the database's event table, in the order they happened. It SHALL never rewrite a row. Each event SHALL carry:
- the server time;
- the world time;
- the actor: a player, or an NPC empire;
- the player it happened to, if any;
- its kind;
- its data.

#### Scenario: Refused command kept
- **WHEN** a command is refused with the error "no colony ship"
- **THEN** its event records `ok` as false and the error text, and it is read back with the other events

### Requirement: Player actions recorded
The server SHALL record the following player actions:
- every command its rules applied or refused, with the world time and client time the rules ran with;
- foundings;
- catch-ups of the yearly tick by more than one year;
- battles and pursuits between players;
- first contacts;
- diplomatic actions that took effect;
- NPC empires discovered;
- NPC worlds captured.

It SHALL NOT record orders the rules never ran (rate-limited, no empire). A failure to record SHALL NOT fail the order or the yearly tick.

#### Scenario: Order applied
- **WHEN** a player's order is applied
- **THEN** an event with the order, the world time it ran at and `ok` true is recorded for that player

#### Scenario: Log unavailable
- **WHEN** recording fails while an order is applied
- **THEN** the order still succeeds and the failure is reported in the server log

### Requirement: NPC decisions recorded
The server SHALL record each decision of an NPC empire, with a line of text explaining it and the player it is aimed at, if any. Decisions are:
- building a raider fleet;
- reinforcing a garrison;
- launching a raid;
- a raid striking;
- a fleet returning home.

#### Scenario: Raid launched
- **WHEN** an NPC raider fleet sets out to raid a player
- **THEN** a `raid` event with that NPC as actor, the player as subject and the standing behind it is recorded

### Requirement: Bounded size
The server SHALL delete the oldest events once the log holds more than 500,000, so that the log stays bounded.

#### Scenario: Log grows past the cap
- **WHEN** more events are recorded than the cap
- **THEN** the oldest are removed and the newest are still read back

### Requirement: Read the last events
The server SHALL return:
- the last 50 events by or about an empire, oldest first;
- the last 100 NPC decisions, oldest first;
- an empty list when there are none.

#### Scenario: NPC raid on an empire
- **WHEN** an NPC raid strikes an empire
- **THEN** the event is among that empire's events

### Requirement: Admin read-only view
Admins SHALL see an empire's events and the NPC decisions on the admin portal and through the admin API. The view SHALL offer no way to change the log. Other players and signed-out visitors SHALL be refused.

#### Scenario: Non-admin asks for a log
- **WHEN** a signed-in player who is not an admin requests an empire's events or the NPC decisions
- **THEN** the server refuses with 403 and returns no events
