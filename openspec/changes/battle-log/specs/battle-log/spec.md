## ADDED Requirements

### Requirement: Battles are logged
An empire SHALL keep a battle log of the most recent 60 battles, newest first, kept in its save:
- every NPC raid on its worlds or fleets, including a plundered world;
- every round of a battle at sea with another player, including pursuits;
- every War Room assault.

Each entry SHALL record the year, kind, place, our side and the enemy, the outcome, and each side's ships lost, destroyed and boarded by class.

#### Scenario: Raid beaten off
- **WHEN** an NPC raid strikes a fleet that beats it off, losing one ship
- **THEN** the log gains a raid entry marked as an attack on us, won, with our one loss and the raiders' losses

#### Scenario: World plundered
- **WHEN** raiders strike an undefended colony
- **THEN** the log gains an entry for that world, plundered, with what was taken

### Requirement: Battle log in the War Room
The War Room SHALL list the battle log. Attacks on us SHALL be marked, and a filter SHALL show only those. Each entry SHALL expand to both sides' losses. Each entry SHALL offer Locate, and Watch while a battle at sea is still being fought.

#### Scenario: Reading the log
- **WHEN** a player opens War Room › Battle log after two raids
- **THEN** both raids are listed, newest first, each with its place, enemy, outcome and losses

### Requirement: Unseen attacks are flagged
The War Room tab SHALL show how many attacks on us have been logged since the battle log was last opened. Opening the battle log SHALL clear the count.

#### Scenario: Attacked while away
- **WHEN** a player's worlds are raided twice while they are away
- **THEN** the War Room tab shows 2 until they open the battle log
