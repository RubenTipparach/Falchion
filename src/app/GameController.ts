import * as THREE from 'three';
import { specOf } from '../content/logistics';
import type { TradePartner } from '../content/society';
import { arrivalTurn, hexAt } from '../core/fleet/Fleet';
import { WorldClock } from './WorldClock';
import type { SaveGame } from './SaveGame';
import { capacity } from '../core/fleet/Logistics';
import { isStationed } from '../core/fleet/Presence';
import { addressOf, formatAddress } from '../core/galaxy/GalacticAddress';
import { StarSystem } from '../core/galaxy/GalaxyModel';
import { Planet } from '../core/galaxy/Planets';
import { Hex, hexDistance, hexEquals, hexToWorld, worldToHex } from '../core/hex/Hex';
import type { FleetLayer, FleetView } from '../render/map/FleetLayer';
import type { HexGridLayer } from '../render/map/HexGridLayer';
import type { ViewState } from '../render/map/MapLayer';
import type { MapView } from '../render/map/MapView';
import type { SectorOverlayLayer } from '../render/map/SectorOverlayLayer';
import type { SelectionLayer } from '../render/map/SelectionLayer';
import { SYSTEM_VIEW_WIDTH, SystemLayer } from '../render/map/SystemLayer';
import type { Drawer } from '../ui/Drawer';
import type { FleetInfo, GameActions, GameQueries, PanelId } from '../ui/GameActions';
import type { Hud } from '../ui/Hud';
import type { TopBar } from '../ui/TopBar';
import type { GameState } from './GameState';
import type { World } from './World';
import { EmpireSim, SimDeps } from '../sim/EmpireSim';

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
}

/** Camera altitude (ly) that frames a whole star system. */
const SYSTEM_ALTITUDE = 0.45;
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
  /** Other players' fleets in the shared galaxy (drawn and selectable, never simulated here). */
  private others: FleetView[] = [];

  attach(view: ViewDeps): void {
    this.view = view;
    view.hexGrid.setHome(this.deps.world.home.hex.q, this.deps.world.home.hex.r);
    this.deps.store.subscribe((s, prev) => {
      if (s.fleets !== prev.fleets || s.loadouts !== prev.loadouts) view.fleets.setFleets(this.fleetViews());
      if (s.fleets !== prev.fleets || s.loadouts !== prev.loadouts || s.explored !== prev.explored || s.turn !== prev.turn) this.refreshSurveyPlans();
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
    // Zooming in close pulls the view onto the nearest star, so you land in its system.
    view.map.controller.attractor = (ground, width) => {
      if (width > 25) return null;
      const star = this.deps.galaxy.nearestStar(worldToHex(ground.x, ground.z), Math.max(1, Math.round(width * 0.15)));
      return star ? star.position : null;
    };
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

  /** Opens the founding screen to edit the empire's name, colours and flag (set by main). */
  onEditEmpire: () => void = () => {};

  editEmpire(): void {
    this.onEditEmpire();
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
  resetEmpire(): void {
    // Stop first: the reload fires pagehide, which would otherwise save the old empire again.
    this.deps.save.stop();
    this.deps.save.clear();
    location.reload();
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
  protected override now(): number {
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
