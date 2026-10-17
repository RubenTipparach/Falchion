import '../ui/styles.css';
import { EncounterResolver } from '../core/encounters/Encounters';
import { newEmpire } from '../core/empire/Empire';
import { planMovement } from '../core/fleet/Fleet';
import { DEFAULT_ADDRESS_SCHEME } from '../core/galaxy/GalacticAddress';
import { GalaxyModel } from '../core/galaxy/GalaxyModel';
import { hexAdd, hexDistance, hexToWorld } from '../core/hex/Hex';
import { TechTree } from '../core/research/TechTree';
import { DEFAULT_DESIGN } from '../core/ships/ShipDesign';
import { DEFAULT_LOOT_TABLES } from '../content/lootTables';
import { SHARD_SOURCES } from '../content/shardSources';
import { BRANCHES, TECH_NODES } from '../content/techTree';
import { FleetLayer, FleetView } from '../render/map/FleetLayer';
import { GalaxyCloudLayer } from '../render/map/GalaxyCloudLayer';
import { HexGridLayer } from '../render/map/HexGridLayer';
import { MapView } from '../render/map/MapView';
import { MidStarLayer } from '../render/map/MidStarLayer';
import { NearStarLayer } from '../render/map/NearStarLayer';
import { SectorOverlayLayer } from '../render/map/SectorOverlayLayer';
import { SelectionLayer } from '../render/map/SelectionLayer';
import { TerritoryLayer } from '../render/map/TerritoryLayer';
import { createDefaultShipFactory } from '../render/ships/defaultRegistries';
import { formatDuration } from '../core/fleet/Fleet';
import { Hud } from '../ui/Hud';
import { StarInfoPanel } from '../ui/StarInfoPanel';
import { TopBar } from '../ui/TopBar';
import { ExplorePanel } from '../ui/panels/ExplorePanel';
import { ResearchPanel } from '../ui/panels/ResearchPanel';
import { ShipyardPanel } from '../ui/panels/ShipyardPanel';
import type { PanelId } from '../ui/GameActions';
import { GameController } from './GameController';
import type { GameState } from './GameState';
import { MockDiscordIdentityProvider } from './identity';
import { Store } from './Store';
import { createMockWorld } from './World';

/** Composition root: build the pure services, the views, and wire them together. */
async function bootstrap(): Promise<void> {
  const params = new URLSearchParams(location.search);
  const identity = await new MockDiscordIdentityProvider().signIn();

  // ── Domain ──
  const galaxy = new GalaxyModel();
  const tree = new TechTree(TECH_NODES, SHARD_SOURCES);
  const encounters = new EncounterResolver(DEFAULT_LOOT_TABLES, tree);
  const world = createMockWorld(galaxy);
  const { factory, styles, traits } = createDefaultShipFactory();

  let empire = newEmpire(identity.displayName);
  let research = tree.grantShards(empire.research, 't-alloys', 'science', 10);
  research = tree.research(research, 't-alloys');
  research = tree.grantShards(research, 't-lasers', 'science', 100);
  research = tree.grantShards(research, 't-fusion', 'science', 60);
  research = tree.grantShards(research, 'o-grown-hulls', 'observation', 4);
  empire = { ...empire, research, chassis: ['tech-frigate'] };

  const fleets = initialFleets(galaxy, world, identity.displayName);
  const store = new Store<GameState>({
    day: 0, speed: 1, empire, design: DEFAULT_DESIGN, hiddenTraits: [], home: world.home,
    selected: null, explored: {}, fleets, contact: null, playerName: identity.displayName, log: [],
  });

  const controller = new GameController({ store, galaxy, tree, encounters, world });

  // ── Views ──
  const app = document.getElementById('app')!;
  const mapEl = document.createElement('div');
  mapEl.className = 'map';
  app.append(mapEl);
  const map = new MapView({ container: mapEl, galaxyRadius: galaxy.params.radius, onClick: controller.handleClick, onHover: controller.handleHover, onFrame: controller.onFrame });

  map.layers.add(new GalaxyCloudLayer(galaxy));
  map.layers.add(new MidStarLayer(galaxy));
  const sectors = map.layers.add(new SectorOverlayLayer(galaxy.params.radius, DEFAULT_ADDRESS_SCHEME));
  map.layers.add(new TerritoryLayer(world.claims));
  const hexGrid = map.layers.add(new HexGridLayer(galaxy.params.radius));
  map.layers.add(new NearStarLayer(galaxy));
  const selection = map.layers.add(new SelectionLayer());
  const fleetLayer = map.layers.add(new FleetLayer(factory, formatDuration));

  const topBar = new TopBar(store, controller, identity.displayName);
  const hud = new Hud();
  const starInfo = new StarInfoPanel(store, controller, controller.describe);
  const panels: Record<PanelId, ShipyardPanel | ResearchPanel | ExplorePanel> = {
    shipyard: new ShipyardPanel(store, controller, factory, styles, traits, controller.unlockedTraits, controller.effectiveDesign),
    research: new ResearchPanel(store, controller, tree, BRANCHES),
    explore: new ExplorePanel(store, controller, controller.planets, tree),
  };
  app.append(topBar.el, hud.el, starInfo.el, ...Object.values(panels).map((p) => p.el));

  controller.attach({ map, hexGrid, selection, sectors, fleets: fleetLayer, hud, topBar, panels });

  // ── Start ──
  const home = hexToWorld(world.home.hex);
  map.controller.focus.set(home.x, home.z);
  if (params.get('view') === 'galaxy') {
    map.controller.zoom.setTargetAltitude(map.controller.zoom.config.galaxyPreset);
  } else if (params.get('view') === 'sector') {
    map.controller.zoom.setTargetAltitude(1_500);
  } else {
    map.controller.zoom.setTargetAltitude(Number(params.get('alt')) || 55);
  }
  map.controller.zoom.snap();
  controller.select(world.home);
  const panel = params.get('panel') as PanelId | null;
  if (panel && panel in panels) controller.openPanel(panel);
  if (params.get('paused')) controller.setSpeed(0);

  window.addEventListener('keydown', (e) => {
    if ((e.target as HTMLElement).tagName === 'INPUT') return;
    if (e.key === 'g' || e.key === 'G') controller.toggleView();
    if (e.key === 'Escape') controller.select(null);
    if (e.key === 'h' || e.key === 'H') controller.flyTo(world.home, true);
  });
  map.start();
  if (import.meta.env.DEV) Object.assign(window, { falchion: controller });
}

function initialFleets(galaxy: GalaxyModel, world: ReturnType<typeof createMockWorld>, player: string): FleetView[] {
  const target = galaxy.nearestStar(hexAdd(world.home.hex, { q: 22, r: -9 }), 10) ?? world.home;
  const nova = world.neighbours.find((n) => n.name === 'Nova Collective')!;
  const vossk = world.neighbours.find((n) => n.name === 'Vossk Hegemony')!;
  const arrakai = world.neighbours.find((n) => n.name === 'House Arrakai')!;
  return [
    { id: 'scout-1', name: 'Scout Wing I', owner: player, color: '#5dff9b', movement: planMovement(world.home.hex, target.hex, -3, 2),
      design: { ...DEFAULT_DESIGN, name: 'Scout', seed: 7 } },
    // Nova's survey fleet is heading to the same star: contact (lockstep) when they meet.
    { id: 'nova-1', name: 'Nova Survey Group', owner: 'Nova Collective', color: '#4fd1ff', movement: planMovement(nova.home.hex, target.hex, 12 - hexDistance(nova.home.hex, target.hex) / 3.5, 3.5),
      design: { ...DEFAULT_DESIGN, name: 'Nova', style: 'geometric', seed: 31, colors: { primary: '#e8f6ff', secondary: '#1b4b6b', accent: '#4fd1ff' } } },
    { id: 'vossk-1', name: 'Vossk Raiders', owner: 'alien:Vossk', color: '#ff5d5d', movement: planMovement(vossk.home.hex, world.home.hex, -10, 1.5),
      design: { ...DEFAULT_DESIGN, name: 'Vossk', style: 'organic', seed: 66, colors: { primary: '#5a1f1f', secondary: '#2a0d0d', accent: '#ff3b3b' }, weapons: 4 } },
    { id: 'arrakai-1', name: 'Arrakai Expedition', owner: 'House Arrakai', color: '#c792ea', movement: planMovement(arrakai.home.hex, world.home.hex, -100, 2.5),
      design: { ...DEFAULT_DESIGN, name: 'Arrakai', style: 'classic', seed: 12, colors: { primary: '#f2f2f2', secondary: '#c9a227', accent: '#7ad7ff' } } },
  ];
}

bootstrap();
