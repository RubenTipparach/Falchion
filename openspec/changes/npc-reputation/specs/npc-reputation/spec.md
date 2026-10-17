## ADDED Requirements

### Requirement: Each NPC faction has a standing with each player
A known NPC faction SHALL hold a standing with each player between −100 and +100, starting at the faction's disposition and drifting one point every five years back toward it. Standing SHALL be shown as a tier: Hostile, Unfriendly, Neutral, Cordial or Allied.

#### Scenario: First contact with pirates
- **WHEN** a player meets a pirate faction
- **THEN** their standing starts below zero and shows as Unfriendly

### Requirement: Actions change standing, and standing changes behaviour
Selling trade goods at a faction's world and paying tribute SHALL raise standing. Fighting its raiders SHALL lower it a little, and assaulting its worlds SHALL lower it a lot. Factions at Cordial or better SHALL NOT raid the player, Hostile factions SHALL raid more often, and a faction's markets SHALL pay more the better the player's standing.

#### Scenario: Buying peace
- **WHEN** a player pays tribute to an Unfriendly faction until it is Cordial
- **THEN** its raiders stop targeting that player

### Requirement: A reputation chart
The Empire panel SHALL show the player's standing with every known faction over time as a chart, with each faction's current tier and standing, and a way to pay tribute.

#### Scenario: Watching relations change
- **WHEN** a player opens Empire › Relations after trading with a faction for a while
- **THEN** the chart shows that faction's line rising
