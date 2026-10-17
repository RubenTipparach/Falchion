# Tasks

## 1. Server foundation

- [ ] 1.1 Create `server/` package importing `src/core`; verify server unit tests run with `npm test`
- [ ] 1.2 Implement event log and command validation; verify `eventLog.test.ts` replay rebuilds identical state

## 2. Time

- [ ] 2.1 Implement `WorldTurnAuthority` (scheduled world turns); verify `worldTurn.test.ts` offline arrival
- [ ] 2.2 Implement contact detection and `LockstepTimeAuthority`; verify `lockstep.test.ts` (open, timeout, close)

## 3. Combat and coexistence

- [ ] 3.1 Implement combat resolver and `Ability` registry; verify `combat.test.ts` replay and counters
- [ ] 3.2 Implement bombardment, assault and capture → reverse-engineering shards; verify `capture.test.ts`
- [ ] 3.3 Enforce no-PvP and co-op reward split; verify `coexistence.test.ts`

## 4. Expansion and economy

- [ ] 4.1 Add biome table and expansion rules; verify `biomes.test.ts`
- [ ] 4.2 Implement `IncomeSource` registry (planets, trade, religion, politics); verify `economy.test.ts`
- [ ] 4.3 Implement espionage and influence; verify `espionage.test.ts`

## 5. Discord

- [ ] 5.1 Implement `IdentityProvider` with Discord OAuth and mock; verify sign-in flow manually in a test guild
- [ ] 5.2 Package client as a Discord Activity; verify launch from a voice channel
- [ ] 5.3 Implement `Notifier` (DM + webhook); verify contact alert delivered in test guild
