## Why
The owner: "lots of battles happen when I'm afk, I would like to watch battles that happen, so please add a feature that can replay battles".

## What Changes
- **The battle log keeps the battle's rounds.** Raids and the fight in orbit of an assault keep every round. A round at sea keeps its own round, and the earlier rounds of the same battle come from the entries before it. Only the newest 24 entries keep rounds; older ones keep their summary. The whole save goes to the browser every year, so this bounds its size.
- **Replay.** Each entry with rounds has a play button and a Replay button. They open the battle view and play the rounds in order, about 20 s each, on the view's own clock rather than the world year. When it ends, Replay again starts over. A replay has no Retreat.
- `resolveBattle` records each round's breakdown and the fleets going into it. It records only: results are unchanged.

## Impact
- **Battle code:**
  - `Combat.resolveBattle` (rounds carry `detail` and `before`);
  - `BattleRecord.battleRecords`;
  - `BattleLog` (`records`, `REPLAY_CAP`, `cleanRecords`);
  - `EmpireSim` (the three log sites).
- **Battle view:** `BattleLayer` (`replay` on a target, a replay clock, `restartReplay`).
- **App and UI:**
  - `GameController.replayBattle`;
  - `BattleLogView`, `WarRoomPanel` and `BattleHud`.
- **Not an order:** it is not added to `COMMANDS`.
