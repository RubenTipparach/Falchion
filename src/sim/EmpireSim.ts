import { RESOURCES, Resource } from '../content/resources';
import { BUILDINGS, slotsOf } from '../content/buildings';
import { buildYears, hasWarships, isSurveyClass, isWarship, specOf, warshipsOf } from '../content/logistics';
import { SHIP_CLASSES, ShipClassDef } from '../content/shipClasses';
import { BattleResult, CombatBonuses, resolveAssault, resolveBattle, Side, Squadron } from '../core/combat/Combat';
import { bonusOf, canAfford, capsOf, Colony, EconomyTables, maxPolicies, maxSpies, pay, Presence, resolveTurn, tradePctOf } from '../core/economy/Economy';
import { cargoCapacity, FREIGHTER, saleValue, type Market } from '../core/economy/Trade';
import { applyCost, applyCrate, EncounterResolver } from '../core/encounters/Encounters';
import { addHaul, Collected, crateMaterials, Haul, planetCache } from '../core/encounters/PlanetCache';
import type { Card } from '../core/encounters/types';
import type { ActivityPlace, ReportKind } from '../core/social/Activity';
import { arrivalTurn, hexAt, planMovement, positionAt, retime, travelTurns } from '../core/fleet/Fleet';
import { catchUpTicks, formatDuration } from '../core/time/WorldTime';
import { capacity, clampStores, exploreCost, firepower, fullStores, rescaleStores, resupply, Stores } from '../core/fleet/Logistics';
import { adjustShips, countOf, dockedShips, Encounter, FleetBattle, FleetOrders, ForeignFleet, inBattle, hasShips, isAggressive, isStationed, Loadout, shipTotal } from '../core/fleet/Presence';
import { planSurvey } from '../core/fleet/Survey';
import { minedBy, nearestMine, stockFor } from '../core/fleet/AutoMine';
import { fieldLeft, fieldsOf, homeBelt, yearsToFull, type AsteroidField } from '../core/galaxy/Asteroids';
import { applyEffects, EMPTY_WORLD, type SharedEffect, type SharedWorld } from '../core/world/SharedWorld';
import { DISCOVERY_RANGE, gridNpcsNear, HOME_TERRITORY, initialNpcState, nearNpc, npcById, spawnNpcs, territoryOf, worldDefense, type NpcDef } from '../core/npc/NpcCatalog';
import { stepNpcs, type RaidTargets } from '../core/npc/NpcSim';
import type { NpcRaid, NpcState } from '../core/npc/types';
import { marketFactor, STANDING, standingOf, tierOf } from '../core/npc/Reputation';
import { due, enqueue, Job } from '../core/construction/Construction';
import { addressOf, formatAddress } from '../core/galaxy/GalacticAddress';
import { GalaxyModel, StarSystem } from '../core/galaxy/GalaxyModel';
import { planetsOf, Planet } from '../core/galaxy/Planets';
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
  /** Ammunition the fleet fires in this round. */
  readonly spent: number;
  /** The battle it is already in, if any (its round count). */
  readonly battle?: FleetBattle;
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
  /** Other players' fleets by `${ownerId}:${fleetId}`, for chasing them. */
  readonly foreignFleet?: (key: string) => ForeignFleet | null;
  /** Markets beyond your own colonies and the neighbours (other players' worlds). */
  readonly markets?: () => readonly Market[];
}

const BASE_SPEED = 1; // ly per year (one year = one minute)
/** Supply an auto-exploring fleet needs to set off for another system. */
const MIN_SURVEY_SUPPLY = 2;
/** Map colour of an empire that has not been founded yet. */
const DEFAULT_EMPIRE_COLOR = '#e6b450';
/** At most a week of missed years is simulated on return; older years only move fleets. */
const MAX_CATCH_UP = 7 * 24 * 60;
/** Per-year report lines that would repeat every minute. */
const ROUTINE = /^(Science: \+|Trade: \d)/;
const fmtInt = (n: number) => Math.round(n).toLocaleString('en-US');
const ROLE_TRAIT: Partial<Record<string, string>> = {
  long: 'role-long', short: 'role-short', barrage: 'role-barrage', siege: 'role-siege', suppression: 'role-suppression',
  capture: 'role-capture', assault: 'role-assault', support: 'role-support',
};

/**
 * The game's rules for one empire: its state, every command a player can give, and the yearly
 * step. Pure and deterministic (no view, DOM or three.js), so the same code runs in the browser
 * and on the server, which advances every empire each tick (change server-authoritative-world).
 */
export class EmpireSim {
  constructor(protected readonly deps: SimDeps) {}

  protected readonly classById = new Map(SHIP_CLASSES.map((c) => [c.id, c]));
  protected readonly targetStars = new Map<string, StarSystem>();

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

  planets = (star: StarSystem): Planet[] => planetsOf(star, this.deps.galaxy.params.seed);

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
    return !!star && (this.colonyStars().has(star.id) || this.state.depots.includes(star.id));
  };

  isFriendly = (star: StarSystem): boolean => this.isFriendlyHex(star.hex);

  /** Ships at the home dock. */
  docked = (): Squadron[] => dockedShips(this.state.economy.roster, Object.values(this.state.loadouts));

  protected dockStores(ships = this.docked()): Stores {
    const full = fullStores(ships, specOf);
    const spent = this.state.dockSpent;
    return { supply: Math.max(0, full.supply - spent.supply), ammo: Math.max(0, full.ammo - spent.ammo) };
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
        id: f.id, name: f.name, ships: l.ships, stores: { supply: l.supply, ammo: l.ammo }, capacity: capacity(l.ships, specOf),
        star: this.deps.galaxy.starAt(dest), stationed, eta: Math.max(0, arrivalTurn(f.movement) - s.turn), friendly: stationed && this.isFriendlyHex(dest), orders: l.orders,
        cargo: l.cargo, cargoFrom: l.cargoFrom, battle: inBattle(l.battle, s.turn) ? l.battle : undefined,
      });
    }
    return out;
  };

  groupsAt = (star: StarSystem): FleetGroup[] => this.groups().filter((g) => g.stationed && g.star?.id === star.id && shipTotal(g.ships) > 0);

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
  fieldReport = (star: StarSystem): FieldReport[] => {
    const w = this.sharedWorld(), year = this.state.turn;
    return this.asteroidsAt(star).map((field) => ({ field, left: fieldLeft(field, w.asteroids[field.id], year), fullIn: yearsToFull(field, w.asteroids[field.id], year) }));
  };

  /** Mining ships and where they are: each mines its system's fields of its resource. */
  protected presence(): Presence {
    const s = this.state;
    const miners: Array<{ classId: string; count: number; pool?: string }> = [];
    const pools: Record<string, number> = {};
    const at = (star: StarSystem | null, classId: string): string | undefined => {
      const r = this.classById.get(classId)?.mines;
      if (!star || !r) return undefined;
      const key = poolKey(star.id, r);
      if (!(key in pools)) pools[key] = this.fieldReport(star).filter((f) => f.field.resource === r).reduce((n, f) => n + f.left, 0);
      return key;
    };
    for (const x of this.docked()) if (this.classById.get(x.classId)?.mines) miners.push({ ...x, pool: at(s.home, x.classId) });
    for (const g of this.groups()) {
      if (g.id === 'dock') continue;
      for (const x of g.ships) if (this.classById.get(x.classId)?.mines) miners.push({ ...x, pool: g.stationed ? at(g.star, x.classId) : undefined });
    }
    const known = this.knownNpcs();
    const reached = known.map((n) => n.def.name).filter((n) => this.reached(n));
    const techOf = Object.fromEntries(known.map((n) => [n.def.name, n.def.archetype.tech]));
    return { miners, pools, reached, techOf };
  }

  /** What was mined from each pool, taken from its fields (fullest first) and shared. */
  protected drawFields(mined: Readonly<Record<string, number>>): void {
    const effects: SharedEffect[] = [];
    for (const [key, amount] of Object.entries(mined)) {
      const { starId, resource } = parsePool(key);
      const star = this.starById(starId);
      if (!star || amount <= 0) continue;
      let rest = amount;
      for (const f of this.fieldReport(star).filter((x) => x.field.resource === resource && x.left > 0).sort((a, b) => b.left - a.left)) {
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
    this.deps.store.update({ fleets: [...s.fleets, fleet], loadouts: { ...s.loadouts, [id]: { ships: wanted, ...fullStores(wanted, specOf), orders } } });
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
    const l = this.state.loadouts[fleetId];
    if (!l) return;
    // A trade run carries on unless the fleet is sent exploring. The flags are stored the same
    // way however they arrive (auto-mine only when on), so browser and server keep equal orders.
    const trade = orders.autoExplore ? undefined : orders.trade ?? l.orders?.trade;
    // Only a fleet with warships may be aggressive.
    const stance = isAggressive(orders) && hasWarships(l.ships) ? 'aggressive' as const : undefined;
    const next: FleetOrders = { autoExplore: orders.autoExplore === true, autoReturn: orders.autoReturn === true, ...(orders.autoMine === true ? { autoMine: true } : {}), trade, stance, ...(l.orders?.chase ? { chase: l.orders.chase } : {}) };
    this.deps.store.update((st) => ({ loadouts: { ...st.loadouts, [fleetId]: { ...l, orders: next } } }));
  }

  returnHome(fleetId: string): void {
    this.moveFleet(fleetId, this.state.home);
  }

  dockFleet(fleetId: string): void {
    const s = this.state;
    const f = s.fleets.find((x) => x.id === fleetId);
    if (!f || !s.loadouts[fleetId]) return;
    if (!isStationed(f.movement, s.turn) || !hexEquals(hexAt(f.movement, s.turn), s.home.hex)) return;
    const { [fleetId]: gone, ...loadouts } = s.loadouts;
    // Goods still aboard go back into the stockpile.
    const materials = gone.cargo ? { ...s.empire.materials, goods: s.empire.materials.goods + gone.cargo } : s.empire.materials;
    this.deps.store.update({ fleets: s.fleets.filter((x) => x.id !== fleetId), loadouts, empire: { ...s.empire, materials } });
    this.dispatch(`${f.name} docks at ${s.home.name}`);
  }

  /** Change a group's ships (and the empire roster); empty fleets disband. */
  protected adjustGroup(groupId: string, delta: Squadron[], stores?: Partial<Stores>): void {
    const s = this.state;
    const roster = { ...s.economy.roster };
    for (const d of delta) roster[d.classId] = Math.max(0, (roster[d.classId] ?? 0) + d.count);
    if (groupId === 'dock') {
      const spent = { ...s.dockSpent };
      if (stores) {
        const full = fullStores(dockedShips(roster, Object.values(s.loadouts)), specOf);
        if (stores.supply !== undefined) spent.supply = Math.max(0, full.supply - stores.supply);
        if (stores.ammo !== undefined) spent.ammo = Math.max(0, full.ammo - stores.ammo);
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
    const next = clampStores(rescaleStores({ supply: stores?.supply ?? l.supply, ammo: stores?.ammo ?? l.ammo }, l.ships, ships, specOf), ships, specOf);
    this.deps.store.update({ economy: { ...s.economy, roster }, loadouts: { ...s.loadouts, [groupId]: { ...l, ships, ...next } }, empire: { ...s.empire, fleetPower: this.fleetPower(roster) } });
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
    return this.groupsAt(star).filter((g) => g.stores.supply >= cost).sort((a, b) => b.stores.supply - a.stores.supply)[0] ?? null;
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
    this.deps.store.update({ empire: { ...s.empire, research }, economy: { ...s.economy, focus } });
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

  buildShip(classId: string, yardPlanetId?: string): void {
    const s = this.state;
    const c = this.classById.get(classId);
    if (!c || !this.isClassUnlocked(c)) return;
    const yard = this.yards().find((y) => y.planetId === yardPlanetId) ?? this.yards().find((y) => y.capital) ?? this.yards()[0];
    if (!yard?.planetId) return this.dispatch('No shipyard: build an Orbital Shipyard on a colony first', 'bad');
    const discount = Math.min(40, this.bonus('build'));
    if (!canAfford(s.empire.materials, c.cost, discount)) return;
    // Paid up front; the hull takes years (minutes) at the yard, one at a time.
    const construction = enqueue(s.construction, { kind: 'ship', item: classId, site: yard.planetId }, buildYears(c), s.turn);
    const job = construction[construction.length - 1];
    this.deps.store.update({ empire: { ...s.empire, materials: pay(s.empire.materials, c.cost, discount) }, construction });
    this.dispatch(`${c.name} laid down at ${yard.name}: ready in ${formatDuration(job.doneTurn - s.turn, CLOCK)}`);
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
    const here = this.groupsAt(star).find((g) => g.id !== 'dock');
    if (here) return this.adjustGroup(here.id, one);
    const id = `yard-${yard.starId}-t${s.turn}`;
    const fleet = { id, name: `${star.name} Yard Group`, owner: s.playerName, color: this.empireColor(), movement: planMovement(star.hex, star.hex, s.turn, 1), design: this.designOf(one) };
    const roster = { ...s.economy.roster, [classId]: (s.economy.roster[classId] ?? 0) + 1 };
    this.deps.store.update({ fleets: [...s.fleets, fleet], loadouts: { ...s.loadouts, [id]: { ships: one, ...fullStores(one, specOf) } }, economy: { ...s.economy, roster } });
  }

  caps = () => capsOf(this.state.economy, this.deps.economy);

  jobs = (site?: string): Job[] => this.state.construction.filter((j) => !site || j.site === site);

  // ── Commands: colonies ─────────────────────────────────────────────

  settle(planet: Planet): void {
    const s = this.state;
    const star = this.starOfPlanet(planet);
    if (!star || this.colonyAt(planet.id)) return;
    if (!s.explored[planet.id]) return this.dispatch(`Survey ${planet.name} before settling it`, 'bad');
    const g = this.groupsAt(star).find((x) => countOf(x.ships, 'colony-ark') > 0);
    if (!g) return this.dispatch(`Settling ${planet.name} needs a Colony Ark on station in ${star.name}`, 'bad');
    this.adjustGroup(g.id, [{ classId: 'colony-ark', count: -1 }]);
    const colony: Colony = { name: planet.name, biome: planet.biome, planetId: planet.id, starId: star.id, size: planet.size, buildings: [] };
    this.deps.store.update((st) => ({ economy: { ...st.economy, colonies: [...st.economy.colonies, colony] } }));
    this.dispatch(`${planet.name} settled: a new colony with ${slotsOf(planet.size)} building slots`, 'good');
    this.deps.report?.('colony', `settled ${planet.name} in ${star.name}`, placeOf(star));
  }

  buildDepot(star: StarSystem): void {
    const s = this.state;
    if (this.isFriendly(star)) return;
    const g = this.groupsAt(star).find((x) => countOf(x.ships, 'construction-tender') > 0);
    if (!g) return this.dispatch(`A supply depot needs a Construction Tender on station in ${star.name}`, 'bad');
    const cost = { credits: 60, metals: 40 };
    if (!canAfford(s.empire.materials, cost)) return this.dispatch('A supply depot costs 60 credits and 40 metals', 'bad');
    this.deps.store.update({ empire: { ...s.empire, materials: pay(s.empire.materials, cost) }, depots: [...s.depots, star.id] });
    this.adjustGroup(g.id, [{ classId: 'construction-tender', count: -1 }]);
    this.dispatch(`Supply depot built at ${star.name}: fleets there resupply and rearm`, 'good');
    this.deps.report?.('depot', `built a supply depot at ${star.name}`, placeOf(star));
  }

  build(planetId: string, buildingId: string): void {
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
    this.dispatch(`${b.name} under construction on ${colony.name}: ready in ${formatDuration(job.doneTurn - s.turn, CLOCK)}`);
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
        this.launchShip(j.item, colony);
        news.push(`${this.classById.get(j.item)?.name ?? j.item} launched at ${colony.name}`);
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
      if (l?.orders?.chase) {
        const note = this.steerChase(f.id);
        if (note) news.push(note);
        continue;
      }
      // An aggressive fleet whose foe broke off last year's battle gives chase on its own.
      if (l && isAggressive(l.orders) && hasWarships(l.ships) && l.battle && l.battle.tick >= s.turn - 1 && isStationed(f.movement, s.turn)) {
        const foe = this.foreignFleet(l.battle.foe);
        const here = hexAt(f.movement, s.turn);
        if (foe && !(isStationed(foe.movement, s.turn) && hexEquals(hexAt(foe.movement, s.turn), here))) {
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
    this.moveFleet(f.id, next, true);
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

  /** What a cargo loaded at `from` sells for at a market. */
  saleValue = (goods: number, from: StarSystem, market: Market): number => {
    const s = this.state;
    const at = this.starById(market.starId);
    const tradePct = tradePctOf({ ...s.economy, stock: s.empire.materials }, this.deps.economy, s.empire.research);
    // An NPC faction pays more the better you stand with it.
    const factor = market.npc ? marketFactor(this.standingWith(market.npc)) : 1;
    return at ? Math.round(saleValue(goods, hexDistance(from.hex, at.hex), market.kind, tradePct) * factor) : 0;
  };

  /** Where a fleet is on station, if it is. */
  protected stationedAt(fleetId: string): StarSystem | null {
    const f = this.state.fleets.find((x) => x.id === fleetId);
    return f && isStationed(f.movement, this.state.turn) ? this.deps.galaxy.starAt(hexAt(f.movement, this.state.turn)) : null;
  }

  /** Fill a fleet's freighters with trade goods at one of your colony systems. */
  loadGoods(fleetId: string, quiet = false): number {
    const s = this.state;
    const l = s.loadouts[fleetId];
    const star = this.stationedAt(fleetId);
    if (!l || !star || !this.colonyStars().has(star.id)) return 0;
    const room = this.cargoCapacity(l.ships) - (l.cargo ?? 0);
    const take = Math.max(0, Math.min(room, Math.floor(s.empire.materials.goods ?? 0)));
    if (!take) return 0;
    this.deps.store.update({
      empire: { ...s.empire, materials: { ...s.empire.materials, goods: s.empire.materials.goods - take } },
      loadouts: { ...s.loadouts, [fleetId]: { ...l, cargo: (l.cargo ?? 0) + take, cargoFrom: l.cargo ? l.cargoFrom : star.id } },
    });
    if (!quiet) this.dispatch(`${this.fleetName(fleetId)} loads ${take} trade goods at ${star.name}`);
    return take;
  }

  /** Sell a fleet's goods at the market it is at (not where they were loaded). Returns the credits. */
  sellGoods(fleetId: string, quiet = false): number {
    const s = this.state;
    const l = s.loadouts[fleetId];
    const star = this.stationedAt(fleetId);
    const market = star && this.marketAt(star);
    const from = l?.cargoFrom ? this.starById(l.cargoFrom) : null;
    if (!l?.cargo || !star || !market || !from || from.id === star.id) return 0;
    const credits = this.saleValue(l.cargo, from, market);
    this.deps.store.update({
      empire: { ...s.empire, materials: { ...s.empire.materials, credits: s.empire.materials.credits + credits } },
      loadouts: { ...s.loadouts, [fleetId]: { ...l, cargo: 0, cargoFrom: undefined } },
    });
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
    const next = cargo > 0 ? to : from;
    if (next.id !== at.id) this.moveFleet(fleetId, next, true);
    return news;
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
    const s = this.state;
    const target = this.warTargets().find((t) => t.id === targetId);
    const committed = ships.filter((x) => x.count > 0);
    if (!target || s.engaged.includes(targetId) || !committed.length) return null;
    const at = target.star;
    const group = this.groupsAt(at).find((g) => g.id === groupId);
    if (!group || !hasShips(group.ships, committed)) return null;
    // Ammunition decides how hard the strike group can hit.
    const fire = firepower(group.stores.ammo, committed, specOf);
    const me = { name: s.playerName, ships: committed, bonuses: this.combatBonuses(), firepower: fire.factor };
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
      colonies = [...colonies, { name: planet?.name ?? at.name, biome: planet?.biome ?? 'barren', planetId: planet?.id, starId: at.id, size: planet?.size ?? 3, buildings: [] }];
      const pool = target.tech.filter((id) => !research.researched.includes(id));
      for (const id of pool.slice(0, 2)) research = this.deps.tree.grantShards(research, id, 'reverse-engineering', 40);
    }
    let summary = result.captured ? `${target.name} captured from the ${target.owner}: a new colony and alien tech fragments`
      : result.phaseReached === 'space' ? `Assault on ${target.name} failed in orbit`
      : result.phaseReached === 'bombardment' ? `Bombardment of ${target.name} could not break its defences: bring siege ships`
      : `Landing on ${target.name} repelled: ${result.troopsLanded} troops vs ${result.troopsNeeded} needed`;
    if (fire.factor < 1) summary = `${summary} (fought at ${Math.round(fire.factor * 100)}% firepower: low ammunition)`;
    const outcome: CombatOutcome = { kind: 'planet', result, summary };
    this.deps.store.update({ empire: { ...s.empire, research }, engaged: [...s.engaged, targetId], economy: { ...s.economy, colonies } });
    this.adjustGroup(groupId, delta, { ammo: group.stores.ammo - fire.spent });
    this.emit(effects);
    this.dispatch(outcome.summary, result.captured ? 'good' : 'bad');
    this.deps.report?.('battle', `${outcome.summary} at ${at.name}`, placeOf(at));
    return outcome;
  }

  // ── Contacts at sea: fleets of different empires on one hex ───────

  /**
   * This fleet as it meets another at sea on `turn`: its warships (the whole fleet when it has
   * none), its research bonuses and its ammunition. Null when it is not on station.
   */
  contactForce(fleetId: string, turn: number, underway = false): ContactForce | null {
    const s = this.state;
    const f = s.fleets.find((x) => x.id === fleetId);
    const l = s.loadouts[fleetId];
    // A fleet under way can still be caught (a pursuit): `underway` allows it.
    if (!f || !l || (!underway && !isStationed(f.movement, turn))) return null;
    const warships = warshipsOf(l.ships);
    const ships = warships.length ? warships : l.ships.filter((x) => x.count > 0);
    const fire = firepower(l.ammo, ships, specOf);
    const at = hexAt(f.movement, turn);
    const empire = s.identity?.name ?? s.playerName;
    return {
      fleetId, fleetName: f.name, empire, at, star: this.deps.galaxy.starAt(at), ships, spent: fire.spent, battle: l.battle, speed: f.movement.speed,
      aggressive: isAggressive(l.orders), armed: warships.length > 0,
      side: { name: empire, ships, bonuses: this.combatBonuses(), firepower: fire.factor },
    };
  }

  /**
   * Record one round of a battle at sea in this empire's own save: the ships its fleet lost (and
   * any it took), the ammunition it fired, the battle it is now in, and the news. `index` is its
   * side in the round; `foe` is the other fleet as it went in.
   */
  applyContact(force: ContactForce, foe: ContactFoe, result: BattleResult, index: 0 | 1, round: number, tick: number, overtaken = false): void {
    const other = index === 0 ? 1 : 0;
    const delta: Squadron[] = force.ships.map((x) => ({ classId: x.classId, count: -(x.count - countOf(result.survivors[index], x.classId)) }));
    for (const c of result.captured[index]) delta.push({ classId: c.classId, count: c.count });
    this.adjustGroup(force.fleetId, delta, { ammo: (this.state.loadouts[force.fleetId]?.ammo ?? 0) - force.spent });
    const mine = shipTotal(force.ships) - shipTotal(result.survivors[index]);
    const theirs = shipTotal(foe.ships) - shipTotal(result.survivors[other]);
    // The other fleet's and empire's names come from another player: bounded like their public view.
    const foeName = foe.fleetName.slice(0, 64), foeEmpire = foe.empire.slice(0, 100);
    const place = force.star?.name ?? 'deep space';
    const l = this.state.loadouts[force.fleetId];
    if (l) this.deps.store.update((st) => ({ loadouts: { ...st.loadouts, [force.fleetId]: { ...l, battle: { foe: foe.key, foeName, foeEmpire, round, tick } } } }));
    const tally = `${mine} of ours lost, ${theirs} of theirs destroyed`;
    const text = result.winner === index ? `${force.fleetName} destroyed ${foeName} of ${foeEmpire} at ${place} in round ${round}: ${tally}`
      : result.winner === other ? `${force.fleetName} was destroyed by ${foeName} of ${foeEmpire} at ${place} in round ${round}`
      : `Battle at ${place}, round ${round}: ${force.fleetName} against ${foeName} of ${foeEmpire}, ${tally}.${round === 1 ? ' A round a year until one side is gone or breaks off: Retreat from the fleet card.' : ''}`;
    this.dispatch(overtaken ? `Overtaken while breaking off: ${text}` : text, result.winner === index ? 'good' : result.winner === other || mine > theirs ? 'bad' : undefined);
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
    if (defender) {
      const fighting = defender.id === 'dock' || armed(defender).length ? armed(defender) : defender.ships;
      if (fighting.length) {
        const fire = firepower(defender.stores.ammo, fighting, specOf);
        const result = resolveBattle(
          { name: raiders, ships: raid.ships, bonuses: def.archetype.bonuses },
          { name: s.playerName, ships: fighting, bonuses: this.combatBonuses(), firepower: fire.factor },
          SHIP_CLASSES, hashSeed(this.deps.galaxy.params.seed, raid.year, raid.fleet));
        const delta: Squadron[] = fighting.map((x) => ({ classId: x.classId, count: -(x.count - countOf(result.survivors[1], x.classId)) }));
        for (const c of result.captured[1]) delta.push({ classId: c.classId, count: c.count });
        this.adjustGroup(defender.id, delta, { ammo: defender.stores.ammo - fire.spent });
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
      } else lost = true;
    }
    if (lost && colony) {
      const m = s.empire.materials;
      const taken: Partial<Record<Resource, number>> = {};
      for (const r of RAID_LOOT) taken[r] = Math.min(RAID_CAP, Math.floor((this.state.empire.materials[r] ?? 0) * RAID_SHARE));
      const materials = { ...this.state.empire.materials };
      for (const [r, n] of Object.entries(taken)) materials[r as Resource] -= n!;
      this.deps.store.update((st) => ({ empire: { ...st.empire, materials } }));
      const list = Object.entries(taken).filter(([, n]) => n! > 0).map(([r, n]) => `${n} ${RESOURCES.find((x) => x.id === r)?.name.toLowerCase()}`).join(', ');
      this.dispatch(`${raiders} plundered ${place}${list ? `: ${list} taken` : ''}. Station warships there to defend it.`, 'bad');
      void m;
    } else if (!defender) {
      this.dispatch(`${raiders} struck at ${place} but found nothing to take`);
    }
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
      if (skipped) this.deps.store.update((st) => ({ turn: st.turn + skipped, dockSpent: { supply: 0, ammo: 0 } }));
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
    // First contact with any NPC in range (reported even in a quiet catch-up year).
    const met = this.discover();
    const s = this.state;
    const { economy, research, report, mined } = resolveTurn({ ...s.economy, stock: s.empire.materials }, s.empire.research, s.turn, this.deps.economy, this.presence());
    this.drawFields(mined);
    const next = s.turn + 1;
    // Logistics: fleets in friendly systems refill; elsewhere ammunition trickles back.
    const loadouts: Record<string, Loadout> = {};
    const arrivals: string[] = [];
    for (const f of s.fleets) {
      const l = s.loadouts[f.id];
      if (!l) continue;
      const here = hexAt(f.movement, next);
      const friendly = isStationed(f.movement, next) && this.isFriendlyHex(here);
      loadouts[f.id] = { ...l, ...resupply(l, l.ships, specOf, friendly) };
      if (arrivalTurn(f.movement) === next && f.movement.route.length > 1) {
        const star = this.deps.galaxy.starAt(here);
        arrivals.push(`${f.name} arrived at ${star?.name ?? 'deep space'}${friendly ? ' and resupplied' : ''}`);
      }
    }
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
      dockSpent: { supply: 0, ammo: 0 },
      empire: { ...s.empire, materials: stock, research },
      economy: settings,
      lastReport: report,
      engaged: [],
      dispatches: news.length ? [...news, ...s.dispatches].slice(0, 40) : s.dispatches,
    });
    this.sampleRelations(next);
    // A guest's browser runs the NPCs itself (the server does for everyone else).
    if (this.deps.npcs === 'local') {
      const r = stepNpcs(this.sharedWorld(), next, this.deps.galaxy, [this.raidTargets()]);
      this.emit([{ kind: 'npcStep', npcs: r.world.npcs, tick: r.world.tick }]);
      this.resolveRaids(r.raids);
    }
    // Construction finishing this year, then fleets acting on standing orders.
    const done = [...this.completeConstruction(), ...this.followOrders()];
    if (!quiet && done.length) this.deps.store.update((st) => ({ dispatches: [...done.map((text) => ({ turn: next, text, tone: 'good' as const })), ...st.dispatches].slice(0, 40) }));
    return { income: report.income, arrivals: [...arrivals, ...done] };
  }

  protected dispatch(text: string, tone?: 'good' | 'bad'): void {
    this.deps.store.update((s) => ({ dispatches: [{ turn: s.turn, text, tone }, ...s.dispatches].slice(0, 40) }));
  }
}

/** A star as a link target for news. */
const placeOf = (star: StarSystem): ActivityPlace => ({ name: star.name, q: star.hex.q, r: star.hex.r });
