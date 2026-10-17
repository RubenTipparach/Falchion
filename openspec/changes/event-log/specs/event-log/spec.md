# Spec Delta

## Purpose

Defines the server's append-only event log per empire: what it records, how it is bounded,
how a founding is kept for replay, how a replay rebuilds the empire, and how an admin reads it.

## ADDED Requirements

### Requirement: Append-only event lines
The server SHALL append each event for an empire as one JSON line to that empire's log, in the order the events were recorded, and SHALL never rewrite a line in place. Each line SHALL carry the server time `at`, the world time `worldTime`, the empire's year `turn` before the event, the `command`, the client time `clientTime`, and `ok`, plus `error` when the event was refused.

#### Scenario: Refused command kept
- **WHEN** a command is refused with the error "no colony ship"
- **THEN** its line records `ok` as false and the error text, and it is still read back with the other events

### Requirement: Commands logged
The server SHALL log every command its rules applied or refused, with the world time and client time the rules ran with, after the empire is saved. It SHALL NOT log orders the rules never ran (rate-limited, no empire). A failure to write the log SHALL NOT fail the order.

#### Scenario: Order applied
- **WHEN** a player's order is applied
- **THEN** a line with the order, the world time it ran at and `ok` true is appended to that empire's log

#### Scenario: Log unavailable
- **WHEN** writing the log fails while an order is applied
- **THEN** the order still succeeds and the failure is reported in the server log

### Requirement: Catch-up logged
The server SHALL log an `advance` event when the yearly tick plays an empire forward by more than one year at once, with the world year it played to.

#### Scenario: Server was down
- **WHEN** the yearly tick plays an empire three years at once after the server was down
- **THEN** an `advance` line with that world year is appended to the empire's log

### Requirement: Bounded size
The server SHALL rotate an empire's log to a single previous file when the next line would take the current file past 2 MB, so that at most the current file and one rotated file are kept.

#### Scenario: Log grows past the cap
- **WHEN** appending a line would take the current log past 2 MB
- **THEN** the current log is moved to the rotated file before the line is written, and reads still return the newest lines

### Requirement: Founding kept for replay
The server SHALL log a `found` event when an empire is founded, and SHALL keep the founding save whole beside the log, so that a replay can start from it. A failure to write the log SHALL NOT fail the founding.

#### Scenario: New empire founded
- **WHEN** a player with no saved empire uploads their first save
- **THEN** a `found` line is logged and the uploaded save is kept as the founding save

### Requirement: Replay rebuilds the empire
Replaying an empire's latest founding save and the events logged after it with the game's rules SHALL produce exactly the stored save, for an empire whose years did not depend on the shared world. Replay SHALL give no result when the founding is no longer in the log.

#### Scenario: Founding and orders replayed
- **WHEN** an empire is founded, given orders over several years, and ticked, including a multi-year catch-up
- **THEN** replaying its founding save and its log equals the stored save

#### Scenario: Founding rotated out
- **WHEN** the log no longer holds the `found` line
- **THEN** replay gives no result

### Requirement: Read the last events
The server SHALL return the last 50 events for an empire, oldest first, and an empty list for an empire with no events.

#### Scenario: Fewer than fifty events
- **WHEN** an empire has three events
- **THEN** all three are returned in order

### Requirement: Admin read-only view
Admins SHALL see the last 50 events of any empire on the admin portal and through the admin API, and the view SHALL offer no way to change the log. Other players and signed-out visitors SHALL be refused.

#### Scenario: Non-admin asks for a log
- **WHEN** a signed-in player who is not an admin requests an empire's events
- **THEN** the server refuses with 403 and returns no events
