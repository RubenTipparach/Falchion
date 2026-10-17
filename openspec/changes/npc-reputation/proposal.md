## Why
NPC empires raid anyone who knows them, and nothing a player does changes that. There is no
diplomacy: trading with a faction, paying it off or attacking its worlds should change how it treats
you, and players need to see where they stand with each faction.

## What Changes
- **Standing:** every known NPC faction holds a standing with each player, from −100 to +100. It starts at the faction's disposition:
  - pirates and Vossk start hostile-leaning;
  - the Seraph Choir starts friendly;
  - the others start neutral.
- **What moves it:**
  - Selling them trade goods raises it.
  - Tribute (200 credits and 10 influence) raises it.
  - Beating off their raiders lowers it a little; assaulting their worlds lowers it a lot, and capturing one more.
  - Every five years it drifts one point back toward their disposition.
- **Tiers:** Hostile (≤ −50), Unfriendly, Neutral (−10 to 10), Cordial, Allied (≥ 50).
- **What standing does:**
  - Cordial and Allied factions do not raid you.
  - Hostile ones raid more often.
  - Their markets pay more the better you stand (up to +50%).
- **Reputation chart:** a Relations tab in the Empire panel with:
  - a line chart of your standing with every known faction over time;
  - each faction's tier, a standing bar, what it thinks of you, and a tribute button.

## Impact
- **Content:** `npcs.ts` gets each archetype's disposition.
- **Core:**
  - `NpcState.standing` per player.
  - A `standing` shared-world effect.
  - The NPC year drifts standing and skips friendly targets.
  - `src/core/npc/Reputation.ts` holds tiers and helpers.
- **Sim:**
  - Standing changes from trade, battles and assaults.
  - `sendTribute` command.
  - The save keeps a sampled history (`relations`) for the chart.
- **UI:** Empire › Relations; War Room targets show standing.
