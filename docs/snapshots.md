# Empire snapshots

Once an hour of real time (`SNAPSHOT_INTERVAL_MS` in `server/snapshots.mjs`) the server records a
snapshot of every empire in the database (`falchion.db`, table `snapshots`). Nothing is pruned.
They are for reading later, by a person, a script or an AI: how each empire's game is going, how
the economy is balanced, what players spend their time on.

Admins export them from the admin portal (`/admin`, "Snapshots"): pick a time range (and,
optionally, one empire) and press **Export**. The file is JSON Lines: one JSON object per line.

One world year passes per real minute, so an hour is sixty years of play between two snapshots.

## The export file

Every line has a `type`:

- **`meta`** (the first line): `exportedAt` (ISO time), `from` and `to` (the range, ISO times;
  `from` included, `to` excluded), `empire` (the empire filter, or null), `includeState`,
  `summaryVersion` (see below) and `docs` (this file).
- **`snapshot`**: one empire at one moment.
- **`event`**: one entry of the event log (`server/eventLog.mjs`) recorded in the same range:
  what players ordered (every command the rules applied or refused), foundings, battles,
  diplomacy, first contacts, NPC decisions, server resets. With an empire filter, the events by or
  about that empire.

Snapshot and event lines are merged in time order, so reading the file top to bottom replays what
happened: the state every hour, and every action in between.

### A `snapshot` line

| Field | Meaning |
| --- | --- |
| `id` | Row id (increasing). |
| `at` | Server time, ms since 1970 (UTC). |
| `time` | The same, as an ISO string. |
| `worldYear` | The world year (the server's tick) when it was taken. |
| `reason` | `hourly`, `manual` (an admin pressed "Take snapshot now") or `reset` (taken just before a server reset). |
| `empire` | `{ id, owner, name }`: the empire's id (its owner's Discord id), its owner's Discord name, the empire's name. |
| `summary` | The summary below. |
| `state` | Only when "include full state" is ticked: the whole stored record `{ player, save, public, ... }` exactly as the server kept it (the save is the same format the game stores; see `src/app/SaveGame.ts`). |

In the database the full record is kept gzipped in the `state` column of every row, whatever the
export asks for, so nothing is lost.

### An `event` line

| Field | Meaning |
| --- | --- |
| `id`, `at`, `time` | Row id, server time (ms) and ISO time. |
| `worldTime` | World time in years (fractional), when known. |
| `actor` | Who did it: a player id, `npc:<id>` for an NPC empire. |
| `subject` | The player it happened to, if any. |
| `kind` | `command`, `advance` (a catch-up of several years), `found`, `battle`, `pursuit`, `contact`, `diplomacy`, `discover`, `capture`, NPC decisions (`build`, `reinforce`, `raid`, `strike`, `return`), `reset` and `reset-empire`. |
| other fields | The event's data: for a command, `command` (`{ name, args }`), `ok`, `error`, `turn`, `clientTime`; for most others a `text` line. |

## The summary

`summary` is built by `summarizeSave` (`src/sim/snapshot.ts`). Field names are stable; a change
to them bumps `v` and is written down here. Ids are the game's own: resource ids
(`credits`, `influence`, `faith`, `food`, `goods`, `metals`, `gases`, `crystals`), ship class ids
(`src/content/shipClasses.ts`), building ids (`src/content/buildings.ts`), tech node ids
(`src/content/techTree.ts`). A star id is `q,r` (its hex; one hex is one light year), a planet id
`q,r/i`. Maps of counts leave out zeros and are sorted by key.

### Version 1

| Field | Meaning |
| --- | --- |
| `v` | Summary schema version (1). |
| `year` | The empire's game year (it equals the world year once the server has played it up to date). |
| `player` | `{ id, name }`: the owner's Discord id and name. |
| `founded` | Whether the empire has been founded (it has a name and flag). |
| `identity` | `{ name, ruler, title, capital, color, shipStyle }`, or null before founding. |
| `home` | Star id of the home system. |
| `government` | Government id. |
| `policies` | Policy ids adopted. |
| `faith` | `{ name, tenets }` of the empire's faith, or null. |
| `governor` | The empire governor's settings `{ focus, build, research, reserve }`, or null when not used. |
| `resources` | Per resource id: `stock` (in store now), `income` (last year's gross gains, from the ledger), `costs` (last year's gross spending: upkeep, food eaten, ...), `net` (last year's change in the store). `net` can differ from `income - costs` when a store was full or empty. |
| `science` | Science points earned last year. |
| `population` | `{ total, worlds, systems }`: total population, settled worlds, settled star systems. |
| `worlds` | One per colony: `{ planet, star, name, biome, pop, capital, buildings }`. |
| `buildings` | Count of each building across all worlds. |
| `depots` | Supply depots built. |
| `ships` | Every ship owned: `ships.total`, `ships.byClass`, `ships.byRole` (`combat`, `capital`, `mining`, `logistics`), `ships.deployed` (in fleets), `ships.docked` (at the home dock). |
| `fleets` | `{ count, moving, inBattle, list }`; each of `list`: `{ id, name, ships, at, star, moving, stance, supply, hull, inBattle, company }` where `at` is the hex it is in, `star` the star there (or null in deep space), `stance` `aggressive` or `passive`, `hull` the share of hull points left (0 to 1), `company` the company running it (or null). |
| `military` | `{ warships, attack, hull, power }`: ships with an attack, the sum of attack and of hull over every ship owned, and the encounter strength `10 + attack / 3`. |
| `construction` | `{ queued, ships, buildings }`: jobs in the yards and on worlds, by ship class and building. |
| `research` | `{ researched, of, nodes, focus, inProgress }`: nodes researched and in the whole tree, their ids, the node research is focused on, and shards collected toward unfinished nodes. |
| `exploration` | See below. |
| `diplomacy` | `{ npcs, players, contacts }`: NPC empires met, each `{ id, name, standing, worlds, capturedByYou }` (`standing` from -100 to 100, null when never changed from the faction's disposition); other players with a relation, each `{ id, status, since, atWar, proposal }` (`status` `neutral`, `war` or `alliance`; `proposal` an open offer, e.g. `alliance from them`); `contacts`, how many players it has met. Empty when the shared world was not available. |
| `battles` | The battle log (the newest 60 battles): `{ logged, outcomes, shipsLost, shipsKilled, recent }`; `outcomes` counts `won`, `lost`, `draw`, `ongoing`, `plundered`; `shipsLost` and `shipsKilled` by class; `recent` the newest five `{ year, kind, outcome, foe, foeEmpire, place }` (`kind`: `raid`, `sea`, `pursuit`, `assault`). |
| `commerce` | `{ tariff, companies, companyTreasury, holdings }`: the tariff (percent), companies chartered and their cash, and shares held in others' companies. Null in older saves. |
| `missions` | `{ active, done, questsDone }`: active mission ids, story missions done, quests completed. |
| `court` | `{ leaderLevel, advisors }`: the ruler's level and advisors seated. |
| `news` | The newest five dispatches `{ year, text, tone }` (`tone` `good`, `bad` or null). |

#### `exploration`

| Field | Meaning |
| --- | --- |
| `exploration.planetsSurveyed` | Planets surveyed. |
| `exploration.systemsSurveyed` | Star systems with at least one surveyed planet. |
| `exploration.systemsVisited` | Star systems its ships have passed through or stopped in (`visited` in the save). |
| `exploration.systemsExplored` | Star systems explored: home, colonies, depots, surveyed and visited systems, and where its fleets are now (`src/core/visibility/Vision.ts`). |
| `exploration.systemsSighted` | Stars sighted but not explored: within 2 ly of an explored system or a fleet, or in its territory. |
| `exploration.cratesOpened` | Loot crates opened. |
| `exploration.cachesCollected` | One-time resource caches collected. |
| `exploration.megastructures` | Types of the megastructures in systems it has explored. |

## Reading them

- Growth: `population.total`, `population.worlds`, `ships.total` and `research.researched` per
  empire over `worldYear`.
- Balance: compare `resources.*.income` and `resources.*.costs` across empires and over time;
  a resource whose `stock` sits at zero with negative `net` is a bottleneck (food is the usual one).
- Behaviour: the `event` lines between two snapshots say what the player did (`command` names),
  and the snapshot after it what it changed.
- A `reset` snapshot is the last state of an empire before a server reset; the next one is its new
  start.
