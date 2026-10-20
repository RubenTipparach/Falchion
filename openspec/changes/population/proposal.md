## Why
Worlds have no population: every colony is the same size forever, and food is only an empire-wide stockpile. The player wants population to drive a world's cities, and food on each world to decide whether it grows or starves.

## What Changes
- **Population on each colony:**
  - Each colony has a population (`pop`, a whole number, at least 1) and growth progress.
  - A newly settled or captured world starts at pop 1; a new empire's capital starts at 3.
  - Older saves get pop 1, or 3 for the capital.
- **Food:**
  - Each pop eats 2 food a year, so a larger world needs more food.
  - A world's own food balance is what it produces minus what its pop eats.
  - The capital gains +4 food among its capital yields, so it can grow.
- **Growth:**
  - A world grows only from its own food surplus, which builds up growth progress.
  - The next pop needs 10 × current pop.
  - A world never exceeds 3 × planet size.
- **Shortages:**
  - A world short of food is fed from the empire's stores, which other worlds' surpluses fill.
  - While the stores cover it, it does not decline, and it does not grow.
- **Decline:**
  - Only the share of a world's shortfall that the stores cannot cover is taken from its growth progress.
  - When that progress falls to −5 × pop, the world loses a pop (never below 1).
- **News and UI:**
  - The yearly report says when a world grows or declines.
  - The planet card shows the pop, the world's own food balance and its growth progress.
- **Cities:** each pop is one major city on the world's surface (the planet close-up change).

## Impact
- Content: `CAPITAL_YIELDS.food`, the population constants.
- Core:
  - `src/core/economy/Population.ts` (new, pure);
  - `Economy.ts`: food per pop, population each year in `resolveTurn`.
- Sim: new colonies start at pop 1; the save upgrade.
- UI: the planet card and colony view.
