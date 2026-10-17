# Spec Delta

## Purpose

Lets players see the rest of the galaxy as it happens: every empire and who is online, other
players' fleets and territory moving within seconds, and a live feed of everyone's news.

## ADDED Requirements

### Requirement: Galaxy activity feed
The server SHALL keep a log of the last 300 notable events by all players (empire founded, colony settled, supply depot built, battle, system fully surveyed, came online, went offline). Each event SHALL carry an id, a time, the player's id and name, their empire's name and colour when they have one, a kind, a text, and optionally a place (name and hex). Signed-in players SHALL read it at `GET /api/activity`, newest first, and receive new events live as `activity` events on their live stream.

#### Scenario: Colony seen by another player
- **WHEN** player A settles a colony while player B has the game open
- **THEN** B's Galaxy feed lists "A's empire settled … in <star>" within a few seconds, with the star as a link

#### Scenario: Guest
- **WHEN** a request without a session asks for `/api/activity` or posts to `/api/events`
- **THEN** it is refused with 401

### Requirement: Reporting news
A player SHALL report their own news with `POST /api/events` using one of the kinds `found`, `colony`, `depot`, `battle` or `survey`; any other kind, including `online` and `offline`, SHALL be refused with 400. Text SHALL be cleaned to one line of at most 160 characters; a place SHALL be kept only when its name appears in the text and its hex coordinates are integers. Battles, colonies and depots SHALL also go to the Discord channel as before.

#### Scenario: Server-only kind
- **WHEN** a client posts an event of kind `online`
- **THEN** it is refused with 400 and nothing is logged

#### Scenario: Place not in the text
- **WHEN** a report says "finished surveying Karon" with the place "Elsewhere"
- **THEN** the event is logged without a place

### Requirement: Report limits
Each player SHALL be limited to 20 reports every 10 minutes; reports beyond that SHALL be refused with 429 and not logged.

#### Scenario: Flooding
- **WHEN** a player posts a 21st report within 10 minutes
- **THEN** it is refused with 429

### Requirement: Server-known events
The server SHALL log a founding when it receives a player's first save, and SHALL announce each founding once even when the client also reports it. It SHALL log a player coming online when their first live stream opens and going offline when their last one closes, ignoring gaps shorter than 30 seconds and players who have no saved empire.

#### Scenario: Reload
- **WHEN** a player reloads the page
- **THEN** no "went offline" or "came online" event is logged

### Requirement: Durable feed
The feed SHALL survive a server restart: it SHALL be written atomically to `activity.json` in the data directory shortly after each change and on shutdown, and loaded at start.

#### Scenario: Deploy
- **WHEN** the server restarts
- **THEN** `/api/activity` still lists the events from before

### Requirement: Live public views
When a player's save arrives, the server SHALL send their public view (empire identity, colour, home, colony stars, fleets, last save time) as a `player` event to every other connected signed-in player and never to the sender, at most once a second per player with the latest view winning. Clients SHALL apply it to the map at once, keep the newer copy when a poll is older than a live update, and keep polling `/api/players` once a world tick as a fallback.

#### Scenario: Move order
- **WHEN** player A sends a fleet to a new destination while B has the game open
- **THEN** B's map and Players drawer show the fleet's new course within a few seconds, not at the next minute

### Requirement: Prompt saves after notable actions
The client SHALL push its save soon after a change other players should see (a fleet's new course, a fleet leaving or docking, a new colony or depot, founding or renaming the empire), at most once every 2.5 seconds; other saves SHALL stay at most once every 10 seconds.

#### Scenario: Burst of orders
- **WHEN** a player gives five move orders within two seconds
- **THEN** the server receives at most one save in any 2.5 second window, carrying the latest orders

### Requirement: Players drawer
A "Players" tab SHALL open a drawer listing every empire in the galaxy with its flag, name in its colour, ruler title and name, Discord name, an online dot, colony systems, fleets, last seen, and distance from your home in light years. Your own empire SHALL be listed first and marked as you, then players online now, then the most recently seen. Guests SHALL see a prompt to sign in.

#### Scenario: Other player listed
- **WHEN** B opens the Players drawer while A is in the game
- **THEN** A's empire is listed below B's own, with A's flag and a green online dot

### Requirement: Players drawer actions
Each empire in the drawer SHALL offer locate (click centres on its home, double-click zooms in), a DM button that opens the chat thread with that player, and an expandable list of its fleets with destination, ETA and a locate button that selects and follows the fleet.

#### Scenario: Direct message
- **WHEN** B clicks DM on A's empire
- **THEN** the chat drawer opens on the private thread with A and the Players drawer closes

#### Scenario: Locate a fleet
- **WHEN** B clicks the locate button of one of A's fleets
- **THEN** the camera centres on that fleet and its fleet card shows A's empire

### Requirement: Galaxy feed view
The Players drawer SHALL have a Galaxy feed tab listing activity newest first, each entry with the empire's flag and coloured name, the text, a relative time, and its place as a link that flies the camera there. New entries from other players SHALL appear briefly as a toast and as a count on the Players tab until the feed is seen.

#### Scenario: Place link
- **WHEN** B clicks the star name in A's colony entry
- **THEN** the camera flies to that star and the star card shows it

### Requirement: Map affordances for other empires
Clicking another player's empire marker on the map SHALL open the Players drawer scrolled to that empire. Hovering another player's fleet SHALL show the fleet's name and its empire.

#### Scenario: Marker click
- **WHEN** B clicks A's empire name on the map
- **THEN** the Players drawer opens with A's card expanded and highlighted

#### Scenario: Fleet hover
- **WHEN** B hovers one of A's ships
- **THEN** the readout says "<fleet> · fleet of the <A's empire>"
