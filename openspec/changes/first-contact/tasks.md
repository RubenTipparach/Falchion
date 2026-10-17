## 1. Rules
- [x] 1.1 `Diplomacy.ts`: `CONTACT_RANGE`, `haveMet`, `firstContacts`; `SharedWorld.contacts` and the `contact` effect; diplomacy ignored before contact; verify `src/core/diplomacy/diplomacy.test.ts`
- [x] 1.2 `EmpireSim`: `hasMet`, `unmetEmpires`, refusal with the reason, first-contact news; headless `findFirstContacts`; verify `src/sim/diplomacy.test.ts`

## 2. Server and UI
- [x] 2.1 The yearly tick applies first contacts before fights and logs them; verify `server/world.test.mjs`
- [x] 2.2 Relations lists met players and counts the rest; Players panel "Not met" tag
