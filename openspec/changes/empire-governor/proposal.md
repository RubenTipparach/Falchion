## Why
The owner wants to set a focus (science, population, resources or money) and let the game run their
empire. Commerce (change `commerce`) automated mining, trading and colonising through companies.
Buildings and research still need a hand on every colony, every few minutes.

## What Changes
- **A governor for the empire** (Empire › Overview). Each part is switched on or off on its own.
  - **Focus:** Balanced, Science, Growth (food and population), Industry (minerals and goods) or Wealth (credits, goods and influence).
  - **Build in free slots:** each year every colony with a free slot and nothing under construction gets the building that serves the focus best.
    - It only builds what you can afford while keeping a credit reserve you set.
    - Food comes first when the empire is short of it.
    - A colony gets a variety of buildings, not one kind in every slot.
    - Shipyards are left to you.
  - **Pick research when idle:** when no research focus is set, the governor picks the next node.
    - It prefers what serves the focus.
    - Among those, it picks the cheapest that is open.
- **Rules are pure and shared.** The choices come from `src/core/empire/Governor.ts`, scored from building and node data with focus weights from `src/content/governor.ts`. The server makes the same choices.
- **New command:** `setGovernor`. The settings are saved as `governor`.

## Impact
- **Core:** `Governor.ts` (`pickBuilding`, `pickResearch`).
- **Content:** `governor.ts` (focus weights).
- **Sim:** a governor step each year; `setGovernor`.
- **Save:** `governor`.
- **UI:** the Overview's Governor card.
