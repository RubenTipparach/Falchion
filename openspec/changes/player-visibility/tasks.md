# Tasks

- [x] 1 Activity log (`server/activity.mjs`): kinds, cleaning, places, per-player rate limit, `found` de-duplication, presence with grace, persistence, `GET /api/activity`, `POST /api/events` (Discord forwarding kept); verify `server/activity.test.mjs` (sign-in, kinds, rate limit, founding once, presence, persistence)
- [x] 2 Live public views (`server/live.mjs`, `chat.broadcast`, save handler in `server/index.mjs`); verify `server/activity.test.mjs` "sends a saved public view to the other players at once, never back to the sender" (real server over HTTP and SSE) and "coalesces a burst of saves"
- [x] 3 Pure client logic (`src/core/social/Activity.ts`, `Roster.ts`): event validation and merge, place split, roster order, relative time, newer-copy merge; verify `src/core/social/social.test.ts`
- [x] 4 Client sync: `notableChange`, `pushDelay`, urgent pushes in `ServerSaves`, `isFleetMovement`, claim ids in `othersOnMap`, `GalaxyPlayers`; verify `src/app/players.test.ts`
- [x] 5 Stream taps and live hooks (`ChatClient`, `ChatSetup`), `PlayersSetup`, `PlayersPanel` (Empires and Galaxy feed), `Toasts`, clickable territory markers, fleet hover text, report kinds and places in `GameController`, wiring in `main.ts`
- [x] 6 Docs: Players and activity sections in `docs/discord.md`
- [x] 7 Manual check: two players through a fake Discord with Playwright: B sees A with flag and online dot; A's move order reaches B's drawer in under a second; A's founding, survey and colony appear in B's feed with working place links and toasts; locate home and fleet, marker click, fleet hover and DM all work; A's dot goes grey when A leaves
