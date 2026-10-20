import { RESOURCES } from '../content/resources';
import { SHIP_CLASSES } from '../content/shipClasses';
import { TECH_NODES } from '../content/techTree';
import { isMegastructure } from '../content/megastructures';
import type { SavedGame } from '../app/SaveGame';
import { relationOf, atWar, type Relation } from '../core/diplomacy/Diplomacy';
import { populationOf } from '../core/economy/Population';
import { arrivalTurn, hexAt } from '../core/fleet/Fleet';
import { inBattle } from '../core/fleet/Presence';
import type { GalaxyModel } from '../core/galaxy/GalaxyModel';
import { planetsOf } from '../core/galaxy/Planets';
import { npcById } from '../core/npc/NpcCatalog';
import { starIdOfPlanet, visionInputOf, visionOf } from '../core/visibility/Vision';
import type { SharedWorld } from '../core/world/SharedWorld';

/**
 * A snapshot summary of an empire (change admin-snapshots-and-fog): the numbers that tell how its
 * game is going, for an AI or a script to read across many hourly snapshots. Pure. The fields are
 * stable and documented one by one in docs/snapshots.md; a change to them bumps SUMMARY_VERSION
 * and is written down there.
 */
export const SUMMARY_VERSION = 1;

/** Recent news lines and battles kept in a summary. */
const RECENT = 5;

const CLASS = new Map(SHIP_CLASSES.map((c) => [c.id, c]));

type Counts = Record<string, number>;

const add = (to: Counts, k: string, n: number) => { if (n) to[k] = (to[k] ?? 0) + n; };
const sorted = (c: Counts): Counts => Object.fromEntries(Object.entries(c).filter(([, n]) => n !== 0).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
const round = (n: number, places = 2) => Math.round(n * 10 ** places) / 10 ** places;

export interface SummaryDeps {
  readonly galaxy: GalaxyModel;
  /** The shared world (relations with other players, NPC standings); missing: none. */
  readonly world?: SharedWorld | null;
}

/** The summary of one empire's save; `player` is its owner. */
export function summarizeSave(save: SavedGame, player: { readonly id: string; readonly name?: string }, { galaxy, world = null }: SummaryDeps): Record<string, unknown> {
  const s = save;
  const id = s.identity;
  const colonies = s.economy?.colonies ?? [];
  const loadouts = s.loadouts ?? {};
  const report = s.lastReport;

  // ── Resources: stock, and last year's ledger (income, costs) and net change ──
  const income: Counts = {}, costs: Counts = {};
  for (const e of report?.ledger ?? []) (e.n >= 0 ? add(income, e.r, e.n) : add(costs, e.r, -e.n));
  const resources: Record<string, { stock: number; net: number; income: number; costs: number }> = {};
  for (const r of RESOURCES) {
    resources[r.id] = {
      stock: round(Number(s.empire?.materials?.[r.id]) || 0),
      net: round(Number(report?.income?.[r.id]) || 0),
      income: round(income[r.id] ?? 0),
      costs: round(costs[r.id] ?? 0),
    };
  }

  // ── Worlds, population and buildings ──
  const buildings: Counts = {};
  const worlds = colonies.map((c) => {
    for (const b of c.buildings ?? []) add(buildings, b, 1);
    return { planet: c.planetId ?? null, star: c.starId ?? null, name: c.name, biome: c.biome, pop: populationOf(c), capital: !!c.capital, buildings: [...(c.buildings ?? [])] };
  });
  const starIds = new Set(colonies.map((c) => c.starId).filter((x): x is string => !!x));

  // ── Ships: everything owned, by class and role; what is deployed; military strength ──
  const roster = s.economy?.roster ?? {};
  const byClass: Counts = {}, byRole: Counts = {}, deployed: Counts = {};
  for (const [cls, n] of Object.entries(roster)) {
    add(byClass, cls, n);
    add(byRole, CLASS.get(cls)?.role ?? 'unknown', n);
  }
  for (const l of Object.values(loadouts)) for (const x of l.ships) add(deployed, x.classId, x.count);
  const docked: Counts = {};
  for (const [cls, n] of Object.entries(byClass)) add(docked, cls, Math.max(0, n - (deployed[cls] ?? 0)));
  let attack = 0, hull = 0, warships = 0;
  for (const [cls, n] of Object.entries(byClass)) {
    const def = CLASS.get(cls);
    if (!def) continue;
    attack += def.attack * n;
    hull += def.hull * n;
    if (def.attack > 0) warships += n;
  }
  const fleets = (s.fleets ?? []).filter((f) => loadouts[f.id]).map((f) => {
    const l = loadouts[f.id];
    const at = hexAt(f.movement, s.turn);
    const total = l.ships.reduce((n, x) => n + (CLASS.get(x.classId)?.hull ?? 0) * x.count, 0);
    const damage = Object.values(l.damage ?? {}).reduce((n, d) => n + (Number(d) || 0), 0);
    const ships: Counts = {};
    for (const x of l.ships) add(ships, x.classId, x.count);
    return {
      id: f.id, name: f.name, ships: sorted(ships), at: `${at.q},${at.r}`, star: galaxy.starAt(at)?.id ?? null,
      moving: s.turn < arrivalTurn(f.movement), stance: l.orders?.stance ?? 'passive', supply: l.supply,
      hull: total ? round(Math.max(0, 1 - damage / total)) : 1, inBattle: inBattle(l.battle, s.turn), company: l.company ?? null,
    };
  });

  // ── Construction ──
  const queuedShips: Counts = {}, queuedBuildings: Counts = {};
  for (const j of s.construction ?? []) add(j.kind === 'ship' ? queuedShips : queuedBuildings, j.item, 1);

  // ── Research ──
  const research = s.empire?.research ?? { shards: {}, researched: [] };
  const done = new Set(research.researched);
  const inProgress: Counts = {};
  for (const [node, n] of Object.entries(research.shards ?? {})) if (!done.has(node) && n > 0) inProgress[node] = n;

  // ── Exploration ──
  const surveyed = Object.keys(s.explored ?? {});
  const vision = visionOf(visionInputOf(s), (h) => galaxy.starAt(h));
  const megastructures = [...new Set(vision.explored.map((sid) => {
    const [q, r] = sid.split(',').map(Number);
    const star = galaxy.starAt({ q, r });
    return star?.megastructure ? planetsOf(star, galaxy.params.seed)[0]?.biome : null;
  }).filter((b): b is string => !!b && isMegastructure(b)))].sort();

  // ── Diplomacy: NPC empires met, and other players ──
  const npcs = Object.values(world?.npcs ?? {}).filter((n) => n.knownBy.includes(player.id)).map((n) => ({
    id: n.id, name: npcById(galaxy, n.id)?.name ?? n.id, standing: n.standing?.[player.id] ?? null,
    worlds: n.colonies.filter((c) => !c.capturedBy).length, capturedByYou: n.colonies.filter((c) => c.capturedBy === player.id).length,
  })).sort((a, b) => (a.id < b.id ? -1 : 1));
  const players: Array<{ id: string; status: Relation['status']; since: number; atWar: boolean; proposal: string | null }> = [];
  for (const key of Object.keys(world?.relations ?? {}).sort()) {
    const [a, b] = key.split('|');
    if (a !== player.id && b !== player.id) continue;
    const other = a === player.id ? b : a;
    const r = relationOf(world?.relations, player.id, other);
    players.push({ id: other, status: r.status, since: r.since, atWar: atWar(world?.relations, player.id, other, s.turn), proposal: r.proposal ? `${r.proposal.kind} from ${r.proposal.from === player.id ? 'you' : 'them'}` : null });
  }
  const contacts = Object.keys(world?.contacts ?? {}).filter((k) => k.split('|').includes(player.id)).length;

  // ── Battles ──
  const log = s.battleLog ?? [];
  const outcomes: Counts = {}, lost: Counts = {}, killed: Counts = {};
  for (const e of log) {
    add(outcomes, e.outcome, 1);
    for (const [c, n] of Object.entries(e.lost ?? {})) add(lost, c, Number(n) || 0);
    for (const [c, n] of Object.entries(e.killed ?? {})) add(killed, c, Number(n) || 0);
  }

  const commerce = s.commerce;
  const court = s.court;
  return {
    v: SUMMARY_VERSION,
    year: s.turn,
    player: { id: player.id, name: player.name ?? null },
    founded: !!id,
    identity: id ? { name: id.name, ruler: id.ruler, title: id.title, capital: id.capital, color: id.color, shipStyle: id.shipStyle ?? null } : null,
    home: s.home?.id ?? null,
    government: s.economy?.government ?? null,
    policies: [...(s.economy?.policies ?? [])],
    faith: s.economy?.faith ? { name: s.economy.faith.name, tenets: [...s.economy.faith.tenets] } : null,
    governor: s.governor ? { focus: s.governor.focus, build: s.governor.build, research: s.governor.research, reserve: s.governor.reserve } : null,
    resources,
    science: report?.science ?? 0,
    population: { total: worlds.reduce((n, w) => n + w.pop, 0), worlds: worlds.length, systems: starIds.size },
    worlds,
    buildings: sorted(buildings),
    depots: (s.depots ?? []).length,
    ships: { total: Object.values(byClass).reduce((n, x) => n + x, 0), byClass: sorted(byClass), byRole: sorted(byRole), deployed: sorted(deployed), docked: sorted(docked) },
    fleets: { count: fleets.length, moving: fleets.filter((f) => f.moving).length, inBattle: fleets.filter((f) => f.inBattle).length, list: fleets },
    military: { warships, attack, hull, power: Math.round(10 + attack / 3) },
    construction: { queued: (s.construction ?? []).length, ships: sorted(queuedShips), buildings: sorted(queuedBuildings) },
    research: { researched: done.size, of: TECH_NODES.length, nodes: [...done].sort(), focus: s.economy?.focus ?? null, inProgress: sorted(inProgress) },
    exploration: {
      planetsSurveyed: surveyed.length, systemsSurveyed: new Set(surveyed.map(starIdOfPlanet)).size,
      systemsVisited: (s.visited ?? []).length, systemsExplored: vision.explored.length, systemsSighted: vision.sighted.length,
      cratesOpened: (s.openedCrates ?? []).length, cachesCollected: (s.collectedCaches ?? []).length, megastructures,
    },
    diplomacy: { npcs, players, contacts },
    battles: {
      logged: log.length, outcomes: sorted(outcomes), shipsLost: sorted(lost), shipsKilled: sorted(killed),
      recent: log.slice(0, RECENT).map((e) => ({ year: e.year, kind: e.kind, outcome: e.outcome, foe: e.foe, foeEmpire: e.foeEmpire, place: e.place?.name ?? null })),
    },
    commerce: commerce ? {
      tariff: commerce.tariff, companies: commerce.companies.length,
      companyTreasury: round(commerce.companies.reduce((n, c) => n + (Number(c.treasury) || 0), 0)),
      holdings: Object.keys(commerce.portfolio ?? {}).length,
    } : null,
    missions: s.missions ? { active: s.missions.active.map((m) => m.id), done: s.missions.done.length, questsDone: s.missions.questsDone } : null,
    court: court ? { leaderLevel: court.leader.level, advisors: Object.keys(court.seats ?? {}).length } : null,
    news: (s.dispatches ?? []).slice(0, RECENT).map((d) => ({ year: d.turn, text: d.text, tone: d.tone ?? null })),
  };
}
