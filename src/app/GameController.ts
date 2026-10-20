import { RESOURCES } from '../content/resources';
import { isMegastructure } from '../content/megastructures';
import { BIOMES } from '../content/biomes';
import * as THREE from 'three';
import { specOf } from '../content/logistics';
import { arrivalTurn, hexAt, planMovement } from '../core/fleet/Fleet';
import { territoryOf } from '../core/npc/NpcCatalog';
import { hashSeed } from '../core/rng/Rng';
import { DEFAULT_DESIGN } from '../core/ships/ShipDesign';
import type { TerritoryClaim } from '../render/map/TerritoryLayer';
import { WorldClock } from './WorldClock';
import type { SaveGame } from './SaveGame';
import { capacity } from '../core/fleet/Logistics';
import { inBattle, isStationed, type ForeignFleet } from '../core/fleet/Presence';
import { flipRecord, type BattleRecord } from '../core/combat/BattleRecord';
import { classDesign } from '../core/ships/ClassDesign';
import type { ShipDesign } from '../core/ships/ShipDesign';
import type { FleetMovement } from '../core/fleet/Fleet';
import type { BattleLayer, BattleSide, BattleTarget } from '../render/battle/BattleLayer';
import { NO_ENDING, type StageEnding } from '../render/battle/BattleStage';
import { cleanRecords } from '../core/combat/BattleLog';
import type { BattleMarkerLayer } from '../render/map/BattleMarkerLayer';
import type { ForeignBattle } from './ServerSync';
import { ownClaim } from './ServerSync';
import { addressOf, formatAddress } from '../core/galaxy/GalacticAddress';
import { StarSystem } from '../core/galaxy/GalaxyModel';
import { Planet } from '../core/galaxy/Planets';
import { Hex, hexDistance, hexEquals, hexRing, hexToWorld, worldToHex } from '../core/hex/Hex';
import { ALL_SEEING, type Sight, type StarLens } from '../core/visibility/Vision';
import type { FleetLayer, FleetView } from '../render/map/FleetLayer';
import type { HexGridLayer } from '../render/map/HexGridLayer';
import type { ViewState } from '../render/map/MapLayer';
import type { MapView } from '../render/map/MapView';
import type { SectorOverlayLayer } from '../render/map/SectorOverlayLayer';
import type { SelectionLayer } from '../render/map/SelectionLayer';
import { SYSTEM_EXTENT, SYSTEM_VIEW_WIDTH, SystemLayer, planetRadius } from '../render/map/SystemLayer';
import type { SurfaceLayer, SurfaceTarget } from '../render/planets/surface/SurfaceLayer';
import type { MegaSurfaceLayer, MegaSurfaceTarget } from '../render/megastructures/surface/MegaSurfaceLayer';
import { hasMegaSurface } from '../core/mega/MegaGround';
import { starColor } from '../render/stars/StarVisuals';
import { foreignSeat, type SettlementInput } from '../core/surface/SurfaceLayout';
import type { Drawer } from '../ui/Drawer';
import type { CityEntry, FleetInfo, GameActions, GameQueries, LandingSpot, PanelId } from '../ui/GameActions';
import { planetLayout } from '../render/planets/planetLayouts';
import type { Hud } from '../ui/Hud';
import type { TopBar } from '../ui/TopBar';
import type { GameState } from './GameState';
import { populationOf } from '../core/economy/Population';
import { routePath, systemRoute } from './Routes';
import { touchFirst } from '../ui/dom';

import { EmpireSim, SimDeps, type OtherEmpire } from '../sim/EmpireSim';

export interface ControllerDeps extends SimDeps {
  readonly clock: WorldClock;
  readonly save: SaveGame;
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
  /** The planet close-up below planet view. */
  readonly surface: SurfaceLayer;
  /** Landed on a megastructure (change mega-surfaces). */
  readonly mega: MegaSurfaceLayer;
  /** The battle view, and the map's markers of battles you can watch. */
  readonly battle: BattleLayer;
  readonly battleMarkers: BattleMarkerLayer;
}

/** A battle at sea you can see: one of its fleets (yours first) and the round it is at. */
interface Sighting {
  /** Both fleets, sorted: the battle's id. */
  readonly key: string;
  /** The fleet seen in it, and its foe (`${ownerId}:${fleetId}`). */
  readonly fleet: string;
  readonly foe: string;
  /** Your own fleet's id, when it is yours. */
  readonly fleetId: string | null;
  readonly tick: number;
  readonly round: number;
  readonly name: string;
  readonly foeName: string;
  readonly foeEmpire: string;
  readonly record: BattleRecord | null;
  readonly movement: FleetMovement;
}

/** Camera altitude (ly) that frames a whole star system. */
const SYSTEM_ALTITUDE = 0.45;
/** Camera altitude (ly) of planet view: following a planet in its orbit. */
const PLANET_ALTITUDE = 0.07;
/** Far enough back to take in a whole megastructure. */
const MEGA_ALTITUDE = 0.45;
/** Camera altitude (ly) when following a ship: close enough to see the hull. */
const FLEET_ALTITUDE = 0.03;
/** Locate buttons pan to their target and come no closer than this (a regional view); double-click dives in. */
const LOCATE_ALTITUDE = 48;
/** Two clicks on the same thing within this many ms are a double-click. */
const DOUBLE_CLICK_MS = 400;

/** Application service: the view on top of the rules (EmpireSim): camera, selection, input and panels. */
export class GameController extends EmpireSim implements GameActions, GameQueries {
  constructor(protected override readonly deps: ControllerDeps) {
    super(deps);
  }

  private view!: ViewDeps;
  private lastClick: { id: string; at: number } | null = null;

  /**
   * What the player sees (change admin-snapshots-and-fog), set by main: what they pick, hover, fly
   * to and read goes through it. The rules (EmpireSim) never do.
   */
  lens: () => StarLens = () => ALL_SEEING;

  /** A star as the player knows it: null when hidden from them, a megastructure not yet found as an ordinary star. */
  seeStar = (star: StarSystem): StarSystem | null => this.lens().see(star);

  /** How a star shows to the player: explored, sighted, fogged (uncharted) or hidden. */
  sightOf = (star: StarSystem): Sight => this.lens().sight(star);

  /** The nearest star to a hex the player can see, within `reach` (as the player knows it). */
  private nearestSeen(h: Hex, reach: number): StarSystem | null {
    const lens = this.lens();
    if (!lens.hideSystems) {
      const star = this.deps.galaxy.nearestStar(h, reach);
      return star && lens.see(star);
    }
    for (let k = 0; k <= reach; k++) {
      for (const c of hexRing(h, k)) {
        const star = this.deps.galaxy.starAt(c);
        const seen = star && lens.see(star);
        if (seen) return seen;
      }
    }
    return null;
  }

  /** What the player sees changed: a selected star now hidden is let go; a megastructure just found shows. */
  refreshSight(): void {
    const sel = this.state.selected;
    if (!sel) return;
    const raw = this.deps.galaxy.starAt(sel.hex);
    const seen = raw && this.lens().see(raw);
    if (!seen) return this.select(null);
    if (seen.megastructure !== sel.megastructure || seen.planetCount !== sel.planetCount) this.deps.store.update({ selected: seen });
  }
  /** Other players' fleets in the shared galaxy (drawn and selectable, never simulated here). */
  private others: FleetView[] = [];

  attach(view: ViewDeps): void {
    this.view = view;
    view.hexGrid.setHome(this.deps.world.home.hex.q, this.deps.world.home.hex.r);
    this.deps.store.subscribe((s, prev) => {
      if (s.fleets !== prev.fleets || s.loadouts !== prev.loadouts) view.fleets.setFleets(this.fleetViews());
      if (s.fleets !== prev.fleets || s.loadouts !== prev.loadouts || s.turn !== prev.turn) this.refreshBattles();
      if (s.fleets !== prev.fleets || s.loadouts !== prev.loadouts || s.explored !== prev.explored || s.turn !== prev.turn) this.refreshSurveyPlans();
      // A finished building or a new colony shows up on the planet being viewed.
      if (s.selectedPlanet !== prev.selectedPlanet || s.economy.colonies !== prev.economy.colonies || s.explored !== prev.explored) this.refreshSurface();
    });
    // Up close, a surveyor flies to the planet it is surveying (when that system is drawn).
    view.fleets.surveyPoint = (id) => {
      const p = this.surveyTargetCached(id);
      return p ? view.system.planetPosition(p.id) : null;
    };
    this.refreshSurveyPlans();
    for (const [id, panel] of Object.entries(view.panels)) panel.onChange(() => view.topBar.setActivePanel(this.openPanelId() ?? (panel.opened ? (id as PanelId) : null)));
    view.fleets.setTime(this.fleetTime());
    view.fleets.setFleets(this.fleetViews());
    this.refreshBattles();
    // Zooming in close pulls the view onto the nearest star, so you land in its system. Once the
    // system is drawn and the cursor is over it, the zoom goes where the cursor is instead: to a
    // planet, a belt or a megastructure, not back to the star.
    view.map.controller.attractor = (ground, width, touch) => {
      if (width > 25) return null;
      const reach = Math.max(1, Math.round(width * 0.15));
      const star = this.nearestSeen(worldToHex(ground.x, ground.z), reach);
      if (star && width < SYSTEM_VIEW_WIDTH && Math.hypot(star.position.x - ground.x, star.position.z - ground.z) < SYSTEM_EXTENT) return null;
      // Pinch zoom (touch) also snaps to ships: whichever, star or ship, is closer to the fingers.
      const ship = touch ? view.fleets.nearest(ground.x, ground.z, reach) : null;
      const starDist = star ? Math.hypot(star.position.x - ground.x, star.position.z - ground.z) : Infinity;
      if (ship && ship.dist < starDist) {
        const at = view.fleets.positionOf(ship.id)!;
        return { x: at.x, z: at.z, follow: () => view.fleets.positionOf(ship.id) };
      }
      return star ? star.position : null;
    };
  }

  private empires: readonly OtherEmpire[] = [];

  /** Other players' empires from the live feed: diplomacy and allied systems. */
  setOtherEmpires(list: readonly OtherEmpire[]): void {
    this.empires = list;
    // Another empire's main world shows its city lights.
    this.view?.system.refreshLights();
  }

  protected override otherEmpires(): readonly OtherEmpire[] {
    return this.empires.length ? this.empires : super.otherEmpires();
  }

  /** Another player's fleet from the live feed (for chasing it): `${ownerId}:${fleetId}`. */
  protected override foreignFleet(key: string): ForeignFleet | null {
    const f = this.others.find((x) => x.id === key);
    return f ? { name: f.name.split(' · ')[0], empire: f.owner, movement: f.movement } : super.foreignFleet(key);
  }

  /** Show other players' fleets (from the server) on the map, and the battles they are in. */
  setOtherFleets(fleets: FleetView[], battles: readonly ForeignBattle[] = []): void {
    this.others = fleets;
    this.otherBattles = battles;
    this.view.fleets.setFleets(this.fleetViews());
    this.refreshBattles();
  }

  // ── Battles at sea: markers and the battle view ───────────────────

  private otherBattles: readonly ForeignBattle[] = [];

  private get myKey(): string {
    return this.me;
  }

  /** Every battle at sea you can see now (fought this year or last), yours first, one per battle. */
  private sightings(): Sighting[] {
    const s = this.state, out = new Map<string, Sighting>();
    const pair = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
    for (const f of s.fleets) {
      const b = s.loadouts[f.id]?.battle;
      if (!b || !inBattle(b, s.turn)) continue;
      const fleet = `${this.myKey}:${f.id}`, key = pair(fleet, b.foe);
      out.set(key, { key, fleet, foe: b.foe, fleetId: f.id, tick: b.tick, round: b.round, name: f.name, foeName: b.foeName, foeEmpire: b.foeEmpire, record: b.view ?? null, movement: f.movement });
    }
    for (const b of [...this.otherBattles].sort((x, y) => (x.fleet < y.fleet ? -1 : 1))) {
      if (b.tick < s.turn - 1) continue;
      const v = this.others.find((x) => x.id === b.fleet);
      if (!v) continue;
      const key = pair(b.fleet, b.foe);
      const seen = out.get(key);
      // Keep the newest round; between equals, the view from your own fleet (or the first fleet).
      if (seen && (seen.tick > b.tick || (seen.tick === b.tick && seen.round >= b.round))) {
        if (!seen.record && b.view) out.set(key, { ...seen, record: flipRecord(b.view) });
        continue;
      }
      out.set(key, { key, fleet: b.fleet, foe: b.foe, fleetId: null, tick: b.tick, round: b.round, name: v.name.split(' · ')[0], foeName: b.foeName, foeEmpire: b.foeEmpire, record: b.view ?? (seen?.record ? flipRecord(seen.record) : null), movement: v.movement });
    }
    return [...out.values()];
  }

  /** A fleet's battle you can watch (yours by id, another player's by `${ownerId}:${fleetId}`). */
  battleOf = (fleetId: string): { round: number; foeName: string; foeEmpire: string } | null => {
    const key = fleetId.includes(':') ? fleetId : `${this.myKey}:${fleetId}`;
    const sg = this.sightings().find((x) => x.fleet === key || x.foe === key);
    if (!sg) return null;
    return sg.fleet === key ? { round: sg.round, foeName: sg.foeName, foeEmpire: sg.foeEmpire } : { round: sg.round, foeName: sg.name, foeEmpire: this.sideOf(sg.fleet, sg.name, '').empire };
  };

  /** Open the battle view on a fleet's battle. */
  watchBattle(fleetId: string): void {
    const key = fleetId.includes(':') ? fleetId : `${this.myKey}:${fleetId}`;
    const sg = this.sightings().find((x) => x.fleet === key || x.foe === key);
    if (sg) this.openBattle(sg.key);
  }

  /** Open the battle view on a battle by its id (a map marker). */
  openBattle(key: string): void {
    const target = this.battleTarget(key);
    if (!target) return this.dispatch('No round of that battle to show yet: it is drawn once a round has been fought.');
    this.view.battle.open(target);
  }

  leaveBattle(): void {
    const wasReplay = !!this.view.battle.current?.replay;
    this.view.battle.close();
    // Back to the panel the replay was started from (the War Room's battle log).
    const back = this.replayFrom;
    this.replayFrom = null;
    if (wasReplay && back && !this.openPanelId()) this.openPanel(back);
  }

  /** The panel a replay was started from, opened again when it is left. */
  private replayFrom: PanelId | null = null;

  /**
   * Play back a battle from the log (change battle-replay): every round it kept, in the battle
   * view, on its own clock. A battle at sea is logged a round an entry: its earlier rounds come
   * from the entries before it.
   */
  replayBattle(entryId: string): void {
    const log = this.state.battleLog ?? [];
    const entry = log.find((e) => e.id === entryId);
    if (!entry) return;
    let rounds = cleanRecords(entry.records);
    if ((entry.kind === 'sea' || entry.kind === 'pursuit') && entry.round && entry.fleetId) {
      const byRound = new Map<number, BattleRecord>();
      for (const e of log) {
        if ((e.kind !== 'sea' && e.kind !== 'pursuit') || e.fleetId !== entry.fleetId || e.foe !== entry.foe || !e.round || e.round > entry.round || e.year > entry.year) continue;
        const r = cleanRecords(e.records)[0];
        if (r && !byRound.has(e.round)) byRound.set(e.round, r);
      }
      // The rounds that run unbroken up to this one.
      const run: BattleRecord[] = [];
      for (let k = entry.round; byRound.has(k); k--) run.unshift(byRound.get(k)!);
      if (run.length) rounds = run;
    }
    if (!rounds.length) return this.dispatch('That battle was logged before replays were kept: only its summary is left.');
    const s = this.state;
    // The panels make way for the battle view while it plays.
    this.replayFrom = this.openPanelId() ?? this.replayFrom;
    for (const panel of Object.values(this.view.panels)) panel.close();
    this.view.topBar.setActivePanel(null);
    const us = entry.fleetId ? `${this.myKey}:${entry.fleetId}` : `${this.myKey}:dock`;
    this.view.battle.open({
      key: `log:${entry.id}`, tick: entry.year, record: rounds[0], fleetId: null, place: entry.place?.name ?? 'deep space',
      sides: [{ ...this.sideOf(us, entry.ours, ''), name: entry.ours, empire: s.identity?.name ?? s.playerName }, { ...this.sideOf(`log-foe:${entry.foe}`, entry.foe, entry.foeEmpire), color: '#f2a541' }],
      replay: { rounds, from: this.view.battle.now, year: entry.year },
    });
  }

  private battleTarget(key: string): BattleTarget | null {
    const sg = this.sightings().find((x) => x.key === key);
    if (!sg?.record) return null;
    const star = this.deps.galaxy.starAt(hexAt(sg.movement, sg.tick));
    return {
      key: sg.key, tick: sg.tick, record: sg.record, fleetId: sg.fleetId, place: star?.name ?? 'deep space',
      sides: [this.sideOf(sg.fleet, sg.name, ''), this.sideOf(sg.foe, sg.foeName, sg.foeEmpire)],
    };
  }

  /** A fleet of a battle as the view draws it: name, empire, colour and ship designs. */
  private sideOf(fleetKey: string, name: string, empire: string): BattleSide {
    const s = this.state;
    if (fleetKey.startsWith(`${this.myKey}:`)) {
      const id = fleetKey.slice(fleetKey.indexOf(':') + 1);
      return { key: fleetKey, name: s.fleets.find((f) => f.id === id)?.name ?? name, empire: s.identity?.name ?? s.playerName, color: ownClaim(s).color, design: (c) => this.effectiveDesign(c) };
    }
    const v = this.others.find((x) => x.id === fleetKey);
    const base: ShipDesign = v?.design ?? { ...DEFAULT_DESIGN, colors: { primary: '#8a3a4f', secondary: '#25121b', accent: '#ff5d8f' } };
    const memo = new Map<string, ShipDesign>();
    return {
      key: fleetKey, name: v ? v.name.split(' · ')[0] : name, empire: v?.owner ?? empire, color: v?.color ?? '#ff5d8f',
      design: (classId) => {
        if (!memo.has(classId)) { const c = this.classById.get(classId); memo.set(classId, c ? classDesign(base, c) : base); }
        return memo.get(classId)!;
      },
    };
  }

  /** Who is breaking off (sailing away from the battle's hex) and who gives chase. */
  battleEnding = (target: BattleTarget): StageEnding => {
    if (target.replay) return NO_ENDING;
    const s = this.state;
    const movementOf = (key: string): FleetMovement | null => {
      if (key.startsWith(`${this.myKey}:`)) return s.fleets.find((f) => f.id === key.slice(key.indexOf(':') + 1))?.movement ?? null;
      return this.others.find((x) => x.id === key)?.movement ?? null;
    };
    const chaseOf = (key: string): string | undefined => {
      if (key.startsWith(`${this.myKey}:`)) return s.loadouts[key.slice(key.indexOf(':') + 1)]?.orders?.chase;
      return this.otherBattles.find((b) => b.fleet === key)?.chase;
    };
    const m0 = movementOf(target.sides[0].key);
    const here = m0 ? hexAt(m0, target.tick) : null;
    const away = (key: string) => {
      const m = movementOf(key);
      return !!m && !!here && !hexEquals(m.route[m.route.length - 1], here);
    };
    const [a, b] = [target.sides[0].key, target.sides[1].key];
    return { flee: [away(a), away(b)], chase: [chaseOf(a) === b, chaseOf(b) === a] };
  };

  /** Markers for the battles you can see; the open view follows its battle's newest round. */
  refreshBattles(): void {
    if (!this.view) return;
    const list = this.sightings();
    this.view.battleMarkers.setBattles(list.map((sg) => {
      const p = hexToWorld(hexAt(sg.movement, sg.tick));
      return { key: sg.key, x: p.x, z: p.z, round: sg.round, title: `${sg.name} against ${sg.foeName} of ${sg.foeEmpire}` };
    }));
    const open = this.view.battle.current;
    if (open) {
      const next = this.battleTarget(open.key);
      if (next) this.view.battle.setTarget(next);
    }
  }

  private npcFleets: FleetView[] = [];
  private npcKey = '';

  /** The NPC empires you know, on the map: territory (claims) and raider fleets. Redrawn only when they change. */
  drawNpcs(territory: { setNpcs(claims: readonly TerritoryClaim[]): void }): void {
    const known = this.knownNpcs();
    const claims: TerritoryClaim[] = known.map(({ def, state }) => ({
      name: def.name, color: def.color, kind: 'alien', home: def.home.hex,
      colonies: state.colonies.filter((c) => !c.capturedBy).map((c) => this.starById(c.starId)).filter((x): x is StarSystem => !!x).map((st) => ({ hex: st.hex, radius: territoryOf(def, st.id) })),
    }));
    const fleets: FleetView[] = known.flatMap(({ def, state }) => state.fleets.map((f): FleetView => ({
      id: `npc:${f.id}`, name: f.name, owner: `alien:${def.name}`, color: def.color,
      movement: planMovement(f.from, f.to, f.depart, 1),
      design: { ...DEFAULT_DESIGN, name: def.name, style: def.archetype.style, seed: hashSeed(f.id) % 1000, colors: { ...def.archetype.hull }, livery: def.archetype.livery, weapons: 3 },
      status: f.mission === 'raid' ? 'Raiding' : f.mission === 'return' ? 'Returning home' : `${f.ships.reduce((n, x) => n + x.count, 0)} warships`,
    })));
    const key = JSON.stringify([claims, fleets.map((f) => [f.id, f.movement, f.status])]);
    if (key === this.npcKey) return;
    this.npcKey = key;
    territory.setNpcs(claims);
    this.npcFleets = fleets;
    this.view.fleets.setFleets(this.fleetViews());
  }

  /** Map fleets with a supply and hull line for the player's own. */
  private fleetViews(): FleetView[] {
    const s = this.state;
    return [...this.others, ...this.npcFleets, ...s.fleets.map((f): FleetView => {
      const l = s.loadouts[f.id];
      if (!l) return f;
      const cap = capacity(l.ships, specOf);
      const parts = [`Supply ${l.supply}/${cap.supply}`];
      const hull = this.hullOf(l.ships, l.damage);
      if (hull < 1) parts.push(`Hull ${Math.round(hull * 100)}%`);
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
  viewHex(): Hex {
    const f = this.view.map.controller.focus;
    return worldToHex(f.x, f.y);
  }

  flyTo(star: StarSystem, closeUp = false): void {
    // A star hidden from the player is not a place they can go to on the map.
    if (!this.lens().see(star)) return;
    const cam = this.view.map.controller;
    cam.flyTo(star.position.x, star.position.z, closeUp ? SYSTEM_ALTITUDE : cam.zoom.targetAltitude > LOCATE_ALTITUDE ? LOCATE_ALTITUDE : undefined);
  }

  /** Opens the founding screen to edit the empire's name, colours and flag (set by main). */
  onEditEmpire: () => void = () => {};
  /** A planet was focused (the UI reopens its card if the player had closed it). */
  onFocusPlanet: ((planet: Planet) => void) | null = null;
  /** A close-up was asked for while its shaders are still being prepared: say so for `ms`. */
  onShadersBusy: ((ms: number, planet: Planet) => void) | null = null;
  /**
   * Whether a planet's close-up can open now: its shaders are prepared (change surface-perf).
   * Asking moves them to the front of the start-up warm-up.
   */
  closeUpReady: (planet: Planet) => boolean = () => true;
  /** A landing asked for before its shaders were ready: made as soon as they are. */
  private pendingLanding: { star: StarSystem; planet: Planet; at?: LandingSpot } | null = null;

  async shareLink(star: StarSystem, planet: Planet | null = null): Promise<'shared' | 'copied' | 'failed'> {
    const url = new URL(routePath(systemRoute(star, planet ? planet.index : null)), location.origin).toString();
    const title = `${planet?.name ?? star.name} · Falchion`;
    try {
      if (touchFirst() && navigator.share) {
        await navigator.share({ title, url });
        return 'shared';
      }
      await navigator.clipboard.writeText(url);
      return 'copied';
    } catch {
      return 'failed';
    }
  }

  editEmpire(): void {
    this.onEditEmpire();
  }

  select(star: StarSystem | null): void {
    // The star as the player knows it; one hidden from them cannot be selected.
    star = star && this.lens().see(star);
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

  /** Open an asteroid field's card (null closes it). */
  focusField(star: StarSystem | null, fieldId: string | null): void {
    if (star && this.state.selected?.id !== star.id) this.select(star);
    this.deps.store.update({ selectedField: fieldId, ...(fieldId ? { selectedPlanet: null } : {}) });
    this.view.system.setFieldSelected(fieldId);
  }

  focusPlanet(star: StarSystem, planet: Planet | null): void {
    // Nothing of a star hidden from the player, nor a megastructure they have not found.
    const seen = this.lens().see(star);
    if (!seen || (planet && isMegastructure(planet.biome) && !this.lens().megastructureSeen(star.id))) return;
    star = seen;
    if (this.state.selectedField) { this.deps.store.update({ selectedField: null }); this.view.system.setFieldSelected(null); }
    if (this.state.selected?.id !== star.id) this.select(star);
    if (planet) this.onFocusPlanet?.(planet);
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
      setTimeout(() => this.followPlanet(planet, isMegastructure(planet.biome) ? MEGA_ALTITUDE : PLANET_ALTITUDE), 900);
    } else this.followPlanet(planet, isMegastructure(planet.biome) ? MEGA_ALTITUDE : PLANET_ALTITUDE);
  }

  /** Follow a planet; `altitude` null keeps the zoom where it is. */
  private followPlanet(planet: Planet, altitude: number | null = PLANET_ALTITUDE): void {
    if (this.state.selectedPlanet?.id !== planet.id) return;
    // Landed on a megastructure: its close-up has the zoom.
    if (this.view.mega.status.active) altitude = null;
    // Until the system is drawn (a slow device may not be there yet), follow its star.
    const star = this.starById(planet.starId);
    const fallback = star ? new THREE.Vector3(star.position.x, 0, star.position.z) : null;
    this.view.map.controller.followTarget(() => this.view.system.planetPosition(planet.id) ?? fallback, altitude ?? undefined);
  }

  /** Descend to a rocky planet's surface (its capital or main city): focuses it first if need be. */
  land(star: StarSystem, planet: Planet, at?: LandingSpot): void {
    this.pendingLanding = null;
    if (!this.lens().see(star) || (isMegastructure(planet.biome) && !this.lens().megastructureSeen(star.id))) return;
    if (!hasMegaSurface(planet.biome) && this.landable(planet) && !this.closeUpReady(planet)) {
      // Its shaders are still in the start-up warm-up (now at the front of it): drawn now, they
      // would compile on the spot. Land as soon as they are ready.
      if (this.state.selectedPlanet?.id !== planet.id || this.state.selectedFleet) this.focusPlanet(star, planet);
      this.pendingLanding = { star, planet, at };
      this.onShadersBusy?.(4000, planet);
      return;
    }
    if (hasMegaSurface(planet.biome)) {
      // A megastructure you can stand on (change mega-surfaces): its own close-up.
      if (this.state.selectedPlanet?.id !== planet.id || this.state.selectedFleet) this.focusPlanet(star, planet);
      this.refreshSurface();
      this.view.mega.land();
      return;
    }
    if (planet.biome === 'gas' || isMegastructure(planet.biome)) return;
    if (this.state.selectedPlanet?.id !== planet.id || this.state.selectedFleet) this.focusPlanet(star, planet);
    else if (!this.view.map.controller.following) this.followPlanet(planet, null);
    this.refreshSurface();
    this.view.surface.land(at);
  }

  /** The major cities on a planet, capital first, from the same layout the surface draws. */
  citiesOf = (planet: Planet): CityEntry[] => {
    const colony = this.surfaceTarget(planet)?.colony;
    if (!colony) return [];
    return planetLayout(planet, colony).layout.settlements.flatMap((c, index) =>
      c.major ? [{ name: c.name, kind: c.kind === 'capital' ? 'capital' as const : 'city' as const, index }] : []);
  };

  /** On the surface: rise back to planet view. */
  leaveSurface(): void {
    if (this.view.mega.status.active) return this.view.mega.leave();
    const planet = this.state.selectedPlanet;
    if (planet && !this.view.map.controller.following) this.followPlanet(planet, null);
    this.view.surface.leave(PLANET_ALTITUDE);
  }

  /** The surface view's planet and what stands on it, from the game state (null: no surface to show). */
  surfaceTarget(planet: Planet | null): SurfaceTarget | null {
    if (!planet || planet.biome === 'gas' || isMegastructure(planet.biome)) return null;
    const star = this.starById(planet.starId);
    const own = this.colonyAt(planet.id);
    let colony: SettlementInput | null = null;
    if (own) {
      colony = { owner: 'own', name: own.name.replace(/ \(capital\)$/, ''), capital: !!own.capital, size: own.size ?? planet.size, buildings: own.buildings ?? [], pop: populationOf(own) };
    } else if (star) {
      // Another empire's system: a generic city on its main world.
      const market = this.marketAt(star);
      if (market && market.kind !== 'own' && foreignSeat(this.planets(star))?.id === planet.id) {
        colony = { owner: 'foreign', name: this.describe(star).owner ?? market.name, capital: false, size: planet.size, buildings: [], pop: 1 };
      }
    }
    const done = this.state.explored[planet.id];
    return { planet, radius: planetRadius(planet), colony, survey: done ? `Unsettled · surveyed (${done.kind})` : 'Unsettled · not yet surveyed' };
  }

  /** The megastructure you can land on, if the selected world is one (change mega-surfaces). */
  megaTarget(planet: Planet | null): MegaSurfaceTarget | null {
    if (!planet || !hasMegaSurface(planet.biome)) return null;
    const star = this.starById(planet.starId);
    const light = new THREE.Color(star ? starColor(star) : '#fff4e0').lerp(new THREE.Color('#ffffff'), 0.6);
    return { id: planet.id, type: planet.biome, seed: hashSeed(planet.id, 'mega'), light };
  }

  /**
   * The warm-up moved on: offer the close-ups whose shaders are ready now, and make a landing that
   * waited on them. Until a planet's are ready its close-up is not offered: Land waits and says
   * why, and the zoom stops at planet view.
   */
  shadersChanged(): void {
    this.refreshSurface();
    const p = this.pendingLanding;
    if (!p) return;
    if (this.state.selectedPlanet?.id !== p.planet.id) this.pendingLanding = null;
    else if (this.closeUpReady(p.planet)) this.land(p.star, p.planet, p.at);
  }

  /** The planet a landing is waiting on, if one is. */
  get landingWaitsFor(): Planet | null {
    return this.pendingLanding?.planet ?? null;
  }

  /** Your colonies' planets, capital first. */
  ownPlanets(): Planet[] {
    const colonies = [...this.state.economy.colonies].sort((a, b) => Number(!!b.capital) - Number(!!a.capital));
    return colonies.flatMap((c) => {
      const star = c.starId ? this.starById(c.starId) : null;
      const planet = star && this.planets(star).find((p) => p.id === c.planetId);
      return planet ? [planet] : [];
    });
  }

  /** A planet or megastructure with a close-up to land in. */
  private landable(planet: Planet): boolean {
    return planet.biome !== 'gas' && (!isMegastructure(planet.biome) || hasMegaSurface(planet.biome));
  }

  private refreshSurface(): void {
    const planet = this.state.selectedPlanet;
    this.view.surface.setTarget(this.surfaceTarget(planet && this.closeUpReady(planet) ? planet : null));
    this.view.mega.setTarget(this.megaTarget(planet));
    // Night lights in the system view come from the same colonies.
    this.view.system.refreshLights();
  }

  private clearPlanetFocus(): void {
    this.deps.store.update({ selectedPlanet: null });
    this.view.system.setSelected(null);
    this.view.map.controller.followTarget(null);
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
    if (!this.state.fleets.some((f) => f.id === fleetId) && !this.others.some((f) => f.id === fleetId) && !this.npcFleets.some((f) => f.id === fleetId)) return;
    if (this.state.selectedPlanet) { this.deps.store.update({ selectedPlanet: null }); this.view.system.setSelected(null); }
    this.deps.store.update({ selectedFleet: fleetId });
    this.view.fleets.setSelected(fleetId);
    // Selecting keeps the zoom; only a double-click or the Zoom button closes in on the ship.
    cam.followTarget(() => this.view.fleets.positionOf(fleetId), zoomIn ? FLEET_ALTITUDE : undefined);
  }

  fleetInfo = (fleetId: string): FleetInfo | null => {
    const s = this.state;
    const fleet = s.fleets.find((f) => f.id === fleetId) ?? this.others.find((f) => f.id === fleetId) ?? this.npcFleets.find((f) => f.id === fleetId);
    if (!fleet) return null;
    const m = fleet.movement;
    return {
      fleet,
      group: this.groups().find((g) => g.id === fleetId) ?? null,
      at: isStationed(m, s.turn) ? this.deps.galaxy.starAt(hexAt(m, s.turn)) : null,
      dest: this.deps.galaxy.starAt(m.route[m.route.length - 1]),
      eta: Math.max(0, arrivalTurn(m) - s.turn),
      // Your own deployed fleets are the ones with a loadout (ships, supply, damage).
      mine: !!s.loadouts[fleetId] && s.fleets.some((f) => f.id === fleetId),
      plan: this.surveyPlan(fleetId),
      surveying: this.surveyTarget(fleetId),
    };
  };

  /** surveyTarget and survey percentages, memoised per state (the map asks every frame). */
  private surveyMemo: { state: GameState | null; targets: Map<string, Planet | null>; pct: Map<string, number | null> } = { state: null, targets: new Map(), pct: new Map() };

  /** Percent of a star's planets surveyed, or null when none are (map labels). */
  surveyedPercent = (star: StarSystem): number | null => {
    if (this.surveyMemo.state !== this.state) this.surveyMemo = { state: this.state, targets: new Map(), pct: new Map() };
    const m = this.surveyMemo.pct;
    if (!m.has(star.id)) {
      const p = star.planetCount ? this.surveyProgress(star) : null;
      m.set(star.id, p && p.done > 0 ? Math.round((100 * p.done) / p.total) : null);
    }
    return m.get(star.id) ?? null;
  };

  private surveyTargetCached(fleetId: string): Planet | null {
    if (this.surveyMemo.state !== this.state) this.surveyMemo = { state: this.state, targets: new Map(), pct: new Map() };
    const m = this.surveyMemo.targets;
    if (!m.has(fleetId)) m.set(fleetId, this.surveyTarget(fleetId));
    return m.get(fleetId) ?? null;
  }

  /** Draw each auto-exploring fleet's next survey stops on the map. */
  private refreshSurveyPlans(): void {
    const s = this.state;
    const pos = (h: Hex) => this.deps.galaxy.starAt(h)?.position ?? hexToWorld(h);
    const plans = s.fleets.filter((f) => s.loadouts[f.id]?.orders?.autoExplore).map((f) => {
      const dest = f.movement.route[f.movement.route.length - 1];
      const from = pos(dest);
      return { color: f.color, from: { x: from.x, z: from.z }, stops: this.surveyPlan(f.id).map((st) => ({ x: st.position.x, z: st.position.z })) };
    });
    this.view.fleets.setPlans(plans);
  }

  /** Abandon this empire and found a new one in the current year. */
  /** Runs before a reset reloads the page (the server deletes its copy of the empire). */
  beforeReset: () => Promise<void> = async () => {};

  resetEmpire(): void {
    // Stop first: the reload fires pagehide, which would otherwise save the old empire again.
    this.deps.save.stop();
    this.deps.save.clear();
    void this.beforeReset().finally(() => location.reload());
  }

  openResearch(nodeId: string): void {
    for (const [pid, panel] of Object.entries(this.view.panels)) if (pid !== 'research') panel.close();
    (this.view.panels.research as unknown as { focusNode(id: string): void }).focusNode(nodeId);
    this.view.topBar.setActivePanel('research');
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
      const field = star ? this.view.system.pickField(ray) : null;
      if (field && star) return this.focusField(star, field.id);
      if (this.state.selectedField) return this.focusField(null, null);
      if (this.state.selectedPlanet) return this.clearPlanetFocus();
    }
    const h = worldToHex(world.x, world.z);
    if (v.visibleWidth > 1_200) {
      this.view.map.controller.flyTo(world.x, world.z, Math.max(40, v.altitude / 12));
      return;
    }
    const reach = Math.min(6, Math.max(1, Math.round(v.visibleWidth * 0.012)));
    const star = this.nearestSeen(h, reach);
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
    // Only a star the player can see is a target; anywhere else is a hex of space (a hidden star there is found on arrival).
    const star = this.nearestSeen(clicked, snap);
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
      const other = f ? null : this.others.find((x) => x.id === shipUnder) ?? this.npcFleets.find((x) => x.id === shipUnder);
      // Another player's fleet: its name (labelled "name · empire" on the map) and the owning empire.
      if (other) this.view.hud.setHover(`${other.name.replace(` · ${other.owner}`, '')}  ·  fleet of the ${other.owner}`);
      else this.view.hud.setHover(`${f?.name ?? 'Fleet'}  ·  ${f?.owner === this.state.playerName ? 'click to select, then right-click a star or empty space to move' : f?.owner.replace('alien:', '') ?? ''}`);
      return;
    }
    const v0 = this.view.map.view;
    if (v0 && v0.visibleWidth < SYSTEM_VIEW_WIDTH) {
      const planet = this.view.system.pick(ray);
      this.view.system.setHover(planet?.id ?? null);
      this.view.system.setFieldHover(null);
      this.view.map.canvas.style.cursor = planet ? 'pointer' : '';
      if (planet) {
        this.view.hud.setHover(`${planet.name}  ·  ${BIOMES.find((b) => b.id === planet.biome)?.name ?? planet.biome}  ·  size ${planet.size}  ·  click to focus`);
        return;
      }
      const star = this.view.system.system;
      const field = star ? this.view.system.pickField(ray) : null;
      this.view.system.setFieldHover(field?.id ?? null);
      if (field && star) {
        const f = this.fieldReport(star).find((x) => x.field.id === field.id);
        const name = RESOURCES.find((r) => r.id === field.resource)?.name ?? field.resource;
        this.view.map.canvas.style.cursor = 'pointer';
        this.view.hud.setHover(`${name} asteroid field  ·  ${f ? `${Math.round(f.left).toLocaleString('en-US')} / ${field.capacity.toLocaleString('en-US')}` : ''}  ·  click to assign miners`);
        return;
      }
    } else {
      this.view.map.canvas.style.cursor = '';
      this.view.system.setFieldHover(null);
    }
    if (!world) return;
    const h = worldToHex(world.x, world.z);
    this.view.hexGrid.setHover(h.q, h.r);
    const v = this.view.map.view;
    const star = v && v.visibleWidth < 1_200 ? this.deps.galaxy.starAt(h) : null;
    const sight = star ? this.lens().sight(star) : 'hidden';
    const dist = hexDistance(h, this.deps.world.home.hex);
    // An uncharted star is not named; a hidden one is not there at all.
    const name = sight === 'hidden' ? '' : sight === 'fogged' ? '  ·  uncharted star' : `  ·  ${star!.name}`;
    this.view.hud.setHover(`${formatAddress(addressOf(h))}${name}  ·  ${dist.toLocaleString('en-US')} ly from home`);
  };

  /**
   * Fractional year the ships are drawn at: continuous wall-clock time, held within the
   * year the empire is in. At a year boundary the clock rolls over a moment before the
   * tick arrives; holding at the year's end keeps ships from stepping back and forth.
   */
  protected override now(): number {
    return this.fleetTime();
  }

  /** The current world time in years, fractional (as orders are dated). */
  worldTime(): number {
    return this.fleetTime();
  }

  private fleetTime(): number {
    const now = this.deps.clock.tick() + this.deps.clock.fraction();
    return Math.min(this.state.turn + 1, Math.max(this.state.turn, now));
  }

  onFrame = (view: ViewState): void => {
    this.view.topBar.setGalaxyMode(view.galaxyMode);
    // Ships glide through the current year toward next year's position.
    this.view.fleets.setTime(this.fleetTime());
    const surface = this.view.surface.status, mega = this.view.mega.status;
    // Zoomed all the way in on a planet whose close-up is still waiting on its shaders: say so.
    const planet = this.state.selectedPlanet;
    if (planet && !hasMegaSurface(planet.biome) && this.landable(planet) && view.altitude <= this.view.map.controller.zoom.floor * 1.05 && !this.closeUpReady(planet)) this.onShadersBusy?.(1500, planet);
    if (surface.engaged) return this.view.hud.setSurface(surface.altitudeKm, view.altitude);
    if (mega.engaged) return this.view.hud.setSurface(mega.altitudeKm, view.altitude);
    const mode = this.state.selectedPlanet ? 'Planet view' : view.visibleWidth < SYSTEM_VIEW_WIDTH ? 'System view' : view.visibleWidth < 420 ? 'Hex view' : view.visibleWidth < 7_000 ? 'Sector view' : 'Galaxy view';
    const pxPerLy = this.view.map.viewportWidth() / view.visibleWidth;
    this.view.hud.setScale(view.visibleWidth, pxPerLy, mode, view.altitude);
  };
}

