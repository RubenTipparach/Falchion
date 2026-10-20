## ADDED Requirements

### Requirement: Hourly empire snapshots
The server SHALL record a snapshot of every stored empire once every `SNAPSHOT_INTERVAL_MS` (one hour of real time), measured from the latest snapshot in the database so a restart does not record twice. Each snapshot SHALL carry the time, the world year, the empire's id, its owner's name, its empire name, why it was taken (`hourly`, `manual` or `reset`), a summary and the whole stored record (compressed). Snapshots SHALL never be pruned automatically.

#### Scenario: An hour passes
- **WHEN** a world tick arrives an hour after the latest snapshot and two empires are stored
- **THEN** two snapshot rows are recorded, one per empire, each with the world year of that tick

#### Scenario: Restart within the hour
- **WHEN** the server restarts twenty minutes after the latest snapshot
- **THEN** no snapshot is recorded until the hour since that snapshot has passed

### Requirement: A documented summary for analysis
Each snapshot's summary SHALL be a JSON object with a schema version and stable field names, documented field by field in `docs/snapshots.md`. It SHALL cover identity, resources (stock, income, costs, net), population, worlds, buildings, ships, fleets, military strength, construction, research, exploration, diplomacy, battles, commerce, missions and the court.

#### Scenario: A new empire
- **WHEN** a freshly founded empire is summarised
- **THEN** its summary lists three worlds in one system, its starting ships by class and its starting stock of every resource

### Requirement: Snapshot export
The admin portal SHALL offer a from/to time range and an optional empire, and an export that downloads, as JSON Lines, a `meta` line followed by every snapshot taken in the range and every event-log entry recorded in the range, merged in time order, each line marked `snapshot` or `event`. The full stored record SHALL be included only when asked for. The portal SHALL show how many snapshots there are, of how many empires, the first and the latest.

#### Scenario: Range filter
- **WHEN** an admin exports from 10:00 to 11:00 while snapshots were taken at 09:30, 10:30 and 11:30
- **THEN** the file holds the 10:30 snapshots and the events recorded between 10:00 and 11:00, and nothing else

#### Scenario: Not an admin
- **WHEN** a signed-in player who is not on the admin list asks for the export
- **THEN** it is refused with 403

### Requirement: Server reset to the founding
The admin portal SHALL offer a server reset that asks for a typed confirmation. A reset SHALL put every empire back to its start as first founded (the same name, ruler, title, capital, colours, flag, ship style and home system), rebuilt at the current world year, without the player founding it again. The founding SHALL be kept when an empire is founded; an empire without a kept founding SHALL have its founding choices read from its current save.

#### Scenario: Reset keeps the empire
- **WHEN** an admin resets the server while a player has six colonies and is allied with another player
- **THEN** that player's empire has its founding name, flag and home, its three starting worlds and starting fleets at the current year, and the alliance is gone

#### Scenario: Unconfirmed
- **WHEN** the reset is asked for without the confirmation text
- **THEN** it is refused with 400 and nothing changes

### Requirement: What a reset keeps and clears
A reset SHALL first snapshot every empire. The shared world SHALL start fresh at the current world year (NPC empires dormant, asteroid fields full, no relations, contacts, stakes or payouts). Snapshots and the event log SHALL be kept, and the reset SHALL be logged.

#### Scenario: Records survive
- **WHEN** an admin resets the server
- **THEN** every earlier snapshot is still there, a `reset` snapshot of each empire is added, and the event log gains a `reset` entry

### Requirement: Hide systems flag
The admin portal SHALL offer a toggle to hide systems, kept as a server setting and announced to connected players at once. Clients SHALL learn it from `/api/info`, `/api/vision` and the live stream. While it is on, a player's map SHALL draw only the systems they have explored or sighted and those an ally shares with them, and selection, hover, search and links SHALL ignore the rest. While it is off the map SHALL draw every star as before.

#### Scenario: Toggled on
- **WHEN** an admin turns hiding on while a player has the game open
- **THEN** within seconds that player's map stops drawing stars they have not explored or sighted

### Requirement: The server does not send what a player cannot see
While the flag is on, the server SHALL leave out of what it sends a player (the players list, live player updates, the shared world and its live updates): other players' home and colony systems the player cannot see, their fleets not near a system the player can see, NPC empires the player has not met, and NPC worlds and fleets the player cannot see. The server's own rules SHALL keep reading everything.

#### Scenario: A distant rival
- **WHEN** the flag is on and another player's colonies are all in systems the player has never explored or sighted
- **THEN** the players list sends that player's empire without those colonies

### Requirement: Vision rules
Vision SHALL be derived by pure, tested functions from an empire's save: explored systems (home, colonies, depots, systems with a surveyed planet, systems a ship of the empire has passed through or stopped in) and sighted systems (within two light years of an explored system or of one of its fleets, or inside its territory). An empire SHALL record the systems its ships pass through or stop in. Allied players SHALL share vision. The rules of the game SHALL NOT depend on vision.

#### Scenario: A voyage
- **WHEN** a fleet flies through three star systems to a fourth
- **THEN** all four are recorded as visited and become explored

### Requirement: Fog of war on the galaxy map
The galaxy map SHALL draw explored space clear and unexplored space under a soft fog, with uncharted stars dim, grey and without names, whether the flag is on or off; with the flag on, unexplored stars SHALL not be drawn at all. The fog SHALL clear around the player's fleets and fade out in the system view.

#### Scenario: Flag off
- **WHEN** the flag is off and the player looks at an unexplored region
- **THEN** its stars are drawn dim and unnamed under the fog, and explored systems nearby are bright and named

### Requirement: Megastructures hidden until visited
A megastructure system SHALL look like an ordinary star system to a player, whether the flag is on or off, until one of their ships has explored it or an ally sharing vision has: no beacon on the map, no structure in the system view, no card details or thumbnail, and no listing in galaxy search.

#### Scenario: Unvisited Dyson sphere
- **WHEN** a player opens the system view of a megastructure system none of their ships has visited
- **THEN** they see the star alone, and the megastructure search does not list it

#### Scenario: Ally's discovery
- **WHEN** an allied player's ship has visited a megastructure system
- **THEN** the player sees its beacon and its structure
