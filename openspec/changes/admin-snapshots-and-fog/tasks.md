## 1. Vision rules
- [ ] 1.1 `src/core/visibility/Vision.ts`: explored and sighted systems, visited along a route, sight of a star, megastructure mask, allies, server filters for public views and the shared world; verify `src/core/visibility/vision.test.ts`
- [ ] 1.2 `EmpireSim.step` records `visited`; `visited` in the save and the new empire; verify `src/sim/vision.test.ts`

## 2. Snapshots
- [ ] 2.1 `summarizeSave` (`src/sim/snapshot.ts`), exported from headless; verify `src/sim/snapshot.test.ts`
- [ ] 2.2 `snapshots` table, `server/snapshots.mjs` (hourly, manual, reset; range reads; stats); verify `server/snapshots.test.mjs`
- [ ] 2.3 Event log range reads; verify `server/eventLog.test.mjs`
- [ ] 2.4 `docs/snapshots.md`: every summary field

## 3. Admin
- [ ] 3.1 Export (JSON Lines, snapshots and events merged by time), snapshot summary, take-now; verify `server/admin.test.mjs`
- [ ] 3.2 Server reset: foundings kept, `refoundSave` in headless, shared world reset, typed confirmation; verify `server/reset.test.mjs`
- [ ] 3.3 Hide systems toggle: setting, `/api/info`, `/api/vision`, live `settings` event; verify `server/admin.test.mjs`

## 4. Server filtering
- [ ] 4.1 `server/vision.mjs`: cached vision per player (own and allies), filtered players list, live player updates and shared world; verify `server/vision.test.mjs`

## 5. Map
- [ ] 5.1 `src/app/Vision.ts` lens; selection, hover, attractor, right-click, links and search use it (manual check)
- [ ] 5.2 `FogOfWarLayer`; `NearStarLayer` dims or hides uncharted stars (Playwright screenshot)
- [ ] 5.3 Megastructures gated: beacons, system view, card, search (manual check; search lens verified in `src/core/galaxy/galaxySearch.test.ts`)
