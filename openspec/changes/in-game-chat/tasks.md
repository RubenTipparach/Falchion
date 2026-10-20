# Tasks

- [x] 1 Chat server (`server/chat.mjs`): global + DM, cleaning, rate limit, history, presence, SSE, persistence; verify `server/chat.test.mjs` (sign-in, CSRF header, rate limit, DM privacy, presence across tabs, places/mentions validation, persistence)
- [x] 2 Discord notifications for mentions and DMs to away players (`notifier.mention`: bot DM, channel ping fallback, per-sender/per-recipient limits); verify `server/chat.test.mjs` with a fake Discord via `fetchImpl`
- [x] 3 Pure text matching (`src/core/chat/ChatText.ts`): place links, mentions, autocomplete query; verify `src/core/chat/ChatText.test.ts`
- [x] 4 Client: `ChatClient` (stream with reconnect + backfill), `ChatPanel` (threads, online list, @autocomplete, links, unread badge, guest prompt), `chatPlaces`, `ChatSetup`, wiring in `main.ts`
- [x] 5 Docs: chat and mentions section in `docs/discord.md`
- [x] 6 Manual check: two players through a fake Discord with Playwright (global message seen live, private DM, @mention of an away player reaches the fake Discord DM endpoint, a star name link moves the camera, guest prompt)
