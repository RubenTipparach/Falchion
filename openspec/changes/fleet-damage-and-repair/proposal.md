## Why
In battles at sea, damage was cleared every round: a ship either died that round or was as good as new. That made Menders useless at sea, and the battle view's health bars could only be approximate. Ammunition also decided most battles (long-range fleets ran dry by round 4), and the player found it more bookkeeping than strategy.

## What Changes
- **No ammunition:**
  - Fleets carry only supply, which is spent exploring.
  - Battles, raids and assaults always fire at full strength.
  - Ammunition gauges, costs and notes are removed.
  - Old saves drop their ammunition.
- **Damage carries over:**
  - Each fleet keeps the damage on each of its ship classes (`loadout.damage`, hull points per class).
  - Battles and raids start from it and leave the new damage.
  - A ship dies when its damage reaches its hull.
  - The "left-over damage destroys one more ship by chance" roll is gone, because the damage now stays.
  - At least one ship is still lost every round.
- **Repairs:**
  - Menders heal their fleet between rounds and every year.
  - A fleet on station in a friendly system repairs each year. The rate depends on what is there:
    - a colony with an Orbital Shipyard (the capital has one) repairs fully;
    - another colony of yours repairs 40 hull points per class;
    - a supply depot or an ally's colony repairs 15.
- **UI:** the Fleets panel and the fleet card show hull integrity, and say "Repairing" where repairs happen.

## Impact
- **Core:**
  - `Combat.ts`: `Side.damage` in, `BattleResult.damage` out, and Menders in `resolveRound`.
  - `Logistics.ts`: supply only, plus a repair helper.
- **Content:** `logistics.ts` gains the repair rates.
- **Sim:** `EmpireSim` keeps the damage on loadouts and repairs each year; headless contacts and pursuits carry damage.
- **UI:**
  - Fleets panel, fleet card, Shipyard and War Room: ammunition removed, hull shown.
  - The public view carries each fleet's damage, for the battle view.
