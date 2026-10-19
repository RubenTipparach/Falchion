## ADDED Requirements

### Requirement: Per-client rate limits
The server SHALL limit each client's requests with token buckets: one for all API and sign-in calls, a smaller one for the costliest reads, and one for reported news. A client is a signed-in player, else an address. A request over its limit SHALL get 429 with a Retry-After header. Other clients SHALL NOT be affected.

#### Scenario: A script hammering the shared world
- **WHEN** one client requests `/api/world` many times a second
- **THEN** after a short burst it gets 429 with Retry-After, and other players are served as usual

### Requirement: Live stream cap
Each client SHALL hold at most six open live streams of each kind. Each SHALL be freed as it closes.

#### Scenario: Too many tabs
- **WHEN** a client opens a seventh world-clock stream
- **THEN** it is refused with 429 until one of the others closes

### Requirement: Cached reads
The player list SHALL be read from the database at most every five seconds, shared by callers arriving together, and refreshed when an empire is founded. The shared world SHALL be serialised once per version.

#### Scenario: Many players polling
- **WHEN** a hundred players fetch the player list within five seconds
- **THEN** the database is read once
