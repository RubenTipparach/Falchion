---
name: testing-practices
description: How to test Falchion code. Use when adding or changing logic in src/core or src/content, fixing a bug, or before committing.
---

# Testing practices

- Runner: **Vitest** (`npm test`). Tests live next to code as `*.test.ts`.
- `src/core/**` must have unit tests for every public behaviour; it is pure, so
  tests need no mocks beyond injected `Rng`.
- Prefer property-style checks for math: e.g. `distance(a,b) === distance(b,a)`,
  every neighbour is at distance 1, round-trip `pixel -> hex -> pixel`.
- Use golden seeds for procgen/loot (see `deterministic-simulation`).
- Bug fix = failing test first, then the fix.
- Rendering (`src/render`) is verified visually: `npm run dev` and look, or a
  Playwright screenshot. Keep logic out of render code so it doesn't need tests.
- Before pushing: `npm run typecheck && npm test && npm run build`.
- Every OpenSpec scenario should map to a test or a manual check noted in tasks.md.
