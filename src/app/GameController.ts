import * as THREE from 'three';
import { ALIEN_TARGETS } from '../content/aliens';
import { RESOURCES, Resource } from '../content/resources';
import { BELT_MINERALS, BUILDINGS, slotsOf } from '../content/buildings';
import { buildYears, isSurveyClass, isWarship, specOf } from '../content/logistics';
import { BIOME_YIELDS } from '../content/resources';
import { SHIP_CLASSES, ShipClassDef } from '../content/shipClasses';
import type { TradePartner } from '../content/society';
import { CombatBonuses, resolveAssault, resolveBattle, Squadron } from '../core/combat/Combat';
import { bonusOf, canAfford, capsOf, Colony, EconomyTables, maxPolicies, maxSpies, pay, Presence, resolveTurn } from '../core/economy/Economy';
import { applyCost, applyCrate, EncounterResolver } from '../core/encounters/Encounters';
import { addHaul, Haul, planetCache } from '../core/encounters/PlanetCache';
import { arrivalTurn, hexAt, planMovement, retime, travelTurns } from '../core/fleet/Fleet';
import { catchUpTicks, formatDuration } from '../core/time/WorldTime';
import { CLOCK, WorldClock } from './WorldClock';
import type { SaveGame } from './SaveGame';
import { capacity, clampStores, exploreCost, firepower, fullStores, rescaleStores, resupply, Stores } from '../core/fleet/Logistics';
import { adjustShips, countOf, dockedShips, FleetOrders, hasShips, isStationed, Loadout, shipTotal } from '../core/fleet/Presence';
import { due, enqueue, Job } from '../core/construction/Construction';
import { addressOf, formatAddress } from '../core/galaxy/GalacticAddress';
import { GalaxyModel, StarSystem } from '../core/galaxy/GalaxyModel';
import { planetsOf, Planet } from '../core/galaxy/Planets';
import { Hex, hexDistance, hexEquals, hexToWorld, worldToHex } from '../core/hex/Hex';
import { hashSeed } from '../core/rng/Rng';
import type { TechTree } from '../core/research/TechTree';
import { normalizeDesign, ShipDesign } from '../core/ships/ShipDesign';
import type { EmpireIdentity } from '../core/empire/Identity';
import type { FleetLayer, FleetView } from '../render/map/FleetLayer';
import type { HexGridLayer } from '../render/map/HexGridLayer';
import type { ViewState } from '../render/map/MapLayer';
import type { MapView } from '../render/map/MapView';
import type { SectorOverlayLayer } from '../render/map/SectorOverlayLayer';
import type { SelectionLayer } from '../render/map/SelectionLayer';
import { SYSTEM_VIEW_WIDTH, SystemLayer } from '../render/map/SystemLayer';
import type { Drawer } from '../ui/Drawer';
import type { CombatOutcome, FleetGroup, FleetInfo, GameActions, GameQueries, PanelId } from '../ui/GameActions';
import type { Hud } from '../ui/Hud';
import type { StarDetails } from '../ui/StarInfoPanel';
import type { TopBar } from '../ui/TopBar';
import type { GameState } from './GameState';
import type { Store } from './Store';
import type { World } from './World';

export interface ControllerDeps {
  readonly store: Store<GameState>;
  readonly galaxy: GalaxyModel;
  readonly tree: TechTree;
  readonly encounters: EncounterResolver;
  readonly world: World;
  readonly economy: EconomyTables;
  readonly clock: WorldClock;
  readonly save: SaveGame;
  /** Share notable news (battles, colonies, depots) with the server's Discord channel. */
  readonly report?: (kind: 'battle' | 'colony' | 'depot', text: string) => void;
}

export interface ViewDeps {
  readonly map: MapView;
  readonly hexGrid: HexGridLayer;
  readonly selection: SelectionLayer;
  readonly sectors: SectorOverlayLayer;
  readonly fleets: FleetLayer;
  readonly hud: Hud;
  readonly topBar: TopBar;
  readonly panels: Readonly<Record<PanelId, Drawer>>;
  readonly system: SystemLayer;
}

/** Camera altitude (ly) that frames a whole star system. */
const SYSTEM_ALTITUDE = 0.45;
/** Camera altitude (ly) when following a ship: close enough to see the hull. */
const FLEET_ALTITUDE = 0.03;
/** Locate buttons pan to their target and come no closer than this (a regional view); double-click dives in. */
const LOCATE_ALTITUDE = 48;
/** Two clicks on the same thing within this many ms are a double-click. */
const DOUBLE_CLICK_MS = 400;
const BASE_SPEED = 1; // ly per year (one year = one minute)
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

/** Application service: implements UI commands on top of the pure core and the map view. */
export class GameController implements GameActions, GameQueries {
  private view!: ViewDeps;
  private readonly classById = new Map(SHIP_CLASSES.map((c) => [c.id, c]));
  private readonly targetStars = new Map<string, StarSystem>();
  private lastClick: { id: string; at: number } | null = null;
  /** Other players' fleets in the shared galaxy (drawn and selectable, never simulated here). */
  private others: FleetView[] = [];

  constructor(private readonly deps: ControllerDeps) {}

  attach(view: ViewDeps): void {
    this.view = view;
    view.hexGrid.setHome(this.deps.world.home.hex.q, this.deps.world.home.hex.r);
    this.deps.store.subscribe((s, prev) => {
      if (s.fleets !== prev.fleets || s.loadouts !== prev.loadouts) view.fleets.setFleets(this.fleetViews());
    });
    for (const [id, panel] of Object.entries(view.panels)) panel.onChange(() => view.topBar.setActivePanel(this.openPanelId() ?? (panel.opened ? (id as PanelId) : null)));
    view.fleets.setTime(this.fleetTime());
    view.fleets.setFleets(this.fleetViews());
    // Zooming in close pulls the view onto the nearest star, so you land in its system.
    view.map.controller.attractor = (ground, width) => {
      if (width > 25) return null;
      const star = this.deps.galaxy.nearestStar(worldToHex(ground.x, ground.z), Math.max(1, Math.round(width * 0.15)));
      return star ? star.position : null;
    };
  }

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
  effectiveDesign = (classId = this.state.shipyardClass): ShipDesign => {
    const c = this.classById.get(classId);
    const traits = this.unlockedTraits().filter((t) => !this.state.hiddenTraits.includes(t));
    const role = c ? (c.mines ? 'role-mining' : ROLE_TRAIT[c.doctrine]) : undefined;
    if (role) traits.push(role);
    if (c?.role === 'capital') traits.push('role-capital');
    return normalizeDesign({ ...this.designFor(classId), traits });
  };

  planets = (star: StarSystem): Planet[] => planetsOf(star, this.deps.galaxy.params.seed);

  describe = (star: StarSystem): StarDetails => {
    const dist = hexDistance(this.deps.world.home.hex, star.hex);
    // Every fleet travels at the empire's speed: 1 ly a year to start, plus drive research.
    const speed = this.fleetSpeed();
    const owner = this.deps.world.claims.find((c) => c.colonies.some((col) => hexDistance(col.hex, star.hex) <= col.radius));
    return {
      address: formatAddress(addressOf(star.hex)),
      distanceFromHome: dist,
      travel: dist === 0 ? '—' : formatDuration(travelTurns(dist, speed), CLOCK),
      speed,
      planets: this.planets(star),
      owner: owner?.kind === 'player' ? this.state.identity?.name ?? owner.name : owner?.name ?? null,
    };
  };

  combatBonuses(): CombatBonuses {
    const b = this.bonus;
    return { long: b('long'), short: b('short'), barrage: b('barrage'), siege: b('siege'), suppression: b('suppression'), capture: b('capture'), morale: b('morale'), repair: b('repair'), hull: b('hull'), vsLong: b('vsLong'), vsBarrage: b('vsBarrage'), troops: b('troops') };
  }

  private fleetPower(roster: Readonly<Record<string, number>>): number {
    return Math.round(10 + SHIP_CLASSES.reduce((s, c) => s + c.attack * (roster[c.id] ?? 0), 0) / 3);
  }

  private groupPower(ships: readonly Squadron[]): number {
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

  private playerClaim = () => this.deps.world.claims.find((c) => c.kind === 'player')!;

  private colonyStars(): Set<string> {
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

  private dockStores(ships = this.docked()): Stores {
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

  targetStar = (targetId: string): StarSystem => {
    const cached = this.targetStars.get(targetId);
    if (cached) return cached;
    const t = ALIEN_TARGETS.find((x) => x.id === targetId)!;
    const owner = this.deps.world.neighbours.find((n) => n.name === t.owner);
    const home = this.deps.world.home.hex;
    const to = owner?.home.hex ?? home;
    const at = { q: Math.round(home.q + (to.q - home.q) * t.reach), r: Math.round(home.r + (to.r - home.r) * t.reach) };
    const star = this.deps.galaxy.nearestStar(at, 12) ?? this.deps.world.home;
    this.targetStars.set(targetId, star);
    return star;
  };

  /** Where each of our fleets is right now. */
  private fleetHexes(): Hex[] {
    const s = this.state;
    return s.fleets.filter((f) => s.loadouts[f.id]).map((f) => hexAt(f.movement, s.turn));
  }

  reached = (empire: string): boolean => {
    const claim = this.deps.world.claims.find((c) => c.name === empire);
    if (!claim) return false;
    return this.fleetHexes().some((h) => claim.colonies.some((c) => hexDistance(c.hex, h) <= c.radius));
  };

  /** Minerals a mining ship can work in a system: the belt plus its planets. */
  private deposits(star: StarSystem | null): Resource[] {
    if (!star) return [];
    const out = new Set<Resource>(BELT_MINERALS);
    for (const p of this.planets(star)) for (const r of Object.keys(BIOME_YIELDS[p.biome] ?? {})) out.add(r as Resource);
    return [...out];
  }

  private presence(): Presence {
    const s = this.state;
    const miners: Array<{ classId: string; count: number; deposits: Resource[] }> = [];
    const homeDeposits = this.deposits(s.home);
    for (const x of this.docked()) if (this.classById.get(x.classId)?.mines) miners.push({ ...x, deposits: homeDeposits });
    for (const g of this.groups()) {
      if (g.id === 'dock') continue;
      const deposits = g.stationed ? this.deposits(g.star) : [];
      for (const x of g.ships) if (this.classById.get(x.classId)?.mines) miners.push({ ...x, deposits });
    }
    const reached = this.deps.world.claims.map((c) => c.name).filter((n) => this.reached(n));
    return { miners, reached };
  }

  /** Show other players' fleets (from the server) on the map. */
  setOtherFleets(fleets: FleetView[]): void {
    this.others = fleets;
    this.view.fleets.setFleets(this.fleetViews());
  }

  /** Map fleets with a supply/ammunition line for the player's own. */
  private fleetViews(): FleetView[] {
    const s = this.state;
    return [...this.others, ...s.fleets.map((f): FleetView => {
      const l = s.loadouts[f.id];
      if (!l) return f;
      const cap = capacity(l.ships, specOf);
      const parts = [`Supply ${l.supply}/${cap.supply}`];
      if (cap.ammo) parts.push(`Ammo ${l.ammo}/${cap.ammo}`);
      return { ...f, status: parts.join(' · ') };
    })];
  }

  // ── Commands: map ──────────────────────────────────────────────────

  toggleView(): void {
    this.view.map.controller.zoom.toggle();
  }

  zoomTo(altitude: number): void {
    this.view.map.controller.zoom.setTargetAltitude(altitude);
  }

  /**
   * Fly to a star. closeUp dives into its system view; otherwise the camera pans there,
   * coming in only as far as a regional view when it is zoomed far out.
   */
  flyTo(star: StarSystem, closeUp = false): void {
    const cam = this.view.map.controller;
    cam.flyTo(star.position.x, star.position.z, closeUp ? SYSTEM_ALTITUDE : cam.zoom.targetAltitude > LOCATE_ALTITUDE ? LOCATE_ALTITUDE : undefined);
  }

  /** The empire's map colour: territory, fleets, routes and the selection outline. */
  empireColor(): string {
    return this.state.identity?.color ?? DEFAULT_EMPIRE_COLOR;
  }

  /** Opens the founding screen to edit the empire's name, colours and flag (set by main). */
  onEditEmpire: () => void = () => {};

  editEmpire(): void {
    this.onEditEmpire();
  }

  /**
   * Found the empire, or change its identity later: your fleets and ships take the new colour,
   * the capital colony takes its new name.
   */
  setIdentity(id: EmpireIdentity, founding: boolean): void {
    const s = this.state;
    const livery = (d: ShipDesign): ShipDesign => ({ ...d, colors: { ...d.colors, accent: id.color } });
    const fleets = s.fleets.map((f) => (s.loadouts[f.id] ? { ...f, color: id.color, design: livery(f.design) } : f));
    const designs = Object.fromEntries(Object.entries(s.designs).map(([k, d]) => [k, livery(d)]));
    const colonies = s.economy.colonies.map((c) => (c.capital ? { ...c, name: id.capital } : c));
    this.deps.store.update({ identity: id, fleets, designs, economy: { ...s.economy, colonies } });
    if (founding) this.dispatch(`The ${id.name} is founded. ${id.title} ${id.ruler} rules from ${id.capital}.`, 'good');
    else this.dispatch(`The empire is now known as the ${id.name}.`);
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

  select(star: StarSystem | null): void {
    if (this.state.selectedPlanet && this.state.selectedPlanet.starId !== star?.id) this.clearPlanetFocus();
    this.deps.store.update({ selected: star });
    if (star) {
      this.view.hexGrid.setSelected(star.hex.q, star.hex.r);
      this.view.selection.select({ x: star.position.x, z: star.position.z });
      this.view.sectors.highlightCell(addressOf(star.hex));
    } else {
      this.view.hexGrid.setSelected(1e9, 1e9);
      this.view.selection.select(null);
      this.view.sectors.highlightCell(null);
    }
  }

  focusPlanet(star: StarSystem, planet: Planet | null): void {
    if (this.state.selected?.id !== star.id) this.select(star);
    const cam = this.view.map.controller;
    if (!planet) {
      this.clearPlanetFocus();
      cam.flyTo(star.position.x, star.position.z, SYSTEM_ALTITUDE);
      return;
    }
    this.deps.store.update({ selectedPlanet: planet });
    this.view.system.setSelected(planet.id);
    if (cam.zoom.targetAltitude > 2) {
      // From afar: fly to the system first; follow once it has been built.
      cam.flyTo(star.position.x, star.position.z, SYSTEM_ALTITUDE);
      setTimeout(() => this.followPlanet(planet), 900);
    } else this.followPlanet(planet);
  }

  private followPlanet(planet: Planet): void {
    if (this.state.selectedPlanet?.id !== planet.id) return;
    this.view.map.controller.followTarget(() => this.view.system.planetPosition(planet.id), 0.07);
  }

  private clearPlanetFocus(): void {
    this.deps.store.update({ selectedPlanet: null });
    this.view.system.setSelected(null);
    this.view.map.controller.followTarget(null);
  }

  // ── Commands: fleets ───────────────────────────────────────────────


  private designOf(ships: readonly Squadron[]): ShipDesign {
    const lead = [...ships].sort((a, b) => (this.classById.get(b.classId)?.hull ?? 0) - (this.classById.get(a.classId)?.hull ?? 0))[0];
    return this.effectiveDesign(lead?.classId ?? this.state.shipyardClass);
  }

  formFleet(ships: Squadron[], to: StarSystem, name?: string): void {
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
    this.dispatch(`${label} departs for ${to.name} (${formatDuration(travelTurns(hexDistance(s.home.hex, to.hex), speed), CLOCK)})`);
  }

  moveFleet(fleetId: string, to: StarSystem, quiet = false): void {
    this.moveFleetToHex(fleetId, to.hex, to.name, quiet);
  }

  /** Send a fleet to any hex: a star system or empty space. */
  moveFleetToHex(fleetId: string, to: Hex, label: string, quiet = false): void {
    const s = this.state;
    const f = s.fleets.find((x) => x.id === fleetId);
    const l = s.loadouts[fleetId];
    if (!f || !l) return;
    const from = hexAt(f.movement, s.turn);
    if (hexEquals(from, to)) return;
    const speed = this.fleetSpeed();
    const moved = { ...f, movement: planMovement(from, to, s.turn, speed) };
    this.deps.store.update({ fleets: s.fleets.map((x) => (x.id === fleetId ? moved : x)) });
    if (!quiet) this.dispatch(`${f.name} sets course for ${label} (${formatDuration(travelTurns(hexDistance(from, to), speed), CLOCK)})`);
  }

  setOrders(fleetId: string, orders: FleetOrders): void {
    const l = this.state.loadouts[fleetId];
    if (l) this.deps.store.update((st) => ({ loadouts: { ...st.loadouts, [fleetId]: { ...l, orders } } }));
  }

  returnHome(fleetId: string): void {
    this.moveFleet(fleetId, this.state.home);
  }

  dockFleet(fleetId: string): void {
    const s = this.state;
    const f = s.fleets.find((x) => x.id === fleetId);
    if (!f || !s.loadouts[fleetId]) return;
    if (!isStationed(f.movement, s.turn) || !hexEquals(hexAt(f.movement, s.turn), s.home.hex)) return;
    const { [fleetId]: _gone, ...loadouts } = s.loadouts;
    this.deps.store.update({ fleets: s.fleets.filter((x) => x.id !== fleetId), loadouts });
    this.dispatch(`${f.name} docks at ${s.home.name}`);
  }

  /** Locate a fleet: select and centre on it; closeUp also zooms in to the ship. */
  focusFleet(fleetId: string, closeUp = false): void {
    if (fleetId === 'dock') return this.flyTo(this.state.home, closeUp);
    this.selectFleet(fleetId, closeUp);
  }

  /** Select a fleet and keep the camera centred on its ship (right-drag orbits it); null clears. */
  selectFleet(fleetId: string | null, zoomIn = false): void {
    const cam = this.view.map.controller;
    if (!fleetId) {
      if (this.state.selectedFleet) {
        this.deps.store.update({ selectedFleet: null });
        this.view.fleets.setSelected(null);
        cam.followTarget(null);
      }
      return;
    }
    if (!this.state.fleets.some((f) => f.id === fleetId) && !this.others.some((f) => f.id === fleetId)) return;
    if (this.state.selectedPlanet) { this.deps.store.update({ selectedPlanet: null }); this.view.system.setSelected(null); }
    this.deps.store.update({ selectedFleet: fleetId });
    this.view.fleets.setSelected(fleetId);
    // Selecting keeps the zoom; only a double-click or the Zoom button closes in on the ship.
    cam.followTarget(() => this.view.fleets.positionOf(fleetId), zoomIn ? FLEET_ALTITUDE : undefined);
  }

  fleetInfo = (fleetId: string): FleetInfo | null => {
    const s = this.state;
    const fleet = s.fleets.find((f) => f.id === fleetId) ?? this.others.find((f) => f.id === fleetId);
    if (!fleet) return null;
    const m = fleet.movement;
    return {
      fleet,
      group: this.groups().find((g) => g.id === fleetId) ?? null,
      at: isStationed(m, s.turn) ? this.deps.galaxy.starAt(hexAt(m, s.turn)) : null,
      dest: this.deps.galaxy.starAt(m.route[m.route.length - 1]),
      eta: Math.max(0, arrivalTurn(m) - s.turn),
      // Your own deployed fleets are the ones with a loadout (ships, supply, ammunition).
      mine: !!s.loadouts[fleetId] && s.fleets.some((f) => f.id === fleetId),
    };
  };

  /** Change a group's ships (and the empire roster); empty fleets disband. */
  private adjustGroup(groupId: string, delta: Squadron[], stores?: Partial<Stores>): void {
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

  private starOfPlanet(planet: Planet): StarSystem | null {
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
    return true;
  }

  exploreAll(star: StarSystem): void {
    let n = 0;
    const pending = this.planets(star).filter((p) => !this.state.explored[p.id] && !this.colonyAt(p.id));
    for (const p of pending) if (this.explore(p, true)) n++;
    if (n < pending.length) this.dispatch(`Explored ${n} of ${pending.length} planets in ${star.name}: out of supply. Return home to resupply, or bring survey ships.`, n ? undefined : 'bad');
  }

  collectCrate(planetId: string): void {
    const s = this.state;
    const crate = s.explored[planetId]?.crate;
    if (!crate || s.openedCrates.includes(planetId)) return;
    this.deps.store.update({ empire: applyCrate(s.empire, crate, this.deps.tree), openedCrates: [...s.openedCrates, planetId] });
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

  collectResources(star: StarSystem): Haul | null {
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
    for (const id of crates) {
      const crate = s.explored[id].crate!;
      for (const c of crate.cards) if (c.type === 'materials') haul = addHaul(haul, { [c.material]: c.amount });
      empire = applyCrate(empire, crate, this.deps.tree);
    }
    this.deps.store.update({
      empire,
      openedCrates: [...s.openedCrates, ...crates],
      collectedCaches: [...s.collectedCaches, ...caches.map((c) => c.planet.id)],
    });
    const text = Object.entries(haul).map(([r, n]) => `+${n} ${RESOURCES.find((x) => x.id === r)?.short ?? r}`).join('  ');
    this.dispatch(`Collected from ${star.name}: ${text || 'cards'}${crates.length ? ` · ${crates.length} crate${crates.length > 1 ? 's' : ''} opened` : ''}`, 'good');
    return haul;
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
    this.deps.store.update((s) => ({ designs: { ...s.designs, [id]: normalizeDesign(design) } }));
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
  private launchShip(classId: string, yard: Colony): void {
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
    this.deps.report?.('colony', `settled ${planet.name} in ${star.name}`);
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
    this.deps.report?.('depot', `built a supply depot at ${star.name}`);
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
    if (!canAfford(s.empire.materials, b.cost)) return this.dispatch(`Not enough resources for a ${b.name}`, 'bad');
    const construction = enqueue(s.construction, { kind: 'building', item: b.id, site: planetId }, b.years, s.turn);
    const job = construction[construction.length - 1];
    this.deps.store.update({ empire: { ...s.empire, materials: pay(s.empire.materials, b.cost) }, construction });
    this.dispatch(`${b.name} under construction on ${colony.name}: ready in ${formatDuration(job.doneTurn - s.turn, CLOCK)}`);
  }

  /** Finish construction due by this year; returns what was completed. */
  private completeConstruction(): string[] {
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

  /** Standing orders: fleets explore and head home for supply on their own. */
  private followOrders(): string[] {
    const s = this.state;
    const news: string[] = [];
    for (const f of s.fleets) {
      const l = s.loadouts[f.id];
      if (!l?.orders || !isStationed(f.movement, s.turn)) continue;
      const star = this.deps.galaxy.starAt(hexAt(f.movement, s.turn));
      if (!star) continue;
      const left = () => this.planets(star).filter((p) => !this.state.explored[p.id] && !this.colonyAt(p.id));
      if (l.orders.autoExplore) {
        const before = left().length;
        for (const p of left()) this.explore(p, true);
        const n = before - left().length;
        if (n) news.push(`${f.name} surveyed ${n} planet${n > 1 ? 's' : ''} in ${star.name}`);
      }
      const now = this.state.loadouts[f.id];
      const atHome = star.id === s.home.id;
      const cap = capacity(now?.ships ?? [], specOf).supply;
      const stuck = now && !atHome && !this.isFriendly(star) && now.supply < cap && !left().some((p) => exploreCost(p) <= now.supply);
      if (l.orders.autoReturn && stuck) {
        this.moveFleet(f.id, s.home, true);
        news.push(`${f.name} is heading home to resupply`);
      }
    }
    return news;
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

  toggleRoute(partnerId: string): void {
    const s = this.state;
    const has = s.economy.routes.some((r) => r.partnerId === partnerId);
    const routes = has ? s.economy.routes.filter((r) => r.partnerId !== partnerId) : [...s.economy.routes, { partnerId }];
    this.deps.store.update({ economy: { ...s.economy, routes } });
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
    const target = ALIEN_TARGETS.find((t) => t.id === targetId);
    const committed = ships.filter((x) => x.count > 0);
    if (!target || s.engaged.includes(targetId) || !committed.length) return null;
    const at = this.targetStar(targetId);
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
    let outcome: CombatOutcome;
    let colonies = s.economy.colonies;
    if (target.kind === 'fleet') {
      const result = resolveBattle(me, target.fleet!, SHIP_CLASSES, seed);
      applySurvivors(result.survivors[0]);
      reverseEngineer(result.captured[0]);
      const caps = result.captured[0].reduce((a, x) => a + x.count, 0);
      const summary = result.winner === 0 ? `Victory over the ${target.name}${caps ? `; ${caps} ship${caps > 1 ? 's' : ''} captured for reverse engineering` : ''}` : result.winner === 1 ? `Defeat against the ${target.name}` : `Stalemate with the ${target.name}`;
      outcome = { kind: 'fleet', result, summary };
    } else {
      const result = resolveAssault(me, target.planet!, SHIP_CLASSES, seed);
      applySurvivors(result.survivors);
      if (result.space) reverseEngineer(result.space.captured[0]);
      if (result.captured) {
        colonies = [...colonies, { name: target.planet!.name, biome: target.owner.startsWith('Krell') ? 'toxic' : 'volcanic', starId: at.id, size: 3, buildings: [] }];
        const pool = (this.deps.economy.alienTech[target.owner] ?? []).filter((id) => !research.researched.includes(id));
        for (const id of pool.slice(0, 2)) research = this.deps.tree.grantShards(research, id, 'reverse-engineering', 40);
      }
      const summary = result.captured ? `${target.planet!.name} captured — new colony and alien tech fragments`
        : result.phaseReached === 'space' ? `Assault on ${target.planet!.name} failed in orbit`
        : result.phaseReached === 'bombardment' ? `Bombardment of ${target.planet!.name} could not break its defences — bring siege ships`
        : `Landing on ${target.planet!.name} repelled: ${result.troopsLanded} troops vs ${result.troopsNeeded} needed`;
      outcome = { kind: 'planet', result, summary };
    }
    if (fire.factor < 1) outcome = { ...outcome, summary: `${outcome.summary} (fought at ${Math.round(fire.factor * 100)}% firepower: low ammunition)` };
    this.deps.store.update({ empire: { ...s.empire, research }, engaged: [...s.engaged, targetId], economy: { ...s.economy, colonies } });
    this.adjustGroup(groupId, delta, { ammo: group.stores.ammo - fire.spent });
    this.dispatch(outcome.summary, /Victory|captured/.test(outcome.summary) ? 'good' : 'bad');
    this.deps.report?.('battle', `${outcome.summary} at ${at.name}`);
    return outcome;
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

  /** Abandon this empire and found a new one in the current year. */
  resetEmpire(): void {
    // Stop first: the reload fires pagehide, which would otherwise save the old empire again.
    this.deps.save.stop();
    this.deps.save.clear();
    location.reload();
  }

  /** Development aid: advance one year now instead of waiting a minute. */
  skipYear(): void {
    this.step(false);
  }

  /** Resolve one year: economy, research, logistics. */
  private step(quiet: boolean): { income: Partial<Record<Resource, number>>; arrivals: string[] } {
    const s = this.state;
    const { economy, research, report } = resolveTurn({ ...s.economy, stock: s.empire.materials }, s.empire.research, s.turn, this.deps.economy, this.presence());
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
    const news = quiet ? [] : [
      ...arrivals.map((text) => ({ turn: next, text, tone: 'good' as const })),
      ...report.lines.filter((l) => !previous.has(l) && !ROUTINE.test(l)).map((text) => ({ turn: next, text })),
    ];
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
    // Construction finishing this year, then fleets acting on standing orders.
    const done = [...this.completeConstruction(), ...this.followOrders()];
    if (!quiet && done.length) this.deps.store.update((st) => ({ dispatches: [...done.map((text) => ({ turn: next, text, tone: 'good' as const })), ...st.dispatches].slice(0, 40) }));
    return { income: report.income, arrivals: [...arrivals, ...done] };
  }

  private dispatch(text: string, tone?: 'good' | 'bad'): void {
    this.deps.store.update((s) => ({ dispatches: [{ turn: s.turn, text, tone }, ...s.dispatches].slice(0, 40) }));
  }

  openPanel(id: PanelId): void {
    for (const [pid, panel] of Object.entries(this.view.panels)) {
      if (pid === id) panel.toggle();
      else panel.close();
    }
    this.view.topBar.setActivePanel(this.openPanelId());
  }

  private openPanelId(): PanelId | null {
    return (Object.entries(this.view.panels).find(([, p]) => p.opened)?.[0] as PanelId | undefined) ?? null;
  }

  // ── Map input & frame ──────────────────────────────────────────────

  handleClick = (world: THREE.Vector3, ray: THREE.Raycaster): void => {
    const v = this.view.map.view;
    if (!v) return;
    const fleet = this.view.fleets.pick(ray);
    // Click selects a ship; double-click also zooms in to it.
    if (fleet) return this.selectFleet(fleet, this.isDoubleClick(`fleet:${fleet}`));
    if (this.state.selectedFleet) this.selectFleet(null);
    if (v.visibleWidth < SYSTEM_VIEW_WIDTH) {
      const planet = this.view.system.pick(ray);
      const star = this.view.system.system;
      if (planet && star) return this.focusPlanet(star, planet);
      if (this.state.selectedPlanet) return this.clearPlanetFocus();
    }
    const h = worldToHex(world.x, world.z);
    if (v.visibleWidth > 1_200) {
      this.view.map.controller.flyTo(world.x, world.z, Math.max(40, v.altitude / 12));
      return;
    }
    const reach = Math.min(6, Math.max(1, Math.round(v.visibleWidth * 0.012)));
    const star = this.deps.galaxy.nearestStar(h, reach);
    // Double-click a star to dive into its system.
    if (star && this.isDoubleClick(star.id)) {
      this.select(star);
      this.flyTo(star, true);
      return;
    }
    this.select(star);
  };

  /** Records a click on `id`; true when it is the second click on it within DOUBLE_CLICK_MS. */
  private isDoubleClick(id: string): boolean {
    const now = performance.now();
    const double = !!this.lastClick && this.lastClick.id === id && now - this.lastClick.at < DOUBLE_CLICK_MS;
    this.lastClick = double ? null : { id, at: now };
    return double;
  }

  /** RTS move order: right-click with one of your fleets selected sends it there. */
  handleRightClick = (world: THREE.Vector3): void => {
    const id = this.state.selectedFleet;
    const info = id ? this.fleetInfo(id) : null;
    if (!id) return;
    if (!info?.mine) return this.dispatch(`${info?.fleet.name ?? 'That fleet'} is not yours to command`, 'bad');
    // A star right under the click (within a couple of percent of the view) is the target;
    // anywhere else, the fleet goes to that exact hex of empty space.
    const v = this.view.map.view;
    const clicked = worldToHex(world.x, world.z);
    const snap = v ? Math.min(30, Math.round(v.visibleWidth * 0.015)) : 0;
    const star = this.deps.galaxy.nearestStar(clicked, snap);
    const fleet = info.fleet;
    if (star) {
      if (info.at?.id === star.id) return this.dispatch(`${fleet.name} is already at ${star.name}`);
      this.moveFleet(id, star);
      this.view.selection.select({ x: star.position.x, z: star.position.z });
      return;
    }
    if (hexEquals(hexAt(fleet.movement, this.state.turn), clicked)) return this.dispatch(`${fleet.name} is already there`);
    const p = hexToWorld(clicked);
    this.moveFleetToHex(id, clicked, `deep space at ${formatAddress(addressOf(clicked))}`);
    this.view.selection.select({ x: p.x, z: p.z });
  };

  handleHover = (world: THREE.Vector3 | null, ray: THREE.Raycaster): void => {
    const shipUnder = this.view.fleets.pick(ray);
    if (shipUnder) {
      const f = this.state.fleets.find((x) => x.id === shipUnder);
      this.view.map.canvas.style.cursor = 'pointer';
      this.view.hud.setHover(`${f?.name ?? 'Fleet'}  ·  ${f?.owner === this.state.playerName ? 'click to select, then right-click a star or empty space to move' : f?.owner.replace('alien:', '') ?? ''}`);
      return;
    }
    const v0 = this.view.map.view;
    if (v0 && v0.visibleWidth < SYSTEM_VIEW_WIDTH) {
      const planet = this.view.system.pick(ray);
      this.view.system.setHover(planet?.id ?? null);
      this.view.map.canvas.style.cursor = planet ? 'pointer' : '';
      if (planet) {
        this.view.hud.setHover(`${planet.name}  ·  ${planet.biome}  ·  size ${planet.size}  ·  click to focus`);
        return;
      }
    } else this.view.map.canvas.style.cursor = '';
    if (!world) return;
    const h = worldToHex(world.x, world.z);
    this.view.hexGrid.setHover(h.q, h.r);
    const v = this.view.map.view;
    const star = v && v.visibleWidth < 1_200 ? this.deps.galaxy.starAt(h) : null;
    const dist = hexDistance(h, this.deps.world.home.hex);
    this.view.hud.setHover(`${formatAddress(addressOf(h))}${star ? `  ·  ${star.name}` : ''}  ·  ${dist.toLocaleString('en-US')} ly from home`);
  };

  /**
   * Fractional year the ships are drawn at: continuous wall-clock time, held within the
   * year the empire is in. At a year boundary the clock rolls over a moment before the
   * tick arrives; holding at the year's end keeps ships from stepping back and forth.
   */
  private fleetTime(): number {
    const now = this.deps.clock.tick() + this.deps.clock.fraction();
    return Math.min(this.state.turn + 1, Math.max(this.state.turn, now));
  }

  onFrame = (view: ViewState): void => {
    this.view.topBar.setGalaxyMode(view.galaxyMode);
    // Ships glide through the current year toward next year's position.
    this.view.fleets.setTime(this.fleetTime());
    const mode = this.state.selectedPlanet ? 'Planet view' : view.visibleWidth < SYSTEM_VIEW_WIDTH ? 'System view' : view.visibleWidth < 420 ? 'Hex view' : view.visibleWidth < 7_000 ? 'Sector view' : 'Galaxy view';
    const pxPerLy = this.view.map.viewportWidth() / view.visibleWidth;
    this.view.hud.setScale(view.visibleWidth, pxPerLy, mode, view.altitude);
  };
}

/** Trade partners derived from the world, with distances from home. */
export function tradePartners(world: World, home: StarSystem): TradePartner[] {
  const dist = (h: { q: number; r: number }) => hexDistance(home.hex, h);
  const mine = world.claims.find((c) => c.kind === 'player')!;
  return [
    ...mine.colonies.slice(1).map((c, i) => ({ id: `colony-${i}`, name: `Colony ${['Aster', 'Brannoc', 'Cirrus', 'Daleth'][i] ?? i + 1}`, kind: 'colony' as const, distance: Math.max(1, dist(c.hex)) })),
    ...world.neighbours.map((n) => ({ id: n.name, name: n.name, kind: n.kind === 'alien' ? ('alien' as const) : ('player' as const), distance: dist(n.home.hex) })),
  ];
}
