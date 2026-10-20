## Why
The owner: "need to total for food here", and "if negative food, it should cause some planets to starve (highest pop first)". A food shortfall was shared thinly across every hungry world and took many years to cost a single point of population, and the food ledger had no total or per-world net.

## What Changes
- **Starvation:** when the stores and this year's food cannot feed everyone, the most populous worlds go hungry first. Each takes as much of the shortfall as it eats, the next world the rest. A hungry world does not grow that year and loses a point once its shortfall reaches 2 × its population (was 5 ×).
- **Food ledger:** a "Net by source" section (income less costs for each world or source), a "Total each year" line, and a warning when the stores run dry this year.

## Impact
`src/core/economy/Population.ts`, `Economy.ts` (populationYear), their tests, `src/ui/ResourceLedger.ts`.
