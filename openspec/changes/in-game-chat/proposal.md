# Proposal

## Why

Players in the shared galaxy cannot talk to each other inside the game. They need to
coordinate ("meet me at Karon Minor"), reach a friend who is away, and see who is playing
right now. High Frontier's location links (a place name in chat becomes a link that jumps
the camera there) are the model.

## What Changes

- **Chat server** (`server/chat.mjs`, zero dependencies): a global channel plus direct
  messages between two players. Messages are cleaned (one line, at most 500 characters, no
  control or bidi characters), rate-limited (5 per 10 s per player), kept in memory (last
  300 global, 200 per DM pair) and persisted to `DATA_DIR/chat.json` (debounced, atomic).
- **Endpoints**, all signed-in only: `GET /api/chat` (recent global messages and your DMs),
  `POST /api/chat` (needs the `X-Falchion: 1` CSRF header), `GET /api/chat/stream` (SSE:
  `message` events you may see, `presence` events) and `GET /api/online`.
- **Presence**: a player is online while they have a chat stream open (any number of tabs).
- **@mentions on Discord**: mentioned players (and DM recipients) who are not in the game
  get a DM from the bot, or else a channel post that pings only them. Private messages never
  have their text posted in the channel. Rate-limited per sender and per recipient.
- **Chat UI**: a Chat tab with an unread badge opens the Comms drawer: Global and one thread
  per DM, the online list with DM buttons, @autocomplete, and location links. Guests see
  "Sign in with Discord to chat".
- **Location links**: when sending, names of places the sender knows (home, colonies,
  explored stars and planets, depots, fleet destinations, other players' homes) are attached
  to the message; readers see them, and any names they know themselves, as links that fly the
  camera there and select the star. Player names link to their home.

Out of scope: moderation tools (mute, report, delete), message editing, channels other than
global, Discord-to-game message relay, PvP diplomacy.

## Capabilities

### New Capabilities
- `in-game-chat`: global chat, direct messages, presence, @mentions with Discord
  notifications, and location links.

## Impact

- New: `server/chat.mjs`, `server/chat.test.mjs`, `src/core/chat/ChatText.ts` (+ test),
  `src/app/ChatClient.ts`, `src/app/ChatSetup.ts`, `src/app/chatPlaces.ts`, `src/ui/Chat.ts`.
- Changed: `server/notifier.mjs` (`mention`), `server/index.mjs` (route, notifier API base
  and public URL, flush on shutdown), `src/app/main.ts` (three wiring lines),
  `src/ui/TopBar.ts` (`addTab`), `src/ui/icons.ts`, `src/ui/styles.css`, `docs/discord.md`.
- Extension points used: the `Drawer` base class for the panel, `ChatBackend`/`ChatContext`
  interfaces between UI and app, and the existing notifier for Discord.
