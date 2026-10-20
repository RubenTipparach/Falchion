## ADDED Requirements

### Requirement: Logged battles keep their rounds
A battle log entry SHALL keep the rounds of its battle as the battle view draws them, our side first:
- **raid, or the fight in orbit of an assault:** every round;
- **round at sea:** that round.

Only the newest 24 entries SHALL keep rounds. Rounds read from a save or the server SHALL be checked and bounded.

#### Scenario: A raid while away
- **WHEN** raiders attack a world while its player is away, and the dock fights them off over three rounds
- **THEN** the battle log's entry for the raid keeps all three rounds

### Requirement: Battles can be replayed
Any logged battle that kept rounds SHALL be playable in the battle view. Its rounds play in order, each in about 20 seconds, on the view's own clock. A battle at sea plays its earlier rounds from the entries before it. A replay SHALL offer no orders, and SHALL be able to play again from its first round.

#### Scenario: Watching last night's battle
- **WHEN** the player presses Replay on a battle at sea fought over four years while they were away
- **THEN** the battle view plays rounds 1 to 4 in turn, showing "Replay · Y<year> · round n of 4", and ends on how the battle came out

### Requirement: Battle news can be replayed from the Dispatches
A dispatch about a battle SHALL name its battle log entry. When that entry kept its rounds, the dispatch SHALL show a play button that replays the battle. News from before dispatches named their battle SHALL find its entry by year and summary.

#### Scenario: Watching a raid from its news
- **WHEN** raiders strike while the player is away and the Dispatches show "beat off … raiders"
- **THEN** the dispatch has a play button, and pressing it replays the raid round by round
