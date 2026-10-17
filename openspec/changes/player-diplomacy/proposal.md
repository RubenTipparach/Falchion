## Why
Player-vs-player combat is open season: any aggressive fleet attacks any other player's fleet it meets. Players have no way to agree peace, make allies, or even see who is hostile. An MMO needs diplomacy between players.

## What Changes
- **Relations between every pair of players:**
  - neutral (the default);
  - war;
  - alliance.
- They live in the shared world, so both sides and every other player see the same thing.
- **Changing relations:**
  - **Declaring war** is one-sided. Hostilities begin a year after the declaration, so there are no surprise attacks within the same minute.
  - **Peace** (war → neutral) and **alliance** (neutral → alliance) are proposed by one side and accepted or declined by the other. Either side can withdraw a proposal.
  - **Breaking an alliance** is one-sided (back to neutral).
- **PvP needs war:**
  - Aggressive fleets attack only fleets of empires they are at war with.
  - Chases and pursuits fight only at war.
  - Neutral and allied fleets pass each other.
- **Allies:** their colony systems are friendly, so fleets resupply there.
- **News:**
  - Each side gets a dispatch when the other declares war, proposes, accepts or breaks an alliance.
  - Wars, peace and alliances appear in the galaxy activity feed.
- **UI:** Empire › Relations lists every other player with the relation, any pending proposal and the actions available.

## Impact
- **Core:**
  - `src/core/diplomacy/Diplomacy.ts` (new): relations, the state machine and queries.
  - `SharedWorld` gets `relations` and a `diplomacy` effect.
- **Sim:**
  - The `diplomacy` command.
  - News of relation changes.
  - Allied systems count as friendly.
  - Contacts and pursuits require war (headless `findContacts`, `resolveContact`, `findPursuits` and `resolvePursuit` take the shared world).
  - The `chase` command requires war.
- **Server:** the ticker passes the shared world to contact detection. The activity feed gains a `diplomacy` kind.
- **UI:** Empire › Relations section for players. The Players panel shows each player's relation.
