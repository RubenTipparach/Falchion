## Why
The owner: "do you have ways to prevent congestion to the server/client ... add the cache and rate limits". Orders and chat were already rate-limited. Gaps remained:
- The read endpoints had no limit per client.
- `/api/players` read every empire from the database on each call.
- Any client could open any number of live streams.

## What Changes
- **Every client gets a bucket for all of `/api` and `/auth`.** A client is a signed-in player, else an address (Fly-Client-IP or X-Forwarded-For). The bucket allows bursts of 120, then 12 a second.
- **The dearest reads have a smaller bucket:** bursts of 12, then one every 2 s. They are:
  - the player list;
  - the shared world;
  - the activity feed;
  - your save;
  - who is online.
- **Reported news** (`POST /api/events`) has its own bucket: bursts of 10, then one every 2 s.
- **Over a limit:** the answer is `429` with `Retry-After`.
- **Live streams:** at most 6 per client (the world clock and chat each).
- **Caches:**
  - **The player list** is read from the database at most every 5 s, and refreshed at once when an empire is founded. Callers arriving together share one read.
  - **The shared world** is serialised once per version, not once per request.
- **Code:** `server/throttle.mjs` holds the token buckets, the short cache, the stream cap and the client key. It has zero dependencies and is tested.

## Impact
`server/throttle.mjs` (new) and `server/index.mjs`. Clients are unchanged: what they send stays well inside the limits.
