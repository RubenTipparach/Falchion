# Design

## Server

`createChat({ auth, file, players, notifier })` returns a request handler for
`/api/chat`, `/api/chat/stream` and `/api/online`, mounted in `server/index.mjs` next to the
admin portal. State is in memory (one Fly machine) and written to `chat.json` one second
after the last change (temp file + rename), and on SIGINT/SIGTERM.

- Recipients and mentions must be known players: those with a save (`store.players()`,
  cached 15 s) or with an open chat stream. Unknown ids are dropped (mentions) or refused
  (recipient). A DM can mention only its recipient, so a third player never learns of it.
- Attached places are kept only when integer hexes, names of at most 40 characters, and
  named in the text, so a link can never point somewhere the text does not show.
- Visibility: a message reaches a stream, or `GET /api/chat`, only when it is global or the
  viewer is its sender or recipient.
- Presence: user id -> set of open SSE responses. The first stream of a user and the close
  of the last one broadcast `presence` to everyone.

## Discord notifications

`notifier.mention({ from, to, text, private })` (extension of the existing notifier):

1. `POST /users/@me/channels { recipient_id }` (cached per user), then post the message to
   that DM channel with `allowed_mentions: { parse: [] }`.
2. If the bot cannot DM them (no shared server, DMs closed), post to `DISCORD_CHANNEL_ID`
   with `<@id>` and `allowed_mentions: { users: [id] }`, never `everyone`. Private messages
   post only "sent you a direct message", without the text.
3. Hourly limits per sender (10) and per recipient (6).

## Client

- `src/core/chat/ChatText.ts` (pure): `matchTerms` splits text into plain runs and known
  names (case-insensitive, whole words, longest first, non-overlapping); `findPlaces`,
  `findMentions`, `mentionQuery`, `suggestPeople`, `threadOf`. Tested in `ChatText.test.ts`.
- `src/ui/Chat.ts`: `ChatPanel extends Drawer`. It depends on two interfaces: `ChatBackend`
  (send) and `ChatContext` (who am I, known places, homes, teleport). Messages are built with
  `h()`/text nodes only.
- `src/app/ChatClient.ts`: implements `ChatBackend` over fetch and `EventSource`, backfills
  history on every (re)connect and reconnects with backoff when the stream closes.
- `src/app/chatPlaces.ts`: known places from `GameState` (home, selected, colonies, depots,
  explored planets and their stars, fleet destinations) plus other players' homes.
- `src/app/ChatSetup.ts`: composition: builds the panel and client, fetches `/api/players`
  for autocomplete and homes, implements teleport (`focusPlanet` for a planet, else
  `select` + `flyTo`), and keeps one right-hand drawer open at a time.
