# Falchion

An at-scale, hex-based 4X MMO set in a 70,000 light-year galaxy, built with three.js and planned Discord integration.

## Quick start

```bash
npm install
npm run dev      # open the mockup
npm test         # core unit tests
```

## Mockup controls

- **Scroll**: exponential zoom from a single hex (1 ly) to the whole galaxy
- **Drag**: pan; **right-drag**: tilt/rotate
- **G**: toggle between hex view and galaxy (quadrant / radial cell) view
- **Click a star**: select it to see its sector address, distance and travel time
- Panels: **Shipyard** (procgen ship designer), **Research** (branching tech tree with shards), **Explore** (encounters and loot crates)

## Spec-driven development

This repo uses [OpenSpec](https://openspec.dev/). Specs and change proposals live in `openspec/`; Claude Code commands are under `/opsx:*`. Project engineering skills (SOLID, modular systems, determinism, testing) live in `.claude/skills/`.

## Screenshots

| Hex view (1 hex = 1 ly) | Galaxy view (quadrants + radial cells) |
|---|---|
| ![](docs/screenshots/hex-view.png) | ![](docs/screenshots/galaxy-view.png) |
| **Research tree** | **Exploration loot** |
| ![](docs/screenshots/research.png) | ![](docs/screenshots/explore.png) |

Procedural ship styles (organic, technological, classic, geometric, utilitarian) — base and with research traits:

![](docs/screenshots/ship-styles.png) ![](docs/screenshots/ship-traits.png)

## Layout

```
src/core      pure deterministic rules (hex, galaxy, fleet, research, encounters, ship designs)
src/content   data tables (tech tree, biomes, shard sources, encounters/loot)
src/render    three.js: map layers (LOD), ship generators + traits
src/ui        DOM panels (top bar, star card, shipyard, research, explore)
src/app       composition root, store, controller, mock world/identity
openspec/     specs and change proposals
```
