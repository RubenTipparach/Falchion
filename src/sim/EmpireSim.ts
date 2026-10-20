import { RESOURCES, Resource } from '../content/resources';
import { MISSIONS, MISSION_BY_ID } from '../content/missions';
import { SEAT_BY_ID, SEEK_COST, type Seat } from '../content/advisors';
import { isMegastructure } from '../content/megastructures';
import { DEFAULT_RESERVE } from '../content/governor';
import { ADVISOR_MAX, LEADER_MAX, MAX_CANDIDATES, NEW_COURT, addXp, appoint, courtBoons, drawCandidate, openSeats, withCandidate, type CourtState } from '../core/empire/Court';
import { MAX_OFFERS, NEW_MISSIONS, QUEST_YEARS, baseOf, progressOf, questOffer, unlocked, type MissionDef, type MissionView, type MissionsState, type QuestDef } from '../core/missions/Missions';
import { BUILDINGS, slotsOf } from '../content/buildings';
import { buildYears, hasWarships, isSurveyClass, isWarship, REPAIR, specOf, warshipsOf, type RepairSite } from '../content/logistics';
import { SHIP_CLASSES, ShipClassDef } from '../content/shipClasses';
import { BattleResult, CombatBonuses, Damage, menderRepair, repairDamage, resolveAssault, resolveBattle, Side, Squadron } from '../core/combat/Combat';
import { battleRecords, recordRound } from '../core/combat/BattleRecord';
import { logBattle, tallyLost, tallyOf, type BattleLogEntry } from '../core/combat/BattleLog';
import { ROLE_TRAIT } from '../core/ships/ClassDesign';
import { bonusOf, canAfford, capsOf, Colony, contractPrice, EconomyTables, FLOW_LOG, miningYield, maxPolicies, maxSpies, pay, Presence, resolveTurn, tradePctOf, type Flow, type Stockpile, type Transfer, type TurnReport } from '../core/economy/Economy';
import { cargoCapacity, FREIGHTER, saleValue, type Market } from '../core/economy/Trade';
import { BASE_PRICE, COMMERCE, EXCHANGE_RESOURCES, type CompanyKind } from '../content/commerce';
import { BIOME_YIELDS } from '../content/resources';
import { FOCI, FOOD_FLOOR, type GovernorFocus } from '../content/governor';
import { pickBuilding, pickResearch } from '../core/empire/Governor';
import { charter, companyKindOf, companyName, companyYear, fleetValue, floatOf, sharePrice, shipValue, wantsShip, type Company, type CompanyYear } from '../core/economy/Companies';
import { cleanTariff, fadePressure, npcTariff, trade as exchangeTrade, unitPrice, type ExchangeView } from '../core/economy/Exchange';
import { corpKey, MAX_SHARE_TRADE, NO_COMMERCE, playerCompanyKey, publicCommerceOf, stakeKey, tariffFor, type CommerceState, type PublicCommerce } from '../core/economy/Commerce';
import { corporationsOf, corpNpc, corpPrice, type Corporation } from '../core/economy/Corporations';
import { applyCost, applyCrate, EncounterResolver } from '../core/encounters/Encounters';
import { addHaul, Collected, crateMaterials, Haul, planetCache } from '../core/encounters/PlanetCache';
import type { Card } from '../core/encounters/types';
import type { ActivityPlace, ReportKind } from '../core/social/Activity';
import { arrivalTurn, hexAt, planMovement, positionAt, retime, travelTurns } from '../core/fleet/Fleet';
import { catchUpTicks, formatDuration } from '../core/time/WorldTime';
import { capacity, clampStores, exploreCost, fullStores, rescaleStores, resupply, Stores } from '../core/fleet/Logistics';
import { adjustShips, countOf, dockedShips, Encounter, FleetBattle, FleetOrders, ForeignFleet, inBattle, hasShips, isAggressive, isStationed, Loadout, shipTotal } from '../core/fleet/Presence';
import { planSurvey } from '../core/fleet/Survey';
import { minedBy, nearestMine, stockFor } from '../core/fleet/AutoMine';
import { fieldLeft, fieldsOf, homeBelt, yearsToFull, type AsteroidField } from '../core/galaxy/Asteroids';
import { applyEffects, EMPTY_WORLD, type SharedEffect, type SharedWorld } from '../core/world/SharedWorld';
import { addVisited, MAX_VISITED, visitedAlong } from '../core/visibility/Vision';
import { actionsFor, allied, applyDiplomacy, atWar, haveMet, newsOf, pairKey, relationOf, type DiplomaticAction, type Relation } from '../core/diplomacy/Diplomacy';
import { BIOMES, settleable } from '../content/biomes';
import { cityWorldIn } from '../core/npc/CityWorlds';
import { DISCOVERY_RANGE, gridNpcsNear, HOME_TERRITORY, initialNpcState, nearNpc, npcById, spawnNpcs, territoryOf, worldDefense, type NpcDef } from '../core/npc/NpcCatalog';
import { stepNpcs, type RaidTargets } from '../core/npc/NpcSim';
import type { NpcRaid, NpcState } from '../core/npc/types';
import { marketFactor, STANDING, standingOf, tierOf } from '../core/npc/Reputation';
import { cancelJob, due, enqueue, Job, moveJob } from '../core/construction/Construction';
import { addressOf, formatAddress } from '../core/galaxy/GalacticAddress';
import { GalaxyModel, StarSystem } from '../core/galaxy/GalaxyModel';
import { planetsOf, Planet, withBiome } from '../core/galaxy/Planets';
import { Hex, hexDistance, hexEquals, hexToWorld, Point2, worldToHex } from '../core/hex/Hex';
import { hashSeed } from '../core/rng/Rng';
import type { TechTree } from '../core/research/TechTree';
import { normalizeDesign, ShipDesign } from '../core/ships/ShipDesign';
import type { EmpireIdentity } from '../core/empire/Identity';
import type { GameState } from '../app/GameState';
import type { Store } from '../app/Store';
import type { World } from '../app/World';
import { CLOCK } from '../app/WorldClock';
import type { CombatOutcome, FactionView, FleetGroup, WarTarget } from '../ui/GameActions';
import type { StarDetails } from '../ui/StarInfoPanel';

/** Another player's empire as diplomacy sees it. */
export interface OtherEmpire {
  readonly id: string;
  readonly name: string;
  readonly color?: string;
  readonly home?: Hex | null;
  readonly colonies: readonly Hex[];
  /** Its tariffs and companies (change commerce), when it published them. */
  readonly commerce?: PublicCommerce;
}

/** An exchange you can trade on (change commerce): an NPC faction's or a player's. */
export interface ExchangeInfo extends ExchangeView {
  readonly name: string;
  readonly kind: 'npc' | 'player';
  /** The NPC faction or player that runs it. */
  readonly owner: string;
  readonly color?: string;
  readonly home?: StarSystem;
}

/** A share on the stock market: one of your companies, another player's, or an NPC corporation. */
export interface StockView {
  /** `own:<company>`, `player:<owner>:<company>` or `npc:<corporation>`. */
  readonly key: string;
  readonly kind: 'own' | 'player' | 'npc';
  readonly name: string;
  /** The empire it belongs to. */
  readonly owner: string;
  /** Its kind of company, or what a corporation does. */
  readonly sector: string;
  readonly price: number;
  /** Dividend per share last year (a corporation's every year). */
  readonly dividend: number;
  /** Shares you (the state) hold, and how many are for sale. */
  readonly held: number;
  readonly float: number;
  readonly shares?: number;
  readonly ships?: number;
  readonly treasury?: number;
  readonly profit?: number;
  readonly fleetId?: string;
  /** A corporation's price over the last 240 years, every 10. */
  readonly history?: readonly number[];
  readonly delisted?: boolean;
  /** One of your companies: what its fleet is doing. */
  readonly status?: string;
}

/** The ledger heading of what other empires owed you (tariffs, dividends). */
const OWED = 'From other empires';

/** One other player in the Relations tab: the relation, any proposal, and what you can do. */
export interface DiplomacyView {
  readonly empire: OtherEmpire;
  readonly relation: Relation;
  readonly atWar: boolean;
  readonly actions: readonly DiplomaticAction[];
}

/** The shared world as an empire's simulation sees it: what it holds now, and where its changes go. */
export interface SharedLink {
  world(): SharedWorld;
  emit(effects: readonly SharedEffect[]): void;
}

/** A shared link over a snapshot: changes apply to it at once and are collected (for the server to apply). */
export function snapshotLink(world: SharedWorld): SharedLink & { readonly effects: SharedEffect[] } {
  let w = world;
  const effects: SharedEffect[] = [];
  return { world: () => w, emit: (e) => { w = applyEffects(w, e); effects.push(...e); }, effects };
}

export interface FieldReport {
  readonly field: AsteroidField;
  /** Units it holds now. */
  readonly left: number;
  /** Years until full (0 when it is). */
  readonly fullIn: number;
}

const xz = (p: Point2): [number, number] => [p.x, p.z];

/** What raiders take from an undefended colony system: a share of each, capped. */
const RAID_LOOT: readonly Resource[] = ['credits', 'metals', 'food', 'goods'];
const RAID_SHARE = 0.08;
const RAID_CAP = 300;

function mergeShips(ships: readonly Squadron[]): Squadron[] {
  const m = new Map<string, number>();
  for (const x of ships) m.set(x.classId, (m.get(x.classId) ?? 0) + x.count);
  return [...m].filter(([, n]) => n > 0).map(([classId, count]) => ({ classId, count }));
}

/** The reputation chart samples standing every RELATIONS_EVERY years and keeps RELATIONS_KEEP samples. */
const RELATIONS_EVERY = 5;
const RELATIONS_KEEP = 120;

const poolKey = (starId: string, resource: Resource) => `${starId}|${resource}`;
/** A pool of one field, worked by the miners sent to it. */
const FIELD_POOL = 'field:';
const fieldPoolKey = (fieldId: string) => `${FIELD_POOL}${fieldId}`;
const parsePool = (key: string) => { const i = key.lastIndexOf('|'); return { starId: key.slice(0, i), resource: key.slice(i + 1) as Resource }; };

/** A fleet as it meets another at sea: what it fights with, and whether it attacks. */
export interface ContactForce extends Encounter {
  readonly fleetId: string;
  readonly fleetName: string;
  /** The empire's name (its identity, or the owner's name before founding). */
  readonly empire: string;
  readonly at: Hex;
  readonly star: StarSystem | null;
  /** The ships that fight: the warships, or the whole fleet when it has none. */
  readonly ships: readonly Squadron[];
  /** The battle it is already in, if any (its round count). */
  readonly battle?: FleetBattle;
  /** Damage its ship classes carry into the round (hull points by class). */
  readonly damage?: Damage;
  /** Light years a year it travels: a faster enemy can run it down when it breaks off. */
  readonly speed: number;
  readonly side: Side;
}

/** The other fleet of a contact, as it stood going in. */
export interface ContactFoe {
  /** The other fleet as `${ownerId}:${fleetId}` (fleet ids repeat between empires). */
  readonly key: string;
  readonly fleetName: string;
  readonly empire: string;
  readonly ships: readonly Squadron[];
  /** Damage its ship classes carried into the round (hull points by class). */
  readonly damage?: Damage;
}

/** What the rules need: state, the galaxy and the content tables. No view, no DOM, no three.js. */
export interface SimDeps {
  readonly store: Store<GameState>;
  readonly galaxy: GalaxyModel;
  readonly tree: TechTree;
  readonly encounters: EncounterResolver;
  readonly world: World;
  readonly economy: EconomyTables;
  /** Share notable news (founding, battles, colonies, depots, surveyed systems) with the galaxy feed and Discord. */
  readonly report?: (kind: ReportKind, text: string, place?: ActivityPlace) => void;
  /** The player's id in the shared world (the server's Discord id; a guest is 'local'). */
  readonly playerId?: string;
  /** 'local': this simulation steps the NPC empires itself (a guest's browser, tests). */
  readonly npcs?: 'local';
  /** The galaxy's shared state (asteroid fields, NPC empires): read it, and hand it this empire's changes. */
  readonly shared?: SharedLink;
  /** Other players' empires: who they are and where their worlds are (diplomacy, allied systems). */
  readonly otherEmpires?: () => readonly OtherEmpire[];
  /** Other players' fleets by `${ownerId}:${fleetId}`, for chasing them. */
  readonly foreignFleet?: (key: string) => ForeignFleet | null;
  /** Markets beyond your own colonies and the neighbours (other players' worlds). */
  readonly markets?: () => readonly Market[];
}

const BASE_SPEED = 1; // ly per year (one year = one minute)
const ARK = 'colony-ark';
/** Supply an ark spends settling a world: all of its own (change commerce). */
const ARK_SUPPLY = specOf(ARK)?.supply ?? 6;
/** The ship a company of each kind buys when it has none to copy. */
const COMPANY_SHIP: Readonly<Record<CompanyKind, string>> = { trade: FREIGHTER, mining: 'prospector', colony: ARK };
/** Supply an auto-exploring fleet needs to set off for another system. */
const MIN_SURVEY_SUPPLY = 2;
/** Map colour of an empire that has not been founded yet. */
const DEFAULT_EMPIRE_COLOR = '#e6b450';
/** At most a week of missed years is simulated on return; older years only move fleets. */
const MAX_CATCH_UP = 7 * 24 * 60;
/** Per-year report lines that would repeat every minute. */
const ROUTINE = /^(Science: \+|Trade: \d)/;
const fmtInt = (n: number) => Math.round(n).toLocaleString('en-US');

/**
 * The game's rules for one empire: its state, every command a player can give, and the yearly
 * step. Pure and deterministic (no view, DOM or three.js), so the same code runs in the browser
 * and on the server, which advances every empire each tick (change server-authoritative-world).
 */
export class EmpireSim {
  constructor(protected readonly deps: SimDeps) {}

  protected readonly classById = new Map(SHIP_CLASSES.map((c) => [c.id, c]));
  protected readonly targetStars = new Map<string, StarSystem>();
  /** News made since a battle began, named after it once it is logged (see logBattle). */
  private readonly unlogged: object[] = [];

  // ── Queries ────────────────────────────────────────────────────────

  get state(): GameState {
    return this.deps.store.state;
  }

  get tree(): TechTree {
    return this.deps.tree;
  }

  get tables(): EconomyTables {
    return this.deps.economy;
  }

  bonus = (stat: string): number => bonusOf(this.deps.tree, this.state.empire.research, stat);

  fleetSpeed(): number {
    return BASE_SPEED + this.bonus('speed');
  }

  /** Buildings with no research gate, or whose research is done. */
  isBuildingUnlocked = (buildingId: string): boolean => {
    const unlock = BUILDINGS.find((b) => b.id === buildingId)?.unlock;
    return !unlock || this.state.empire.research.researched.includes(unlock);
  };

  isClassUnlocked = (c: ShipClassDef): boolean =>
    !c.unlock || this.state.empire.research.researched.includes(c.unlock) || this.state.empire.chassis.includes(c.id);

  unlockedTraits = (): string[] => this.deps.tree.traitsOf(this.state.empire.research);

  designFor = (classId: string): ShipDesign => {
    const saved = this.state.designs[classId];
    if (saved) return saved;
    const c = this.classById.get(classId)!;
    const base = this.state.designs[this.state.shipyardClass] ?? Object.values(this.state.designs)[0];
    return normalizeDesign({ ...base, name: c.name, seed: hashSeed(c.id) % 100_000, style: c.look.style, length: c.look.length, bulk: c.look.bulk, engines: c.look.engines, weapons: c.look.weapons, traits: [] });
  };

  /** Design with research traits and the class's role decorations applied. */
  /** The ship style the empire was founded with: always available to it. */
  foundingStyle = (): string => this.state.identity?.shipStyle ?? this.state.designs[this.state.shipyardClass]?.style ?? 'technological';

  /** Styles the empire can build in: its own, plus those research has unlocked. */
  unlockedStyles = (): string[] => [...new Set([this.foundingStyle(), ...this.deps.tree.stylesOf(this.state.empire.research)])];

  effectiveDesign = (classId = this.state.shipyardClass): ShipDesign => {
    const c = this.classById.get(classId);
    // Only styles the empire has may show: locked ones fall back to its own style.
    const styles = this.unlockedStyles();
    const d = this.designFor(classId);
    const style = styles.includes(d.style) ? d.style : this.foundingStyle();
    const blend = (d.blend ?? []).filter((b) => styles.includes(b));
    const traits = this.unlockedTraits().filter((t) => !this.state.hiddenTraits.includes(t));
    const role = c ? (c.mines ? 'role-mining' : ROLE_TRAIT[c.doctrine]) : undefined;
    if (role) traits.push(role);
    if (c?.role === 'capital') traits.push('role-capital');
    return normalizeDesign({ ...d, style, blend, traits });
  };

  private readonly cityWorlds = new Map<string, string | null>();

  /**
   * A system's planets as this empire sees them: its colonies keep the type they were settled as
   * (planets refined by a later change stay what they were), and an advanced civilisation's
   * capital is a city world.
   */
  planets = (star: StarSystem): Planet[] => {
    const raw = planetsOf(star, this.deps.galaxy.params.seed);
    if (!this.cityWorlds.has(star.id)) this.cityWorlds.set(star.id, cityWorldIn(this.deps.galaxy, star, raw));
    const city = this.cityWorlds.get(star.id);
    const colonies = this.state.economy.colonies;
    return raw.map((p) => withBiome(p, colonies.find((c) => c.planetId === p.id)?.biome ?? (p.id === city ? 'ecumenopolis' : undefined)));
  };

  describe = (star: StarSystem): StarDetails => {
    const dist = hexDistance(this.deps.world.home.hex, star.hex);
    // Every fleet travels at the empire's speed: 1 ly a year to start, plus drive research.
    const speed = this.fleetSpeed();
    const owner = this.deps.world.claims.find((c) => c.colonies.some((col) => hexDistance(col.hex, star.hex) <= col.radius));
    const npc = owner ? null : this.knownNpcs().find(({ def, state }) => state.colonies.some((c) => !c.capturedBy && nearNpc(def, star.hex) && hexDistance(this.starById(c.starId)?.hex ?? star.hex, star.hex) <= territoryOf(def, c.starId)));
    return {
      address: formatAddress(addressOf(star.hex)),
      distanceFromHome: dist,
      travel: dist === 0 ? '—' : formatDuration(travelTurns(dist, speed), CLOCK),
      speed,
      planets: this.planets(star),
      owner: owner?.kind === 'player' ? this.state.identity?.name ?? owner.name : owner?.name ?? npc?.def.name ?? null,
    };
  };

  combatBonuses(): CombatBonuses {
    const b = this.bonus;
    return { long: b('long'), short: b('short'), barrage: b('barrage'), siege: b('siege'), suppression: b('suppression'), capture: b('capture'), morale: b('morale'), repair: b('repair'), hull: b('hull'), vsLong: b('vsLong'), vsBarrage: b('vsBarrage'), troops: b('troops') };
  }

  protected fleetPower(roster: Readonly<Record<string, number>>): number {
    return Math.round(10 + SHIP_CLASSES.reduce((s, c) => s + c.attack * (roster[c.id] ?? 0), 0) / 3);
  }

  protected groupPower(ships: readonly Squadron[]): number {
    return this.fleetPower(Object.fromEntries(ships.map((x) => [x.classId, x.count])));
  }

  // ── Queries: fleets, logistics and presence ───────────────────────

  starById = (id: string): StarSystem | null => {
    const s = this.state;
    for (const st of [s.home, s.selected]) if (st?.id === id) return st;
    // Star ids are their hex coordinates, "q,r".
    const [q, r] = id.split(',').map(Number);
    return Number.isFinite(q) && Number.isFinite(r) ? this.deps.galaxy.starAt({ q, r }) : null;
  };

  protected playerClaim = () => this.deps.world.claims.find((c) => c.kind === 'player')!;

  protected colonyStars(): Set<string> {
    return new Set(this.state.economy.colonies.map((c) => c.starId).filter((x): x is string => !!x));
  }

  isFriendlyHex = (h: Hex): boolean => {
    if (this.playerClaim().colonies.some((c) => hexDistance(c.hex, h) <= c.radius)) return true;
    const star = this.deps.galaxy.starAt(h);
    if (star && (this.colonyStars().has(star.id) || this.state.depots.includes(star.id))) return true;
    // An ally's colony systems are friendly too.
    return this.allies().some((e) => [e.home, ...e.colonies].some((c) => !!c && hexEquals(c, h)));
  };

  isFriendly = (star: StarSystem): boolean => this.isFriendlyHex(star.hex);

  /** The state's fleets' loadouts (company fleets' ships are not in the state's roster). */
  protected stateLoadouts(loadouts = this.state.loadouts): Loadout[] {
    return Object.values(loadouts).filter((l) => !l.company);
  }

  /** Ships at the home dock. */
  docked = (): Squadron[] => dockedShips(this.state.economy.roster, this.stateLoadouts());

  protected dockStores(ships = this.docked()): Stores {
    const full = fullStores(ships, specOf);
    const spent = this.state.dockSpent;
    return { supply: Math.max(0, full.supply - spent.supply) };
  }

  groups = (): FleetGroup[] => {
    const s = this.state;
    const dockShips = this.docked();
    const out: FleetGroup[] = [{ id: 'dock', name: `${s.home.name} Dock`, ships: dockShips, stores: this.dockStores(dockShips), capacity: capacity(dockShips, specOf), star: s.home, stationed: true, eta: 0, friendly: true }];
    for (const f of s.fleets) {
      const l = s.loadouts[f.id];
      if (!l) continue;
      const dest = f.movement.route[f.movement.route.length - 1];
      const stationed = isStationed(f.movement, s.turn);
      out.push({
        id: f.id, name: f.name, ships: l.ships, stores: { supply: l.supply }, capacity: capacity(l.ships, specOf),
        damage: l.damage, hull: this.hullOf(l.ships, l.damage), repair: stationed ? this.repairSite(dest) : null,
        star: this.deps.galaxy.starAt(dest), stationed, eta: Math.max(0, arrivalTurn(f.movement) - s.turn), friendly: stationed && this.isFriendlyHex(dest), orders: l.orders,
        cargo: l.cargo, cargoFrom: l.cargoFrom, battle: inBattle(l.battle, s.turn) ? l.battle : undefined,
        ...(l.company ? { company: { id: l.company, name: this.companyById(l.company)?.name ?? 'A company' } } : {}),
        ...(countOf(l.ships, ARK) ? { colonists: l.colonists ?? 0 } : {}),
      });
    }
    return out;
  };

  groupsAt = (star: StarSystem): FleetGroup[] => this.groups().filter((g) => g.stationed && g.star?.id === star.id && shipTotal(g.ships) > 0);

  /** The state's groups at a star: what the player can give orders to (not companies' fleets). */
  protected stateGroupsAt = (star: StarSystem): FleetGroup[] => this.groupsAt(star).filter((g) => !g.company);

  planetById = (id: string): Planet | null => {
    const star = this.starById(id.slice(0, id.lastIndexOf('/')));
    return star ? this.planets(star).find((p) => p.id === id) ?? null : null;
  };

  colonyAt = (planetId: string): Colony | undefined => this.state.economy.colonies.find((c) => c.planetId === planetId);

  yards = (): Colony[] => this.state.economy.colonies.filter((c) => (c.buildings ?? []).some((b) => BUILDINGS.find((x) => x.id === b)?.shipyard));

  /** Star a War Room target sits at. */
  targetStar = (targetId: string): StarSystem => {
    const t = this.warTargets().find((x) => x.id === targetId);
    return t?.star ?? this.state.home;
  };

  /** Where each of our fleets is right now. */
  protected fleetHexes(): Hex[] {
    const s = this.state;
    return s.fleets.filter((f) => s.loadouts[f.id]).map((f) => hexAt(f.movement, s.turn));
  }

  /** Is one of our fleets inside (or at the edge of) a known empire's space? */
  reached = (empire: string): boolean => {
    const npc = this.knownNpcs().find((n) => n.def.name === empire);
    if (!npc) return false;
    return this.fleetHexes().some((h) => nearNpc(npc.def, h, 2));
  };

  // ── The shared world: asteroid fields ──────────────────────────────

  /** The galaxy's shared state as this empire sees it (local when nothing is linked). */
  protected sharedWorld(): SharedWorld {
    return this.deps.shared?.world() ?? this.localWorld;
  }

  /** Changes this empire made to the shared world: the link takes them (the server applies them for everyone). */
  protected emit(effects: readonly SharedEffect[]): void {
    if (!effects.length) return;
    if (this.deps.shared) this.deps.shared.emit(effects);
    else this.localWorld = applyEffects(this.localWorld, effects);
  }

  private localWorld: SharedWorld = EMPTY_WORLD;

  /** A system's asteroid fields; your home system also has its own belt of metals and gases. */
  asteroidsAt = (star: StarSystem): AsteroidField[] =>
    [...(star.id === this.state.home.id ? homeBelt(star) : []), ...fieldsOf(star, this.deps.galaxy.params.seed)];

  /** Each field of a system with what it holds now and the years until it is full again. */
  /** Units a year one mining ship of a class takes from a field of its resource. */
  minePerYear = (classId: string): number => miningYield({ ...this.state.economy, stock: this.state.empire.materials }, this.deps.economy, this.state.empire.research, classId);

  /** An asteroid field by its id (`${starId}#…`), or null. */
  fieldById = (id: string): AsteroidField | null => {
    const star = this.starById(id.slice(0, id.lastIndexOf('#')));
    return star ? this.asteroidsAt(star).find((f) => f.id === id) ?? null : null;
  };

  fieldReport = (star: StarSystem): FieldReport[] => {
    const w = this.sharedWorld(), year = this.state.turn;
    return this.asteroidsAt(star).map((field) => ({ field, left: fieldLeft(field, w.asteroids[field.id], year), fullIn: yearsToFull(field, w.asteroids[field.id], year) }));
  };

  /** Mining ships and where they are: each mines its system's fields of its resource. */
  protected presence(): Presence {
    const s = this.state;
    const miners: Array<{ classId: string; count: number; pool?: string; contract?: { company: string; name: string } }> = [];
    const pools: Record<string, number> = {};
    // Fields that miners on station were sent to work, while they have rock left: those miners
    // draw on them alone, and the rest of the system's miners on the other fields.
    const pinned = new Map<string, FieldReport>();
    for (const g of this.groups()) {
      const id = g.id === 'dock' ? undefined : s.loadouts[g.id]?.orders?.mineField;
      if (!id || !g.stationed || !g.star) continue;
      const f = this.fieldReport(g.star).find((x) => x.field.id === id);
      if (f && f.left > 0 && g.ships.some((x) => this.classById.get(x.classId)?.mines === f.field.resource)) pinned.set(id, f);
    }
    this.pinned = new Set(pinned.keys());
    const at = (star: StarSystem | null, classId: string, field?: string): string | undefined => {
      const r = this.classById.get(classId)?.mines;
      if (!star || !r) return undefined;
      const own = field ? pinned.get(field) : undefined;
      if (own && own.field.resource === r && own.field.starId === star.id) {
        const key = fieldPoolKey(own.field.id);
        pools[key] = own.left;
        return key;
      }
      const key = poolKey(star.id, r);
      if (!(key in pools)) pools[key] = this.fieldReport(star).filter((f) => f.field.resource === r && !pinned.has(f.field.id)).reduce((n, f) => n + f.left, 0);
      return key;
    };
    for (const x of this.docked()) if (this.classById.get(x.classId)?.mines) miners.push({ ...x, pool: at(s.home, x.classId) });
    for (const g of this.groups()) {
      if (g.id === 'dock') continue;
      // A mining company's crews are paid for what they mine.
      const contract = g.company ? { company: g.company.id, name: g.company.name } : undefined;
      const field = s.loadouts[g.id]?.orders?.mineField;
      for (const x of g.ships) if (this.classById.get(x.classId)?.mines) miners.push({ ...x, pool: g.stationed ? at(g.star, x.classId, field) : undefined, ...(contract ? { contract } : {}) });
    }
    const known = this.knownNpcs();
    const reached = known.map((n) => n.def.name).filter((n) => this.reached(n));
    const techOf = Object.fromEntries(known.map((n) => [n.def.name, n.def.archetype.tech]));
    return { miners, pools, reached, techOf };
  }

  /** Fields worked by miners sent to them this year (presence): the system's other miners leave them be. */
  private pinned = new Set<string>();

  /** What was mined from each pool, taken from its fields (fullest first) and shared. */
  protected drawFields(mined: Readonly<Record<string, number>>): void {
    const effects: SharedEffect[] = [];
    for (const [key, amount] of Object.entries(mined)) {
      if (key.startsWith(FIELD_POOL)) {
        const field = this.fieldById(key.slice(FIELD_POOL.length));
        if (field && amount > 0) effects.push({ kind: 'mined', field, amount, year: this.state.turn });
        continue;
      }
      const { starId, resource } = parsePool(key);
      const star = this.starById(starId);
      if (!star || amount <= 0) continue;
      let rest = amount;
      for (const f of this.fieldReport(star).filter((x) => x.field.resource === resource && x.left > 0 && !this.pinned.has(x.field.id)).sort((a, b) => b.left - a.left)) {
        const take = Math.min(rest, f.left);
        effects.push({ kind: 'mined', field: f.field, amount: take, year: this.state.turn });
        rest -= take;
        if (rest <= 0) break;
      }
    }
    this.emit(effects);
  }

  /** The empire's map colour: territory, fleets, routes and the selection outline. */
  empireColor(): string {
    return this.state.identity?.color ?? DEFAULT_EMPIRE_COLOR;
  }

  /**
   * Found the empire, or change its identity later: your fleets and ships take the new colour,
   * the capital colony takes its new name.
   */
  setIdentity(id: EmpireIdentity, founding: boolean): void {
    const s = this.state;
    // Founding sets the race's ship style on every design and the ships it starts with.
    const style = founding && id.shipStyle ? id.shipStyle : null;
    const livery = (d: ShipDesign): ShipDesign => ({ ...d, ...(style ? { style, blend: [] } : {}), colors: { ...d.colors, accent: id.color } });
    const fleets = s.fleets.map((f) => (s.loadouts[f.id] ? { ...f, color: id.color, design: livery(f.design) } : f));
    const designs = Object.fromEntries(Object.entries(s.designs).map(([k, d]) => [k, livery(d)]));
    const colonies = s.economy.colonies.map((c) => (c.capital ? { ...c, name: id.capital } : c));
    this.deps.store.update({ identity: id, fleets, designs, economy: { ...s.economy, colonies } });
    if (founding) {
      this.dispatch(`The ${id.name} is founded. ${id.title} ${id.ruler} rules from ${id.capital}.`, 'good');
      this.deps.report?.('found', `founded the ${id.name} at ${s.home.name}`, placeOf(s.home));
    } else this.dispatch(`The empire is now known as the ${id.name}.`);
  }

  /** Every fleet moves at its empire's speed (1 ly a year to start): re-time saved journeys made at other speeds. */
  retimeFleets(): void {
    const s = this.state;
    const fleets = s.fleets.map((f) => {
      const movement = retime(f.movement, s.turn, s.loadouts[f.id] ? this.fleetSpeed() : BASE_SPEED);
      return movement === f.movement ? f : { ...f, movement };
    });
    if (fleets.some((f, i) => f !== s.fleets[i])) this.deps.store.update({ fleets });
  }

  // ── Commands: fleets ───────────────────────────────────────────────


  protected designOf(ships: readonly Squadron[]): ShipDesign {
    const lead = [...ships].sort((a, b) => (this.classById.get(b.classId)?.hull ?? 0) - (this.classById.get(a.classId)?.hull ?? 0))[0];
    return this.effectiveDesign(lead?.classId ?? this.state.shipyardClass);
  }

  formFleet(ships: Squadron[], to: StarSystem, name?: string, quiet = false): void {
    const s = this.state;
    const wanted = ships.filter((x) => x.count > 0);
    if (!wanted.length || !hasShips(this.docked(), wanted)) return;
    const n = s.fleets.filter((f) => f.owner === s.playerName).length + 1;
    const kind = wanted.every((x) => isSurveyClass(this.classById.get(x.classId)!)) ? 'Survey Group' : wanted.some((x) => isWarship(this.classById.get(x.classId)!)) ? 'Task Force' : 'Flotilla';
    const id = `player-${n}-t${s.turn}`;
    const label = name ?? `${kind} ${n}`;
    const speed = this.fleetSpeed();
    const fleet = { id, name: label, owner: s.playerName, color: this.empireColor(), movement: planMovement(s.home.hex, to.hex, s.turn, speed), design: this.designOf(wanted) };
    // Ships leave with full holds: the dock's spending this turn stays with the dock.
    // Survey groups explore and come home for supply on their own by default.
    const orders = kind === 'Survey Group' ? { autoExplore: true, autoReturn: true } : undefined;
    // Arks leave with colonists from the capital, one colony's worth each, while it has people to spare.
    const capital = s.economy.colonies.find((c) => c.capital);
    const colonists = countOf(wanted, ARK) && capital ? Math.min(countOf(wanted, ARK), this.spare(capital)) : 0;
    this.deps.store.update({ fleets: [...s.fleets, fleet], loadouts: { ...s.loadouts, [id]: { ships: wanted, ...fullStores(wanted, specOf), orders, ...(countOf(wanted, ARK) ? { colonists } : {}) } } });
    if (colonists && capital?.planetId) this.movePeople(capital.planetId, -colonists);
    if (!quiet) this.dispatch(`${label} departs for ${to.name} (${formatDuration(travelTurns(hexDistance(s.home.hex, to.hex), speed), CLOCK)})`);
  }

  /**
   * The current time in turns. Whole turns here; a live client adds the fraction of the
   * year that has passed, so orders given between ticks take effect from that moment.
   */
  protected now(): number {
    return this.state.turn;
  }

  /** Where a hex is on the galaxy plane: its star, or the hex centre in empty space. */
  pointOf = (h: Hex): Point2 => this.deps.galaxy.starAt(h)?.position ?? hexToWorld(h);

  moveFleet(fleetId: string, to: StarSystem, quiet = false): void {
    this.moveFleetToHex(fleetId, to.hex, to.name, quiet);
  }

  /** Send a fleet to any hex: a star system or empty space. */
  moveFleetToHex(fleetId: string, to: Hex, label: string, quiet = false): void {
    if (this.runByCompany(fleetId)) return;
    // Any other course ends a chase.
    const l = this.state.loadouts[fleetId];
    if (l?.orders?.chase) this.deps.store.update((st) => ({ loadouts: { ...st.loadouts, [fleetId]: { ...l, orders: { ...l.orders, chase: undefined } } } }));
    this.setCourse(fleetId, to, label, quiet);
  }

  /** Set a fleet's course from exactly where it is now (keeps its orders). */
  protected setCourse(fleetId: string, to: Hex, label: string, quiet = false): void {
    const s = this.state;
    const f = s.fleets.find((x) => x.id === fleetId);
    const l = s.loadouts[fleetId];
    if (!f || !l) return;
    // Set off from exactly where the fleet is now, mid-hex and mid-year, so it never jumps.
    const time = Math.max(s.turn, this.now());
    const at = positionAt(f.movement, time, this.pointOf);
    const from = worldToHex(at.x, at.z);
    if (hexEquals(from, to) && hexEquals(f.movement.route[f.movement.route.length - 1], to)) return;
    const speed = this.fleetSpeed();
    const moved = { ...f, movement: planMovement(from, to, time, speed, at) };
    this.deps.store.update({ fleets: s.fleets.map((x) => (x.id === fleetId ? moved : x)) });
    if (!quiet) this.dispatch(`${f.name} sets course for ${label} (${formatDuration(travelTurns(hexDistance(from, to), speed), CLOCK)})`);
  }

  setOrders(fleetId: string, orders: FleetOrders): void {
    if (this.runByCompany(fleetId)) return;
    const l = this.state.loadouts[fleetId];
    if (!l) return;
    // A trade run carries on unless the fleet is sent exploring. The flags are stored the same
    // way however they arrive (auto-mine only when on), so browser and server keep equal orders.
    const trade = orders.autoExplore ? undefined : orders.trade ?? l.orders?.trade;
    // Only a fleet with warships may be aggressive.
    const stance = isAggressive(orders) && hasWarships(l.ships) ? 'aggressive' as const : undefined;
    const next: FleetOrders = { autoExplore: orders.autoExplore === true, autoReturn: orders.autoReturn === true, ...(orders.autoMine === true ? { autoMine: true } : {}), trade, stance, ...(l.orders?.chase ? { chase: l.orders.chase } : {}), ...(l.orders?.mineField ? { mineField: l.orders.mineField } : {}) };
    this.deps.store.update((st) => ({ loadouts: { ...st.loadouts, [fleetId]: { ...l, orders: next } } }));
  }

  /**
   * Send mining ships to work one asteroid field (change asteroid-assign). A fleet sets course for
   * the field's star and, on station there, its miners of that field's resource mine it first;
   * from the dock (`dock`), its miners of that resource leave as a new flotilla. Once the field is
   * dry they mine the system's other fields, and an auto-mining fleet moves on as before.
   */
  mineField(fleetId: string, fieldId: string): void {
    const s = this.state;
    const field = this.fieldById(fieldId);
    const star = field && this.starById(field.starId);
    if (!field || !star) return;
    const res = RESOURCES.find((r) => r.id === field.resource)?.name.toLowerCase() ?? field.resource;
    let id = fleetId;
    if (fleetId === 'dock') {
      const ships = this.docked().filter((x) => x.count > 0 && this.classById.get(x.classId)?.mines === field.resource);
      if (!ships.length) return;
      const before = new Set(s.fleets.map((f) => f.id));
      this.formFleet(ships, star, `${RESOURCES.find((r) => r.id === field.resource)?.name ?? 'Mining'} miners`, true);
      const made = this.state.fleets.find((f) => !before.has(f.id));
      if (!made) return;
      id = made.id;
    }
    if (this.runByCompany(id)) return;
    const l = this.state.loadouts[id];
    const f = this.state.fleets.find((x) => x.id === id);
    if (!l || !f || !l.ships.some((x) => x.count > 0 && this.classById.get(x.classId)?.mines === field.resource)) return;
    this.deps.store.update((st) => ({ loadouts: { ...st.loadouts, [id]: { ...l, orders: { ...(l.orders ?? {}), mineField: field.id } } } }));
    this.setCourse(id, star.hex, star.name, true);
    this.dispatch(`Sent ${f.name} to mine the ${res} field at ${star.name}`);
  }

  returnHome(fleetId: string): void {
    this.moveFleet(fleetId, this.state.home);
  }

  dockFleet(fleetId: string): void {
    if (this.runByCompany(fleetId)) return;
    const s = this.state;
    const f = s.fleets.find((x) => x.id === fleetId);
    if (!f || !s.loadouts[fleetId]) return;
    if (!isStationed(f.movement, s.turn) || !hexEquals(hexAt(f.movement, s.turn), s.home.hex)) return;
    const { [fleetId]: gone, ...loadouts } = s.loadouts;
    // Goods still aboard go back into the stockpile.
    const materials = gone.cargo ? { ...s.empire.materials, goods: s.empire.materials.goods + gone.cargo } : s.empire.materials;
    // Colonists aboard go home to the capital.
    const capital = s.economy.colonies.find((c) => c.capital);
    if (gone.colonists && capital?.planetId) this.movePeople(capital.planetId, gone.colonists);
    this.deps.store.update({ fleets: s.fleets.filter((x) => x.id !== fleetId), loadouts, empire: { ...s.empire, materials } });
    this.noteFlow(s.empire.materials, `${f.name} docked: cargo unloaded`);
    this.dispatch(`${f.name} docks at ${s.home.name}`);
  }

  /**
   * Change a group's ships (and the empire roster); empty fleets disband. `damage` replaces the
   * damage its ships carry (after a fight); otherwise classes it no longer has drop theirs.
   */
  protected adjustGroup(groupId: string, delta: Squadron[], stores?: Partial<Stores>, damage?: Damage): void {
    const s = this.state;
    const roster = { ...s.economy.roster };
    // A company's ships are its own: the state's roster does not change.
    if (!s.loadouts[groupId]?.company) for (const d of delta) roster[d.classId] = Math.max(0, (roster[d.classId] ?? 0) + d.count);
    if (groupId === 'dock') {
      const spent = { ...s.dockSpent };
      if (stores) {
        const full = fullStores(dockedShips(roster, this.stateLoadouts(s.loadouts)), specOf);
        if (stores.supply !== undefined) spent.supply = Math.max(0, full.supply - stores.supply);
      }
      this.deps.store.update({ economy: { ...s.economy, roster }, dockSpent: spent, empire: { ...s.empire, fleetPower: this.fleetPower(roster) } });
      return;
    }
    const l = s.loadouts[groupId];
    if (!l) return;
    const ships = adjustShips(l.ships, delta);
    if (!ships.length) {
      const { [groupId]: _gone, ...loadouts } = s.loadouts;
      this.deps.store.update({ economy: { ...s.economy, roster }, loadouts, fleets: s.fleets.filter((f) => f.id !== groupId), empire: { ...s.empire, fleetPower: this.fleetPower(roster) } });
      return;
    }
    const next = clampStores(rescaleStores({ supply: stores?.supply ?? l.supply }, l.ships, ships, specOf), ships, specOf);
    const carried = Object.fromEntries(Object.entries(damage ?? l.damage ?? {}).filter(([id, d]) => d > 0 && countOf(ships, id) > 0));
    const { damage: _old, ...rest } = l;
    // Arks lost take their colonists with them.
    if (rest.colonists !== undefined) rest.colonists = Math.min(rest.colonists, countOf(ships, ARK));
    this.deps.store.update({ economy: { ...s.economy, roster }, loadouts: { ...s.loadouts, [groupId]: { ...rest, ships, ...next, ...(Object.keys(carried).length ? { damage: carried } : {}) } }, empire: { ...s.empire, fleetPower: this.fleetPower(roster) } });
  }

  /** Hull integrity of a group, 0..1: how much of its ships' hull its damage has not taken. */
  hullOf(ships: readonly Squadron[], damage: Damage | undefined): number {
    if (!damage) return 1;
    let total = 0, lost = 0;
    for (const x of ships) {
      const hull = this.classById.get(x.classId)?.hull ?? 0;
      total += hull * x.count;
      lost += Math.min(hull * x.count, damage[x.classId] ?? 0);
    }
    return total > 0 ? 1 - lost / total : 1;
  }

  /**
   * What repairs a fleet on station at `h`: a colony with an Orbital Shipyard (and home) fully,
   * another colony quickly, a supply depot, an ally's world or the edge of our territory slowly.
   */
  repairSite(h: Hex): RepairSite | null {
    if (!this.isFriendlyHex(h)) return null;
    const star = this.deps.galaxy.starAt(h);
    if (star) {
      if (hexEquals(star.hex, this.state.home.hex)) return 'shipyard';
      const here = this.state.economy.colonies.filter((c) => c.starId === star.id);
      if (here.some((c) => c.capital || (c.buildings ?? []).includes('shipyard'))) return 'shipyard';
      if (here.length) return 'colony';
      if (this.state.depots.includes(star.id)) return 'depot';
    }
    return this.allies().some((e) => [e.home, ...e.colonies].some((c) => !!c && hexEquals(c, h))) ? 'ally' : 'depot';
  }

  // ── Commands: exploration ──────────────────────────────────────────

  protected starOfPlanet(planet: Planet): StarSystem | null {
    return this.starById(planet.starId);
  }

  /** The group on station with the most supply that can afford to explore this planet. */
  explorerFor(planet: Planet): FleetGroup | null {
    const star = this.starOfPlanet(planet);
    if (!star) return null;
    const cost = exploreCost(planet);
    return this.stateGroupsAt(star).filter((g) => g.stores.supply >= cost).sort((a, b) => b.stores.supply - a.stores.supply)[0] ?? null;
  }

  explore(planet: Planet, quiet = false): boolean {
    const s = this.state;
    if (s.explored[planet.id] || this.colonyAt(planet.id)) return false;
    const g = this.explorerFor(planet);
    if (!g) {
      if (!quiet) this.dispatch(`Cannot explore ${planet.name}: no ship on station there with ${exploreCost(planet)} supply`, 'bad');
      return false;
    }
    const empire = { ...s.empire, fleetPower: this.groupPower(g.ships) };
    const result = this.deps.encounters.resolve(this.deps.galaxy.params.seed, planet, empire);
    this.adjustGroup(g.id, [], { supply: g.stores.supply - exploreCost(planet) });
    const now = this.state;
    this.deps.store.update({ explored: { ...now.explored, [planet.id]: result }, empire: applyCost(now.empire, result) });
    const star = this.starOfPlanet(planet);
    if (star && this.unsurveyed(star).length === 0) this.deps.report?.('survey', `finished surveying ${star.name}`, placeOf(star));
    return true;
  }

  exploreAll(star: StarSystem): void {
    let n = 0;
    const pending = this.planets(star).filter((p) => !this.state.explored[p.id] && !this.colonyAt(p.id));
    for (const p of pending) if (this.explore(p, true)) n++;
    if (n < pending.length) this.dispatch(`Explored ${n} of ${pending.length} planets in ${star.name}: out of supply. Return home to resupply, or bring survey ships.`, n ? undefined : 'bad');
  }

  collectCrate(planetId: string): Collected | null {
    const s = this.state;
    const crate = s.explored[planetId]?.crate;
    if (!crate || s.openedCrates.includes(planetId)) return null;
    this.deps.store.update({ empire: applyCrate(s.empire, crate, this.deps.tree), openedCrates: [...s.openedCrates, planetId] });
    return { haul: crateMaterials(crate.cards), cards: crate.cards };
  }

  unopenedCrates = (): string[] =>
    Object.entries(this.state.explored).filter(([id, r]) => r.crate && !this.state.openedCrates.includes(id)).map(([id]) => id);

  /** A system with one of your colonies in it. */
  isOwned = (star: StarSystem): boolean => this.colonyStars().has(star.id);

  /** Resource caches waiting on newly explored (not owned) planets of a system. */
  pendingCaches = (star: StarSystem): Array<{ planet: Planet; cache: Haul }> => {
    const s = this.state;
    // Only newly explored worlds: planets you have settled give nothing extra.
    return this.planets(star)
      .filter((p) => s.explored[p.id]?.success && !s.collectedCaches.includes(p.id) && !this.colonyAt(p.id))
      .map((p) => ({ planet: p, cache: planetCache(p, this.deps.galaxy.params.seed) }));
  };

  cacheOf = (planet: Planet): Haul => planetCache(planet, this.deps.galaxy.params.seed);

  collectResources(star: StarSystem): Collected | null {
    const caches = this.pendingCaches(star);
    const crates = this.unopenedCrates();
    if (!caches.length && !crates.length) return null;
    const s = this.state;
    let empire = s.empire;
    let haul: Haul = {};
    for (const { cache } of caches) haul = addHaul(haul, cache);
    const materials = { ...empire.materials };
    for (const [r, n] of Object.entries(haul)) materials[r as Resource] += n!;
    empire = { ...empire, materials };
    const cards: Card[] = [];
    for (const id of crates) {
      const crate = s.explored[id].crate!;
      haul = addHaul(haul, crateMaterials(crate.cards));
      cards.push(...crate.cards);
      empire = applyCrate(empire, crate, this.deps.tree);
    }
    this.deps.store.update({
      empire,
      openedCrates: [...s.openedCrates, ...crates],
      collectedCaches: [...s.collectedCaches, ...caches.map((c) => c.planet.id)],
    });
    this.noteFlow(s.empire.materials, `Collected at ${star.name}`);
    const text = Object.entries(haul).map(([r, n]) => `+${n} ${RESOURCES.find((x) => x.id === r)?.short ?? r}`).join('  ');
    this.dispatch(`Collected from ${star.name}: ${text || 'cards'}${crates.length ? ` · ${crates.length} crate${crates.length > 1 ? 's' : ''} opened` : ''}`, 'good');
    return { haul, cards };
  }

  /**
   * Collect what one explored planet holds: its one-time resource cache and its loot crate.
   * The player's acknowledgement that they got it.
   */
  collectPlanet(planet: Planet): Collected | null {
    const s = this.state;
    const star = this.starById(planet.starId);
    const cache = star ? this.pendingCaches(star).find((c) => c.planet.id === planet.id)?.cache : undefined;
    const crate = s.explored[planet.id]?.crate && !s.openedCrates.includes(planet.id) ? s.explored[planet.id].crate! : null;
    if (!cache && !crate) return null;
    let haul: Haul = cache ?? {};
    const materials = { ...s.empire.materials };
    for (const [r, n] of Object.entries(haul)) materials[r as Resource] += n!;
    let empire = { ...s.empire, materials };
    if (crate) {
      haul = addHaul(haul, crateMaterials(crate.cards));
      empire = applyCrate(empire, crate, this.deps.tree);
    }
    this.deps.store.update({
      empire,
      openedCrates: crate ? [...s.openedCrates, planet.id] : s.openedCrates,
      collectedCaches: cache ? [...s.collectedCaches, planet.id] : s.collectedCaches,
    });
    this.noteFlow(s.empire.materials, `Collected on ${planet.name}`);
    const text = Object.entries(haul).map(([r, n]) => `+${n} ${RESOURCES.find((x) => x.id === r)?.short ?? r}`).join('  ');
    this.dispatch(`Collected from ${planet.name}: ${text || 'cards'}${crate ? ' · crate opened' : ''}`, 'good');
    return { haul, cards: crate?.cards ?? [] };
  }

  collectAllLoot(): void {
    const ids = this.unopenedCrates();
    if (!ids.length) return;
    const s = this.state;
    let empire = s.empire;
    let cards = 0;
    for (const id of ids) {
      const crate = s.explored[id].crate!;
      empire = applyCrate(empire, crate, this.deps.tree);
      cards += crate.cards.length;
    }
    this.deps.store.update({ empire, openedCrates: [...s.openedCrates, ...ids] });
    this.dispatch(`Opened ${ids.length} loot crate${ids.length > 1 ? 's' : ''} (${cards} cards)`, 'good');
  }

  // ── Commands: research ─────────────────────────────────────────────

  research(nodeId: string): void {
    const s = this.state;
    const research = this.deps.tree.research(s.empire.research, nodeId);
    const node = this.deps.tree.node(nodeId);
    const focus = s.economy.focus === nodeId ? null : s.economy.focus;
    const speed = this.fleetSpeed();
    this.deps.store.update({ empire: { ...s.empire, research }, economy: { ...s.economy, focus } });
    if (this.fleetSpeed() !== speed) this.retimeFleets();
    const unlocked = node.grants.filter((g) => g.kind === 'chassis').map((g) => this.classById.get(g.id)?.name).filter(Boolean);
    this.dispatch(`Researched ${node.name}${unlocked.length ? ` — unlocks ${unlocked.join(', ')}` : ''}`, 'good');
  }

  setFocus(nodeId: string | null): void {
    this.deps.store.update((s) => ({ economy: { ...s.economy, focus: nodeId } }));
  }

  grantShards(nodeId: string, sourceId: string, amount: number): void {
    const s = this.state;
    this.deps.store.update({ empire: { ...s.empire, research: this.deps.tree.grantShards(s.empire.research, nodeId, sourceId, amount) } });
  }

  // ── Commands: shipyard ─────────────────────────────────────────────

  selectClass(classId: string): void {
    this.deps.store.update({ shipyardClass: classId });
  }

  setDesign(design: ShipDesign): void {
    const id = this.state.shipyardClass;
    // Styles are earned: a locked style (say from a pasted design code) falls back to the empire's own.
    const styles = this.unlockedStyles();
    const style = styles.includes(design.style) ? design.style : this.foundingStyle();
    const allowed = { ...design, style, blend: (design.blend ?? []).filter((b) => styles.includes(b)) };
    this.deps.store.update((s) => ({ designs: { ...s.designs, [id]: normalizeDesign(allowed) } }));
  }

  /**
   * Lay down a ship at a yard. `charter`: a freighter, mining ship or colony ark founds a company
   * when it is launched (change commerce); other ships ignore it.
   */
  buildShip(classId: string, yardPlanetId?: string, charter?: boolean): void {
    const s = this.state;
    const c = this.classById.get(classId);
    if (!c || !this.isClassUnlocked(c)) return;
    const yard = this.yards().find((y) => y.planetId === yardPlanetId) ?? this.yards().find((y) => y.capital) ?? this.yards()[0];
    if (!yard?.planetId) return this.dispatch('No shipyard: build an Orbital Shipyard on a colony first', 'bad');
    const discount = Math.min(40, this.bonus('build'));
    if (!canAfford(s.empire.materials, c.cost, discount)) return;
    // Paid up front; the hull takes years (minutes) at the yard, one at a time.
    const chartered = charter === true && !!companyKindOf(c);
    const construction = enqueue(s.construction, { kind: 'ship', item: classId, site: yard.planetId, ...(chartered ? { charter: true } : {}) }, buildYears(c), s.turn);
    const job = construction[construction.length - 1];
    this.deps.store.update({ empire: { ...s.empire, materials: pay(s.empire.materials, c.cost, discount) }, construction });
    this.noteFlow(s.empire.materials, `Built a ${c.name}`);
    this.dispatch(`${c.name} laid down at ${yard.name}${chartered ? ' for a new company' : ''}: ready in ${formatDuration(job.doneTurn - s.turn, CLOCK)}`);
  }

  /** Take a ship off a yard's queue: those after it move up, and the part not yet built is refunded. */
  cancelJob(jobId: string): void {
    const s = this.state;
    const job = s.construction.find((j) => j.id === jobId && j.kind === 'ship');
    const c = job && this.classById.get(job.item);
    const r = job && cancelJob(s.construction, jobId, s.turn);
    if (!job || !c || !r) return;
    const discount = Math.min(40, this.bonus('build'));
    const materials = { ...s.empire.materials };
    for (const [res, n] of Object.entries(c.cost)) materials[res as Resource] += Math.floor(Math.ceil(n! * (1 - discount / 100)) * (1 - r.built));
    this.deps.store.update({ construction: r.queue, empire: { ...s.empire, materials } });
    this.noteFlow(s.empire.materials, `Cancelled a ${c.name}`);
  }

  /** Move a waiting ship one place earlier (up) or later in its yard's queue. */
  moveJob(jobId: string, up: boolean): void {
    const s = this.state;
    const queue = s.construction.some((j) => j.id === jobId && j.kind === 'ship') ? moveJob(s.construction, jobId, up, s.turn) : null;
    if (queue) this.deps.store.update({ construction: queue });
  }

  /** A finished hull joins the home dock, or a group in the yard's system. */
  protected launchShip(classId: string, yard: Colony): void {
    const s = this.state;
    const one = [{ classId, count: 1 }];
    if (!yard.starId || yard.starId === s.home.id) {
      this.adjustGroup('dock', one);
      return;
    }
    const star = this.starById(yard.starId)!;
    const here = this.stateGroupsAt(star).find((g) => g.id !== 'dock');
    if (here) return this.adjustGroup(here.id, one);
    const id = `yard-${yard.starId}-t${s.turn}`;
    const fleet = { id, name: `${star.name} Yard Group`, owner: s.playerName, color: this.empireColor(), movement: planMovement(star.hex, star.hex, s.turn, 1), design: this.designOf(one) };
    const roster = { ...s.economy.roster, [classId]: (s.economy.roster[classId] ?? 0) + 1 };
    this.deps.store.update({ fleets: [...s.fleets, fleet], loadouts: { ...s.loadouts, [id]: { ships: one, ...fullStores(one, specOf) } }, economy: { ...s.economy, roster } });
  }

  caps = () => capsOf(this.state.economy, this.deps.economy);

  /**
   * Next year's economy on the current state, without changing anything: the resource ledger's
   * income and costs (change resource-ledger).
   */
  forecast = (): TurnReport => resolveTurn({ ...this.state.economy, stock: this.state.empire.materials }, this.state.empire.research, this.state.turn, this.deps.economy, this.presence(), this.transfers()).report;

  /** Record a one-off change to the stores since `before` (what caused it), newest first. */
  protected noteFlow(before: Stockpile, what: string): void {
    const after = this.state.empire.materials, turn = this.state.turn;
    const add: Flow[] = [];
    for (const r of RESOURCES) {
      const n = (after[r.id] ?? 0) - (before[r.id] ?? 0);
      if (n) add.push({ turn, r: r.id, n, what });
    }
    if (add.length) this.deps.store.update((st) => ({ flows: [...add, ...(st.flows ?? [])].slice(0, FLOW_LOG) }));
  }

  jobs = (site?: string): Job[] => this.state.construction.filter((j) => !site || j.site === site);

  // ── Commands: colonies ─────────────────────────────────────────────

  /**
   * Settle a surveyed planet with a Colony Ark on station there (change commerce): the ark is not
   * used up, but it spends its colonists and all of its supply. A fleet's ark needs colonists aboard
   * (see embark); an ark at the home dock takes them from the capital, if it can spare them (colonistFloor).
   */
  settle(planet: Planet): void {
    const s = this.state;
    const star = this.starOfPlanet(planet);
    if (!star || this.colonyAt(planet.id)) return;
    const why = this.cannotSettle(planet);
    if (why) return this.dispatch(why, 'bad');
    const ark = this.arkAt(star);
    if (typeof ark === 'string') return this.dispatch(ark, 'bad');
    if (ark.id !== 'dock') {
      const l = s.loadouts[ark.id];
      this.deps.store.update((st) => ({ loadouts: { ...st.loadouts, [ark.id]: { ...l, colonists: (l.colonists ?? 0) - 1, supply: l.supply - ARK_SUPPLY } } }));
    } else {
      this.adjustGroup('dock', [], { supply: ark.stores.supply - ARK_SUPPLY });
      this.movePeople(s.economy.colonies.find((c) => c.capital)!.planetId!, -1);
    }
    this.foundColony(planet, star);
  }

  /**
   * The state's ark at a star that can settle now (a fleet's, with colonists and a full ark's
   * supply; or the home dock's, with colonists from the capital), else why none can.
   */
  arkAt = (star: StarSystem): FleetGroup | string => {
    const arks = this.stateGroupsAt(star).filter((x) => countOf(x.ships, ARK) > 0);
    if (!arks.length) return `Settling needs a Colony Ark on station in ${star.name}`;
    const fleet = arks.find((g) => g.id !== 'dock' && (g.colonists ?? 0) > 0 && g.stores.supply >= ARK_SUPPLY);
    if (fleet) return fleet;
    const capital = this.state.economy.colonies.find((c) => c.capital);
    const dock = arks.find((g) => g.id === 'dock' && g.stores.supply >= ARK_SUPPLY);
    if (dock && capital && this.spare(capital) > 0) return dock;
    if (arks.some((g) => g.id !== 'dock' && !(g.colonists ?? 0))) return `The ark at ${star.name} has no colonists: load them at a colony that can spare people (Embark)`;
    if (arks.some((g) => g.id === 'dock')) return `Settling from the dock takes colonists from ${capital?.name ?? 'the capital'}, which gives them only at population ${capital ? this.colonistFloor(capital) : 2} or more, and ${ARK_SUPPLY} supply`;
    return `The ark at ${star.name} needs ${ARK_SUPPLY} supply to settle: resupply in a friendly system`;
  };

  /** Why a planet cannot be settled (null when it can). */
  protected cannotSettle(planet: Planet): string | null {
    if (!this.state.explored[planet.id]) return `Survey ${planet.name} before settling it`;
    if (!settleable(planet.biome)) return `${planet.name} cannot be settled: ${BIOMES.find((b) => b.id === planet.biome)?.settle === 'conquest' ? 'it can only be taken' : 'nothing can live on it'}`;
    return null;
  }

  /** A new colony on a planet: one point of population, which grows on its own food surplus. */
  protected foundColony(planet: Planet, star: StarSystem, by?: string): void {
    const colony: Colony = { name: planet.name, biome: planet.biome, planetId: planet.id, starId: star.id, size: planet.size, buildings: [], pop: 1 };
    this.deps.store.update((st) => ({ economy: { ...st.economy, colonies: [...st.economy.colonies, colony] } }));
    this.dispatch(`${planet.name} settled${by ? ` by ${by}` : ''}: a new colony with ${slotsOf(planet.size)} building slots`, 'good');
    this.deps.report?.('colony', `settled ${planet.name} in ${star.name}`, placeOf(star));
  }

  /**
   * The population a colony must have to give up one for colonists: its own floor, else the
   * empire's (change commerce), never below 2 (a world keeps at least one).
   */
  colonistFloor = (c: Colony): number => Math.max(2, c.colonistFloor ?? this.commerce.colonistFloor ?? 2);

  /** Colonists a colony can spare now: its population down to one below its floor. */
  protected spare(c: Colony): number {
    return Math.max(0, (c.pop ?? 1) - (this.colonistFloor(c) - 1));
  }

  /** Set the colonist floor for the whole empire (no planet), or for one colony (null: back to the empire's). */
  setColonistFloor(floor: number | null, planetId: string | null): void {
    const n = floor === null ? null : Math.max(2, Math.min(50, Math.round(floor)));
    if (!planetId) {
      if (n !== null) this.updateCommerce((c) => ({ ...c, colonistFloor: n }));
      return;
    }
    this.deps.store.update((st) => ({ economy: { ...st.economy, colonies: st.economy.colonies.map((c) => {
      if (c.planetId !== planetId) return c;
      const { colonistFloor: _old, ...rest } = c;
      return n === null ? rest : { ...rest, colonistFloor: n };
    }) } }));
  }

  /** Add (or take, negative) population on a colony. */
  protected movePeople(planetId: string, delta: number): void {
    this.deps.store.update((st) => ({ economy: { ...st.economy, colonies: st.economy.colonies.map((c) => (c.planetId === planetId ? { ...c, pop: Math.max(1, (c.pop ?? 1) + delta) } : c)) } }));
  }

  /**
   * Load colonists onto a fleet's empty arks from your colonies in the system it is at: one per
   * ark, each from a colony that can spare people (population at or above its colonist floor, the
   * most populous first), which loses one.
   * Returns how many boarded.
   */
  embark(fleetId: string, quiet = false): number {
    const s = this.state;
    const l = s.loadouts[fleetId];
    const star = this.stationedAt(fleetId);
    if (!l || !star) return 0;
    if (l.company && !quiet) { this.notYours(fleetId); return 0; }
    let room = countOf(l.ships, ARK) - (l.colonists ?? 0);
    if (room <= 0) { if (!quiet) this.dispatch(`${this.fleetName(fleetId)} is already carrying colonists`); return 0; }
    let boarded = 0;
    for (;;) {
      if (room <= 0) break;
      const from = this.state.economy.colonies.filter((c) => c.starId === star.id && this.spare(c) > 0).sort((a, b) => (b.pop ?? 1) - (a.pop ?? 1))[0];
      if (!from?.planetId) break;
      this.movePeople(from.planetId, -1);
      boarded++;
      room--;
    }
    if (!boarded) {
      if (!quiet) this.dispatch(`No colony at ${star.name} has people to spare: a colony gives colonists only at its colonist floor or above (Empire › Colonies)`, 'bad');
      return 0;
    }
    this.deps.store.update((st) => ({ loadouts: { ...st.loadouts, [fleetId]: { ...st.loadouts[fleetId], colonists: (st.loadouts[fleetId].colonists ?? 0) + boarded } } }));
    if (!quiet) this.dispatch(`${boarded} colon${boarded === 1 ? 'y' : 'ies'}' worth of colonists boarded ${this.fleetName(fleetId)} at ${star.name}`, 'good');
    return boarded;
  }

  buildDepot(star: StarSystem): void {
    const s = this.state;
    if (this.isFriendly(star)) return;
    const g = this.stateGroupsAt(star).find((x) => countOf(x.ships, 'construction-tender') > 0);
    if (!g) return this.dispatch(`A supply depot needs a Construction Tender on station in ${star.name}`, 'bad');
    const cost = { credits: 60, metals: 40 };
    if (!canAfford(s.empire.materials, cost)) return this.dispatch('A supply depot costs 60 credits and 40 metals', 'bad');
    this.deps.store.update({ empire: { ...s.empire, materials: pay(s.empire.materials, cost) }, depots: [...s.depots, star.id] });
    this.noteFlow(s.empire.materials, `Supply depot at ${star.name}`);
    this.adjustGroup(g.id, [{ classId: 'construction-tender', count: -1 }]);
    this.dispatch(`Supply depot built at ${star.name}: fleets there resupply and repair, slowly`, 'good');
    this.deps.report?.('depot', `built a supply depot at ${star.name}`, placeOf(star));
  }

  build(planetId: string, buildingId: string, quiet = false): void {
    const s = this.state;
    const colony = this.colonyAt(planetId);
    const b = BUILDINGS.find((x) => x.id === buildingId);
    if (!colony || !b) return;
    const have = colony.buildings ?? [];
    const queued = this.jobs(planetId).filter((j) => j.kind === 'building').map((j) => j.item);
    if (have.length + queued.length >= slotsOf(colony.size ?? 3, colony.capital)) return this.dispatch(`${colony.name} has no free building slots`, 'bad');
    if (b.unique && (have.includes(b.id) || queued.includes(b.id))) return;
    if (!this.isBuildingUnlocked(b.id)) return this.dispatch(`${b.name} needs research: ${this.deps.tree.node(b.unlock!).name}`, 'bad');
    if (!canAfford(s.empire.materials, b.cost)) return this.dispatch(`Not enough resources for a ${b.name}`, 'bad');
    const construction = enqueue(s.construction, { kind: 'building', item: b.id, site: planetId }, b.years, s.turn);
    const job = construction[construction.length - 1];
    this.deps.store.update({ empire: { ...s.empire, materials: pay(s.empire.materials, b.cost) }, construction });
    this.noteFlow(s.empire.materials, `${b.name} on ${colony.name}`);
    if (!quiet) this.dispatch(`${b.name} under construction on ${colony.name}: ready in ${formatDuration(job.doneTurn - s.turn, CLOCK)}`);
  }

  /** Finish construction due by this year; returns what was completed. */
  protected completeConstruction(): string[] {
    const { done, pending } = due(this.state.construction, this.state.turn);
    if (!done.length) return [];
    this.deps.store.update({ construction: pending });
    const news: string[] = [];
    for (const j of done) {
      const colony = this.colonyAt(j.site);
      if (!colony) continue;
      if (j.kind === 'ship') {
        const company = j.charter ? this.charterCompany(j.item, colony) : null;
        if (!company) this.launchShip(j.item, colony);
        news.push(company ? `${this.classById.get(j.item)?.name ?? j.item} launched at ${colony.name}: ${company.name} is founded, the state holds ${company.held} of its ${company.shares} shares` : `${this.classById.get(j.item)?.name ?? j.item} launched at ${colony.name}`);
      } else {
        const colonies = this.state.economy.colonies.map((c) => (c.planetId === j.site ? { ...c, buildings: [...(c.buildings ?? []), j.item] } : c));
        this.deps.store.update((st) => ({ economy: { ...st.economy, colonies } }));
        news.push(`${BUILDINGS.find((b) => b.id === j.item)?.name ?? j.item} completed on ${colony.name}`);
      }
    }
    return news;
  }

  /** Planets of a system still to survey (not explored, not settled), in orbit order. */
  protected unsurveyed(star: StarSystem): Planet[] {
    return this.planets(star).filter((p) => !this.state.explored[p.id] && !this.colonyAt(p.id));
  }

  /** How much of a system has been surveyed: explored or settled planets out of all. */
  surveyProgress = (star: StarSystem): { done: number; total: number } => {
    const total = star.planetCount;
    return { done: total - this.unsurveyed(star).length, total };
  };

  /** A system worth a surveyor's visit: it has planets nobody has surveyed. */
  protected isSurveyTarget = (star: StarSystem): boolean => star.planetCount > 0 && this.unsurveyed(star).length > 0;

  /**
   * The next systems an auto-exploring fleet will survey (up to 3): the system it is heading
   * to (or surveying now) first, then the nearest unsurveyed systems after it, one hop at a time.
   */
  surveyPlan = (fleetId: string): StarSystem[] => {
    const s = this.state;
    const f = s.fleets.find((x) => x.id === fleetId);
    if (!f || !s.loadouts[fleetId]?.orders?.autoExplore) return [];
    const dest = f.movement.route[f.movement.route.length - 1];
    const here = this.deps.galaxy.starAt(dest);
    const first = here && this.isSurveyTarget(here) ? [here] : [];
    return [...first, ...planSurvey(this.deps.galaxy, dest, 3 - first.length, this.isSurveyTarget)];
  };

  /** The planet an auto-exploring fleet on station is surveying this year (it flies there in system view). */
  surveyTarget = (fleetId: string): Planet | null => {
    const s = this.state;
    const f = s.fleets.find((x) => x.id === fleetId);
    const l = s.loadouts[fleetId];
    if (!f || !l?.orders?.autoExplore || !isStationed(f.movement, s.turn)) return null;
    const star = this.deps.galaxy.starAt(hexAt(f.movement, s.turn));
    return star ? this.unsurveyed(star).find((p) => exploreCost(p) <= l.supply) ?? null : null;
  };

  /** Standing orders: fleets survey planet by planet, move on to the next system, and head home for supply. */
  protected followOrders(): string[] {
    const s = this.state;
    const news: string[] = [];
    for (const f of s.fleets) {
      const l = s.loadouts[f.id];
      // Companies run their own fleets.
      if (l?.company) {
        const note = this.runCompanyFleet(f.id);
        if (note) news.push(note);
        continue;
      }
      if (l?.orders?.chase) {
        const note = this.steerChase(f.id);
        if (note) news.push(note);
        continue;
      }
      // An aggressive fleet whose foe broke off last year's battle gives chase on its own.
      if (l && isAggressive(l.orders) && hasWarships(l.ships) && l.battle && l.battle.tick >= s.turn - 1 && isStationed(f.movement, s.turn)) {
        const foe = this.foreignFleet(l.battle.foe);
        const here = hexAt(f.movement, s.turn);
        if (foe && this.atWarWith(l.battle.foe.slice(0, l.battle.foe.indexOf(':'))) && !(isStationed(foe.movement, s.turn) && hexEquals(hexAt(foe.movement, s.turn), here))) {
          this.deps.store.update((st) => ({ loadouts: { ...st.loadouts, [f.id]: { ...l, orders: { ...l.orders, chase: l.battle!.foe } } } }));
          news.push(`${f.name} gives chase to ${foe.name.slice(0, 64)} of ${foe.empire.slice(0, 100)}`);
          this.steerChase(f.id);
          continue;
        }
      }
      if (!l?.orders || !isStationed(f.movement, s.turn)) continue;
      if (l.orders.trade) {
        const sold = this.runTrade(f.id);
        if (sold) news.push(sold);
        continue;
      }
      const star = this.deps.galaxy.starAt(hexAt(f.movement, s.turn));
      const left = () => (star ? this.unsurveyed(star) : []);
      if (l.orders.autoExplore) {
        // One planet a year: the surveyor visits each world in turn.
        const target = this.surveyTarget(f.id);
        if (target && star && this.explore(target, true)) {
          const p = this.surveyProgress(star);
          news.push(`${f.name} surveyed ${target.name} (${star.name} ${Math.round((100 * p.done) / Math.max(1, p.total))}% surveyed)`);
        }
        // System done (or empty space) and supply left: on to the nearest unsurveyed system.
        const supply = this.state.loadouts[f.id]?.supply ?? 0;
        if (left().length === 0 && supply >= MIN_SURVEY_SUPPLY) {
          const next = planSurvey(this.deps.galaxy, hexAt(f.movement, s.turn), 1, this.isSurveyTarget)[0];
          if (next) {
            this.moveFleet(f.id, next, true);
            news.push(`${f.name} heads on to survey ${next.name}`);
            continue;
          }
        }
      }
      // Auto-mine: miners with nothing left to mine here move on to the nearest field that has some
      // (not while the fleet is still surveying this system).
      if (l.orders.autoMine && !(l.orders.autoExplore && left().length > 0)) {
        const moved = this.mineOn(f.id);
        if (moved) {
          news.push(moved);
          continue;
        }
      }
      // Out of supply: back to the nearest friendly system to refill. Explorers always do this
      // (and carry on surveying once full); other fleets when ordered to return to resupply.
      const now = this.state.loadouts[f.id];
      if (!now || (star && this.isFriendly(star))) continue;
      const here = hexAt(f.movement, s.turn);
      const cap = capacity(now.ships, specOf).supply;
      const canSurveyHere = left().some((p) => exploreCost(p) <= now.supply);
      const outOfSupply = l.orders.autoExplore
        ? !canSurveyHere && (left().length > 0 || now.supply < MIN_SURVEY_SUPPLY)
        : now.supply < cap && !canSurveyHere;
      if ((l.orders.autoExplore || l.orders.autoReturn) && outOfSupply) {
        const refuge = this.nearestFriendly(here);
        if (hexEquals(refuge.hex, here)) continue;
        this.moveFleet(f.id, refuge, true);
        news.push(`${f.name} is low on supply: returning to ${refuge.name} to resupply${l.orders.autoExplore ? ', then surveying on' : ''}`);
      }
    }
    return news;
  }

  /**
   * An auto-mining fleet on station whose miners have nothing left to mine where they are (no
   * field of their resource, or all of them mined out) heads for the nearest system in reach with
   * a field that has rocks left. Uses the shared world, so fields others mined dry count as dry.
   * Returns the news, or null when it stays.
   */
  protected mineOn(fleetId: string): string | null {
    const s = this.state;
    const f = s.fleets.find((x) => x.id === fleetId);
    const l = s.loadouts[fleetId];
    if (!f || !l || !isStationed(f.movement, s.turn)) return null;
    const resources = minedBy(l.ships, (classId) => this.classById.get(classId)?.mines);
    if (!resources.length) return null;
    const here = hexAt(f.movement, s.turn);
    const star = this.deps.galaxy.starAt(here);
    const stockAt = (st: StarSystem) => stockFor(this.fieldReport(st), resources);
    if (star && stockAt(star) > 0) return null;
    const next = nearestMine(this.deps.galaxy, here, stockAt);
    if (!next) return null;
    // Name the resource it goes for: the one with most left there.
    const report = this.fieldReport(next);
    const resource = [...resources].sort((a, b) => stockFor(report, [b]) - stockFor(report, [a]))[0];
    this.steer(f.id, next);
    return `${f.name} heads to ${next.name} to mine ${resource}`;
  }

  /** The closest system where fleets resupply (a colony system or a supply depot); home if none is closer. */
  nearestFriendly(from: Hex): StarSystem {
    let best = this.state.home;
    let bestD = hexDistance(from, best.hex);
    for (const id of [...this.colonyStars(), ...this.state.depots]) {
      const star = this.starById(id);
      if (!star) continue;
      const d = hexDistance(from, star.hex);
      if (d < bestD || (d === bestD && star.id < best.id)) { best = star; bestD = d; }
    }
    return best;
  }

  toggleTrait(traitId: string): void {
    const hidden = this.state.hiddenTraits;
    this.deps.store.update({ hiddenTraits: hidden.includes(traitId) ? hidden.filter((t) => t !== traitId) : [...hidden, traitId] });
  }

  // ── Commands: empire (politics, trade, religion, espionage) ───────

  setGovernment(id: string): void {
    const s = this.state;
    if (s.economy.government === id) return;
    const cost = 30;
    if (s.empire.materials.influence < cost) return this.dispatch(`Changing government needs ${cost} influence`, 'bad');
    this.deps.store.update({ economy: { ...s.economy, government: id }, empire: { ...s.empire, materials: { ...s.empire.materials, influence: s.empire.materials.influence - cost } } });
    this.noteFlow(s.empire.materials, `New government: ${this.deps.economy.governments.find((g) => g.id === id)?.name ?? id}`);
  }

  togglePolicy(id: string): void {
    const s = this.state;
    const has = s.economy.policies.includes(id);
    if (!has && s.economy.policies.length >= maxPolicies(this.deps.economy, s.empire.research)) return;
    this.deps.store.update({ economy: { ...s.economy, policies: has ? s.economy.policies.filter((p) => p !== id) : [...s.economy.policies, id] } });
  }

  // ── Commands: trade ────────────────────────────────────────────────

  /** Worlds that buy trade goods: your colonies and the worlds of other empires. */
  markets = (): Market[] => {
    const out = new Map<string, Market>();
    for (const id of this.colonyStars()) {
      const star = this.starById(id);
      if (star) out.set(id, { starId: id, name: star.name, kind: 'own' });
    }
    for (const { def, state } of this.knownNpcs()) {
      for (const c of state.colonies) {
        const star = this.starById(c.starId);
        if (star && !c.capturedBy && !out.has(c.starId)) out.set(c.starId, { starId: c.starId, name: `${star.name} (${def.name})`, kind: 'npc', npc: def.id });
      }
    }
    for (const m of this.deps.markets?.() ?? []) if (!out.has(m.starId)) out.set(m.starId, m);
    return [...out.values()];
  };

  marketAt = (star: StarSystem): Market | null => this.markets().find((m) => m.starId === star.id) ?? null;

  /** Goods a group can carry, with research. */
  cargoCapacity = (ships: readonly Squadron[]): number => cargoCapacity(ships, bonusOf(this.tree, this.state.empire.research, 'cargo'));

  /** What a cargo loaded at `from` sells for at a market, after the market's tariff. */
  saleValue = (goods: number, from: StarSystem, market: Market): number => this.saleQuote(goods, from, market).credits;

  /** A sale's credits after tariff, and the tariff (which goes to the market's owner, when a player). */
  saleQuote = (goods: number, from: StarSystem, market: Market): { credits: number; tariff: number } => {
    const s = this.state;
    const at = this.starById(market.starId);
    if (!at) return { credits: 0, tariff: 0 };
    const tradePct = tradePctOf({ ...s.economy, stock: s.empire.materials }, this.deps.economy, s.empire.research);
    // An NPC faction pays more the better you stand with it.
    const factor = market.npc ? marketFactor(this.standingWith(market.npc)) : 1;
    const gross = saleValue(goods, hexDistance(from.hex, at.hex), market.kind, tradePct) * factor;
    const tariff = Math.round(gross * this.marketTariff(market) / 100);
    return { credits: Math.round(gross) - tariff, tariff };
  };

  /** Percent a market's owner takes from goods sold there: none at home (change commerce). */
  marketTariff = (market: Market): number => {
    if (market.npc) {
      const def = npcById(this.deps.galaxy, market.npc);
      return def ? npcTariff(def.archetype.id, this.standingWith(market.npc)) : 0;
    }
    if (market.player) return this.playerTariff(market.player);
    return 0;
  };

  /** Where a fleet is on station, if it is. */
  protected stationedAt(fleetId: string): StarSystem | null {
    const f = this.state.fleets.find((x) => x.id === fleetId);
    return f && isStationed(f.movement, this.state.turn) ? this.deps.galaxy.starAt(hexAt(f.movement, this.state.turn)) : null;
  }

  /** Fill a fleet's freighters with trade goods at one of your colony systems. */
  loadGoods(fleetId: string, quiet = false): number {
    if (!quiet && this.runByCompany(fleetId)) return 0;
    const s = this.state;
    const l = s.loadouts[fleetId];
    const star = this.stationedAt(fleetId);
    if (!l || !star || !this.colonyStars().has(star.id)) return 0;
    const room = this.cargoCapacity(l.ships) - (l.cargo ?? 0);
    const take = Math.max(0, Math.min(room, Math.floor(s.empire.materials.goods ?? 0)));
    if (!take) return 0;
    // A trading company buys its goods from the state.
    const company = l.company ? this.companyById(l.company) : undefined;
    const paid = company ? Math.round(take * (BASE_PRICE.goods ?? 4) * COMMERCE.goodsShare) : 0;
    this.deps.store.update({
      empire: { ...s.empire, materials: { ...s.empire.materials, goods: s.empire.materials.goods - take, credits: s.empire.materials.credits + paid } },
      loadouts: { ...s.loadouts, [fleetId]: { ...l, cargo: (l.cargo ?? 0) + take, cargoFrom: l.cargo ? l.cargoFrom : star.id } },
    });
    if (company) this.bookCompany(company.id, 0, paid);
    this.noteFlow(s.empire.materials, company ? `Goods sold to ${company.name}` : `${this.fleetName(fleetId)} loaded goods at ${star.name}`);
    if (!quiet) this.dispatch(`${this.fleetName(fleetId)} loads ${take} trade goods at ${star.name}`);
    return take;
  }

  /** Sell a fleet's goods at the market it is at (not where they were loaded). Returns the credits. */
  sellGoods(fleetId: string, quiet = false): number {
    if (!quiet && this.runByCompany(fleetId)) return 0;
    const s = this.state;
    const l = s.loadouts[fleetId];
    const star = this.stationedAt(fleetId);
    const market = star && this.marketAt(star);
    const from = l?.cargoFrom ? this.starById(l.cargoFrom) : null;
    if (!l?.cargo || !star || !market || !from || from.id === star.id) return 0;
    const { credits, tariff } = this.saleQuote(l.cargo, from, market);
    // A company's sale is its own revenue; the state's goes into the treasury.
    const company = l.company ? this.companyById(l.company) : undefined;
    this.deps.store.update({
      empire: company ? s.empire : { ...s.empire, materials: { ...s.empire.materials, credits: s.empire.materials.credits + credits } },
      loadouts: { ...s.loadouts, [fleetId]: { ...l, cargo: 0, cargoFrom: undefined } },
    });
    if (company) this.bookCompany(company.id, credits, 0);
    else this.noteFlow(s.empire.materials, `${this.fleetName(fleetId)} sold goods at ${market.name}`);
    // Another player's world: its owner gets the tariff.
    if (market.player && tariff > 0) this.emit([{ kind: 'payout', to: market.player, label: `Tariffs from ${this.empireName()}`, credits: tariff }]);
    if (market.npc) this.changeStanding(market.npc, Math.min(STANDING.tradeMax, Math.max(1, Math.floor(l.cargo * STANDING.perGoods))));
    if (!quiet) this.dispatch(this.saleNews(fleetId, l.cargo, market, credits), 'good');
    return credits;
  }

  /** The seller's news of a sale, naming whose world bought the goods (only the seller hears of it). */
  protected saleNews = (fleetId: string, goods: number, market: Market, credits: number): string =>
    `${this.fleetName(fleetId)} sold ${goods} trade goods at ${market.name} for ${credits} credits`;

  /**
   * Start (or stop, with null) a trade run: the fleet loads goods at your colony system nearest the
   * market, sells them there, and repeats. From the dock, the docked freighters set out as a new fleet.
   */
  tradeRun(groupId: string, to: StarSystem | null): void {
    if (this.runByCompany(groupId)) return;
    const s = this.state;
    if (!to) {
      const l = s.loadouts[groupId];
      if (l?.orders?.trade) this.deps.store.update({ loadouts: { ...s.loadouts, [groupId]: { ...l, orders: { ...l.orders, trade: undefined } } } });
      return;
    }
    if (!this.marketAt(to)) return this.dispatch(`${to.name} has no market for trade goods`, 'bad');
    const from = [...this.colonyStars()].map((id) => this.starById(id)).filter((x): x is StarSystem => !!x && x.id !== to.id)
      .sort((a, b) => hexDistance(a.hex, to.hex) - hexDistance(b.hex, to.hex) || (a.id < b.id ? -1 : 1))[0];
    if (!from) return this.dispatch('A trade run needs a colony of yours to load goods at, other than the market', 'bad');
    let fleetId = groupId;
    if (groupId === 'dock') {
      const n = countOf(this.docked(), FREIGHTER);
      if (!n) return this.dispatch('No Bulk Freighters in the dock', 'bad');
      const before = new Set(s.fleets.map((f) => f.id));
      this.formFleet([{ classId: FREIGHTER, count: n }], from, `Trade Run to ${to.name}`, true);
      fleetId = this.state.fleets.find((f) => !before.has(f.id))?.id ?? '';
    }
    const l = this.state.loadouts[fleetId];
    if (!l || !countOf(l.ships, FREIGHTER)) return this.dispatch('A trade run needs Bulk Freighters', 'bad');
    this.deps.store.update((st) => ({ loadouts: { ...st.loadouts, [fleetId]: { ...l, orders: { trade: { from: from.id, to: to.id }, stance: l.orders?.stance } } } }));
    this.dispatch(`${this.fleetName(fleetId)} starts a trade run: goods from ${from.name} to ${to.name}`);
    this.runTrade(fleetId);
  }

  protected fleetName = (fleetId: string): string => this.state.fleets.find((f) => f.id === fleetId)?.name ?? 'Fleet';

  /** One step of a trade run: sell at the market, load at the colony, and head for the other end. */
  protected runTrade(fleetId: string): string | null {
    const l = this.state.loadouts[fleetId];
    const trade = l?.orders?.trade;
    const at = this.stationedAt(fleetId);
    if (!trade || !at) return null;
    const from = this.starById(trade.from), to = this.starById(trade.to);
    if (!from || !to) return null;
    let news: string | null = null;
    const market = at.id === to.id && l.cargo ? this.marketAt(to) : null;
    if (market) {
      const n = l.cargo!;
      const credits = this.sellGoods(fleetId, true);
      if (credits) news = this.saleNews(fleetId, n, market, credits);
    }
    if (at.id === from.id) this.loadGoods(fleetId, true);
    const cargo = this.state.loadouts[fleetId]?.cargo ?? 0;
    // A company waits at the loading end until its holds are half full; a state run leaves with what there is.
    const enough = l.company ? cargo >= this.cargoCapacity(l.ships) / 2 : cargo > 0;
    const next = enough ? to : from;
    if (next.id !== at.id) this.steer(fleetId, next);
    return news;
  }

  /** Set a fleet's course for a star without a word (standing orders and companies). */
  protected steer(fleetId: string, to: StarSystem): void {
    this.setCourse(fleetId, to.hex, to.name, true);
  }

  foundFaith(name: string, tenets: string[]): void {
    const s = this.state;
    if (s.economy.faith) return;
    this.deps.store.update({ economy: { ...s.economy, faith: { name, tenets: tenets.slice(0, 2), adherents: { [s.playerName]: 40 }, missions: [] } } });
    this.dispatch(`${name} is founded`, 'good');
  }

  toggleMission(empire: string): void {
    const s = this.state;
    const f = s.economy.faith;
    if (!f) return;
    const missions = f.missions.includes(empire) ? f.missions.filter((m) => m !== empire) : [...f.missions, empire].slice(-3);
    this.deps.store.update({ economy: { ...s.economy, faith: { ...f, missions } } });
  }

  toggleSpy(empire: string): void {
    const s = this.state;
    const has = s.economy.spyNetworks.includes(empire);
    if (!has && s.economy.spyNetworks.length >= maxSpies(this.deps.economy, s.empire.research)) return;
    this.deps.store.update({ economy: { ...s.economy, spyNetworks: has ? s.economy.spyNetworks.filter((x) => x !== empire) : [...s.economy.spyNetworks, empire] } });
  }

  // ── Commands: war ──────────────────────────────────────────────────

  engage(targetId: string, ships: Squadron[], groupId: string): CombatOutcome | null {
    this.unlogged.length = 0;
    const s = this.state;
    const target = this.warTargets().find((t) => t.id === targetId);
    const committed = ships.filter((x) => x.count > 0);
    if (!target || s.engaged.includes(targetId) || !committed.length) return null;
    const at = target.star;
    const group = this.groupsAt(at).find((g) => g.id === groupId);
    if (!group || !hasShips(group.ships, committed)) return null;
    const me = { name: s.playerName, ships: committed, bonuses: this.combatBonuses(), damage: group.damage };
    const seed = hashSeed(this.deps.galaxy.params.seed, s.turn, targetId);
    const delta: Squadron[] = [];
    let research = s.empire.research;
    const salvage = 10 + this.bonus('salvage') * 3;
    const reverseEngineer = (captured: readonly Squadron[]) => {
      for (const c of captured) {
        const node = this.classById.get(c.classId)?.unlock;
        if (node && !research.researched.includes(node)) research = this.deps.tree.grantShards(research, node, 'reverse-engineering', salvage * c.count);
        delta.push({ classId: c.classId, count: c.count });
      }
    };
    const applySurvivors = (survivors: readonly Squadron[]) => {
      for (const x of committed) delta.push({ classId: x.classId, count: -(x.count - countOf(survivors, x.classId)) });
    };
    const result = resolveAssault(me, target.planet, SHIP_CLASSES, seed);
    applySurvivors(result.survivors);
    if (result.space) reverseEngineer(result.space.captured[0]);
    let colonies = s.economy.colonies;
    const effects: SharedEffect[] = [];
    // The NPC's ships in orbit (its garrison and raiders at home) fought as one: the survivors hold the world.
    const garrison = result.space ? result.space.survivors[1] : target.planet.garrison.ships;
    effects.push({ kind: 'npcColony', npc: target.npc, star: at.id, garrison, ...(result.captured ? { capturedBy: this.me } : {}) });
    if (result.space) for (const f of target.docked) effects.push({ kind: 'npcFleet', npc: target.npc, fleet: f, ships: [] });
    const disposition = npcById(this.deps.galaxy, target.npc)?.archetype.disposition ?? 0;
    effects.push({ kind: 'standing', npc: target.npc, player: this.me, delta: STANDING.assault + (result.captured ? STANDING.capture : 0), base: disposition });
    if (result.captured) {
      const planet = [...this.planets(at)].sort((a, b) => b.size - a.size || (a.id < b.id ? -1 : 1))[0];
      colonies = [...colonies, { name: planet?.name ?? at.name, biome: planet?.biome ?? 'barren', planetId: planet?.id, starId: at.id, size: planet?.size ?? 3, buildings: [], pop: 1 }];
      const pool = target.tech.filter((id) => !research.researched.includes(id));
      for (const id of pool.slice(0, 2)) research = this.deps.tree.grantShards(research, id, 'reverse-engineering', 40);
    }
    const summary = result.captured ? `${target.name} captured from the ${target.owner}: a new colony and alien tech fragments`
      : result.phaseReached === 'space' ? `Assault on ${target.name} failed in orbit`
      : result.phaseReached === 'bombardment' ? `Bombardment of ${target.name} could not break its defences: bring siege ships`
      : `Landing on ${target.name} repelled: ${result.troopsLanded} troops vs ${result.troopsNeeded} needed`;
    const outcome: CombatOutcome = { kind: 'planet', result, summary };
    this.logBattle({
      year: s.turn, kind: 'assault', attacked: false, place: placeOf(at), ours: group.name, ...(group.id !== 'dock' ? { fleetId: group.id } : {}),
      foe: target.name, foeEmpire: target.owner, outcome: result.captured ? 'won' : 'lost',
      lost: tallyLost(committed, result.survivors), killed: result.space ? tallyLost(target.planet.garrison.ships, result.space.survivors[1]) : {},
      ...(result.space?.captured[0].length ? { boarded: tallyOf(result.space.captured[0]) } : {}), ...(result.space?.captured[1].length ? { taken: tallyOf(result.space.captured[1]) } : {}),
      summary, ...(result.space ? { records: battleRecords(result.space, 0, this.classById) } : {}),
    });
    this.deps.store.update({ empire: { ...s.empire, research }, engaged: [...s.engaged, targetId], economy: { ...s.economy, colonies } });
    this.adjustGroup(groupId, delta, undefined, result.damage);
    this.emit(effects);
    this.dispatch(outcome.summary, result.captured ? 'good' : 'bad');
    this.deps.report?.('battle', `${outcome.summary} at ${at.name}`, placeOf(at));
    return outcome;
  }

  // ── Contacts at sea: fleets of different empires on one hex ───────

  /**
   * This fleet as it meets another at sea on `turn`: its warships (the whole fleet when it has
   * none), its research bonuses and the damage it carries. Null when it is not on station.
   */
  contactForce(fleetId: string, turn: number, underway = false): ContactForce | null {
    const s = this.state;
    const f = s.fleets.find((x) => x.id === fleetId);
    const l = s.loadouts[fleetId];
    // A fleet under way can still be caught (a pursuit): `underway` allows it.
    if (!f || !l || (!underway && !isStationed(f.movement, turn))) return null;
    const warships = warshipsOf(l.ships);
    const ships = warships.length ? warships : l.ships.filter((x) => x.count > 0);
    const at = hexAt(f.movement, turn);
    const empire = s.identity?.name ?? s.playerName;
    return {
      fleetId, fleetName: f.name, empire, at, star: this.deps.galaxy.starAt(at), ships, battle: l.battle, damage: l.damage, speed: f.movement.speed,
      aggressive: isAggressive(l.orders), armed: warships.length > 0,
      side: { name: empire, ships, bonuses: this.combatBonuses(), damage: l.damage },
    };
  }

  /**
   * Record one round of a battle at sea in this empire's own save: the ships its fleet lost (and
   * any it took), the damage it carries out, the battle it is now in, and the news. `index` is its
   * side in the round; `foe` is the other fleet as it went in.
   */
  applyContact(force: ContactForce, foe: ContactFoe, result: BattleResult, index: 0 | 1, round: number, tick: number, overtaken = false): void {
    this.unlogged.length = 0;
    const other = index === 0 ? 1 : 0;
    const delta: Squadron[] = force.ships.map((x) => ({ classId: x.classId, count: -(x.count - countOf(result.survivors[index], x.classId)) }));
    for (const c of result.captured[index]) delta.push({ classId: c.classId, count: c.count });
    this.adjustGroup(force.fleetId, delta, undefined, result.damage[index]);
    const mine = shipTotal(force.ships) - shipTotal(result.survivors[index]);
    const theirs = shipTotal(foe.ships) - shipTotal(result.survivors[other]);
    // The other fleet's and empire's names come from another player: bounded like their public view.
    const foeName = foe.fleetName.slice(0, 64), foeEmpire = foe.empire.slice(0, 100);
    const place = force.star?.name ?? 'deep space';
    const l = this.state.loadouts[force.fleetId];
    // The round as the battle view draws it, this fleet first; the meter's 100% carries over from the battle's first round.
    const detail = result.rounds[0]?.detail;
    const going = l?.battle && l.battle.foe === foe.key && round > 1 ? l.battle.view : undefined;
    const view = detail ? recordRound(detail, round, [{ ships: force.ships, damage: force.damage }, { ships: foe.ships, damage: foe.damage }], index, this.classById, going?.start ?? null) : undefined;
    if (l) this.deps.store.update((st) => ({ loadouts: { ...st.loadouts, [force.fleetId]: { ...l, battle: { foe: foe.key, foeName, foeEmpire, round, tick, ...(view ? { view } : {}) } } } }));
    const tally = `${mine} of ours lost, ${theirs} of theirs destroyed`;
    const text = result.winner === index ? `${force.fleetName} destroyed ${foeName} of ${foeEmpire} at ${place} in round ${round}: ${tally}`
      : result.winner === other ? `${force.fleetName} was destroyed by ${foeName} of ${foeEmpire} at ${place} in round ${round}`
      : `Battle at ${place}, round ${round}: ${force.fleetName} against ${foeName} of ${foeEmpire}, ${tally}.${round === 1 ? ' A round a year until one side is gone or breaks off: Retreat from the fleet card.' : ''}`;
    this.dispatch(overtaken ? `Overtaken while breaking off: ${text}` : text, result.winner === index ? 'good' : result.winner === other || mine > theirs ? 'bad' : undefined);
    this.logBattle({
      year: tick, kind: overtaken ? 'pursuit' : 'sea', attacked: overtaken || !force.aggressive, place: force.star ? placeOf(force.star) : { name: 'deep space', q: force.at.q, r: force.at.r },
      ours: force.fleetName, fleetId: force.fleetId, foe: foeName, foeEmpire, round,
      outcome: result.winner === index ? 'won' : result.winner === other ? 'lost' : 'ongoing',
      lost: tallyLost(force.ships, result.survivors[index]), killed: tallyLost(foe.ships, result.survivors[other]),
      ...(result.captured[index].length ? { boarded: tallyOf(result.captured[index]) } : {}), ...(result.captured[other].length ? { taken: tallyOf(result.captured[other]) } : {}),
      summary: overtaken ? `Overtaken while breaking off: ${text}` : text, ...(view ? { records: [view] } : {}),
    });
  }

  /** Another player's fleet by `${ownerId}:${fleetId}` (from the server's list of empires, or the live feed). */
  protected foreignFleet(key: string): ForeignFleet | null {
    return this.deps.foreignFleet?.(key) ?? null;
  }

  /**
   * Order a fleet with warships to chase another player's fleet (null stops). Each year it steers
   * for where its quarry will be; it fights when they are on the same hex.
   */
  chase(fleetId: string, target: string | null): void {
    if (this.runByCompany(fleetId)) return;
    const s = this.state;
    const f = s.fleets.find((x) => x.id === fleetId);
    const l = s.loadouts[fleetId];
    if (!f || !l) return;
    if (!target) {
      if (l.orders?.chase) this.deps.store.update((st) => ({ loadouts: { ...st.loadouts, [fleetId]: { ...l, orders: { ...l.orders, chase: undefined } } } }));
      return;
    }
    const foe = this.foreignFleet(target);
    if (!foe || !hasWarships(l.ships) || target.startsWith(`${this.me}:`)) return this.dispatch(`${f.name} cannot chase that fleet`, 'bad');
    if (!this.atWarWith(target.slice(0, target.indexOf(':')))) return this.dispatch(`${f.name} can only chase the fleets of an empire you are at war with`, 'bad');
    this.deps.store.update((st) => ({ loadouts: { ...st.loadouts, [fleetId]: { ...l, orders: { ...(l.orders ?? {}), chase: target } } } }));
    this.dispatch(`${f.name} gives chase to ${foe.name.slice(0, 64)} of ${foe.empire.slice(0, 100)}`);
    this.steerChase(fleetId);
  }

  /**
   * Steer a chasing fleet for where its quarry will be a year from now: a faster chaser closes
   * in and catches it; a slower one gains only while the quarry is stopped. Lost quarry ends the chase.
   */
  protected steerChase(fleetId: string): string | null {
    const s = this.state;
    const f = s.fleets.find((x) => x.id === fleetId);
    const l = s.loadouts[fleetId];
    const key = l?.orders?.chase;
    if (!f || !l || !key) return null;
    const foe = this.foreignFleet(key);
    if (!foe) {
      this.deps.store.update((st) => ({ loadouts: { ...st.loadouts, [fleetId]: { ...l, orders: { ...l.orders, chase: undefined } } } }));
      return `${f.name} has lost track of the fleet it was chasing`;
    }
    const time = Math.max(s.turn, this.now());
    const ahead = worldToHex(...xz(positionAt(foe.movement, Math.floor(time) + 1, this.pointOf)));
    const dest = f.movement.route[f.movement.route.length - 1];
    if (!hexEquals(dest, ahead)) this.setCourse(fleetId, ahead, foe.name, true);
    return null;
  }

  /**
   * Break off: the fleet sets course at once for the nearest friendly system (home when it is
   * already there, or a nearby star), which ends any battle it is in. Allowed any time.
   */
  retreat(fleetId: string): void {
    const s = this.state;
    const f = s.fleets.find((x) => x.id === fleetId);
    const l = s.loadouts[fleetId];
    if (!f || !l) return;
    const here = hexAt(f.movement, s.turn);
    const friendly = [s.home.id, ...this.colonyStars(), ...s.depots].map((id) => this.starById(id)).filter((x): x is StarSystem => !!x && !hexEquals(x.hex, here))
      .sort((a, b) => hexDistance(a.hex, here) - hexDistance(b.hex, here) || (a.id < b.id ? -1 : 1));
    const away = friendly[0] ?? this.deps.galaxy.nearestStar({ q: here.q + 4, r: here.r - 2 }, 10);
    if (!away) return;
    // Retreating ends the fight: the fleet is no longer aggressive.
    if (l.orders?.stance) this.deps.store.update((st) => ({ loadouts: { ...st.loadouts, [fleetId]: { ...l, orders: { ...l.orders, stance: undefined } } } }));
    this.moveFleet(fleetId, away, true);
    this.dispatch(`${f.name} breaks off and retreats to ${away.name}. An enemy with faster ships can still pursue it.`, 'bad');
  }

  // ── Diplomacy between players ─────────────────────────────────────

  protected otherEmpires(): readonly OtherEmpire[] {
    return this.deps.otherEmpires?.() ?? [];
  }

  protected relationWith(other: string): Relation {
    return relationOf(this.sharedWorld().relations, this.me, other);
  }

  /** At war with another player now (the declaration's notice has run out). */
  atWarWith = (other: string): boolean => atWar(this.sharedWorld().relations, this.me, other, Math.max(this.state.turn, this.now()));

  protected allies(): OtherEmpire[] {
    const rel = this.sharedWorld().relations;
    return this.otherEmpires().filter((e) => allied(rel, this.me, e.id));
  }

  /** Whether this empire has met another player (first contact): only then can they deal. */
  hasMet = (other: string): boolean => {
    const w = this.sharedWorld();
    return haveMet(w.contacts, w.relations, this.me, other);
  };

  /** Other players this empire has not met yet (the Relations tab counts them). */
  unmetEmpires = (): number => this.otherEmpires().filter((e) => e.id !== this.me && !this.hasMet(e.id)).length;

  /** Every player this empire has met, with the relation, any proposal and what you can do (the Relations tab). */
  diplomacyView = (): DiplomacyView[] => this.otherEmpires().filter((e) => e.id !== this.me && this.hasMet(e.id)).map((empire) => {
    const relation = this.relationWith(empire.id);
    return { empire, relation, atWar: this.atWarWith(empire.id), actions: actionsFor(relation, this.me) };
  });

  /** Take a diplomatic step toward another player: declare war, propose or answer peace and alliances. */
  diplomacy(other: string, action: DiplomaticAction): void {
    const empire = this.otherEmpires().find((e) => e.id === other);
    const time = Math.max(this.state.turn, this.now());
    if (empire && other !== this.me && !this.hasMet(other)) return this.dispatch(`We have not met ${empire.name.slice(0, 100)} yet: our fleets or worlds must come near theirs first`, 'bad');
    if (!empire || other === this.me || !applyDiplomacy(this.relationWith(other), this.me, action, time)) return this.dispatch('That is not possible with them now', 'bad');
    this.emit([{ kind: 'diplomacy', by: this.me, other, action, at: time }]);
    const them = empire.name.slice(0, 100);
    const text = action === 'declare-war' ? `War declared on ${them}: hostilities begin within a year`
      : action === 'propose-peace' ? `Peace proposed to ${them}`
      : action === 'propose-alliance' ? `Alliance proposed to ${them}`
      : action === 'accept' ? (this.relationWith(other).status === 'alliance' ? `Alliance with ${them}: their systems are friendly to our fleets` : `Peace with ${them}`)
      : action === 'decline' ? `Declined ${them}'s proposal`
      : action === 'withdraw' ? `Proposal to ${them} withdrawn`
      : `Alliance with ${them} broken`;
    this.dispatch(text, action === 'declare-war' || action === 'break-alliance' ? 'bad' : 'good');
    if (action !== 'decline' && action !== 'withdraw') this.deps.report?.('diplomacy', text);
  }

  /** Empires met for the first time, and what other players did toward this one, during the year now ending. */
  protected diplomaticNews(): string[] {
    const s = this.state;
    const { relations: rel, contacts } = this.sharedWorld();
    const out: string[] = [];
    for (const e of this.otherEmpires()) {
      const met = contacts?.[pairKey(this.me, e.id)];
      if (e.id !== this.me && met !== undefined && Math.floor(met) === s.turn) out.push(`First contact with ${e.name.slice(0, 100)}: we can now deal with them in Empire › Relations`);
      const r = relationOf(rel, this.me, e.id);
      if (r.by === e.id && r.at !== undefined && Math.floor(r.at) === s.turn) {
        const line = newsOf(r, e.name.slice(0, 100));
        if (line) out.push(line);
      }
    }
    return out;
  }

  // ── The empire governor (change empire-governor) ──

  /** Switch the governor on or change it: its focus, whether it builds and picks research, and its credit reserve. */
  setGovernor(focus: GovernorFocus, build: boolean, research: boolean, reserve: number): void {
    if (!(focus in FOCI)) return;
    this.deps.store.update({ governor: { focus, build, research, reserve: Math.max(0, Math.min(1_000_000, Math.round(reserve))) } });
  }

  /**
   * The governor's year: a research focus when none is set, and the best building for its focus on
   * every colony with a free slot and nothing under construction, while the credits last above the
   * reserve. Returns its news.
   */
  protected govern(): string[] {
    const g = this.state.governor;
    if (!g) return [];
    const news: string[] = [];
    if (g.research && !this.state.economy.focus) {
      const id = pickResearch(this.deps.tree, this.state.empire.research, g.focus);
      if (id) {
        this.setFocus(id);
        news.push(`Governor: research ${this.deps.tree.node(id).name} next`);
      }
    }
    if (!g.build) return news;
    return [...news, ...this.autoBuild(g.focus, g.reserve, 'Governor')];
  }

  /**
   * The best building for a focus on every colony with a free slot and nothing under construction,
   * while the credits last above `reserve` (the governor's, or a Steward's when delegated).
   */
  protected autoBuild(focus: GovernorFocus, reserve: number, who: string): string[] {
    const news: string[] = [];
    const caps = this.caps();
    const stock = this.state.empire.materials;
    const nearlyFull = RESOURCES.filter((r) => caps[r.id] !== undefined && stock[r.id] >= caps[r.id]! * 0.8).length;
    const foodIncome = this.state.lastReport?.income.food ?? FOOD_FLOOR;
    for (const c of this.state.economy.colonies) {
      if (!c.planetId || this.jobs(c.planetId).some((j) => j.kind === 'building')) continue;
      const have = c.buildings ?? [];
      if (have.length >= slotsOf(c.size ?? 3, c.capital)) continue;
      const site = { biomeYields: BIOME_YIELDS[c.biome] ?? {}, buildings: have, foodIncome, nearlyFull };
      const m = this.state.empire.materials;
      const pick = pickBuilding(BUILDINGS, focus, site, (b) => this.isBuildingUnlocked(b.id) && canAfford(m, b.cost) && m.credits - (b.cost.credits ?? 0) >= reserve);
      if (!pick) continue;
      this.build(c.planetId, pick.id, true);
      news.push(`${who}: ${pick.name} started on ${c.name}`);
    }
    return news;
  }

  // ── Missions and the court (change missions-and-court) ─────────────

  get missions(): MissionsState {
    return this.state.missions ?? NEW_MISSIONS;
  }

  get court(): CourtState {
    return this.state.court ?? NEW_COURT;
  }

  private surveyCache: { explored: GameState['explored'] | null; home: string; view: Pick<MissionView, 'surveyed' | 'surveyedOf' | 'surveyedDistances' | 'megaTypes'> } | null = null;

  /** What surveying has found, by type and distance (cached until the next survey). */
  private surveyView(): Pick<MissionView, 'surveyed' | 'surveyedOf' | 'surveyedDistances' | 'megaTypes'> {
    const s = this.state;
    const c = this.surveyCache;
    if (c && c.explored === s.explored && c.home === s.home.id) return c.view;
    const surveyedOf: Record<string, number> = {};
    const surveyedDistances: number[] = [];
    const mega = new Set<string>();
    const seed = this.deps.galaxy.params.seed;
    const byStar = new Map<string, Planet[]>();
    for (const id of Object.keys(s.explored)) {
      const starId = id.slice(0, id.lastIndexOf('/'));
      let planets = byStar.get(starId);
      if (!planets) {
        const star = this.starById(starId);
        planets = star ? planetsOf(star, seed) : [];
        byStar.set(starId, planets);
      }
      const p = planets.find((x) => x.id === id);
      if (!p) continue;
      surveyedOf[p.biome] = (surveyedOf[p.biome] ?? 0) + 1;
      if (isMegastructure(p.biome)) {
        surveyedOf.megastructure = (surveyedOf.megastructure ?? 0) + 1;
        mega.add(p.biome);
      }
      const star = this.starById(starId);
      if (star) surveyedDistances.push(hexDistance(star.hex, s.home.hex));
    }
    const view = { surveyed: Object.keys(s.explored).length, surveyedOf, surveyedDistances, megaTypes: [...mega] };
    this.surveyCache = { explored: s.explored, home: s.home.id, view };
    return view;
  }

  /** The empire as missions measure it. */
  missionView = (): MissionView => {
    const s = this.state;
    const buildings: Record<string, number> = {};
    for (const c of s.economy.colonies) for (const b of c.buildings ?? []) buildings[b] = (buildings[b] ?? 0) + 1;
    let miners = 0, warships = 0;
    for (const [id, n] of Object.entries(s.economy.roster)) {
      const c = this.classById.get(id);
      if (!c || !n) continue;
      if (c.mines) miners += n;
      if (c.role === 'combat' || c.role === 'capital') warships += n;
    }
    const standings: Record<string, number> = {};
    for (const n of this.knownNpcs()) standings[n.def.id] = this.standingWith(n.def.id);
    const stationed = this.groups().filter((g) => g.stationed && g.star && shipTotal(g.ships) > 0).map((g) => g.star!.id);
    return {
      turn: s.turn, ...this.surveyView(), colonies: s.economy.colonies.length, buildings, miners, warships,
      researched: s.empire.research.researched.length, stock: s.empire.materials, income: s.lastReport?.income ?? {},
      contacts: this.knownNpcs().length, standings, depots: s.depots.length, stationed, leaderLevel: this.court.leader.level,
    };
  };

  /** A mission by id: a story mission, an accepted quest or an offer. */
  missionDef = (id: string): MissionDef | QuestDef | null =>
    MISSION_BY_ID[id] ?? this.missions.active.find((a) => a.id === id)?.quest ?? this.missions.offers.find((o) => o.id === id) ?? null;

  /** A mission's progress, now. */
  missionProgress = (id: string): ReturnType<typeof progressOf> | null => {
    const def = this.missionDef(id);
    return def ? progressOf(def, this.missions.active.find((a) => a.id === id), this.missionView()) : null;
  };

  protected updateMissions(fn: (m: MissionsState) => MissionsState): void {
    this.deps.store.update((st) => ({ missions: fn(st.missions ?? NEW_MISSIONS) }));
  }

  protected updateCourt(fn: (c: CourtState) => CourtState): void {
    this.deps.store.update((st) => ({ court: fn(st.court ?? NEW_COURT) }));
    this.refreshBoons();
  }

  /** The ruler's name and title, for the court's boons and news. */
  rulerName = (): string => {
    const id = this.state.identity;
    return id ? `${id.title} ${id.ruler}`.trim() : this.state.playerName;
  };

  /** The economy counts the court's bonuses and the accords in force (EconomyState.boons). */
  protected refreshBoons(): void {
    const turn = this.state.turn;
    const boons = [
      ...courtBoons(this.court, this.rulerName()),
      ...this.missions.accords.filter((a) => a.until > turn).map((a) => ({ name: a.name, effects: a.effects, until: a.until })),
    ];
    this.deps.store.update((st) => ({ economy: { ...st.economy, boons } }));
  }

  /** Claim a finished mission: hand over what it asks, take its rewards. */
  claimMission(id: string): void {
    const active = this.missions.active.find((a) => a.id === id);
    const def = active && (active.quest ?? MISSION_BY_ID[id]);
    if (!active || !def) return;
    if (!progressOf(def, active, this.missionView()).complete) return this.dispatch(`${def.title} is not done yet`, 'bad');
    const before = this.state.empire.materials;
    let materials = { ...before };
    for (const o of def.objectives) if (o.kind === 'deliver' && o.resource) materials[o.resource] = Math.max(0, (materials[o.resource] ?? 0) - o.n);
    for (const [r, n] of Object.entries(def.rewards.materials ?? {})) materials = { ...materials, [r]: (materials[r as Resource] ?? 0) + (n ?? 0) };
    this.deps.store.update((st) => ({ empire: { ...st.empire, materials } }));
    this.noteFlow(before, `Mission: ${def.title}`);
    const quest = active.quest;
    this.updateMissions((m) => ({
      ...m,
      active: m.active.filter((a) => a.id !== id),
      done: quest ? m.done : [...m.done, id],
      questsDone: m.questsDone + (quest ? 1 : 0),
      record: [{ turn: this.state.turn, title: def.title, chapter: def.chapter }, ...m.record].slice(0, 40),
    }));
    const extra = this.rewardsOf(def, quest);
    this.dispatch(`${def.title} complete${def.epilogue ? `: ${def.epilogue}` : ''}${extra.length ? ` (${extra.join('; ')})` : ''}`, 'good');
    for (const n of this.unlockStory()) this.dispatch(n, 'good');
  }

  /** Everything but materials: experience, shards, a candidate, standing, an accord. Returns what was given. */
  protected rewardsOf(def: MissionDef, quest?: QuestDef): string[] {
    const r = def.rewards;
    const out: string[] = [];
    if (r.leaderXp) out.push(...this.leaderXp(r.leaderXp));
    if (r.advisorXp) {
      const seat: Seat | undefined = def.giver === 'faction' ? 'chancellor' : def.giver === 'council' ? undefined : def.giver;
      if (seat) out.push(...this.advisorXp(seat, r.advisorXp));
    }
    if (r.shards) {
      const node = this.state.economy.focus ?? pickResearch(this.deps.tree, this.state.empire.research, 'balanced');
      if (node) {
        this.grantShards(node, 'missions', r.shards);
        out.push(`${r.shards} shards toward ${this.deps.tree.node(node).name}`);
      }
    }
    if (r.candidate) {
      const c = drawCandidate(hashSeed(this.me, 'court'), r.candidate, this.court.drawn, quest ? quest.npcName : undefined);
      this.updateCourt((court) => withCandidate(court, c));
      out.push(`${c.name} offers to serve as ${SEAT_BY_ID[c.seat].name}`);
    }
    if (quest && r.standing) {
      this.changeStanding(quest.npc, r.standing);
      out.push(`standing with the ${quest.npcName} +${r.standing}`);
    }
    if (quest && r.accord) {
      const accord = { name: `Trade accord with the ${quest.npcName}`, effects: { tradePct: r.accord.tradePct }, until: this.state.turn + r.accord.years };
      this.updateMissions((m) => ({ ...m, accords: [...m.accords.filter((a) => a.name !== accord.name && a.until > this.state.turn), accord] }));
      this.refreshBoons();
      out.push(`+${r.accord.tradePct}% trade for ${r.accord.years} years`);
    }
    return out;
  }

  /** Experience for the ruler; news of levels gained and seats opened. */
  protected leaderXp(xp: number): string[] {
    const was = this.court.leader;
    const { next, gained } = addXp(was, xp, LEADER_MAX, true);
    this.updateCourt((c) => ({ ...c, leader: next }));
    if (!gained) return [];
    const seats = openSeats(next.level) > openSeats(was.level) ? `, and can keep ${openSeats(next.level)} advisors` : '';
    return [`${this.rulerName()} rises to level ${next.level}${seats}`];
  }

  /** Experience for the advisor in a seat, if there is one. */
  protected advisorXp(seat: Seat, xp: number): string[] {
    const a = this.court.seats[seat];
    if (!a) return [];
    const { next, gained } = addXp(a, xp, ADVISOR_MAX);
    this.updateCourt((c) => ({ ...c, seats: { ...c.seats, [seat]: next } }));
    return gained ? [`${SEAT_BY_ID[seat].name} ${a.name} rises to level ${next.level}`] : [];
  }

  /** Take up a faction's quest. */
  acceptQuest(id: string): void {
    const offer = this.missions.offers.find((o) => o.id === id);
    if (!offer) return;
    const turn = this.state.turn;
    const view = this.missionView();
    this.updateMissions((m) => ({
      ...m,
      offers: m.offers.filter((o) => o.id !== id),
      active: [...m.active, { id, started: turn, expires: turn + QUEST_YEARS, base: baseOf(offer, view), quest: offer }],
    }));
    this.dispatch(`Quest accepted: ${offer.title} (for the ${offer.npcName})`, 'good');
  }

  /** Turn a faction's offer down (no ill will; it may ask again another time). */
  declineQuest(id: string): void {
    if (!this.missions.offers.some((o) => o.id === id)) return;
    this.updateMissions((m) => ({ ...m, offers: m.offers.filter((o) => o.id !== id), declined: [...(m.declined ?? []), id].slice(-30) }));
  }

  /** Appoint a candidate to their seat. */
  appointAdvisor(candidateId: string): void {
    const r = appoint(this.court, candidateId);
    if ('error' in r) return this.dispatch(`Cannot appoint: ${r.error}`, 'bad');
    this.updateCourt(() => r.court);
    const c = Object.values(r.court.seats).find((a) => a?.id === candidateId);
    if (c) this.dispatch(`${c.name} is appointed ${SEAT_BY_ID[c.seat].name}`, 'good');
  }

  /** Send an advisor back to the candidates. */
  dismissAdvisor(seat: Seat): void {
    const a = this.court.seats[seat];
    if (!a) return;
    this.updateCourt((c) => {
      const seats = { ...c.seats };
      delete seats[seat];
      return { ...c, seats, candidates: [...c.candidates, { ...a, delegate: false }].slice(-MAX_CANDIDATES) };
    });
  }

  /** Let an advisor make their seat's decisions each year (or take them back). */
  delegate(seat: Seat, on: boolean): void {
    const a = this.court.seats[seat];
    if (!a) return;
    this.updateCourt((c) => ({ ...c, seats: { ...c.seats, [seat]: { ...a, delegate: on } } }));
  }

  /** Spend influence to find a candidate for a seat. */
  seekAdvisor(seat: Seat): void {
    const s = this.state;
    if ((s.empire.materials.influence ?? 0) < SEEK_COST) return this.dispatch(`Seeking an advisor needs ${SEEK_COST} influence`, 'bad');
    const before = s.empire.materials;
    this.deps.store.update({ empire: { ...s.empire, materials: { ...before, influence: before.influence - SEEK_COST } } });
    this.noteFlow(before, `Sought a ${SEAT_BY_ID[seat].name}`);
    const c = drawCandidate(hashSeed(this.me, 'court'), seat, this.court.drawn);
    this.updateCourt((court) => withCandidate(court, c));
    this.dispatch(`${c.name} answers your call: a candidate for ${SEAT_BY_ID[seat].name}`, 'good');
  }

  /**
   * The year for missions and the court: lapsed offers and quests go, story missions begin as
   * they are uncovered, factions make offers, finished missions are claimed, advisors grow and
   * the delegated ones decide. Returns the news.
   */
  protected missionYear(): string[] {
    const news: string[] = [];
    const turn = this.state.turn;
    // Lapsed offers and quests.
    const lapsed = this.missions.active.filter((a) => a.expires !== undefined && a.expires <= turn);
    for (const a of lapsed) news.push(`Quest lapsed: ${a.quest?.title ?? a.id}`);
    this.updateMissions((m) => ({ ...m, active: m.active.filter((a) => !lapsed.includes(a)), offers: m.offers.filter((o) => o.offerEnds > turn) }));
    // Anything finished is claimed (a hand-over only once it can be paid), and the story goes on.
    for (const a of [...this.missions.active]) {
      const def = a.quest ?? MISSION_BY_ID[a.id];
      if (def && progressOf(def, a, this.missionView()).complete) this.claimMission(a.id);
    }
    news.push(...this.unlockStory());
    // Faction offers.
    for (const { def } of this.knownNpcs()) {
      if (this.missions.offers.length >= MAX_OFFERS) break;
      const offer = questOffer({ id: def.id, name: def.name, archetype: def.archetype.id, tier: def.tier, standing: this.standingWith(def.id), home: { id: def.home.id, name: def.home.name } }, this.me, turn);
      if (!offer) continue;
      const m = this.missions;
      if (m.offers.some((o) => o.id === offer.id) || m.active.some((a) => a.id === offer.id) || m.declined?.includes(offer.id) || m.taken?.includes(offer.id)) continue;
      this.updateMissions((x) => ({ ...x, offers: [...x.offers, offer], taken: [...(x.taken ?? []), offer.id].slice(-60) }));
      news.push(`The ${def.name} ask a favour: ${offer.title}`);
    }
    // The advisors grow with the years, and the delegated ones decide.
    news.push(...this.advise());
    this.refreshBoons();
    return news;
  }

  /** Story missions whose time has come (their requirements done, their trigger met) begin. Returns the news. */
  protected unlockStory(): string[] {
    const turn = this.state.turn;
    const fresh = unlocked(MISSIONS, this.missions, this.missionView());
    if (!fresh.length) return [];
    this.updateMissions((m) => ({ ...m, active: [...m.active, ...fresh.map((d) => ({ id: d.id, started: turn }))] }));
    return fresh.map((d) => `New mission: ${d.title}${d.chapter > 1 && !d.requires?.length ? ' (uncovered by exploring)' : ''}`);
  }

  /** Each seated advisor gains a little; each delegated one acts in their seat. */
  protected advise(): string[] {
    const news: string[] = [];
    for (const seat of Object.keys(this.court.seats) as Seat[]) news.push(...this.advisorXp(seat, 4));
    const act = (seat: Seat, did: string[]): void => {
      if (!did.length) return;
      const a = this.court.seats[seat]!;
      news.push(...did.map((d) => `${SEAT_BY_ID[seat].name} ${a.name}: ${d}`), ...this.advisorXp(seat, 6));
    };
    const on = (seat: Seat) => this.court.seats[seat]?.delegate ? this.court.seats[seat] : undefined;
    const steward = on('steward');
    if (steward) {
      const trait = SEAT_BY_ID.steward.traits.find((t) => t.id === steward.trait);
      act('steward', this.autoBuild(trait?.focus ?? 'balanced', DEFAULT_RESERVE, '').map((x) => `started ${x.replace(/^: /, '').replace(' started on ', ' on ')}`));
    }
    if (on('science') && !this.state.economy.focus) {
      const id = pickResearch(this.deps.tree, this.state.empire.research, 'science');
      if (id) {
        this.setFocus(id);
        act('science', [`research ${this.deps.tree.node(id).name} next`]);
      }
    }
    if (on('chancellor')) {
      const did: string[] = [];
      // Take a quest whose hand-over is already in the vaults, one a year.
      const stock = this.state.empire.materials;
      const easy = this.missions.offers.find((o) => o.objectives.every((x) => x.kind !== 'deliver' || (stock[x.resource!] ?? 0) >= x.n * 1.5));
      if (easy) {
        this.acceptQuest(easy.id);
        did.push(`accepted ${easy.title}`);
      }
      // Tribute to a faction turning hostile, while credits allow (once every 20 years).
      const last = this.court.lastTribute ?? -Infinity;
      if (this.state.turn - last >= 20) {
        const sour = this.knownNpcs().find((n) => this.standingWith(n.def.id) < -10);
        const cost = STANDING.tributeCost;
        if (sour && stock.credits - cost.credits >= DEFAULT_RESERVE && stock.influence >= cost.influence) {
          this.sendTribute(sour.def.id);
          this.deps.store.update((st) => ({ court: { ...(st.court ?? NEW_COURT), lastTribute: this.state.turn } }));
          did.push(`sent tribute to the ${sour.def.name}`);
        }
      }
      act('chancellor', did);
    }
    if (on('admiral')) {
      const did: string[] = [];
      for (const g of this.groups()) {
        if (did.length >= 2) break;
        if (g.id === 'dock' || g.company || g.battle || !g.stationed || g.repair || (g.hull ?? 1) >= 0.6 || g.orders?.trade) continue;
        const here = g.star ? g.star.hex : null;
        if (!here) continue;
        const refuge = this.nearestFriendly(here);
        if (hexEquals(refuge.hex, here)) continue;
        this.moveFleet(g.id, refuge, true);
        did.push(`sent ${g.name} to ${refuge.name} for repairs`);
      }
      act('admiral', did);
    }
    const faith = this.state.economy.faith;
    if (on('prelate') && faith && faith.missions.length < 3) {
      const next = this.knownEmpires().find((e) => !faith.missions.includes(e.name));
      if (next) {
        this.toggleMission(next.name);
        act('prelate', [`sent missionaries to the ${next.name}`]);
      }
    }
    if (on('spymaster')) {
      const nets = this.state.economy.spyNetworks;
      if (nets.length < maxSpies(this.deps.economy, this.state.empire.research)) {
        const next = this.knownEmpires().find((e) => !nets.includes(e.name));
        if (next) {
          this.toggleSpy(next.name);
          act('spymaster', [`planted a spy network in the ${next.name}`]);
        }
      }
    }
    return news;
  }

  // ── Commerce: companies, exchanges, tariffs and shares (change commerce) ──

  get commerce(): CommerceState {
    return this.state.commerce ?? NO_COMMERCE;
  }

  protected updateCommerce(fn: (c: CommerceState) => CommerceState): void {
    this.deps.store.update((st) => ({ commerce: fn(st.commerce ?? NO_COMMERCE) }));
  }

  companyById = (id: string): Company | undefined => this.commerce.companies.find((c) => c.id === id);

  /** True, and says so, when a fleet is a company's: the state gives it no orders. */
  protected runByCompany(fleetId: string): boolean {
    if (!this.state.loadouts[fleetId]?.company) return false;
    this.notYours(fleetId);
    return true;
  }

  protected notYours(fleetId: string): void {
    const c = this.companyById(this.state.loadouts[fleetId]?.company ?? '');
    this.dispatch(`${this.fleetName(fleetId)} is run by ${c?.name ?? 'a company'}: it takes no orders from the state`, 'bad');
  }

  /** The empire's name as other empires know it. */
  protected empireName = (): string => this.state.identity?.name ?? this.state.playerName;

  /** Book what a company earned and spent this year (settled at the start of the next). */
  protected bookCompany(id: string, revenue: number, costs: number): void {
    if (!revenue && !costs) return;
    this.updateCommerce((c) => ({ ...c, companies: c.companies.map((x) => (x.id === id ? { ...x, revenue: x.revenue + revenue, costs: x.costs + costs } : x)) }));
  }

  /** A company's ships (none when its fleet is gone). */
  companyShips = (c: Company): Squadron[] => [...(this.state.loadouts[c.fleetId]?.ships ?? [])];

  protected costOf = (classId: string) => this.classById.get(classId)?.cost;

  /** A share of one of your companies: its assets and record. */
  sharePriceOf = (c: Company): number => sharePrice(c, fleetValue(this.companyShips(c), this.costOf));

  /** Shares other players hold in one of your companies (kept in the shared world). */
  protected outsideShares(companyId: string, owner = this.me): number {
    return Object.values(this.sharedWorld().stakes?.[stakeKey(owner, companyId)] ?? {}).reduce((a, b) => a + b, 0);
  }

  /**
   * A chartered ship is launched: it founds a company that owns it as its own fleet, in the yard's
   * system. The state keeps most of the shares and sells the rest, for that share of the ship's value.
   */
  protected charterCompany(classId: string, yard: Colony): Company | null {
    const c = this.classById.get(classId);
    const kind = companyKindOf(c);
    if (!c || !kind) return null;
    const s = this.state;
    const star = (yard.starId ? this.starById(yard.starId) : null) ?? s.home;
    const n = (this.commerce.chartered ?? 0) + 1;
    const name = companyName(kind, star.name, hashSeed(this.me, n), this.commerce.companies.map((x) => x.name));
    const company = charter(`co-${n}`, name, kind, `company-${n}-t${s.turn}`, s.turn);
    // A colony company's first ark takes its colonists from the yard's world, if it can spare them.
    const colonists = kind === 'colony' && yard.planetId && this.spare(yard) > 0 ? 1 : 0;
    if (colonists) this.movePeople(yard.planetId!, -1);
    const ipo = Math.round((shipValue(c.cost) * (company.shares - company.held)) / company.shares);
    const before = this.state.empire.materials;
    this.deps.store.update((st) => ({
      empire: { ...st.empire, materials: { ...st.empire.materials, credits: st.empire.materials.credits + ipo } },
      commerce: { ...(st.commerce ?? NO_COMMERCE), chartered: n, companies: [...(st.commerce ?? NO_COMMERCE).companies, company] },
    }));
    this.companyFleet(company, classId, star, colonists);
    this.noteFlow(before, `${name}: ${company.shares - company.held} shares floated`);
    return company;
  }

  /** A new fleet for a company, with one ship, at a star. */
  protected companyFleet(company: Company, classId: string, star: StarSystem, colonists = 0): void {
    const s = this.state;
    const ships = [{ classId, count: 1 }];
    const fleet = { id: company.fleetId, name: company.name, owner: s.playerName, color: this.empireColor(), movement: planMovement(star.hex, star.hex, s.turn, 1), design: this.designOf(ships) };
    const orders: FleetOrders | undefined = company.kind === 'mining' ? { autoMine: true } : undefined;
    this.deps.store.update((st) => ({
      fleets: [...st.fleets.filter((f) => f.id !== fleet.id), fleet],
      loadouts: { ...st.loadouts, [fleet.id]: { ships, ...fullStores(ships, specOf), ...(orders ? { orders } : {}), company: company.id, ...(company.kind === 'colony' ? { colonists } : {}) } },
    }));
  }

  /** A company's year at work: trading, mining or settling. Returns its news, if any. */
  protected runCompanyFleet(fleetId: string): string | null {
    const l = this.state.loadouts[fleetId];
    const company = l?.company ? this.companyById(l.company) : undefined;
    if (!l || !company) return null;
    if (company.kind === 'trade') return this.companyTrade(fleetId);
    if (company.kind === 'mining') return this.mineOn(fleetId);
    return this.companyColonize(fleetId, company);
  }

  /** A trading company takes the best route it knows whenever it is empty at the loading end. */
  protected companyTrade(fleetId: string): string | null {
    const l = this.state.loadouts[fleetId];
    const at = this.stationedAt(fleetId);
    if (!at) return null;
    const route = l.orders?.trade;
    if (!route || (!l.cargo && at.id === route.from) || !this.starById(route.to) || !this.marketAt(this.starById(route.to)!)) {
      const best = this.bestTradeRoute(fleetId, at);
      if (!best) return null;
      if (best.from !== route?.from || best.to !== route?.to) {
        this.deps.store.update((st) => ({ loadouts: { ...st.loadouts, [fleetId]: { ...st.loadouts[fleetId], orders: { ...st.loadouts[fleetId].orders, trade: best } } } }));
      }
    }
    return this.runTrade(fleetId);
  }

  /**
   * The route that pays a fleet's freighters most a year: load at your colony nearest a market and
   * sell there, less what the goods cost a company, over the years of the round trip.
   */
  bestTradeRoute(fleetId: string, at: StarSystem): { from: string; to: string } | null {
    const l = this.state.loadouts[fleetId];
    const cap = l ? this.cargoCapacity(l.ships) : 0;
    if (!cap) return null;
    const speed = this.fleetSpeed();
    const cost = cap * (BASE_PRICE.goods ?? 4) * COMMERCE.goodsShare;
    const colonies = [...this.colonyStars()].map((id) => this.starById(id)).filter((x): x is StarSystem => !!x);
    let best: { from: string; to: string } | null = null, rate = 0;
    for (const m of this.markets()) {
      const to = this.starById(m.starId);
      if (!to) continue;
      const from = colonies.filter((c) => c.id !== to.id).sort((a, b) => hexDistance(a.hex, to.hex) - hexDistance(b.hex, to.hex) || (a.id < b.id ? -1 : 1))[0];
      if (!from) continue;
      const years = travelTurns(hexDistance(at.hex, from.hex), speed) + 2 * travelTurns(hexDistance(from.hex, to.hex), speed) + 2;
      const r = (this.saleValue(cap, from, m) - cost) / years;
      if (r > rate) { rate = r; best = { from: from.id, to: to.id }; }
    }
    return best;
  }

  /** Whether a company may settle a planet: surveyed, settleable, free, outside other empires' space. */
  protected canSettleFor(planet: Planet, fleetId: string): boolean {
    if (this.cannotSettle(planet) || this.colonyAt(planet.id)) return false;
    const star = this.starOfPlanet(planet);
    if (!star) return false;
    // Someone else's space (another player's or an NPC's), unless it is also yours.
    const yours = this.colonyStars().has(star.id) || this.playerClaim().colonies.some((c) => hexDistance(c.hex, star.hex) <= c.radius);
    if (!yours && this.describe(star).owner) return false;
    // Another of your companies is already taking colonists there.
    return !Object.entries(this.state.loadouts).some(([id, l]) => id !== fleetId && l.orders?.settle === planet.id);
  }

  /** What a world is worth to settle: its yields at base prices, bigger worlds more. */
  protected worldValue(planet: Planet): number {
    let v = 0;
    for (const [r, n] of Object.entries(BIOME_YIELDS[planet.biome] ?? {})) v += (n ?? 0) * (r === 'credits' ? 1 : BASE_PRICE[r as Resource] ?? 2);
    return v * (0.6 + 0.2 * planet.size);
  }

  /** The best world for a colony company to settle within reach of a hex. */
  protected bestSettlement(from: Hex, fleetId: string): Planet | null {
    let best: Planet | null = null, score = 0;
    for (const id of Object.keys(this.state.explored)) {
      const p = this.planetById(id);
      const star = p ? this.starOfPlanet(p) : null;
      if (!p || !star) continue;
      const d = hexDistance(from, star.hex);
      if (d > COMMERCE.colonyReach) continue;
      const value = this.worldValue(p);
      if (value <= 0) continue;
      const sc = value / (1 + d / 10);
      if (sc > score && this.canSettleFor(p, fleetId)) { score = sc; best = p; }
    }
    return best;
  }

  /**
   * A colony company's year: load colonists where it can, settle the world it is bound for when it
   * is there, pick the next one, or head back for colonists and supply.
   */
  protected companyColonize(fleetId: string, company: Company): string | null {
    const at = this.stationedAt(fleetId);
    if (!at) return null;
    let l = this.state.loadouts[fleetId];
    if ((l.colonists ?? 0) < countOf(l.ships, ARK) && this.colonyStars().has(at.id)) {
      this.embark(fleetId, true);
      l = this.state.loadouts[fleetId];
    }
    const loaded = l.colonists ?? 0;
    if (loaded > 0 && l.supply >= ARK_SUPPLY) {
      const bound = l.orders?.settle ? this.planetById(l.orders.settle) : null;
      const target = bound && this.canSettleFor(bound, fleetId) ? bound : this.bestSettlement(at.hex, fleetId);
      if (!target) {
        if (bound) this.setSettleTarget(fleetId, undefined);
        return null;
      }
      const star = this.starOfPlanet(target)!;
      if (star.id === at.id) return this.companySettle(fleetId, company, target, star);
      if (target.id !== bound?.id) {
        this.setSettleTarget(fleetId, target.id);
        this.steer(fleetId, star);
        return `${company.name} sets out to settle ${target.name}`;
      }
      return null;
    }
    // Out of colonists: the nearest system with a colony that can spare people; out of supply: the nearest friendly one.
    const to = loaded === 0 ? this.nearestPeopled(at.hex) : this.isFriendly(at) ? null : this.nearestFriendly(at.hex);
    if (to && to.id !== at.id) {
      this.steer(fleetId, to);
      return loaded === 0 ? `${company.name} heads to ${to.name} for colonists` : null;
    }
    return null;
  }

  protected setSettleTarget(fleetId: string, planetId: string | undefined): void {
    this.deps.store.update((st) => ({ loadouts: { ...st.loadouts, [fleetId]: { ...st.loadouts[fleetId], orders: { ...st.loadouts[fleetId].orders, settle: planetId } } } }));
  }

  /** A colony company settles a world: its ark spends its colonists and supply, and the state pays the fee. */
  protected companySettle(fleetId: string, company: Company, planet: Planet, star: StarSystem): string {
    const l = this.state.loadouts[fleetId];
    this.deps.store.update((st) => ({ loadouts: { ...st.loadouts, [fleetId]: { ...l, colonists: (l.colonists ?? 0) - 1, supply: l.supply - ARK_SUPPLY, orders: { ...l.orders, settle: undefined } } } }));
    this.foundColony(planet, star, company.name);
    const before = this.state.empire.materials;
    const fee = Math.max(0, Math.min(COMMERCE.settleFee, Math.floor(before.credits)));
    if (fee) {
      this.deps.store.update((st) => ({ empire: { ...st.empire, materials: { ...st.empire.materials, credits: st.empire.materials.credits - fee } } }));
      this.noteFlow(before, `Settlement fee: ${company.name}`);
      this.bookCompany(company.id, fee, 0);
    }
    return `${company.name} settled ${planet.name}${fee ? ` for a fee of ${fee} credits` : ''}`;
  }

  /** The nearest system with a colony of yours that can spare colonists (at or above its colonist floor). */
  protected nearestPeopled(from: Hex): StarSystem | null {
    const stars = [...new Set(this.state.economy.colonies.filter((c) => this.spare(c) > 0 && c.starId).map((c) => c.starId!))]
      .map((id) => this.starById(id)).filter((x): x is StarSystem => !!x);
    return stars.sort((a, b) => hexDistance(from, a.hex) - hexDistance(from, b.hex) || (a.id < b.id ? -1 : 1))[0] ?? null;
  }

  /** Every company's accounts for the year, settled from what it earned and spent (no change made). */
  protected companyYears(): Array<{ readonly year: CompanyYear; readonly state: number }> {
    return this.commerce.companies.map((c) => {
      const upkeep = this.companyShips(c).reduce((n, x) => n + x.count * (this.deps.economy.upkeepOf?.(this.classById.get(x.classId)!) ?? 1), 0);
      const year = companyYear(c, upkeep);
      return { year, state: Math.round(year.perShare * c.held) };
    });
  }

  /**
   * The year's income from outside the colonies (the economy's transfers): your companies' tax and
   * the state's dividends, NPC corporations' dividends, and what other empires owe you.
   */
  protected transfers(years = this.companyYears()): Transfer[] {
    const out: Transfer[] = [];
    for (const { year, state } of years) {
      if (year.tax) out.push({ r: 'credits', n: year.tax, group: 'Companies', label: `Tax: ${year.company.name}` });
      if (state) out.push({ r: 'credits', n: state, group: 'Companies', label: `Dividends: ${year.company.name}` });
    }
    for (const [key, n] of Object.entries(this.commerce.portfolio ?? {})) {
      const corp = key.startsWith('npc:') ? this.corporation(key.slice(4)) : null;
      const d = corp ? Math.round(corp.dividend * n) : 0;
      if (d) out.push({ r: 'credits', n: d, group: 'Investments', label: `Dividends: ${corp!.name}` });
    }
    for (const [label, n] of Object.entries(this.sharedWorld().payouts?.[this.me] ?? {})) {
      // Whole credits; a fraction stays owed until it adds up.
      const credits = Math.floor(n);
      if (credits > 0) out.push({ r: 'credits', n: credits, group: OWED, label });
    }
    return out;
  }

  /**
   * After the year's economy: what was owed is collected, companies' books are closed (with this
   * year's ore contracts carried into the next), other players get their dividends, and companies
   * grow, or are wound up when they have lost their fleet.
   */
  protected settleCommerce(years: ReadonlyArray<{ readonly year: CompanyYear }>, transfers: readonly Transfer[], contracts: Readonly<Record<string, number>>): string[] {
    const effects: SharedEffect[] = [];
    const claimed = Object.fromEntries(transfers.filter((t) => t.group === OWED).map((t) => [t.label, t.n]));
    if (Object.keys(claimed).length) effects.push({ kind: 'claim', player: this.me, amounts: claimed });
    const stakes = this.sharedWorld().stakes ?? {};
    const news: string[] = [];
    const companies: Company[] = [];
    for (const { year } of years) {
      let c: Company = { ...year.company, revenue: year.company.revenue + (contracts[year.company.id] ?? 0) };
      for (const [holder, n] of Object.entries(stakes[stakeKey(this.me, c.id)] ?? {})) {
        const credits = Math.round(year.perShare * n * 100) / 100;
        if (credits > 0 && holder !== this.me) effects.push({ kind: 'payout', to: holder, label: `Dividends: ${c.name} (${this.empireName()})`, credits });
      }
      const ships = this.companyShips(c);
      const classId = [...ships].sort((a, b) => b.count - a.count)[0]?.classId ?? COMPANY_SHIP[c.kind];
      const cls = this.classById.get(classId)!;
      const price = shipValue(cls.cost);
      if (wantsShip(c, shipTotal(ships), price, this.state.turn) && this.hasWorkFor(c, ships, contracts[c.id] ?? 0)) {
        c = { ...c, treasury: c.treasury - price, grown: this.state.turn };
        if (ships.length) this.adjustGroup(c.fleetId, [{ classId, count: 1 }]);
        else this.companyFleet(c, classId, this.state.home);
        news.push(`${c.name} bought a ${cls.name}: its fleet is ${shipTotal(ships) + 1} strong`);
      } else if (!ships.length) {
        news.push(`${c.name} has lost its fleet and cannot buy another: it is wound up`);
        continue;
      }
      companies.push(c);
    }
    this.emit(effects);
    this.updateCommerce((cm) => ({ ...cm, companies, pressure: fadePressure(cm.pressure) }));
    return news;
  }

  /**
   * Whether a company has work for another ship: a trading company only when trade goods are piling
   * up beyond what it carries, a mining company only when every ship it has was mining last year.
   */
  protected hasWorkFor(c: Company, ships: readonly Squadron[], contracted: number): boolean {
    if (c.kind === 'trade') {
      // Goods the colonies make in a round trip must fill one more freighter's hold.
      const run = this.state.loadouts[c.fleetId]?.orders?.trade;
      const from = run && this.starById(run.from), to = run && this.starById(run.to);
      if (!from || !to) return false;
      const trip = 2 * travelTurns(hexDistance(from.hex, to.hex), this.fleetSpeed()) + 2;
      const made = Math.max(0, this.state.lastReport?.income.goods ?? 0);
      return made * trip >= this.cargoCapacity([...ships, { classId: FREIGHTER, count: 1 }]);
    }
    if (c.kind === 'mining') {
      const full = ships.reduce((n, x) => n + x.count * this.minePerYear(x.classId) * contractPrice(this.classById.get(x.classId)?.mines ?? 'metals'), 0);
      return contracted >= full * 0.75;
    }
    return true;
  }

  /** What a company's fleet is doing, in a few words (the Companies tab). */
  companyStatus = (c: Company): string => {
    const s = this.state;
    const l = s.loadouts[c.fleetId];
    const f = s.fleets.find((x) => x.id === c.fleetId);
    if (!l || !f) return 'Has no fleet: it buys a ship when it can';
    const at = this.stationedAt(c.fleetId);
    const dest = this.deps.galaxy.starAt(f.movement.route[f.movement.route.length - 1]);
    if (c.kind === 'trade') {
      const run = l.orders?.trade;
      const from = run && this.starById(run.from), to = run && this.starById(run.to);
      if (!run || !from || !to) return 'Looking for a market';
      if (at?.id === from.id && !l.cargo) return `Waiting at ${from.name} for trade goods`;
      return l.cargo ? `Carrying ${fmtInt(l.cargo)} goods from ${from.name} to ${to.name}` : `Heading back to ${from.name} for goods`;
    }
    if (c.kind === 'mining') return at ? (stockFor(this.fieldReport(at), minedBy(l.ships, (id) => this.classById.get(id)?.mines)) > 0 ? `Mining at ${at.name}` : 'No field with rock left in reach') : `Heading to ${dest?.name ?? 'a field'} to mine`;
    const bound = l.orders?.settle ? this.planetById(l.orders.settle) : null;
    if (bound) return `Taking colonists to ${bound.name}`;
    if (!(l.colonists ?? 0)) return at ? `Waiting at ${at.name} for colonists: no colony there is at its colonist floor` : `Heading to ${dest?.name ?? 'a colony'} for colonists`;
    if (l.supply < ARK_SUPPLY) return 'Resupplying';
    return `No surveyed world to settle within ${COMMERCE.colonyReach} ly: survey more systems nearby`;
  };

  // ── Exchanges ──

  /** The exchanges you can trade on: every NPC faction you know and every player you have met. */
  exchanges = (): ExchangeInfo[] => {
    const out: ExchangeInfo[] = [];
    for (const { def } of this.knownNpcs()) {
      const makes = Object.entries(BIOME_YIELDS[def.archetype.biome] ?? {}).filter(([, n]) => (n ?? 0) > 0).map(([r]) => r as Resource);
      out.push({ id: `npc:${def.id}`, name: def.name, kind: 'npc', owner: def.id, color: def.color, tariff: npcTariff(def.archetype.id, this.standingWith(def.id)), makes, home: def.home });
    }
    for (const e of this.otherEmpires()) {
      if (e.id === this.me || !this.hasMet(e.id)) continue;
      const home = e.home ? this.deps.galaxy.starAt(e.home) : null;
      out.push({ id: `player:${e.id}`, name: e.name, kind: 'player', owner: e.id, color: e.color, tariff: this.playerTariff(e.id), ...(home ? { home } : {}) });
    }
    return out;
  };

  /** The tariff another player charges you (their default before they published one). */
  protected playerTariff(player: string): number {
    const e = this.otherEmpires().find((x) => x.id === player);
    return e?.commerce ? tariffFor(e.commerce, this.me) : NO_COMMERCE.tariff;
  }

  /** What a unit costs to buy, or pays to sell, on an exchange now (with your pressure there). */
  exchangePrice = (exchangeId: string, r: Resource, side: 'buy' | 'sell'): number => {
    const ex = this.exchanges().find((x) => x.id === exchangeId);
    return ex ? unitPrice(ex, r, this.state.turn, side, this.commerce.pressure?.[exchangeId]?.[r] ?? 0) : 0;
  };

  /** What a trade would come to, without making it. */
  exchangeQuote = (exchangeId: string, r: Resource, side: 'buy' | 'sell', amount: number): number => {
    const ex = this.exchanges().find((x) => x.id === exchangeId);
    return ex && amount > 0 ? exchangeTrade(ex, r, this.state.turn, side, amount, this.commerce.pressure?.[exchangeId]?.[r] ?? 0).credits : 0;
  };

  buyResource(exchangeId: string, r: Resource, amount: number): void {
    this.tradeOnExchange(exchangeId, r, 'buy', amount);
  }

  sellResource(exchangeId: string, r: Resource, amount: number): void {
    this.tradeOnExchange(exchangeId, r, 'sell', amount);
  }

  protected tradeOnExchange(exchangeId: string, r: Resource, side: 'buy' | 'sell', want: number): void {
    const s = this.state;
    const ex = this.exchanges().find((x) => x.id === exchangeId);
    if (!ex) return this.dispatch('You can only trade on the exchanges of empires you have met', 'bad');
    if (!EXCHANGE_RESOURCES.includes(r)) return;
    const stock = s.empire.materials[r] ?? 0;
    const cap = this.caps()[r];
    let amount = Math.max(0, Math.min(COMMERCE.maxTrade, Math.floor(want)));
    amount = side === 'sell' ? Math.min(amount, Math.floor(stock)) : cap !== undefined ? Math.min(amount, Math.max(0, Math.floor(cap - stock))) : amount;
    const name = RESOURCES.find((x) => x.id === r)!.name.toLowerCase();
    if (!amount) return this.dispatch(side === 'sell' ? `No ${name} to sell` : `No room to store more ${name}: build Warehouses`, 'bad');
    const pressure = this.commerce.pressure?.[exchangeId]?.[r] ?? 0;
    const t = exchangeTrade(ex, r, s.turn, side, amount, pressure);
    if (side === 'buy' && t.credits > s.empire.materials.credits) return this.dispatch(`${amount} ${name} costs ${fmtInt(t.credits)} credits on the ${ex.name} exchange`, 'bad');
    const before = s.empire.materials;
    const materials = { ...before, [r]: stock + (side === 'buy' ? amount : -amount), credits: before.credits + (side === 'buy' ? -t.credits : t.credits) };
    this.deps.store.update((st) => ({
      empire: { ...st.empire, materials },
      commerce: { ...(st.commerce ?? NO_COMMERCE), pressure: { ...st.commerce?.pressure, [exchangeId]: { ...st.commerce?.pressure?.[exchangeId], [r]: t.pressure } } },
    }));
    this.noteFlow(before, `${side === 'buy' ? 'Bought' : 'Sold'} ${amount} ${name} on the ${ex.name} exchange`);
    if (ex.kind === 'player' && t.tariff > 0) this.emit([{ kind: 'payout', to: ex.owner, label: `Tariffs from ${this.empireName()}`, credits: t.tariff }]);
    this.dispatch(`${side === 'buy' ? 'Bought' : 'Sold'} ${amount} ${name} on the ${ex.name} exchange for ${fmtInt(t.credits)} credits`);
  }

  /**
   * Freighters against the exchange, for trade goods: what an exchange pays a unit now, and what a
   * freighter run from your colony nearest that empire's nearest world would (with the years one way).
   */
  shippingQuote = (exchangeId: string): { exchange: number; freighter: number; years: number; from: string; to: string } | null => {
    const ex = this.exchanges().find((x) => x.id === exchangeId);
    if (!ex) return null;
    const theirs = this.markets().filter((m) => (ex.kind === 'npc' ? m.npc === ex.owner : m.player === ex.owner));
    const colonies = [...this.colonyStars()].map((id) => this.starById(id)).filter((x): x is StarSystem => !!x);
    let best: { exchange: number; freighter: number; years: number; from: string; to: string } | null = null;
    for (const m of theirs) {
      const to = this.starById(m.starId);
      if (!to) continue;
      const from = colonies.sort((a, b) => hexDistance(a.hex, to.hex) - hexDistance(b.hex, to.hex))[0];
      if (!from) continue;
      const years = travelTurns(hexDistance(from.hex, to.hex), this.fleetSpeed());
      const freighter = this.saleValue(100, from, m) / 100;
      if (!best || years < best.years) best = { exchange: this.exchangePrice(exchangeId, 'goods', 'sell'), freighter, years, from: from.name, to: m.name };
    }
    return best;
  };

  // ── Tariffs ──

  /** Set the tariff other players pay you: everyone's (no player), or one player's. */
  setTariff(rate: number, player: string | null): void {
    const t = cleanTariff(rate);
    this.updateCommerce((c) => {
      if (!player) return { ...c, tariff: t };
      const tariffs = { ...c.tariffs };
      if (t === c.tariff) delete tariffs[player];
      else tariffs[player] = t;
      return { ...c, tariffs };
    });
  }

  // ── Shares ──

  /** An NPC corporation by id, if you know its faction. */
  protected corporation(id: string): Corporation | null {
    const npc = this.knownNpcs().find((n) => n.def.id === corpNpc(id));
    return npc ? corporationsOf(npc.def).find((c) => c.id === id) ?? null : null;
  }

  /** Every share you can trade: your companies, those of players you have met, and known factions' corporations. */
  stocks = (): StockView[] => {
    const year = this.state.turn, mine = this.commerce;
    const out: StockView[] = mine.companies.map((c) => ({
      key: `own:${c.id}`, kind: 'own', name: c.name, owner: this.empireName(), sector: c.kind, price: this.sharePriceOf(c), dividend: c.dividend, status: this.companyStatus(c),
      held: c.held, float: floatOf(c, this.outsideShares(c.id)), shares: c.shares, ships: shipTotal(this.companyShips(c)), treasury: c.treasury, profit: c.profits[c.profits.length - 1] ?? 0, fleetId: c.fleetId,
    }));
    for (const e of this.otherEmpires()) {
      if (e.id === this.me || !this.hasMet(e.id)) continue;
      for (const c of e.commerce?.companies ?? []) {
        const key = playerCompanyKey(e.id, c.id);
        out.push({ key, kind: 'player', name: c.name, owner: e.name, sector: c.kind, price: c.price, dividend: c.dividend, held: mine.portfolio?.[key] ?? 0, float: floatOf(c, this.outsideShares(c.id, e.id)), shares: c.shares, ships: c.ships });
      }
    }
    for (const { def } of this.knownNpcs()) {
      for (const c of corporationsOf(def)) {
        const key = corpKey(c.id);
        const held = mine.portfolio?.[key] ?? 0;
        out.push({ key, kind: 'npc', name: c.name, owner: def.name, sector: c.blurb, price: corpPrice(c, year), dividend: c.dividend, held, float: COMMERCE.maxCorpShares - held, history: Array.from({ length: 24 }, (_, i) => corpPrice(c, year - (23 - i) * 10)) });
      }
    }
    // Shares still held in companies no longer listed (wound up, or their empire gone quiet).
    for (const [key, n] of Object.entries(mine.portfolio ?? {})) {
      if (n > 0 && !out.some((x) => x.key === key)) out.push({ key, kind: key.startsWith('npc:') ? 'npc' : 'player', name: 'Delisted company', owner: '—', sector: 'No longer trades', price: 0, dividend: 0, held: n, float: 0, delisted: true });
    }
    return out;
  };

  buyShares(key: string, want: number): void {
    this.tradeShares(key, Math.max(0, Math.min(MAX_SHARE_TRADE, Math.floor(want))), 'buy');
  }

  sellShares(key: string, want: number): void {
    this.tradeShares(key, Math.max(0, Math.min(MAX_SHARE_TRADE, Math.floor(want))), 'sell');
  }

  protected tradeShares(key: string, want: number, side: 'buy' | 'sell'): void {
    const stock = this.stocks().find((x) => x.key === key);
    if (!stock || !want) return;
    const n = side === 'buy' ? Math.min(want, stock.float) : Math.min(want, stock.held);
    if (!n) return this.dispatch(side === 'buy' ? `No ${stock.name} shares are for sale` : `You hold no ${stock.name} shares`, 'bad');
    const credits = side === 'buy' ? Math.ceil(stock.price * n * (1 + COMMERCE.shareFee)) : Math.floor(stock.price * n * (1 - COMMERCE.shareFee));
    const before = this.state.empire.materials;
    if (side === 'buy' && credits > before.credits) return this.dispatch(`${n} ${stock.name} shares cost ${fmtInt(credits)} credits`, 'bad');
    const delta = side === 'buy' ? n : -n;
    this.deps.store.update((st) => {
      const c = st.commerce ?? NO_COMMERCE;
      const portfolio = { ...c.portfolio };
      if (stock.kind !== 'own') {
        const left = (portfolio[key] ?? 0) + delta;
        if (left > 0) portfolio[key] = left;
        else delete portfolio[key];
      }
      const companies = stock.kind === 'own' ? c.companies.map((x) => (`own:${x.id}` === key ? { ...x, held: x.held + delta } : x)) : c.companies;
      return {
        empire: { ...st.empire, materials: { ...st.empire.materials, credits: st.empire.materials.credits + (side === 'buy' ? -credits : credits) } },
        commerce: { ...c, companies, portfolio },
      };
    });
    // Another player's company: the shared world records who holds it, so its dividends reach you.
    if (key.startsWith('player:')) {
      const [, owner, id] = key.split(':');
      this.emit([{ kind: 'stake', company: stakeKey(owner, id), player: this.me, delta }]);
    }
    this.noteFlow(before, `${side === 'buy' ? 'Bought' : 'Sold'} ${n} ${stock.name} shares`);
    this.dispatch(`${side === 'buy' ? 'Bought' : 'Sold'} ${n} ${stock.name} shares for ${fmtInt(credits)} credits`);
  }

  /** What other empires see of your commerce: tariffs and companies. */
  publicCommerce = (): PublicCommerce => publicCommerceOf(this.commerce, this.state.loadouts, this.costOf);

  // ── NPC empires ────────────────────────────────────────────────────

  /** Who this empire is in the shared world. */
  protected get me(): string {
    return this.deps.playerId ?? 'local';
  }

  /** NPC empires this empire has met, with who they are and what they hold now. */
  knownNpcs = (): Array<{ def: NpcDef; state: NpcState }> => {
    const out: Array<{ def: NpcDef; state: NpcState }> = [];
    for (const state of Object.values(this.sharedWorld().npcs)) {
      if (!state.knownBy.includes(this.me)) continue;
      const def = npcById(this.deps.galaxy, state.id);
      if (def) out.push({ def, state });
    }
    return out.sort((a, b) => a.def.id.localeCompare(b.def.id));
  };

  /** Known empires to send missionaries and spies to, with the technology spies can steal. */
  knownEmpires = (): Array<{ name: string; tech: readonly string[] }> => this.knownNpcs().map((n) => ({ name: n.def.name, tech: n.def.archetype.tech }));

  factions = (): FactionView[] => this.knownNpcs().map(({ def, state }) => ({
    id: def.id, name: def.name, color: def.color, blurb: def.archetype.blurb, tier: def.tier, home: def.home,
    worlds: state.colonies.filter((c) => !c.capturedBy).length, fleets: state.fleets.length,
    standing: this.standingWith(def.id), disposition: def.archetype.disposition,
  }));

  /** Your standing with an NPC faction (its disposition before anything happened). */
  standingWith = (npcId: string): number => {
    const npc = this.sharedWorld().npcs[npcId];
    const def = npcById(this.deps.galaxy, npcId);
    return npc && def ? standingOf(npc, this.me, def.archetype.disposition) : def?.archetype.disposition ?? 0;
  };

  protected changeStanding(npcId: string, delta: number): void {
    const def = npcById(this.deps.galaxy, npcId);
    if (def && delta) this.emit([{ kind: 'standing', npc: npcId, player: this.me, delta, base: def.archetype.disposition }]);
  }

  /** Pay a known faction tribute: credits and influence for better standing. */
  sendTribute(npcId: string): void {
    const s = this.state;
    const known = this.knownNpcs().find((n) => n.def.id === npcId);
    if (!known) return;
    if (!canAfford(s.empire.materials, STANDING.tributeCost)) return this.dispatch(`Tribute to the ${known.def.name} needs ${STANDING.tributeCost.credits} credits and ${STANDING.tributeCost.influence} influence`, 'bad');
    this.deps.store.update({ empire: { ...s.empire, materials: pay(s.empire.materials, STANDING.tributeCost) } });
    this.noteFlow(s.empire.materials, `Tribute to the ${known.def.name}`);
    this.changeStanding(npcId, STANDING.tribute);
    this.dispatch(`Tribute sent to the ${known.def.name}: standing now ${this.standingWith(npcId)} (${tierOf(this.standingWith(npcId)).name})`, 'good');
  }

  /** Every few years, note where you stand with each known faction (the reputation chart). */
  protected sampleRelations(year: number): void {
    if (year % RELATIONS_EVERY !== 0) return;
    const known = this.knownNpcs();
    if (!known.length) return;
    const prev = this.state.relations ?? { years: [], series: {} };
    const keep = Math.max(0, prev.years.length + 1 - RELATIONS_KEEP);
    const years = [...prev.years, year].slice(keep);
    const series: Record<string, Array<number | null>> = {};
    const ids = new Set([...Object.keys(prev.series), ...known.map((n) => n.def.id)]);
    for (const id of ids) {
      const old = prev.series[id] ?? prev.years.map(() => null);
      const now = known.some((n) => n.def.id === id) ? this.standingWith(id) : null;
      series[id] = [...old, now].slice(keep);
    }
    this.deps.store.update({ relations: { years, series } });
  }

  /** NPC worlds you can attack from the War Room: their garrison, with any raiders at home. */
  warTargets = (): WarTarget[] => {
    const out: WarTarget[] = [];
    for (const { def, state } of this.knownNpcs()) {
      const docked = state.fleets.filter((f) => f.mission === 'home');
      for (const c of state.colonies) {
        const star = this.starById(c.starId);
        if (!star || c.capturedBy) continue;
        const isHome = star.id === def.home.id;
        const ships = mergeShips([...c.garrison, ...(isHome ? docked.flatMap((f) => f.ships) : [])]);
        out.push({
          id: `${def.id}@${star.id}`, npc: def.id, owner: def.name, color: def.color, star, kind: 'planet', tier: def.tier,
          name: `${star.name}${isHome ? ' (capital)' : ''}`, blurb: def.archetype.blurb, tech: def.archetype.tech,
          docked: isHome ? docked.map((f) => f.id) : [],
          planet: { name: star.name, ...worldDefense(def, star.id), garrison: { name: `${def.name} garrison`, ships, bonuses: def.archetype.bonuses } },
        });
      }
    }
    return out;
  };

  /** Where raiders can strike this empire: its colony systems and its fleets on station. */
  raidTargets = (): RaidTargets => {
    const s = this.state;
    const colonies = [...new Set([s.home.id, ...this.colonyStars()])].map((id) => this.starById(id)).filter((x): x is StarSystem => !!x);
    const fleets = s.fleets.filter((f) => s.loadouts[f.id] && isStationed(f.movement, s.turn)).map((f) => hexAt(f.movement, s.turn));
    return { player: this.me, targets: [...colonies.map((c) => ({ hex: c.hex, what: 'colony' as const })), ...fleets.map((hex) => ({ hex, what: 'fleet' as const }))] };
  };

  /**
   * Meet the NPCs nearby: your home's neighbours are known from the start; others once a fleet
   * comes within range of their space. Discovering one wakes it for the whole galaxy.
   */
  protected discover(): string[] {
    const s = this.state, galaxy = this.deps.galaxy, w = this.sharedWorld();
    const known = new Set(Object.values(w.npcs).filter((n) => n.knownBy.includes(this.me)).map((n) => n.id));
    const found = new Map<string, NpcDef>();
    for (const d of spawnNpcs(galaxy, s.home.hex)) if (!known.has(d.id)) found.set(d.id, d);
    const spots = [s.home.hex, ...this.fleetHexes()];
    for (const h of spots) {
      for (const d of gridNpcsNear(galaxy, h, HOME_TERRITORY + DISCOVERY_RANGE)) if (!known.has(d.id) && nearNpc(d, h, DISCOVERY_RANGE)) found.set(d.id, d);
    }
    // Other players' neighbours, already awake.
    for (const n of Object.values(w.npcs)) {
      if (known.has(n.id) || found.has(n.id)) continue;
      const d = npcById(galaxy, n.id);
      if (d && spots.some((h) => nearNpc(d, h, DISCOVERY_RANGE))) found.set(d.id, d);
    }
    if (!found.size) return [];
    this.emit([...found.values()].flatMap((d) => [
      { kind: 'discover' as const, npc: w.npcs[d.id] ?? initialNpcState(d, s.turn), by: this.me },
      { kind: 'standing' as const, npc: d.id, player: this.me, delta: 0, base: d.archetype.disposition },
    ]));
    return [...found.values()].map((d) => `First contact: the ${d.name} at ${d.home.name}. ${d.archetype.blurb}`);
  }

  /** Raids that struck this empire: defenders fight, an undefended colony system is plundered. */
  resolveRaids(raids: readonly NpcRaid[]): void {
    for (const raid of raids) {
      if (raid.player !== this.me) continue;
      const def = npcById(this.deps.galaxy, raid.npc);
      if (def) this.resolveRaid(raid, def);
    }
  }

  protected resolveRaid(raid: NpcRaid, def: NpcDef): void {
    this.unlogged.length = 0;
    const s = this.state;
    const star = this.deps.galaxy.starAt(raid.at);
    const place = star?.name ?? 'deep space';
    const raiders = this.sharedWorld().npcs[def.id]?.fleets.find((f) => f.id === raid.fleet)?.name ?? `${def.name} raiders`;
    const atHome = hexEquals(raid.at, s.home.hex);
    // Defenders: warships of the dock (at home) and of fleets on station there; a fleet with no warships fights with what it has.
    const candidates = this.groups().filter((g) => g.stationed && shipTotal(g.ships) > 0 && (g.id === 'dock' ? atHome : hexEquals(hexAt(s.fleets.find((f) => f.id === g.id)!.movement, s.turn), raid.at)));
    const armed = (g: FleetGroup) => g.ships.filter((x) => { const c = this.classById.get(x.classId); return !!c && isWarship(c); });
    const defender = [...candidates].sort((a, b) => this.groupPower(armed(b)) - this.groupPower(armed(a)))[0];
    const colony = !!star && (atHome || this.colonyStars().has(star.id));
    let lost = !defender;
    let raidEntry: Omit<BattleLogEntry, 'id'> | null = null;
    if (defender) {
      const fighting = defender.id === 'dock' || armed(defender).length ? armed(defender) : defender.ships;
      if (fighting.length) {
        const result = resolveBattle(
          { name: raiders, ships: raid.ships, bonuses: def.archetype.bonuses },
          { name: s.playerName, ships: fighting, bonuses: this.combatBonuses(), damage: defender.damage },
          SHIP_CLASSES, hashSeed(this.deps.galaxy.params.seed, raid.year, raid.fleet));
        const delta: Squadron[] = fighting.map((x) => ({ classId: x.classId, count: -(x.count - countOf(result.survivors[1], x.classId)) }));
        for (const c of result.captured[1]) delta.push({ classId: c.classId, count: c.count });
        this.adjustGroup(defender.id, delta, undefined, result.damage[1]);
        this.emit([{ kind: 'npcFleet', npc: def.id, fleet: raid.fleet, ships: result.survivors[0] }]);
        this.changeStanding(def.id, STANDING.repel);
        const mine = -delta.filter((d) => d.count < 0).reduce((n, d) => n + d.count, 0);
        const theirs = shipTotal(raid.ships) - shipTotal(result.survivors[0]);
        const text = result.winner === 1 ? `${defender.name} beat off ${raiders} at ${place}: ${theirs} of theirs destroyed, ${mine} of ours lost`
          : result.winner === 0 ? `${raiders} defeated ${defender.name} at ${place}: ${mine} ships lost, ${theirs} of theirs destroyed`
          : `${defender.name} fought ${raiders} to a standstill at ${place}: ${mine} ships lost, ${theirs} of theirs destroyed`;
        this.dispatch(text, result.winner === 1 ? 'good' : 'bad');
        if (star) this.deps.report?.('battle', text, placeOf(star));
        lost = result.winner !== 1;
        raidEntry = {
          year: s.turn, kind: 'raid', attacked: true, place: star ? placeOf(star) : null, ours: defender.name, ...(defender.id !== 'dock' ? { fleetId: defender.id } : {}),
          foe: raiders, foeEmpire: def.name, outcome: result.winner === 1 ? 'won' : result.winner === 0 ? 'lost' : 'draw',
          lost: tallyLost(fighting, result.survivors[1]), killed: tallyLost(raid.ships, result.survivors[0]),
          ...(result.captured[1].length ? { boarded: tallyOf(result.captured[1]) } : {}), ...(result.captured[0].length ? { taken: tallyOf(result.captured[0]) } : {}),
          summary: text, records: battleRecords(result, 1, this.classById),
        };
      } else lost = true;
    }
    if (lost && colony) {
      const m = s.empire.materials;
      const taken: Partial<Record<Resource, number>> = {};
      for (const r of RAID_LOOT) taken[r] = Math.min(RAID_CAP, Math.floor((this.state.empire.materials[r] ?? 0) * RAID_SHARE));
      const materials = { ...this.state.empire.materials };
      for (const [r, n] of Object.entries(taken)) materials[r as Resource] -= n!;
      const before = this.state.empire.materials;
      this.deps.store.update((st) => ({ empire: { ...st.empire, materials } }));
      this.noteFlow(before, `${raiders} plundered ${place}`);
      const list = Object.entries(taken).filter(([, n]) => n! > 0).map(([r, n]) => `${n} ${RESOURCES.find((x) => x.id === r)?.name.toLowerCase()}`).join(', ');
      const text = `${raiders} plundered ${place}${list ? `: ${list} taken` : ''}. Station warships there to defend it.`;
      this.dispatch(text, 'bad');
      raidEntry = raidEntry
        ? { ...raidEntry, outcome: 'plundered', plunder: taken, summary: `${raidEntry.summary}. ${text}` }
        : { year: s.turn, kind: 'raid', attacked: true, place: star ? placeOf(star) : null, ours: place, foe: raiders, foeEmpire: def.name, outcome: 'plundered', lost: {}, killed: {}, plunder: taken, summary: text };
      void m;
    } else if (!defender) {
      this.dispatch(`${raiders} struck at ${place} but found nothing to take`);
    }
    if (raidEntry) this.logBattle(raidEntry);
  }

  /** Add a battle to the empire's battle log (War Room › Battle log). */
  protected logBattle(entry: Omit<BattleLogEntry, 'id'>): void {
    // The news this battle made since the last one was logged names it, to be replayed from there.
    const news = new Set<object>(this.unlogged.splice(0));
    this.deps.store.update((st) => {
      const battleLog = logBattle(st.battleLog, entry);
      const battle = battleLog[0].id;
      return { battleLog, dispatches: st.dispatches.map((d) => (news.has(d) && d.turn === entry.year ? { ...d, battle } : d)) };
    });
  }


  // ── World time ─────────────────────────────────────────────────────

  /**
   * Advance the empire to the world's current year. Live ticks arrive once a
   * minute; after time away the missed years are simulated in one batch
   * (capped) and summarised in a single dispatch.
   */
  advanceTo(tick: number): void {
    const { run, skipped } = catchUpTicks(this.state.turn, tick, MAX_CATCH_UP);
    if (!run && !skipped) return;
    if (run === 1 && !skipped) { this.step(false); return; }
    const income: Partial<Record<Resource, number>> = {};
    const arrivals: string[] = [];
    this.deps.store.batch(() => {
      // Years beyond the cap are the oldest ones: they pass unsimulated (fleets still move, their
      // position is a function of time) so the most recent week is resolved in full.
      if (skipped) this.deps.store.update((st) => ({ turn: st.turn + skipped, dockSpent: { supply: 0 } }));
      for (let i = 0; i < run; i++) {
        const r = this.step(true);
        for (const [k, n] of Object.entries(r.income)) income[k as Resource] = (income[k as Resource] ?? 0) + n!;
        arrivals.push(...r.arrivals);
      }
      const gained = RESOURCES.filter((r) => income[r.id]).map((r) => `${income[r.id]! > 0 ? '+' : ''}${fmtInt(income[r.id]!)} ${r.short}`).join('  ');
      const away = formatDuration(run + skipped, CLOCK);
      this.dispatch(`While you were away (${away}, ${(run + skipped).toLocaleString('en-US')} years): ${gained || 'no income'}${arrivals.length ? ` · ${arrivals.length} arrival${arrivals.length > 1 ? 's' : ''}` : ''}${skipped ? ` · the earliest ${skipped.toLocaleString('en-US')} years were not simulated` : ''}`, 'good');
      for (const a of arrivals.slice(-5)) this.dispatch(a, 'good');
    });
  }

  /** Development aid: advance one year now instead of waiting a minute. */
  skipYear(): void {
    this.step(false);
  }

  /** Resolve one year: economy, research, logistics. */
  protected step(quiet: boolean): { income: Partial<Record<Resource, number>>; arrivals: string[] } {
    // First contact with any NPC in range (reported even in a quiet catch-up year), and what other
    // players did toward this empire since last year.
    const met = [...this.discover(), ...this.diplomaticNews()];
    const s = this.state;
    const speed = this.fleetSpeed();
    // Companies close last year's books; their tax and dividends, and what other empires owe, are income.
    const years = this.companyYears();
    const transfers = this.transfers(years);
    const { economy, research, report, mined, contracts } = resolveTurn({ ...s.economy, stock: s.empire.materials }, s.empire.research, s.turn, this.deps.economy, this.presence(), transfers);
    this.drawFields(mined);
    const next = s.turn + 1;
    // Logistics: fleets in friendly systems refill their supply and repair (fully at a shipyard world,
    // slowly at an outpost); Menders patch their fleet wherever it is, between battle rounds too.
    const loadouts: Record<string, Loadout> = {};
    const arrivals: string[] = [];
    for (const f of s.fleets) {
      const l = s.loadouts[f.id];
      if (!l) continue;
      const here = hexAt(f.movement, next);
      const friendly = isStationed(f.movement, next) && this.isFriendlyHex(here);
      const site = isStationed(f.movement, next) ? this.repairSite(here) : null;
      const heal = (site ? REPAIR[site] : 0) + (inBattle(l.battle, next) ? 0 : menderRepair(l.ships, this.combatBonuses()));
      const { damage: hurt, ...rest } = l;
      const damage = heal > 0 ? repairDamage(hurt, heal) : hurt;
      loadouts[f.id] = { ...rest, ...resupply(l, l.ships, specOf, friendly), ...(damage ? { damage } : {}) };
      if (arrivalTurn(f.movement) === next && f.movement.route.length > 1) {
        const star = this.deps.galaxy.starAt(here);
        arrivals.push(`${f.name} arrived at ${star?.name ?? 'deep space'}${friendly ? (hurt ? ' to resupply and repair' : ' and resupplied') : ''}`);
      }
    }
    const visited = this.visitedThrough(s, next);
    const { stock, ...settings } = economy;
    // Live years only report news: arrivals, and report lines that changed since last year.
    const previous = new Set(s.lastReport?.lines ?? []);
    const news = [...met.map((text) => ({ turn: next, text, tone: 'bad' as const })), ...(quiet ? [] : [
      ...arrivals.map((text) => ({ turn: next, text, tone: 'good' as const })),
      ...report.lines.filter((l) => !previous.has(l) && !ROUTINE.test(l)).map((text) => ({ turn: next, text })),
    ])];
    this.deps.store.update({
      turn: next,
      loadouts,
      dockSpent: { supply: 0 },
      empire: { ...s.empire, materials: stock, research },
      economy: settings,
      lastReport: report,
      engaged: [],
      dispatches: news.length ? [...news, ...s.dispatches].slice(0, 40) : s.dispatches,
      ...(visited ? { visited } : {}),
    });
    const growth = this.settleCommerce(years, transfers, contracts);
    // Research that finished this year (full nodes research themselves) may speed fleets up.
    if (this.fleetSpeed() !== speed) this.retimeFleets();
    this.sampleRelations(next);
    // A guest's browser runs the NPCs itself (the server does for everyone else).
    if (this.deps.npcs === 'local') {
      const r = stepNpcs(this.sharedWorld(), next, this.deps.galaxy, [this.raidTargets()]);
      this.emit([{ kind: 'npcStep', npcs: r.world.npcs, tick: r.world.tick }]);
      this.resolveRaids(r.raids);
    }
    // Construction finishing this year, then fleets acting on standing orders.
    const done = [...growth, ...this.completeConstruction(), ...this.govern(), ...this.followOrders(), ...this.missionYear()];
    if (!quiet && done.length) this.deps.store.update((st) => ({ dispatches: [...done.map((text) => ({ turn: next, text, tone: 'good' as const })), ...st.dispatches].slice(0, 40) }));
    return { income: report.income, arrivals: [...arrivals, ...done] };
  }

  /** The visited systems as last read, as a set (a save keeps thousands). */
  private visitedMemo: { list: readonly string[]; set: Set<string> } | null = null;

  /**
   * The systems the empire's ships passed through or stopped in going from year `s.turn` to
   * `next` added to `visited` (change admin-snapshots-and-fog), or null when there is nothing new.
   */
  private visitedThrough(s: GameState, next: number): readonly string[] | null {
    const list = s.visited ?? [];
    if (this.visitedMemo?.list !== list) this.visitedMemo = { list, set: new Set(list) };
    const known = this.visitedMemo.set;
    const fresh: string[] = [];
    for (const f of s.fleets) {
      if (!s.loadouts[f.id]) continue;
      for (const h of visitedAlong(f.movement, s.turn, next)) {
        const id = `${h.q},${h.r}`;
        if (known.has(id)) continue;
        if (this.deps.galaxy.starAt(h)) fresh.push(id);
      }
    }
    if (!fresh.length) return null;
    const out = addVisited(list, fresh, MAX_VISITED, known);
    return out === list ? null : out;
  }

  protected dispatch(text: string, tone?: 'good' | 'bad'): void {
    const news = { turn: this.state.turn, text, tone };
    this.unlogged.push(news);
    this.deps.store.update((s) => ({ dispatches: [news, ...s.dispatches].slice(0, 40) }));
  }
}

/** A star as a link target for news. */
const placeOf = (star: StarSystem): ActivityPlace => ({ name: star.name, q: star.hex.q, r: star.hex.r });
