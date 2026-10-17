## 1. Core and content
- [x] 1.1 Add `stance` to `FleetOrders`, with `isAggressive`, `Encounter`, `attacks` and `startsFight` in `src/core/fleet/Presence.ts` (verified by `startsFight` in `src/core/fleet/presence.test.ts`).
- [x] 1.2 Add `warshipsOf` and `hasWarships` in `src/content/logistics.ts` (verified by the freighter case in `src/sim/pvp.test.ts`).

## 2. Sim and commands
- [x] 2.1 Carry the stance in the orders codec in `src/sim/commands.ts` (verified by the codec and stance-keeping cases in `src/sim/pvp.test.ts`).
- [x] 2.2 Add `EmpireSim.contactForce` and `applyContact` (verified by the losses, dispatch and determinism cases in `src/sim/pvp.test.ts`).
- [x] 2.3 Add `findContacts` and `resolveContact` to `src/sim/headless.ts` (verified by the contact cases in `src/sim/pvp.test.ts`).

## 3. Server
- [x] 3.1 Resolve contacts after each world year in `server/simTicker.mjs`, with both empires locked in id order (verified by the contact cases in `server/simTicker.test.mjs`).
- [x] 3.2 Sanitise `armed` and `stance` in `publicView` in `server/index.mjs`.

## 4. Client
- [x] 4.1 Send `armed` and `stance` in `publicEmpire` (`src/app/ServerSync.ts`).
- [x] 4.2 Add the Aggressive chip to the fleet card in `src/ui/StarInfoPanel.ts`.

## 5. Review fixes
- [x] 5.1 Refuse the aggressive stance for fleets without warships in `EmpireSim.setOrders`, and keep it when a trade run starts (verified in `src/sim/pvp.test.ts`).
- [x] 5.2 Fight only when both empires have played exactly to the year; order and seed the battle by owner and fleet id; bound the other player's names in the dispatch (verified in `src/sim/pvp.test.ts`).
- [x] 5.3 Fight a year's contacts once per ticker, and put the first save back when the second cannot be stored (verified in `server/simTicker.test.mjs`).
- [x] 5.4 Show another empire's warfleets and aggressive warfleets on the map label and fleet card (verified in `src/app/players.test.ts`); test `publicView` sanitising (`server/server.test.mjs`).

## 6. Rounds and retreat
- [x] 6.1 One round a world year (resolveRound), at least one ship lost per round, range closing over rounds
- [x] 6.2 Fleets remember the battle and its round; the fleet card shows it with Retreat
- [x] 6.3 `retreat` command: nearest friendly system at once, ending the battle
