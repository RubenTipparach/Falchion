# Proposal

## Why

The owner asked for "a full MMO: I want to see what other players are doing". Today other
players are nearly invisible: their fleets and territory refresh once a minute, there is no
list of who is in the galaxy, and their news (colonies, battles, depots) goes only to the
Discord channel. This is stage 1: make other players visible and alive in the game. Moving the
simulation onto the server is a later, separate change.

## What Changes

- **Galaxy activity feed (server, `server/activity.mjs`)**: a bounded log (last 300) of notable
  events by every player: empire founded, colony settled, supply depot built, battle won or
  lost, system fully surveyed, came online, went offline. Persisted to `DATA_DIR/activity.json`
  (debounced, atomic, flushed on shutdown) like `chat.json`.
  - Sources: `POST /api/events` (now also `survey` and `found`; kinds validated, text cleaned,
    an optional place kept only when named in the text, 20 reports per 10 minutes per player),
    the server's own first-save (`found`, de-duplicated with the client's report), and chat
    presence (with a 30 s grace so a reload is not news; players without a save are skipped).
  - `GET /api/activity` (signed-in only) and a live `activity` SSE event.
  - Battles, colonies and depots still go to the Discord channel through the notifier.
- **Real-time other players (server, `server/live.mjs`)**: each `PUT /api/save` sends the
  player's public view as a `player` SSE event to every other signed-in player (never back to
  the sender), at most once a second per player (the latest wins).
- **One live connection**: both events travel on the existing chat stream
  (`/api/chat/stream`); `chat.mjs` gains `broadcast(event, data, { except })` and an
  `onPresence` hook.
- **Prompt saves (client)**: a move order, a new colony or depot, or founding marks the next
  save as news: it is pushed within about 0.3 s, at most once every 2.5 s (routine saves stay at
  10 s). The once-a-minute `/api/players` poll stays as the fallback.
- **Players drawer (client)**: a "Players" top-bar tab lists every empire: flag, name in its
  colour, ruler title and name, Discord name, online dot, colony systems, fleets, last seen,
  distance from your home in ly. Actions: locate home, DM (opens the chat thread), and an
  expandable fleet list (destination, ETA, locate). You are listed first; then online players,
  then by last seen.
- **Galaxy feed (client)**: a second tab in the same drawer lists activity newest first with
  flags, coloured names, relative times and place links. New entries from other players show
  as a short toast and a badge on the tab.
- **Map**: clicking another player's territory marker opens the drawer on that empire;
  hovering another player's fleet names its empire.

Out of scope: server-side simulation (stage 2), PvP interactions, diplomacy, moderation of the
feed, notifications for the feed outside the game.

## Capabilities

### New Capabilities
- `player-visibility`: the galaxy activity feed, live public views of other players, the
  Players drawer and Galaxy feed, and the map affordances for other empires.

## Impact

- New: `server/activity.mjs`, `server/live.mjs`, `server/activity.test.mjs`,
  `src/core/social/Activity.ts`, `src/core/social/Roster.ts` (+ `social.test.ts`),
  `src/app/GalaxyApi.ts`, `src/app/GalaxyPlayers.ts`, `src/app/PlayersSetup.ts`,
  `src/app/players.test.ts`, `src/ui/PlayersPanel.ts`, `src/ui/Toasts.ts`.
- Changed: `server/index.mjs` (wiring, save broadcast, `/api/events` moved to the activity
  module), `server/chat.mjs` (`broadcast`, `onPresence`), `src/app/ServerSync.ts` (claim ids,
  movement validation, `notableChange`, urgent push throttle), `src/app/ChatClient.ts` and
  `ChatSetup.ts` (stream taps and live hooks), `src/app/GameController.ts` (report kinds and
  places, hover text), `src/app/main.ts` (wiring), `src/render/map/TerritoryLayer.ts`
  (clickable markers), `src/ui/icons.ts`, `src/ui/styles.css`, `docs/discord.md`.
- Extension points used: the `Drawer` base class, the `PlayersContext` interface between the
  panel and the app, `LiveHooks`/`StreamTaps` for anything else that listens on the live stream,
  and the existing notifier for Discord.
