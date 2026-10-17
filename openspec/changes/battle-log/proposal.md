## Why
Battles only show up as dispatches, which scroll away (the last 40 lines). A player needs to see every time their worlds or fleets were attacked, and their own attacks: who, where, when, how it went and what each side lost.

## What Changes
- **What is recorded:** each empire keeps a battle log in its save, newest first, up to 60 entries.
  - NPC raids on its worlds and fleets: fought off, lost, a standstill, or a world plundered with what was taken.
  - Every round of a battle at sea with another player, including pursuits.
  - Its War Room assaults.
- **What each entry holds:**
  - the year;
  - the kind;
  - whether we were attacked;
  - the place;
  - our fleet or world and the enemy;
  - the round;
  - the outcome;
  - the ships lost, destroyed, boarded and taken on each side, by class;
  - any plunder.
- **War Room › Battle log** lists them:
  - attacks on us are marked;
  - a filter shows only attacks on us;
  - each entry expands to the losses on both sides;
  - Locate goes to the place;
  - Watch opens the battle view for a battle at sea still being fought.
- **Badge:** the War Room tab shows how many times we have been attacked since the log was last opened.

## Impact
- Core: `src/core/combat/BattleLog.ts` (new, pure: entries, cap, unseen count).
- Sim:
  - `EmpireSim` records raids, sea battles and assaults;
  - `GameState.battleLog` is saved;
  - what was last read is remembered in the browser.
- UI: `WarRoomPanel` Battle log section; TopBar badge.
