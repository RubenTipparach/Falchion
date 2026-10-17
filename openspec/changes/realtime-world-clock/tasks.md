# Tasks

## 1. Clock

- [x] 1.1 `WorldTime.ts`: tickAt, tickFraction, formatDuration, catchUpTicks; verify `worldTime.test.ts`
- [x] 1.2 Server `/api/clock` and SSE `/api/ticks` aligned to minute boundaries; verify CI smoke test
- [x] 1.3 `WorldClock.ts`: server clock with skew correction and local fallback

## 2. Game

- [x] 2.1 `GameController.advanceTo` / `step`: live ticks and capped catch-up in one store batch; verify `saveGame.test.ts` (batching)
- [x] 2.2 `SaveGame.ts` browser persistence; verify `saveGame.test.ts`
- [x] 2.3 `progressAtTime` continuous ship motion; verify `fleet.test.ts`; base speed 1 ly/min

## 3. UI

- [x] 3.1 Replace End Turn with year + countdown; dev-only "+1 yr"; "Found a new empire"
- [x] 3.2 Years and minutes in all UI text

## 4. Follow-ups

- [ ] 4.1 Build and research durations in years
- [ ] 4.2 Standing orders for fleets while the player is away
- [ ] 4.3 Server-side authoritative empire state and Discord notifications
- [ ] 4.4 Economy rebalance for income every minute (storage caps, upkeep)
