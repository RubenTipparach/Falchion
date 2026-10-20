# Spec Delta

## Purpose

Lets signed-in players talk in the game: a global channel, private direct messages, who is
online, @mentions that reach away players on Discord, and place names that link to the map.

## ADDED Requirements

### Requirement: Signed-in chat
Chat endpoints SHALL be available only to players signed in with Discord; guests SHALL see a prompt to sign in instead of the chat. Posting a message SHALL require the `X-Falchion: 1` header in addition to the session cookie.

#### Scenario: Guest opens chat
- **WHEN** a guest opens the Chat tab
- **THEN** the panel says to sign in with Discord to chat, and the chat API answers 401

#### Scenario: Cross-site post
- **WHEN** a request posts a message without the `X-Falchion` header
- **THEN** it is refused with 403 and nothing is sent

### Requirement: Global chat
A message to `global` SHALL be delivered live to every player with the chat open and kept in recent history (the last 300). Text SHALL be one line of at most 500 characters without control characters, and each player SHALL be limited to 5 messages every 10 seconds.

#### Scenario: Message seen by another player
- **WHEN** player A sends a global message while player B has the game open
- **THEN** B sees it within a few seconds, with A's name and the time

#### Scenario: Flooding
- **WHEN** a player sends a sixth message within 10 seconds
- **THEN** it is refused with 429 and the panel says to slow down

### Requirement: Direct messages
A player SHALL be able to message another known player privately; only the two of them SHALL receive or load it. A direct message SHALL NOT mention or notify any third player.

#### Scenario: Privacy
- **WHEN** A sends a direct message to B
- **THEN** B receives it in a thread with A, and a third player C neither receives it live nor sees it in history

### Requirement: Presence
The server SHALL treat a player as online while at least one of their chat streams is open, broadcast changes to everyone, and list online players at `/api/online`. The panel SHALL list online players with a button to message each.

#### Scenario: Two tabs
- **WHEN** a player closes one of two open tabs
- **THEN** they stay online until the last tab closes

### Requirement: Mentions
Typing `@` SHALL suggest players, online first and then all known players; a picked or typed `@Name` of a known player SHALL be sent as their id and shown highlighted. The server SHALL ignore ids of unknown players.

#### Scenario: Autocomplete
- **WHEN** A types "@Fr" in the chat input
- **THEN** Friend is suggested, and picking them inserts "@Friend" that is sent as Friend's id

### Requirement: Discord notifications for away players
A mentioned player who is not online, and the recipient of a direct message who is not online, SHALL be notified on Discord: by a DM from the bot when possible, else by a channel post that pings only them. A private message's text SHALL never be posted in the channel. Notifications SHALL be rate-limited per sender and per recipient.

#### Scenario: Mentioning an away player
- **WHEN** A writes "@Friend meet me at Karon Minor" while Friend is not in the game
- **THEN** the bot sends Friend a Discord DM: "**A** mentioned you in Falchion: … — https://falchion.fly.dev"

#### Scenario: Bot cannot DM
- **WHEN** the bot cannot open a DM with the mentioned player
- **THEN** it posts in the notification channel pinging only that player

#### Scenario: Online player
- **WHEN** the mentioned player has the game open
- **THEN** no Discord notification is sent; the message is highlighted for them and the Chat tab shows a red badge

### Requirement: Location links when sending
When sending, the client SHALL attach the places named in the text that the sender knows (home, colony stars and planets, explored stars and planets, depots, fleet destinations, other players' homes), matched case-insensitively on whole words with longer names first. The server SHALL keep at most 10 places, each named in the text, with a name of at most 40 characters and integer hex coordinates.

#### Scenario: Attaching a place
- **WHEN** A sends "regroup at vela ii" and A has explored the planet Vela II
- **THEN** the message carries the place Vela II with its star's hex

#### Scenario: Unknown text
- **WHEN** a message contains a word that is not a place anyone attached or the reader knows
- **THEN** it stays plain text

### Requirement: Following location links
Readers SHALL see attached places, and names of places they know themselves, as links; clicking one SHALL fly the camera there and select the star, and a planet SHALL open its system. Player names SHALL link to their home.

#### Scenario: Teleport
- **WHEN** a reader clicks the star name "Karon Minor" in a message
- **THEN** the camera flies to Karon Minor and the star card shows it

### Requirement: Durable chat
Chat history SHALL survive a server restart: it SHALL be written to `chat.json` in the data directory atomically, shortly after each change and on shutdown, and loaded at start.

#### Scenario: Deploy
- **WHEN** the server restarts after a message was sent
- **THEN** the message is still in history
