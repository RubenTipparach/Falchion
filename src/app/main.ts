import '../ui/styles.css';
import { EncounterResolver } from '../core/encounters/Encounters';
import { newEmpire } from '../core/empire/Empire';
import { planMovement, travelTurns } from '../core/fleet/Fleet';
import { formatDuration } from '../core/time/WorldTime';
import { CLOCK, connectWorldClock } from './WorldClock';
import { SaveGame, savedHome } from './SaveGame';
import { DEFAULT_ADDRESS_SCHEME } from '../core/galaxy/GalacticAddress';
import { GalaxyModel } from '../core/galaxy/GalaxyModel';
import { hexAdd, hexDistance, hexToWorld, worldToHex } from '../core/hex/Hex';
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
import { BUILDINGS, STORAGE } from '../content/buildings';
import { specOf, upkeepOf } from '../content/logistics';
import { planetsOf, Planet } from '../core/galaxy/Planets';
import { PlanetThumbnails } from '../render/planets/PlanetThumbnails';
import { NebulaLayer } from '../render/map/NebulaLayer';
import { NebulaSkyboxLayer } from '../render/map/NebulaSkyboxLayer';
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
import { GUEST, probeSession } from './identity';
import { colorFor, othersOnMap, ownClaim, publicEmpire, ServerSaves } from './ServerSync';
import { cleanIdentity, suggestIdentity } from '../core/empire/Identity';
import { HERALDRY } from '../content/heraldry';
import { showFounding } from '../ui/Founding';
import { showSignIn } from '../ui/SignIn';
import { Store } from './Store';
import { createWorld } from './World';
import { setupChat } from './ChatSetup';

/** Composition root: build the pure services, the views, and wire them together. */
async function bootstrap(): Promise<void> {
  // Signed in with Discord (session cookie on the Falchion server), or offer the choice; guests
  // play in this browser only, and static hosting (no server) goes straight to guest play.
  const probe = await probeSession();
  const identity = probe.user ?? (probe.server && probe.authEnabled ? await showSignIn(GUEST) : GUEST);
  const signedIn = identity.provider === 'discord';

  // ── Domain ──
  const galaxy = new GalaxyModel();
  const tree = new TechTree(TECH_NODES, SHARD_SOURCES);
  const encounters = new EncounterResolver(DEFAULT_LOOT_TABLES, tree);
  const saveGame = new SaveGame(galaxy.params.seed, undefined, signedIn ? identity.id : undefined);
  const serverSaves = signedIn ? new ServerSaves() : null;
  let saved = saveGame.load();
  if (serverSaves) {
    // The server copy follows the player between devices; use whichever is further along.
    const remote = await serverSaves.load();
    if (saveGame.valid(remote) && (!saved || remote.turn >= saved.turn)) saved = remote;
  }
  // A saved empire keeps its home system wherever the galaxy puts stars now.
  const world = createWorld(galaxy, signedIn ? identity.id : undefined, savedHome(saved));
  const { factory, styles, traits } = createDefaultShipFactory();
  const partners = tradePartners(world, world.home);
  const economyTables: EconomyTables = { tree, classes: SHIP_CLASSES, governments: GOVERNMENTS, policies: POLICIES, tenets: TENETS, partners, alienTech: ALIEN_TECH, buildings: BUILDINGS, storage: STORAGE, upkeepOf };

  // Starting position: a young empire with a few roots researched and a small fleet.
  let research = newEmpire(identity.displayName).research;
  for (const id of ['t-alloys', 'u-modular', 'a-heritage', 'a-duelist-tradition', 'o-grown-hulls', 'u-logistics']) {
    research = tree.research(tree.grantShards(research, id, 'science', tree.node(id).shards), id);
  }
  research = tree.grantShards(research, 't-lasers', 'science', 50);
  research = tree.grantShards(research, 'u-mining', 'science', 4);
  research = tree.grantShards(research, 'a-diplomacy', 'observation', 3);
  const empire = { ...newEmpire(identity.displayName), research };

  // Colonies are real planets: an empire starts with one star system, settled on three of its worlds (the capital has a shipyard).
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
  const clock = await connectWorldClock();
  const t0 = clock.tick();
  const start = initialFleets(galaxy, world, identity.displayName, t0);
  const houseDesign = { ...DEFAULT_DESIGN, colors: { primary: '#c8d0dc', secondary: '#2b3448', accent: '#ffb547' } };

  const fresh: GameState = {
    turn: t0, empire,
    economy: {
      roster: start.roster, government: 'council', policies: [], routes: [{ partnerId: partners[0].id }],
      faith: null, spyNetworks: [], focus: 't-fusion', colonies,
    },
    designs: { prospector: { ...houseDesign, name: 'Prospector Skiff', style: 'utilitarian', seed: 4, length: 0.8, bulk: 0.8, engines: 2, weapons: 0 } },
    shipyardClass: 'prospector', hiddenTraits: [], home: world.home,
    selected: null, selectedFleet: null, selectedPlanet: null, explored: {}, openedCrates: [], collectedCaches: [], fleets: start.fleets, loadouts: start.loadouts, dockSpent: { supply: 0, ammo: 0 }, depots: [], construction: [], playerName: identity.displayName,
    lastReport: null, engaged: [], identity: null,
    dispatches: [{ turn: t0, text: 'Welcome, Commander. One year passes every minute. Survey Group Alpha is on station nearby: explore its planets and collect what you find. Ships need supply to explore and ammunition to fight; both refill in friendly systems.' }],
  };
  // A saved empire carries on where it left off; the missed years are caught up below.
  const store = new Store<GameState>(saved ? { ...fresh, ...saved, home: world.home, identity: cleanIdentity(saved.identity, HERALDRY) } : fresh);

  const controller = new GameController({ store, galaxy, tree, encounters, world, economy: economyTables, clock, save: saveGame,
    // Signed-in players' notable news goes to the Discord channel (the server rate-limits it).
    report: signedIn ? (kind, text) => { void fetch('./api/events', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind, text }) }).catch(() => {}); } : undefined,
  });

  // ── Views ──
  const app = document.getElementById('app')!;
  const mapEl = document.createElement('div');
  mapEl.className = 'map';
  app.append(mapEl);
  const map = new MapView({ container: mapEl, galaxyRadius: galaxy.params.radius, onClick: controller.handleClick, onRightClick: controller.handleRightClick, onHover: controller.handleHover, onFrame: controller.onFrame });

  map.layers.add(new StarfieldLayer(galaxy.params.seed));
  map.layers.add(new NebulaLayer(galaxy.params.seed));
  // System view: the star (or a followed ship in deep space) sits inside the map's nebula.
  map.layers.add(new NebulaSkyboxLayer(galaxy.params.seed, (x, z) => {
    const star = galaxy.nearestStar(worldToHex(x, z), 1);
    return star && { id: star.id, x: star.position.x, z: star.position.z };
  }));
  map.layers.add(new GalaxyDiscLayer(galaxy.params));
  map.layers.add(new GalaxyCloudLayer(galaxy));
  map.layers.add(new MidStarLayer(galaxy));
  const sectors = map.layers.add(new SectorOverlayLayer(galaxy.params.radius, DEFAULT_ADDRESS_SCHEME));
  // Neighbours are fixed; your own territory follows your colonies and identity.
  const territory = map.layers.add(new TerritoryLayer(world.claims.filter((c) => c.kind !== 'player')));
  territory.setOwn(ownClaim(store.state));
  store.subscribe((s, prev) => { if (s.identity !== prev.identity || s.economy.colonies !== prev.economy.colonies) territory.setOwn(ownClaim(s)); });
  const hexGrid = map.layers.add(new HexGridLayer(galaxy.params.radius));
  const nearStars = map.layers.add(new NearStarLayer(galaxy));
  nearStars.surveyed = controller.surveyedPercent;
  const system = map.layers.add(new SystemLayer(galaxy, { isHome: (s) => s.id === world.home.id, onPlanetClick: (star, planet) => controller.focusPlanet(star, planet) }));
  const selection = map.layers.add(new SelectionLayer());
  const fleetLayer = map.layers.add(new FleetLayer(factory, (years) => formatDuration(years, CLOCK), (h) => galaxy.starAt(h)?.position ?? hexToWorld(h), (id) => controller.selectFleet(id)));

  const zoomCfg = map.controller.zoom.config;
  const topBar = new TopBar(store, controller, identity, clock, controller.caps);
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
      unlockedStyles: controller.unlockedStyles,
      foundingStyle: controller.foundingStyle,
      buildDiscount: () => Math.min(40, controller.bonus('build')),
    }),
    research: new ResearchPanel(store, controller, tree, BRANCHES, DOMAINS, economyTables),
    empire: new EmpirePanel(store, controller, controller, economyTables, world.neighbours.map((n) => n.name), thumb),
    war: new WarRoomPanel(store, controller, controller),
    explore: new ExplorePanel(store, controller, controller, controller.planets, tree, thumb),
    fleets: new FleetsPanel(store, controller, controller),
  };
  app.append(topBar.el, hud.banner, hud.el, hud.ladder, starInfo.el, dispatches.el, ...Object.values(panels).map((p) => p.el));

  controller.attach({ map, hexGrid, selection, sectors, fleets: fleetLayer, hud, topBar, panels, system });
  // In-game chat (global + DMs, location links, @mentions): see ChatSetup.
  const chat = setupChat({ identity, canSignIn: probe.server && probe.authEnabled, galaxy, controller, panels: Object.values(panels) });
  topBar.addTab(chat.tab);
  app.append(chat.el);

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
    if (e.key === 'Escape' && store.state.selectedFleet) { controller.selectFleet(null); return; }
    if (e.key === 'Escape') { if (store.state.selectedPlanet && store.state.selected) controller.focusPlanet(store.state.selected, null); else controller.select(null); }
    if (e.key === 'h' || e.key === 'H') controller.flyTo(world.home, true);
    if (import.meta.env.DEV && e.key === 'Enter' && tag !== 'BUTTON') controller.skipYear();
  });
  // The world runs on: one year per minute, pushed by the server when there is one.
  // Other players in the shared galaxy: their territory and fleets, refreshed every year.
  const refreshOthers = async () => {
    if (!serverSaves) return;
    const { fleets, claims } = othersOnMap(await serverSaves.players());
    controller.setOtherFleets(fleets);
    territory.setDynamic(claims);
  };
  void refreshOthers();
  clock.onTick((tick) => { controller.advanceTo(tick); void refreshOthers(); });
  // Saved journeys planned at other speeds continue at the empire's speed, then the missed years run.
  controller.retimeFleets();
  controller.advanceTo(clock.tick());
  document.addEventListener('visibilitychange', () => { if (!document.hidden) controller.advanceTo(clock.tick()); });
  let saveTimer = 0;
  const persist = () => {
    saveGame.save(store.state);
    // The server copy starts once the empire is founded, so the galaxy (and the Discord channel)
    // first hears of a new player with their chosen name and flag.
    if (serverSaves && store.state.identity && !saveGame.stoppedSaving) serverSaves.push(saveGame.snapshot(store.state), publicEmpire(store.state, colorFor(identity.id)));
  };
  store.subscribe(() => { clearTimeout(saveTimer); saveTimer = window.setTimeout(persist, 1500); });
  // Leaving or reloading: write the local save and send the server copy now, so another device
  // (or this one after a reload) picks up exactly where this tab left off.
  const persistNow = () => { clearTimeout(saveTimer); persist(); serverSaves?.flush(); };
  window.addEventListener('pagehide', persistNow);
  // A new version on the server: save, say so, and reload onto it.
  clock.onNewVersion(() => {
    persistNow();
    hud.setContact('Falchion was updated. Saving and reloading…');
    setTimeout(() => location.reload(), 2_500);
  });
  // One tab plays the empire: if another tab saves it, this one stops writing and offers to take over.
  // Server announcements (set in the admin portal) show as a banner for everyone.
  let tabWarning = false;
  const showAnnouncement = async () => {
    if (!probe.server || tabWarning) return;
    try {
      const res = await fetch('./api/announcement', { cache: 'no-store' });
      const a = res.ok ? ((await res.json()) as { text?: string; by?: string }) : {};
      hud.setContact(a.text ? `📣 ${a.text}${a.by ? ` (${a.by})` : ''}` : null);
    } catch {
      // Offline: keep whatever is showing.
    }
  };
  void showAnnouncement();
  clock.onTick(() => void showAnnouncement());
  saveGame.onOtherTab(() => {
    tabWarning = true;
    saveGame.stop();
    hud.setContact('This empire is open in another tab, so this tab stopped saving. Reload here to play in this tab instead.');
  });
  persist();
  map.start();

  // Founding screen: a new empire (or one saved before identities existed) chooses its name,
  // ruler, capital, colour and flag; the Empire panel and top bar reopen it to edit.
  const capitalName = () => store.state.economy.colonies.find((c) => c.capital)?.name.replace(/ \(capital\)$/, '') ?? world.home.name;
  const found = async () => {
    const chosen = await showFounding(suggestIdentity(galaxy.params.seed, identity.displayName, capitalName(), HERALDRY), HERALDRY, 'found');
    if (!chosen) return;
    controller.setIdentity(chosen, true);
    persistNow();
  };
  controller.onEditEmpire = async () => {
    const current = store.state.identity;
    if (!current) return void found();
    const chosen = await showFounding(current, HERALDRY, 'edit');
    if (!chosen) return;
    controller.setIdentity(chosen, false);
    persistNow();
  };
  if (!store.state.identity) void found();
  if (import.meta.env.DEV) Object.assign(window, { falchion: controller });
}

/** Starting fleets, timed relative to the year the empire is founded (t0). */
function initialFleets(galaxy: GalaxyModel, world: ReturnType<typeof createWorld>, player: string, t0: number) {
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
    { id: 'scout-1', name: 'Scout Wing I', owner: player, color: '#e6b450', movement: planMovement(home, target.hex, t0 - 2, 1), design: house('Scout', 7, 'technological') },
    { id: 'survey-1', name: 'Survey Group Alpha', owner: player, color: '#e6b450', movement: planMovement(home, survey.hex, t0 - 6, 1), design: house('Survey', 9, 'technological') },
    { id: 'strike-1', name: '1st Strike Group', owner: player, color: '#e6b450', movement: planMovement(home, raiders.hex, t0 + 3 - hexDistance(home, raiders.hex), 1), design: house('Strike', 21, 'classic') },
    { id: 'nova-1', name: 'Nova Survey Group', owner: 'Nova Collective', color: '#4fd1ff', movement: planMovement(nova.home.hex, target.hex, t0 + 7 - travelTurns(hexDistance(nova.home.hex, target.hex), 1), 1),
      design: { ...DEFAULT_DESIGN, name: 'Nova', style: 'geometric', seed: 31, colors: { primary: '#e8f6ff', secondary: '#1b4b6b', accent: '#4fd1ff' } } },
    { id: 'vossk-1', name: 'Vossk Raiders', owner: 'alien:Vossk', color: '#ff5d5d', movement: planMovement(vossk.home.hex, world.home.hex, t0 - 10, 1),
      design: { ...DEFAULT_DESIGN, name: 'Vossk', style: 'organic', seed: 66, colors: { primary: '#5a1f1f', secondary: '#2a0d0d', accent: '#ff3b3b' }, weapons: 4 } },
    { id: 'arrakai-1', name: 'Arrakai Expedition', owner: 'House Arrakai', color: '#c792ea', movement: planMovement(arrakai.home.hex, world.home.hex, t0 - 100, 1),
      design: { ...DEFAULT_DESIGN, name: 'Arrakai', style: 'classic', seed: 12, colors: { primary: '#f2f2f2', secondary: '#c9a227', accent: '#7ad7ff' } } },
  ];
  const loadout = (ships: Squadron[], supply?: number): Loadout => ({ ships, ...fullStores(ships, specOf), ...(supply === undefined ? {} : { supply }) });
  const loadouts: Record<string, Loadout> = {
    'scout-1': loadout([{ classId: 'pathfinder', count: 2 }]),
    'survey-1': { ...loadout([{ classId: 'survey-cutter', count: 2 }], 15), orders: { autoReturn: true } },
    // Wins against the raiders with full magazines, loses at half: ammunition matters.
    'strike-1': loadout([{ classId: 'lancer', count: 6 }, { classId: 'railgun-monitor', count: 2 }, { classId: 'interceptor', count: 2 }]),
  };
  // Roster = every ship owned: deployed fleets plus the home dock.
  const roster: Record<string, number> = { prospector: 3, 'ice-cutter': 1, 'bulk-freighter': 1, interceptor: 2, 'survey-cutter': 1, 'colony-ark': 1, 'construction-tender': 1 };
  for (const l of Object.values(loadouts)) for (const x of l.ships) roster[x.classId] = (roster[x.classId] ?? 0) + x.count;
  return { fleets, loadouts, roster };
}

bootstrap();
