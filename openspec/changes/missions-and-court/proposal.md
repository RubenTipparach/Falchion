## Why
The owner:
> implement quests and missions, to help move things along, reward players with loot, and leveling up their leader, or administration members. Introduce advisors into the mix, these advisors provide bonuses and make decisions for you on your behalf. the missions will act as like sort of tutorials on what to do in the game, but overtime progress into an expansive story. different missions can be uncovered through exploration, and negotiations with neighboring empires. On occasion NPC empires should give you quests to complete as well which will improve relations and provide you with better trade options, politics, and improved cultural and religious points

## What Changes
- **Missions** (`src/content/missions.ts`, `src/core/missions/Missions.ts`). Each mission is a briefing, objectives and rewards.
  - **Objectives** are read from the empire's state, so progress shows live and the server agrees. Kinds:
    - planets surveyed, of a type or far from home;
    - colonies, buildings and ships;
    - research;
    - stockpile and income;
    - contacts and standing;
    - depots;
    - a fleet at a star;
    - resources handed over;
    - megastructures surveyed;
    - the leader's level.
  - **The story runs in chapters:**
    - **I. First Light:** the tutorial on surveying, mining, research, colonies, supply, first contact, trade, building and a fleet.
    - **II. Whispers:** echoes of something older, found by exploring choir, dead machine and bone worlds.
    - **III. The Builders:** the megastructures and an expedition to the galactic core.
  - **Discovery and contact:** surveying certain worlds or making first contact uncovers missions. Contact uncovers an envoy mission per faction.
  - **Rewards:**
    - materials, research shards and loot;
    - experience for the leader and for the mission's advisor;
    - new advisor candidates;
    - standing and timed boons.
  - **Claiming:** a mission is claimed when done (Claim), and the year's end claims any left done. A mission that hands resources over takes them on its claim.
- **NPC quests.** Now and then a known faction offers a quest, more often the better you stand with it.
  - **Offers** come from the faction, its home and the year, so the server and the browser agree.
  - **What they ask:** hand over metals, crystals, goods or faith; survey more planets; or send a fleet to their home.
  - **Lifetime:** offers lapse after 60 years, and accepted quests after 150.
  - **Rewards:** standing, influence (politics) and faith (religion and culture). Sometimes also a timed trade accord (+10% trade), research shards, or an envoy candidate.
- **The court** (`src/core/empire/Court.ts`, `src/content/advisors.ts`):
  - **The leader:** your ruler gains experience and levels (up to 20). Each level adds influence and stability.
  - **Advisors:** six seats (Steward, Chancellor, Admiral, Science Minister, Prelate, Spymaster). Leader levels open more of them, from two at the start to all six.
  - **Advisor bonuses:** each advisor has a level (up to 10) and a trait, and brings bonuses for their seat that grow with level.
  - **Advisor growth:** advisors gain experience from the missions of their seat and from their own decisions.
  - **Recruiting:** candidates come from missions and envoys, or can be sought for influence.
- **Delegation: advisors decide for you.** Each yearly decision is noted in dispatches.
  - **Steward:** builds by their focus.
  - **Science Minister:** keeps a research focus set.
  - **Chancellor:** accepts affordable quests and sends tribute to factions turning hostile.
  - **Admiral:** sends badly damaged idle fleets home to repair.
  - **Prelate:** sends missionaries to known empires.
  - **Spymaster:** keeps spy networks filled.
- **Bonuses** reach the economy as boons (`EconomyState.boons`). These are the court's bonuses plus timed accords, beside government, policies and faith, so income, trade, mining, science and approval all count them.
- **Commands:** `claimMission`, `acceptQuest`, `declineQuest`, `appointAdvisor`, `dismissAdvisor`, `delegate` and `seekAdvisor`, validated on the server.
- **UI:** a Missions panel with two tabs.
  - **Missions:** the story chapter, active missions with live progress and rewards, faction offers, and a record.
  - **Court:** the leader's level, the advisor seats with their bonuses and Delegate switches, and candidates to appoint.

## Impact
- **Content:** `missions.ts`, `advisors.ts`.
- **Core:** `missions/Missions.ts`, `empire/Court.ts`; `Economy.ts` adds boons to `activeSources`.
- **Sim:** mission and court state; yearly checks, offers, claims and delegated decisions; the new commands.
- **UI:** `MissionsPanel`, a top bar tab and an icon.
- **Saves:** older saves start the story at chapter I.
