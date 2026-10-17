import '../ui/styles.css';
import { EncounterResolver } from '../core/encounters/Encounters';
import { newEmpire } from '../core/empire/Empire';
import { formatTurns, planMovement, travelTurns } from '../core/fleet/Fleet';
import { DEFAULT_ADDRESS_SCHEME } from '../core/galaxy/GalacticAddress';
import { GalaxyModel } from '../core/galaxy/GalaxyModel';
import { hexAdd, hexDistance, hexToWorld } from '../core/hex/Hex';
import { TechTree } from '../core/research/TechTree';
import { DEFAULT_DESIGN } from '../core/ships/ShipDesign';
import { DEFAULT_LOOT_TABLES } from '../content/lootTables';
import { SHARD_SOURCES } from '../content/shardSources';
import { ALIEN_TECH, BRANCHES, DOMAINS, TECH_NODES } from '../content/techTree';
import { SHIP_CLASSES } from '../content/shipClasses';
import { GOVERNMENTS, POLICIES, TENETS } from '../content/society';
import type { Colony, EconomyTables } from '../core/economy/Economy';
import type { Squadron } from '../core/combat/Combat';
import { fullStores } from '../core/fleet/Logistics';
import type { Loadout } from '../core/fleet/Presence';
import { BUILDINGS } from '../content/buildings';
import { specOf } from '../content/logistics';
import { planetsOf, Planet } from '../core/galaxy/Planets';
import { PlanetThumbnails } from '../render/planets/PlanetThumbnails';
import { NebulaLayer } from '../render/map/NebulaLayer';
import { GalaxyDiscLayer } from '../render/map/GalaxyDiscLayer';
import { StarfieldLayer } from '../render/map/StarfieldLayer';
import { SystemLayer } from '../render/map/SystemLayer';
import { Dispatches } from '../ui/Dispatches';
import type { Drawer } from '../ui/Drawer';
import { EmpirePanel } from '../ui/panels/EmpirePanel';
import { WarRoomPanel } from '../ui/panels/WarRoomPanel';
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
import { Hud } from '../ui/Hud';
import { StarInfoPanel } from '../ui/StarInfoPanel';
import { TopBar } from '../ui/TopBar';
import { ExplorePanel } from '../ui/panels/ExplorePanel';
import { FleetsPanel } from '../ui/panels/FleetsPanel';
import { ResearchPanel } from '../ui/panels/ResearchPanel';
import { ShipyardPanel } from '../ui/panels/ShipyardPanel';
import type { PanelId } from '../ui/GameActions';
import { GameController, tradePartners } from './GameController';
import type { GameState } from './GameState';
import { MockDiscordIdentityProvider } from './identity';
import { Store } from './Store';
import { createWorld } from './World';

/** Composition root: build the pure services, the views, and wire them together. */
async function bootstrap(): Promise<void> {
  const identity = await new MockDiscordIdentityProvider().signIn();

  // ── Domain ──
  const galaxy = new GalaxyModel();
  const tree = new TechTree(TECH_NODES, SHARD_SOURCES);
  const encounters = new EncounterResolver(DEFAULT_LOOT_TABLES, tree);
  const world = createWorld(galaxy);
  const { factory, styles, traits } = createDefaultShipFactory();
  const partners = tradePartners(world, world.home);
  const economyTables: EconomyTables = { tree, classes: SHIP_CLASSES, governments: GOVERNMENTS, policies: POLICIES, tenets: TENETS, partners, alienTech: ALIEN_TECH, buildings: BUILDINGS };

  // Starting position: a young empire with a few roots researched and a small fleet.
  let research = newEmpire(identity.displayName).research;
  for (const id of ['t-alloys', 'u-modular', 'a-heritage', 'a-duelist-tradition', 'o-grown-hulls', 'u-logistics']) {
    research = tree.research(tree.grantShards(research, id, 'science', tree.node(id).shards), id);
  }
  research = tree.grantShards(research, 't-lasers', 'science', 50);
  research = tree.grantShards(research, 'u-mining', 'science', 4);
  research = tree.grantShards(research, 'a-diplomacy', 'observation', 3);
  const empire = { ...newEmpire(identity.displayName), research };

  // Colonies are real planets: three in the home system (the capital has a shipyard) and one in each claimed system.
  const homePlanets = planetsOf(world.home, galaxy.params.seed);
  const colonyOf = (p: Planet, buildings: string[], capital = false): Colony =>
    ({ name: capital ? `${p.name} (capital)` : p.name, biome: p.biome, planetId: p.id, starId: p.starId, size: p.size, capital, buildings });
  // Capital on the most habitable world; gas giants cannot be settled.
  const HABITABLE = ['terran', 'ocean', 'jungle', 'desert', 'ice', 'barren', 'volcanic', 'toxic'];
  const settleable = homePlanets.filter((p) => p.biome !== 'gas')
    .sort((a, b) => HABITABLE.indexOf(a.biome) - HABITABLE.indexOf(b.biome) || b.size - a.size);
  const colonies: Colony[] = [
    ...settleable.slice(0, 1).map((p) => colonyOf(p, ['shipyard', 'farm', 'trade-hub'], true)),
    ...settleable.slice(1, 3).map((p) => colonyOf(p, ['mine'])),
  ];
  const claim = world.claims.find((c) => c.kind === 'player')!;
  for (const c of claim.colonies.slice(1)) {
    const star = galaxy.starAt(c.hex);
    const p = star && star.id !== world.home.id ? planetsOf(star, galaxy.params.seed).find((x) => x.biome !== 'gas') : undefined;
    if (p && !colonies.some((x) => x.planetId === p.id)) colonies.push(colonyOf(p, ['farm']));
  }
  const start = initialFleets(galaxy, world, identity.displayName);
  const houseDesign = { ...DEFAULT_DESIGN, colors: { primary: '#c8d0dc', secondary: '#2b3448', accent: '#ffb547' } };

  const store = new Store<GameState>({
    turn: 1, empire,
    economy: {
      roster: start.roster, government: 'council', policies: [], routes: [{ partnerId: partners[0].id }],
      faith: null, spyNetworks: [], focus: 't-fusion', colonies,
    },
    designs: { prospector: { ...houseDesign, name: 'Prospector Skiff', style: 'utilitarian', seed: 4, length: 0.8, bulk: 0.8, engines: 2, weapons: 0 } },
    shipyardClass: 'prospector', hiddenTraits: [], home: world.home,
    selected: null, selectedPlanet: null, explored: {}, openedCrates: [], collectedCaches: [], fleets: start.fleets, loadouts: start.loadouts, dockSpent: { supply: 0, ammo: 0 }, depots: [], contact: null, playerName: identity.displayName,
    lastReport: null, engaged: [],
    dispatches: [{ turn: 1, text: 'Welcome, Commander. Survey Group Alpha is on station nearby: explore its planets, collect what you find, then end the turn. Ships need supply to explore and ammunition to fight; both refill in friendly systems.' }],
  });

  const controller = new GameController({ store, galaxy, tree, encounters, world, economy: economyTables });

  // ── Views ──
  const app = document.getElementById('app')!;
  const mapEl = document.createElement('div');
  mapEl.className = 'map';
  app.append(mapEl);
  const map = new MapView({ container: mapEl, galaxyRadius: galaxy.params.radius, onClick: controller.handleClick, onHover: controller.handleHover, onFrame: controller.onFrame });

  map.layers.add(new StarfieldLayer(galaxy.params.seed));
  map.layers.add(new NebulaLayer(galaxy.params.seed));
  map.layers.add(new GalaxyDiscLayer(galaxy.params));
  map.layers.add(new GalaxyCloudLayer(galaxy));
  map.layers.add(new MidStarLayer(galaxy));
  const sectors = map.layers.add(new SectorOverlayLayer(galaxy.params.radius, DEFAULT_ADDRESS_SCHEME));
  map.layers.add(new TerritoryLayer(world.claims));
  const hexGrid = map.layers.add(new HexGridLayer(galaxy.params.radius));
  map.layers.add(new NearStarLayer(galaxy));
  const system = map.layers.add(new SystemLayer(galaxy, { isHome: (s) => s.id === world.home.id, onPlanetClick: (star, planet) => controller.focusPlanet(star, planet) }));
  const selection = map.layers.add(new SelectionLayer());
  const fleetLayer = map.layers.add(new FleetLayer(factory, formatTurns));

  const zoomCfg = map.controller.zoom.config;
  const topBar = new TopBar(store, controller, identity.displayName);
  const hud = new Hud({ min: zoomCfg.minAltitude, max: zoomCfg.maxAltitude }, (alt) => controller.zoomTo(alt));
  const thumbs = new PlanetThumbnails(80);
  const thumb = (p: Planet) => thumbs.url(p);
  const starInfo = new StarInfoPanel(store, controller, controller, controller.describe, thumb, economyTables);
  const dispatches = new Dispatches(store);
  const panels: Record<PanelId, Drawer> = {
    shipyard: new ShipyardPanel(store, controller, controller, factory, styles, traits, tree, {
      isUnlocked: controller.isClassUnlocked,
      designFor: controller.designFor,
      effectiveDesign: controller.effectiveDesign,
      unlockedTraits: controller.unlockedTraits,
      buildDiscount: () => Math.min(40, controller.bonus('build')),
    }),
    research: new ResearchPanel(store, controller, tree, BRANCHES, DOMAINS, economyTables),
    empire: new EmpirePanel(store, controller, controller, economyTables, world.neighbours.map((n) => n.name)),
    war: new WarRoomPanel(store, controller, controller),
    explore: new ExplorePanel(store, controller, controller, controller.planets, tree, thumb),
    fleets: new FleetsPanel(store, controller, controller),
  };
  app.append(topBar.el, hud.banner, hud.el, hud.ladder, starInfo.el, dispatches.el, ...Object.values(panels).map((p) => p.el));

  controller.attach({ map, hexGrid, selection, sectors, fleets: fleetLayer, hud, topBar, panels, system });

  // ── Start ──
  const home = hexToWorld(world.home.hex);
  map.controller.focus.set(home.x, home.z);
  map.controller.zoom.setTargetAltitude(48);
  map.controller.zoom.snap();
  controller.select(world.home);

  window.addEventListener('keydown', (e) => {
    const tag = (e.target as HTMLElement).tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    if (e.key === 'g' || e.key === 'G') controller.toggleView();
    if (e.key === 'Escape') { if (store.state.selectedPlanet && store.state.selected) controller.focusPlanet(store.state.selected, null); else controller.select(null); }
    if (e.key === 'h' || e.key === 'H') controller.flyTo(world.home, true);
    if (e.key === 'Enter' && tag !== 'BUTTON') controller.endTurn();
  });
  map.start();
  if (import.meta.env.DEV) Object.assign(window, { falchion: controller });
}

function initialFleets(galaxy: GalaxyModel, world: ReturnType<typeof createWorld>, player: string) {
  const home = world.home.hex;
  const near = (dq: number, dr: number) => galaxy.nearestStar(hexAdd(home, { q: dq, r: dr }), 10) ?? world.home;
  const target = near(22, -9);
  const survey = near(5, -3);
  const nova = world.neighbours.find((n) => n.name === 'Nova Collective')!;
  const vossk = world.neighbours.find((n) => n.name === 'Vossk Hegemony')!;
  const arrakai = world.neighbours.find((n) => n.name === 'House Arrakai')!;
  const house = (name: string, seed: number, style = DEFAULT_DESIGN.style) => ({ ...DEFAULT_DESIGN, name, style, seed, colors: { primary: '#c8d0dc', secondary: '#2b3448', accent: '#ffb547' } });
  // Raiders sit 15% of the way to Vossk space; a strike group is already on its way.
  const toVossk = { q: Math.round(home.q + (vossk.home.hex.q - home.q) * 0.15), r: Math.round(home.r + (vossk.home.hex.r - home.r) * 0.15) };
  const raiders = galaxy.nearestStar(toVossk, 12) ?? world.home;
  const fleets: FleetView[] = [
    { id: 'scout-1', name: 'Scout Wing I', owner: player, color: '#e6b450', movement: planMovement(home, target.hex, -2, 4), design: house('Scout', 7, 'technological') },
    { id: 'survey-1', name: 'Survey Group Alpha', owner: player, color: '#e6b450', movement: planMovement(home, survey.hex, -6, 3), design: house('Survey', 9, 'technological') },
    { id: 'strike-1', name: '1st Strike Group', owner: player, color: '#e6b450', movement: planMovement(home, raiders.hex, 3 - hexDistance(home, raiders.hex), 1), design: house('Strike', 21, 'classic') },
    // Nova's survey fleet is heading to the same star: contact (lockstep) a few turns in.
    { id: 'nova-1', name: 'Nova Survey Group', owner: 'Nova Collective', color: '#4fd1ff', movement: planMovement(nova.home.hex, target.hex, 7 - travelTurns(hexDistance(nova.home.hex, target.hex), 3), 3),
      design: { ...DEFAULT_DESIGN, name: 'Nova', style: 'geometric', seed: 31, colors: { primary: '#e8f6ff', secondary: '#1b4b6b', accent: '#4fd1ff' } } },
    { id: 'vossk-1', name: 'Vossk Raiders', owner: 'alien:Vossk', color: '#ff5d5d', movement: planMovement(vossk.home.hex, world.home.hex, -10, 2),
      design: { ...DEFAULT_DESIGN, name: 'Vossk', style: 'organic', seed: 66, colors: { primary: '#5a1f1f', secondary: '#2a0d0d', accent: '#ff3b3b' }, weapons: 4 } },
    { id: 'arrakai-1', name: 'Arrakai Expedition', owner: 'House Arrakai', color: '#c792ea', movement: planMovement(arrakai.home.hex, world.home.hex, -100, 3),
      design: { ...DEFAULT_DESIGN, name: 'Arrakai', style: 'classic', seed: 12, colors: { primary: '#f2f2f2', secondary: '#c9a227', accent: '#7ad7ff' } } },
  ];
  const loadout = (ships: Squadron[], supply?: number): Loadout => ({ ships, ...fullStores(ships, specOf), ...(supply === undefined ? {} : { supply }) });
  const loadouts: Record<string, Loadout> = {
    'scout-1': loadout([{ classId: 'pathfinder', count: 2 }]),
    'survey-1': loadout([{ classId: 'survey-cutter', count: 2 }], 15),
    // Wins against the raiders with full magazines, loses at half: ammunition matters.
    'strike-1': loadout([{ classId: 'lancer', count: 6 }, { classId: 'railgun-monitor', count: 2 }, { classId: 'interceptor', count: 2 }]),
  };
  // Roster = every ship owned: deployed fleets plus the home dock.
  const roster: Record<string, number> = { prospector: 3, 'ice-cutter': 1, 'bulk-freighter': 1, interceptor: 2, 'survey-cutter': 1, 'colony-ark': 1, 'construction-tender': 1 };
  for (const l of Object.values(loadouts)) for (const x of l.ships) roster[x.classId] = (roster[x.classId] ?? 0) + x.count;
  return { fleets, loadouts, roster };
}

bootstrap();
