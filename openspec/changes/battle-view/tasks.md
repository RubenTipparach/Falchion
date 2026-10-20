## 1. Rules: the round's breakdown (src/core/combat)
- [x] 1.1 `resolveRound` logs `detail`: lost and boarded by class, damage by doctrine, jam and flak, hull points, damage carried at the round's end; results unchanged, no ammunition (tests: `src/core/combat/battleRecord.test.ts` "tallies every loss and boarding by class", "splits the damage by doctrine", "keeps the damage each class carries", "is deterministic (golden seed)"; existing `combat.test.ts` and `src/sim/pvp.test.ts` still pass)
- [x] 1.2 `BattleRecord`: `recordRound` (this fleet first), `flipRecord`, `afterRound`, `shipHealths` / `classHealth` from carried damage, `cleanBattleRecord` for untrusted input (tests: "puts the recording fleet first", "carries the battle's starting strength over", "spreads a class's damage", "checks another player's record")
- [x] 1.3 `FleetBattle.view` written by `applyContact`; `Loadout.damage` read into the round (test: `src/sim/pvp.test.ts` "keeps the round's record for the battle view in both saves")

## 2. Public view
- [x] 2.1 `publicEmpire` publishes the battle's round, names and record; `othersOnMap` lists other players' battles, records checked (test: `src/app/players.test.ts` "lists the battles other players' fleets are in")
- [x] 2.2 Server `publicView` bounds the record (test: `server/server.test.mjs` "keeps a fleet's battle and its round record, bounded")

## 3. Battle view (src/render/battle)
- [x] 3.1 `BattleScript`: seeded schedule of shots, kill shots, pods, repairs and jamming; health over the round; strength meter and outcome (tests: `src/render/battle/battleScript.test.ts`)
- [x] 3.2 `BattleFx`: glow points, one instanced beam quad, instanced debris and shields (four draw calls)
- [x] 3.3 `ShipBatches`: ship meshes from `ShipFactory`, merged by material and instanced per class and empire
- [x] 3.4 `BattleStage`: formation, range closing by band, every effect of the mockup, captured ships in the captors' colours, breaking off and pursuit
- [x] 3.5 `BattleLayer`: covers the map, replays the round across its world year, follows the next round; `BattleRig` camera follows the centroid and pulls back with separation
- [x] 3.6 `BattleMarkerLayer`: pulsing red hex and crossed-swords marker with the round; click opens the view

## 4. HUD and wiring
- [x] 4.1 `BattleHud`: strength meter (60%/30% bar colours, crippled flicker, capital bars wider, verdicts, trend arrows), fleet labels, callouts, dock with round, band, countdown, Retreat and Back; drag, wheel, pinch
- [x] 4.2 Watch battle on the fleet card's battle banner and on other players' fleets in battle; Esc leaves the view
- [x] 4.3 Controller: battle sightings from your fleets and the public views, targets, ending (who breaks off, who chases), markers refreshed with the state

## 5. Checks
- [x] 5.1 `npx tsc --noEmit`, `npx vitest run`, `npm run spec:validate`, `npm run build`
- [x] 5.2 Manual: Playwright at 1440x900 and 390x844 (touch) mid-round, at the end of a battle and after Retreat; no console errors, no horizontal scroll
