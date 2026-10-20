## ADDED Requirements

### Requirement: Missions with live objectives and rewards
The game SHALL offer missions, each with a briefing, objectives and rewards. Progress SHALL be read from the empire's state and shown live. A mission whose objectives are met SHALL be claimable, and SHALL be claimed at the year's end if not claimed before. A hand-over objective SHALL take its resources only when the mission is claimed.

#### Scenario: First survey mission
- **WHEN** a new empire has surveyed three planets
- **THEN** "Know Your Home" shows complete and claiming it pays its credits and the leader's experience

### Requirement: A story that grows from tutorial to epic
Missions SHALL run in chapters, from a tutorial on the game's basics to a story of older civilisations, the megastructures and the galactic core. Later missions SHALL unlock when earlier ones are done, or when exploration or first contact uncovers them.

#### Scenario: Exploration uncovers a mission
- **WHEN** the player surveys their first choir world
- **THEN** "The Choir Sings" becomes active

### Requirement: NPC quests
Known factions SHALL now and then offer quests, more often the better the player stands with them. Offers SHALL be deterministic for the faction, the player and the year. An accepted quest SHALL reward standing with the faction, influence and faith, and sometimes a timed trade accord. Offers and quests SHALL expire.

#### Scenario: A delivery for a neighbour
- **WHEN** the player accepts a faction's request for metals and claims it with the metals in hand
- **THEN** the metals are handed over and standing, influence and faith rise

### Requirement: Leader and advisors
The ruler SHALL gain experience and levels, each adding influence and stability. Advisors SHALL sit in seats opened by the leader's level. Each SHALL have a level and a trait, and bring bonuses for their seat that grow with their level. The bonuses SHALL count in income, trade, mining, science and approval.

#### Scenario: Appointing a steward
- **WHEN** the player appoints a Steward candidate
- **THEN** the Steward's bonuses appear in the year's income

### Requirement: Delegation
An advisor whose decisions are delegated SHALL act for the player each year in their domain, and SHALL report each decision in the dispatches.

#### Scenario: The Science Minister picks research
- **WHEN** the Science Minister has delegation and no research focus is set
- **THEN** a focus is chosen at the year's end and the dispatch names it
