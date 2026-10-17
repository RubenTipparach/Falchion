# Design

## Server

```
PUT /api/save ──> store.save ──> playerFeed.publish(view) ──> chat.broadcast('player', view, { except: sender })
             └──(first save)──> activity.founded ─┐
POST /api/events ──> activity.report ─────────────┼──> log (300, activity.json) ──> chat.broadcast('activity', event)
chat stream open/close ──> activity.presence ─────┘                               └──> notifier.report (battle/colony/depot)
GET /api/activity ──> activity.recent()
```

- `createActivity({ auth, file, empireOf, broadcast, forward })` owns the log and handles
  `GET /api/activity` and `POST /api/events`. Each event is
  `{ id, at, player: { id, name }, empire: { name, color } | null, kind, text, place? }`.
  `empireOf` reads the player's saved public view, so the feed shows the empire as it was.
- Kinds: `found`, `colony`, `depot`, `battle`, `survey` are reportable; `online` and `offline`
  are server-only. Text is cleaned with chat's `cleanText` (one line, no control or bidi
  characters, 160 characters). A place is kept only with integer hex coordinates and a name of
  at most 40 characters that appears in the text.
- Rate limit: 20 reports per player per 10 minutes (429 above). `found` is de-duplicated per
  player for 10 minutes, so the client's report and the server's first-save event announce a
  founding once, whichever arrives first. Presence events: 30 s grace (a reload is not news),
  at most 6 an hour per player, none for players without a save.
- `createPlayerFeed({ broadcast })`: per player, at most one `player` push a second; a save
  inside the window is sent when it ends (the latest wins).
- One live connection: the chat stream. `chat.broadcast(event, data, { except })` writes to
  every connected signed-in player; `onPresence(user, online)` fires on a player's first stream
  and when their last one closes.

## Client

- Pure logic in `src/core/social`: `Activity.ts` (event shape, `cleanEvent` for untrusted
  events, `mergeActivity`, `splitOnPlace`) and `Roster.ts` (`sortRoster`, `relativeTime`,
  `upsertNewer`, `mergeSnapshot`). Tested in `social.test.ts`.
- `GalaxyPlayers` (app, no DOM): others (polled snapshot merged with live pushes, newer
  `updatedAt` wins), who is online, and the feed; `onChange(what, freshEvents)`.
- `ChatClient` takes `StreamTaps` (extra SSE event handlers); `setupChat` takes `LiveHooks`
  (`taps`, `presence`, `status`) so the Players feature listens on the same stream without the
  chat knowing about it. On every (re)connect the players and the feed are reloaded.
- `setupPlayers` (composition): builds `PlayerRow`s (validated identities via `cleanIdentity`
  and `HERALDRY`, distances with `hexDistance`, fleet destination and ETA from the movement),
  applies other players to the map (`othersOnMap` → `setOtherFleets`, `territory.setDynamic`
  only when claims changed), shows toasts, and wires marker clicks.
- `PlayersPanel extends Drawer` depends only on `PlayersContext`. All player text goes in as
  text nodes; colours are validated `#rrggbb`. Redraws are skipped when the output is unchanged
  so a click is never lost to a redraw.
- Saves: `notableChange(prev, next)` (own fleet courses, colonies, depots, identity) marks the
  next push urgent; `pushDelay` keeps 10 s between routine pushes and 2.5 s between urgent ones.
  `flush(closing)` sends at once only when the page is closing.
