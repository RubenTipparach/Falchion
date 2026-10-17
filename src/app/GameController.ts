import * as THREE from 'three';
import { applyCost, applyCrate, EncounterResolver } from '../core/encounters/Encounters';
import { formatTurns, hexAt, planMovement, travelTurns } from '../core/fleet/Fleet';
import { addressOf, formatAddress } from '../core/galaxy/GalacticAddress';
import { GalaxyModel, StarSystem } from '../core/galaxy/GalaxyModel';
import { planetsOf, Planet } from '../core/galaxy/Planets';
import { hexDistance, hexToWorld, worldToHex } from '../core/hex/Hex';
import type { TechTree } from '../core/research/TechTree';
import { normalizeDesign, ShipDesign } from '../core/ships/ShipDesign';
import type { FleetLayer } from '../render/map/FleetLayer';
import type { HexGridLayer } from '../render/map/HexGridLayer';
import type { ViewState } from '../render/map/MapLayer';
import type { MapView } from '../render/map/MapView';
import type { SectorOverlayLayer } from '../render/map/SectorOverlayLayer';
import type { SelectionLayer } from '../render/map/SelectionLayer';
import type { Drawer } from '../ui/Drawer';
import type { GameActions, PanelId } from '../ui/GameActions';
import type { Hud } from '../ui/Hud';
import type { StarDetails } from '../ui/StarInfoPanel';
import type { TopBar } from '../ui/TopBar';
import type { GameState } from './GameState';
import type { Store } from './Store';
import { inContact, MockWorld } from './World';

export interface ControllerDeps {
  readonly store: Store<GameState>;
  readonly galaxy: GalaxyModel;
  readonly tree: TechTree;
  readonly encounters: EncounterResolver;
  readonly world: MockWorld;
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
}

const BASE_SPEED = 2; // hexes (ly) per turn

/** Application service: implements UI commands on top of the pure core and the map view. */
export class GameController implements GameActions {
  private view!: ViewDeps;

  constructor(private readonly deps: ControllerDeps) {}

  attach(view: ViewDeps): void {
    this.view = view;
    view.hexGrid.setHome(this.deps.world.home.hex.q, this.deps.world.home.hex.r);
    this.deps.store.subscribe((s, prev) => {
      if (s.fleets !== prev.fleets) view.fleets.setFleets(s.fleets);
      if (s.turn !== prev.turn) view.fleets.setTurn(s.turn);
      if (s.contact !== prev.contact) view.hud.setContact(s.contact);
    });
    view.fleets.setTurn(this.deps.store.state.turn);
    view.fleets.setFleets(this.deps.store.state.fleets);
    this.updateContact();
  }

  // ── Queries ────────────────────────────────────────────────────────

  get state(): GameState {
    return this.deps.store.state;
  }

  fleetSpeed(): number {
    const bonus = this.deps.tree.grantsOf(this.state.empire.research).reduce((s, g) => s + (g.kind === 'bonus' && g.stat === 'speed' ? g.amount : 0), 0);
    return BASE_SPEED + bonus;
  }

  unlockedTraits = (): string[] => this.deps.tree.traitsOf(this.state.empire.research);

  effectiveDesign = (): ShipDesign => {
    const traits = this.unlockedTraits().filter((t) => !this.state.hiddenTraits.includes(t));
    return normalizeDesign({ ...this.state.design, traits });
  };

  planets = (star: StarSystem): Planet[] => planetsOf(star, this.deps.galaxy.params.seed);

  describe = (star: StarSystem): StarDetails => {
    const dist = hexDistance(this.deps.world.home.hex, star.hex);
    const speed = this.fleetSpeed();
    const owner = this.deps.world.claims.find((c) => c.colonies.some((col) => hexDistance(col.hex, star.hex) <= col.radius));
    return {
      address: formatAddress(addressOf(star.hex)),
      distanceFromHome: dist,
      travel: dist === 0 ? '—' : formatTurns(travelTurns(dist, speed)),
      speed,
      planets: this.planets(star),
      owner: owner?.name ?? null,
    };
  };

  // ── Commands ───────────────────────────────────────────────────────

  toggleView(): void {
    this.view.map.controller.zoom.toggle();
  }

  flyTo(star: StarSystem, closeUp = false): void {
    const p = hexToWorld(star.hex);
    this.view.map.controller.flyTo(p.x, p.z, closeUp ? 30 : undefined);
  }

  select(star: StarSystem | null): void {
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

  sendFleet(to: StarSystem): void {
    const s = this.state;
    const n = s.fleets.filter((f) => f.owner === s.playerName).length + 1;
    const fleet = {
      id: `player-${n}-t${s.turn}`,
      name: `${this.effectiveDesign().name} Wing ${n}`,
      owner: s.playerName,
      color: '#5dff9b',
      movement: planMovement(s.home.hex, to.hex, s.turn, this.fleetSpeed()),
      design: this.effectiveDesign(),
    };
    this.deps.store.update({ fleets: [...s.fleets, fleet], log: [...s.log, `Fleet dispatched to ${to.name}`] });
  }

  explore(planet: Planet): void {
    const s = this.state;
    if (s.explored[planet.id]) return;
    const result = this.deps.encounters.resolve(this.deps.galaxy.params.seed, planet, s.empire);
    this.deps.store.update({ explored: { ...s.explored, [planet.id]: result }, empire: applyCost(s.empire, result) });
  }

  collectCrate(planetId: string): void {
    const s = this.state;
    const crate = s.explored[planetId]?.crate;
    if (!crate) return;
    this.deps.store.update({ empire: applyCrate(s.empire, crate, this.deps.tree) });
  }

  research(nodeId: string): void {
    const s = this.state;
    const research = this.deps.tree.research(s.empire.research, nodeId);
    const grants = this.deps.tree.node(nodeId).grants;
    const chassis = [...s.empire.chassis, ...grants.flatMap((g) => (g.kind === 'chassis' && !s.empire.chassis.includes(g.id) ? [g.id] : []))];
    const parts = [...s.empire.parts, ...grants.flatMap((g) => (g.kind === 'part' && !s.empire.parts.includes(g.id) ? [g.id] : []))];
    this.deps.store.update({ empire: { ...s.empire, research, chassis, parts } });
  }

  grantShards(nodeId: string, sourceId: string, amount: number): void {
    const s = this.state;
    this.deps.store.update({ empire: { ...s.empire, research: this.deps.tree.grantShards(s.empire.research, nodeId, sourceId, amount) } });
  }

  setDesign(design: ShipDesign): void {
    this.deps.store.update({ design: normalizeDesign(design) });
  }

  toggleTrait(traitId: string): void {
    const hidden = this.state.hiddenTraits;
    this.deps.store.update({ hiddenTraits: hidden.includes(traitId) ? hidden.filter((t) => t !== traitId) : [...hidden, traitId] });
  }

  /** Advance the world one turn. Inside a lockstep zone this is the player's turn submission. */
  endTurn(): void {
    this.deps.store.update((s) => ({ turn: s.turn + 1 }));
    this.updateContact();
  }

  openPanel(id: PanelId): void {
    for (const [pid, panel] of Object.entries(this.view.panels)) {
      if (pid === id) panel.toggle();
      else panel.close();
    }
  }

  // ── Map input & frame ──────────────────────────────────────────────

  handleClick = (world: THREE.Vector3): void => {
    const v = this.view.map.view;
    if (!v) return;
    const h = worldToHex(world.x, world.z);
    if (v.visibleWidth > 1_200) {
      // Too far out to pick a hex: dive in toward the clicked point.
      this.view.map.controller.flyTo(world.x, world.z, Math.max(40, v.altitude / 12));
      return;
    }
    const reach = Math.min(6, Math.max(1, Math.round(v.visibleWidth * 0.012)));
    const star = this.deps.galaxy.nearestStar(h, reach);
    this.select(star);
  };

  handleHover = (world: THREE.Vector3 | null): void => {
    if (!world) return;
    const h = worldToHex(world.x, world.z);
    this.view.hexGrid.setHover(h.q, h.r);
    const v = this.view.map.view;
    const star = v && v.visibleWidth < 1_200 ? this.deps.galaxy.starAt(h) : null;
    const dist = hexDistance(h, this.deps.world.home.hex);
    this.view.hud.setHover(`${formatAddress(addressOf(h))}${star ? ` · ★ ${star.name}` : ''} · ${dist.toLocaleString('en-US')} ly from home`);
  };

  onFrame = (view: ViewState): void => {
    this.view.topBar.setGalaxyMode(view.galaxyMode);
    const mode = view.visibleWidth < 420 ? 'Hex view' : view.visibleWidth < 7_000 ? 'Sector view' : 'Galaxy view';
    this.view.hud.setScale(view.visibleWidth, mode);
  };

  /**
   * When fleets of different players are within the lockstep radius, that zone
   * resolves in lockstep: every participant must submit before the turn ends
   * (mocked here: the other player auto-submits). PvP stays disabled.
   */
  private updateContact(): void {
    const s = this.state;
    const mine = s.fleets.filter((f) => f.owner === s.playerName);
    const others = s.fleets.filter((f) => f.owner !== s.playerName && !f.owner.startsWith('alien:'));
    let contact: string | null = null;
    for (const a of mine) {
      for (const b of others) {
        if (inContact(hexAt(a.movement, s.turn), hexAt(b.movement, s.turn))) {
          contact = `Contact with ${b.owner} — lockstep: both players submit before the turn resolves (peaceful; PvP disabled)`;
        }
      }
    }
    if (contact !== s.contact) this.deps.store.update({ contact });
  }
}
