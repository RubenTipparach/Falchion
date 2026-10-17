# Falchion

An at-scale, hex-based 4X MMO set in a 70,000 light-year galaxy, built with three.js and planned Discord integration.

## Quick start

```bash
npm install
npm run dev      # play locally
npm test         # core unit tests
```

## How to play

- **Scroll**: exponential zoom from a single planet to the whole galaxy; **drag**: pan; **right-drag**: tilt/rotate; **G**: hex / galaxy view
- **Realtime**: the server advances the world one tick per minute, and each tick is one year. At base speed a ship crosses one light year per minute, in a straight line. The top bar shows the year and the countdown to the next. Your empire is saved in the browser and keeps running while you are away (up to a week of years is simulated when you return).
- **Ships act where they are.** Exploring, fighting, mining, settling, building depots, missionaries and spies all need a ship on location.
- **Supply** is spent exploring (Survey Cutters carry the most); **ammunition** is spent in battle and sets firepower. Both refill in friendly systems; ammunition slowly regenerates elsewhere. Fleets can return home and dock.
- **Colonies** are planets with building slots: farms (food), mines, trade hubs, research labs, temples and shipyards. Ships are built at a shipyard and start in that system. **Colony Arks** settle explored worlds; **Construction Tenders** build forward supply depots.
- **Explore** newly found planets for loot crates and a one-time resource cache, then press **Collect resources**.
- Panels: **Fleets**, **Explore**, **War Room** (deterministic combat and planetary assault), **Shipyard** (procedural ship designer), **Research** (branching tree with shards), **Empire** (colonies, trade, politics, religion, espionage). The locate buttons zoom to a planet, star or fleet.

## Play with friends

Sign in with Discord at https://falchion.fly.dev to found your empire in a shared galaxy.
Setup (once): [docs/discord.md](docs/discord.md).

## Admin portal

**https://falchion.fly.dev/admin** (also the **Admin** link in the top bar once you are signed in as an admin).

- Who can open it: Discord ids in the `ADMIN_DISCORD_ID` GitHub secret, comma-separated
  (same secret as High Frontier). Anyone else sees "Not an admin" along with their own id,
  ready to copy into that list.
- What it does: server status, the player list (year, colonies, fleets, last save), reset a
  player's empire, set the in-game announcement banner (also posted to Discord), and send a
  test message to the notification channel.
- Setup and troubleshooting: [docs/discord.md](docs/discord.md#admin-portal).

## Deployment

Every push to any branch builds, tests and deploys (latest push wins):

- **GitHub Pages**: the static client. One-time: Settings → Pages → Source: *GitHub Actions*; Settings → Environments → `github-pages` → allow all branches.
- **Fly.io**: `server/` (Node, serves the client + `/healthz`, `/api/info`). One-time: `fly apps create falchion`, then `fly tokens create deploy -a falchion` → repo secret `FLY_API_TOKEN`. Until then the job skips with a notice.

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
src/app       composition root, store, controller, world and (stand-in) identity
openspec/     specs and change proposals
```
