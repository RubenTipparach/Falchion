## ADDED Requirements

### Requirement: A yard's queue can be cancelled and reordered
A ship in a yard's queue SHALL be cancellable, refunding its cost less the share already built, with the ships after it moving up. A waiting ship SHALL move one place earlier or later; the ship under way SHALL stay first. Both SHALL be server commands that agree with the browser.

#### Scenario: Cancelling a queued ship
- **WHEN** the player cancels the second of three queued ships
- **THEN** its cost is refunded in full and the third ship starts when the first is done

#### Scenario: Moving a ship earlier
- **WHEN** the player moves the third ship up
- **THEN** it is built second and the second ship third
