import '../ui/styles.css';
import { EncounterResolver } from '../core/encounters/Encounters';
import { formatDuration } from '../core/time/WorldTime';
import { CLOCK, connectWorldClock } from './WorldClock';
import { SaveGame, savedHome, type SavedGame, upgradeSave } from './SaveGame';
import { DEFAULT_ADDRESS_SCHEME } from '../core/galaxy/GalacticAddress';
import { GalaxyModel } from '../core/galaxy/GalaxyModel';
import { hexToWorld, worldToHex } from '../core/hex/Hex';
import { TechTree } from '../core/research/TechTree';
import { DEFAULT_LOOT_TABLES } from '../content/lootTables';
import { SHARD_SOURCES } from '../content/shardSources';
import { ALIEN_TECH, BRANCHES, DOMAINS, TECH_NODES } from '../content/techTree';
import { SHIP_CLASSES } from '../content/shipClasses';
import { GOVERNMENTS, POLICIES, TENETS } from '../content/society';
import type { EconomyTables } from '../core/economy/Economy';
import type { Market } from '../core/economy/Trade';
import { BUILDINGS, STORAGE } from '../content/buildings';
import { upkeepOf } from '../content/logistics';
import { Planet } from '../core/galaxy/Planets';
import { PlanetThumbnails } from '../render/planets/PlanetThumbnails';
import { createThumbs } from '../render/thumbs/Thumbnails';
import { preloadHullTextures } from '../render/ships/hullTextures';
import { setThumbs } from '../ui/thumbs';
import { ResourceLedger } from '../ui/ResourceLedger';
import { NebulaLayer } from '../render/map/NebulaLayer';
import { LowResBackground } from '../render/map/LowResBackground';
import { touchFirst } from '../ui/dom';
import { NebulaSkyboxLayer } from '../render/map/NebulaSkyboxLayer';
import { GalaxyDiscLayer } from '../render/map/GalaxyDiscLayer';
import { StarfieldLayer } from '../render/map/StarfieldLayer';
import { SystemLayer } from '../render/map/SystemLayer';
import { SurfaceLayer } from '../render/planets/surface/SurfaceLayer';
import { BattleLayer } from '../render/battle/BattleLayer';
import { MegaBeaconLayer } from '../render/map/MegaBeaconLayer';
import { BattleMarkerLayer } from '../render/map/BattleMarkerLayer';
import { BattleHud } from '../ui/BattleHud';
import { Dispatches } from '../ui/Dispatches';
import type { Drawer } from '../ui/Drawer';
import { EmpirePanel } from '../ui/panels/EmpirePanel';
import { WarRoomPanel } from '../ui/panels/WarRoomPanel';
import { FleetLayer } from '../render/map/FleetLayer';
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
import { CityLocator } from '../ui/CityLocator';
import { TopBar } from '../ui/TopBar';
import { ExplorePanel } from '../ui/panels/ExplorePanel';
import { FleetsPanel } from '../ui/panels/FleetsPanel';
import { ResearchPanel } from '../ui/panels/ResearchPanel';
import { ShipyardPanel } from '../ui/panels/ShipyardPanel';
import { SearchPanel } from '../ui/panels/SearchPanel';
import type { PanelId } from '../ui/GameActions';
import { GameController } from './GameController';
import { SharedWorldClient } from './SharedWorldClient';
import type { GameState } from './GameState';
import { GUEST, probeSession } from './identity';
import { colorFor, ownClaim, publicEmpire, ServerSaves } from './ServerSync';
import { cleanIdentity, suggestIdentity } from '../core/empire/Identity';
import { HERALDRY } from '../content/heraldry';
import { showFounding } from '../ui/Founding';
import { showSignIn } from '../ui/SignIn';
import { Store } from './Store';
import { createWorld } from './World';
import { setupChat } from './ChatSetup';
import { setupPlayers } from './PlayersSetup';
import { setupRouting } from './Router';
import { ServerAuthority } from './Authority';
import { COMMANDS, encodeCommand, type CommandName } from '../sim/commands';
import { newEmpireState } from '../sim/newEmpireState';
import { reportActivity } from './GalaxyApi';

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
  // The server runs signed-in players' empires: its copy is the empire, on every device.
  const remote = serverSaves ? await serverSaves.load() : null;
  const onServer = saveGame.valid(remote);
  if (onServer) saved = upgradeSave(remote);
  // A saved empire keeps its home system wherever the galaxy puts stars now.
  const world = createWorld(galaxy, signedIn ? identity.id : undefined, savedHome(saved));
  const { factory, styles, traits } = createDefaultShipFactory();
  const economyTables: EconomyTables = { tree, classes: SHIP_CLASSES, governments: GOVERNMENTS, policies: POLICIES, tenets: TENETS, alienTech: ALIEN_TECH, buildings: BUILDINGS, storage: STORAGE, upkeepOf };

  // Hull plating textures load with the clock, before any ship or thumbnail is drawn.
  const [clock] = await Promise.all([connectWorldClock(), preloadHullTextures()]);
  // A new empire (or the template a save is laid over): see newEmpireState.
  const fresh = newEmpireState({ galaxy, tree, world, playerName: identity.displayName, t0: clock.tick() });
  // A saved empire carries on where it left off; the missed years are caught up below.
  const store = new Store<GameState>(saved ? { ...fresh, ...saved, home: world.home, identity: cleanIdentity(saved.identity, HERALDRY) } : fresh);

  // Asteroid fields and NPC empires everyone shares (the server's when signed in).
  const shared = await SharedWorldClient.connect(!!serverSaves && probe.server);
  // The server runs the NPC empires for signed-in players; a guest's browser runs its own.
  const onlineWorld = !!serverSaves && probe.server;
  // Other players' worlds are markets for trade goods, from the live players list (PlayersSetup).
  let otherMarkets: readonly Market[] = [];
  const controller = new GameController({ store, galaxy, tree, encounters, world, economy: economyTables, clock, save: saveGame, shared,
    playerId: onlineWorld ? identity.id : 'local', ...(onlineWorld ? {} : { npcs: 'local' as const }),
    // Signed-in players' notable news goes to the galaxy feed and the Discord channel (the server rate-limits it).
    report: signedIn ? reportActivity : undefined,
    markets: () => otherMarkets,
  });
  // Signed in: the server runs the empire. Every order is applied here at once and sent to the
  // server as a command (only the outermost call: an order that gives others sends just itself);
  // the server's answer is the truth the browser adopts. Guests play on their own.
  const authority = serverSaves && probe.server ? new ServerAuthority(store, onServer, (text) => store.update((s) => ({ dispatches: [{ turn: s.turn, text, tone: 'bad' as const }, ...s.dispatches].slice(0, 40) }))) : null;
  if (authority) {
    let depth = 0;
    const calls = controller as unknown as Record<string, (...args: unknown[]) => unknown>;
    for (const name of Object.keys(COMMANDS) as CommandName[]) {
      const original = calls[name].bind(controller);
      calls[name] = (...args: unknown[]) => {
        if (depth > 0 || !authority.running) return original(...args);
        depth++;
        try {
          return original(...args);
        } finally {
          depth--;
          try {
            authority.send(encodeCommand(name, args), controller.worldTime());
          } catch {
            // Not sendable (should not happen): the next state from the server corrects it.
          }
        }
      };
    }
    controller.beforeReset = async () => { await fetch('./api/save', { method: 'DELETE', credentials: 'same-origin' }).catch(() => {}); };
  }

  // ── Views ──
  const app = document.getElementById('app')!;
  const mapEl = document.createElement('div');
  mapEl.className = 'map';
  app.append(mapEl);
  // Phones and tablets get lighter rendering: the heavy nebula and galaxy shaders at a third of the resolution.
  const lite = touchFirst();
  const map = new MapView({ container: mapEl, galaxyRadius: galaxy.params.radius, onClick: controller.handleClick, onRightClick: controller.handleRightClick, onHover: controller.handleHover, onFrame: controller.onFrame, lite });

  map.layers.add(new StarfieldLayer(galaxy.params.seed));
  const nebula = new NebulaLayer(galaxy.params.seed, lite);
  const disc = new GalaxyDiscLayer(galaxy.params, lite);
  if (lite) map.layers.add(new LowResBackground([nebula, disc], 0.25));
  else map.layers.add(nebula);
  // System view: the star (or a followed ship in deep space) sits inside the map's nebula.
  map.layers.add(new NebulaSkyboxLayer(galaxy.params.seed, (x, z) => {
    const star = galaxy.nearestStar(worldToHex(x, z), 1);
    return star && { id: star.id, x: star.position.x, z: star.position.z };
  }));
  if (!lite) map.layers.add(disc);
  map.layers.add(new GalaxyCloudLayer(galaxy, lite ? 70_000 : undefined));
  map.layers.add(new MidStarLayer(galaxy));
  const sectors = map.layers.add(new SectorOverlayLayer(galaxy.params.radius, DEFAULT_ADDRESS_SCHEME));
  // Neighbours are fixed; your own territory follows your colonies and identity.
  const territory = map.layers.add(new TerritoryLayer(world.claims.filter((c) => c.kind !== 'player')));
  territory.setOwn(ownClaim(store.state));
  store.subscribe((s, prev) => { if (s.identity !== prev.identity || s.economy.colonies !== prev.economy.colonies) territory.setOwn(ownClaim(s)); });
  const hexGrid = map.layers.add(new HexGridLayer(galaxy.params.radius, lite));
  const nearStars = map.layers.add(new NearStarLayer(galaxy));
  nearStars.surveyed = controller.surveyedPercent;
  const system = map.layers.add(new SystemLayer(galaxy, { colonyOf: (planet) => controller.surfaceTarget(planet)?.colony ?? null, onPlanetClick: (star, planet) => controller.focusPlanet(star, planet), planets: (star) => controller.planets(star), fields: (star) => controller.fieldReport(star) }));
  // Asteroid belts thin as fields are mined and fill back as they refill: re-read them when the shared world or the year changes.
  shared.onChange(() => system.refreshFields());
  store.subscribe((s, prev) => { if (s.turn !== prev.turn) system.refreshFields(); });
  // Surface view: the focused planet's close-up, below planet view (draws its own scene when near).
  const surface = map.layers.add(new SurfaceLayer({ zoom: map.controller.zoom, input: map.controller, frame: (id) => system.planetFrame(id), hold: (id) => system.holdPlanet(id), canvas: map.canvas, lite }));
  // Megastructures are seen from across the galaxy (change megastructures).
  map.layers.add(new MegaBeaconLayer(galaxy.megastructures().map((m) => {
    const star = galaxy.starAt(m.hex)!;
    return { starId: m.starId, starName: star.name, type: m.type, x: star.position.x, z: star.position.z };
  }), (starId) => {
    const star = controller.starById(starId);
    const mega = star && controller.planets(star)[0];
    if (star && mega) controller.focusPlanet(star, mega);
  }));
  const selection = map.layers.add(new SelectionLayer());
  const fleetLayer = map.layers.add(new FleetLayer(factory, (years) => formatDuration(years, CLOCK), (h) => galaxy.starAt(h)?.position ?? hexToWorld(h), (id) => controller.selectFleet(id)));
  // Battles at sea: a marker on the map for each one you can see, and the view that covers the map to watch one.
  const battleMarkers = map.layers.add(new BattleMarkerLayer((key) => controller.openBattle(key)));
  const battle = map.layers.add(new BattleLayer(factory, SHIP_CLASSES, { worldTime: () => controller.worldTime(), ending: (t) => controller.battleEnding(t), lite }));
  const battleHud = new BattleHud({ leave: () => controller.leaveBattle(), retreat: (id) => controller.retreat(id) }, battle.controls);
  battle.onFrame = (f) => battleHud.render(f);

  const zoomCfg = map.controller.zoom.config;
  const ledger = new ResourceLedger(store, { forecast: () => controller.forecast(), caps: () => controller.caps() });
  const topBar = new TopBar(store, controller, identity, clock, controller.caps, (r, el) => ledger.toggle(r, el));
  const hud = new Hud({ min: zoomCfg.minAltitude / 10, max: zoomCfg.maxAltitude }, (alt) => controller.zoomTo(alt), () => {
    const s = store.state;
    if (s.selected && s.selectedPlanet && s.selectedPlanet.biome !== 'gas') controller.land(s.selected, s.selectedPlanet);
    else hud.setHover('Focus a rocky planet first, then land on it');
  });
  // Rendered thumbnails for ships, buildings, resources, encounters and research (one studio).
  setThumbs(createThumbs({ factory, design: (classId) => controller.effectiveDesign(classId) }));
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
    empire: new EmpirePanel(store, controller, controller, economyTables, thumb),
    war: new WarRoomPanel(store, controller, controller),
    explore: new ExplorePanel(store, controller, controller, controller.planets, tree, thumb),
    fleets: new FleetsPanel(store, controller, controller),
    search: new SearchPanel(store, controller, controller, galaxy, controller.planets, thumb),
  };
  // City locator: the focused planet's major cities, also while its card is closed.
  const cityLocator = new CityLocator(store, controller, controller, starInfo);
  starInfo.onCardChange = () => cityLocator.render();
  controller.onFocusPlanet = () => starInfo.showPlanet();
  app.append(topBar.el, hud.banner, hud.el, hud.ladder, starInfo.el, cityLocator.el, dispatches.el, battleHud.el, ...Object.values(panels).map((p) => p.el));

  controller.attach({ map, hexGrid, selection, sectors, fleets: fleetLayer, hud, topBar, panels, system, surface, battle, battleMarkers });
  // Phones: the star, planet and fleet card is a bottom sheet; keep what you look at centred above it.
  if (lite) {
    const phone = window.matchMedia('(max-width: 720px)');
    map.setBottomInset(() => {
      if (!phone.matches || starInfo.el.classList.contains('hidden')) return 0;
      const top = starInfo.el.getBoundingClientRect().top;
      const box = mapEl.getBoundingClientRect();
      const covered = Math.max(0, Math.min(box.height * 0.7, box.bottom - top));
      // The top bar covers the map's top edge too: centre between the two.
      return covered && Math.max(0, covered - Math.max(0, topBar.el.getBoundingClientRect().bottom - box.top));
    });
  }
  // The NPC empires you know: drawn now, every year, and whenever the shared world changes.
  const drawNpcs = () => controller.drawNpcs(territory);
  drawNpcs();
  shared.onChange(drawNpcs);
  store.subscribe((s, prev) => { if (s.turn !== prev.turn) drawNpcs(); });
  // Other players, live: the Players drawer, Galaxy feed, toasts and their fleets and territory (see PlayersSetup).
  const players = setupPlayers({ identity, canSignIn: probe.server && probe.authEnabled, galaxy, controller, store, territory,
    fetchPlayers: serverSaves && (() => serverSaves.players()), message: (id) => chat.openThread(id),
    setMarkets: (markets) => { otherMarkets = markets; } });
  // In-game chat (global + DMs, location links, @mentions): see ChatSetup. Its stream also carries the players' live events.
  // The live stream also carries the server's state of this empire each year.
  // It also announces changes to the shared world.
  const live = { ...players.live, taps: { ...players.live.taps, state: (data: unknown) => authority?.onServerState((data as { save?: SavedGame }).save), world: (data: unknown) => shared.adopt(data) } };
  const chat = setupChat({ identity, canSignIn: probe.server && probe.authEnabled, galaxy, controller, panels: Object.values(panels), live });
  players.alongside([...Object.values(panels), chat]);
  topBar.addTab(players.panel.tab);
  topBar.addTab(chat.tab);
  app.append(chat.el, players.panel.el, players.toasts.el);

  // ── Start ──
  const home = hexToWorld(world.home.hex);
  map.controller.focus.set(home.x, home.z);
  map.controller.zoom.setTargetAltitude(48);
  map.controller.zoom.snap();
  controller.select(world.home);
  // Hotlinks (/system/q,r/Name, /hex/q,r, /player/id): open where the link points; the address bar follows the selection.
  setupRouting({ controller, store, galaxy, map, showPlayer: (id) => players.panel.show(id) });

  window.addEventListener('keydown', (e) => {
    const tag = (e.target as HTMLElement).tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    if (e.key === 'Escape' && battle.isOpen) { controller.leaveBattle(); return; }
    if (battle.isOpen) return;
    if (e.key === 'g' || e.key === 'G') controller.toggleView();
    if (e.key === '/') { e.preventDefault(); controller.openPanel('search'); return; }
    if (e.key === 'Escape' && store.state.selectedFleet) { controller.selectFleet(null); return; }
    if (e.key === 'Escape' && surface.status.active) { controller.leaveSurface(); return; }
    if (e.key === 'Escape') { if (store.state.selectedPlanet && store.state.selected) controller.focusPlanet(store.state.selected, null); else controller.select(null); }
    if (e.key === 'h' || e.key === 'H') controller.flyTo(world.home, true);
    if (import.meta.env.DEV && e.key === 'Enter' && tag !== 'BUTTON') controller.skipYear();
  });
  // The world runs on: one year per minute, pushed by the server when there is one.
  // Other players in the shared galaxy: live over the stream, and polled every year as a fallback.
  const refreshOthers = () => players.refresh();
  void refreshOthers();
  // Signed in: the server runs the empire and each year sends what it decided; guests (and an
  // empire not yet founded) run it here.
  const yearly = (tick: number) => { if (authority?.running) authority.expectTick(tick); else controller.advanceTo(tick); };
  clock.onTick((tick) => { yearly(tick); void refreshOthers(); });
  if (!authority?.running) {
    // Saved journeys planned at other speeds continue at the empire's speed, then the missed years run.
    controller.retimeFleets();
    controller.advanceTo(clock.tick());
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    if (authority?.running) void authority.refresh();
    else controller.advanceTo(clock.tick());
  });
  let saveTimer = 0;
  let creating = false;
  const persist = () => {
    saveGame.save(store.state);
    // The server's copy starts once the empire is founded, so the galaxy (and the Discord channel)
    // first hears of a new player with their chosen name and flag. From then on the server runs it.
    if (!serverSaves || !authority || authority.running || creating || !store.state.identity || saveGame.stoppedSaving) return;
    creating = true;
    void serverSaves.create(saveGame.snapshot(store.state), publicEmpire(store.state, colorFor(identity.id))).then((r) => {
      creating = false;
      if (r.created) authority.activate();
      else if (r.existing) { authority.activate(); authority.adopt(r.existing); }
    });
  };
  // The local copy (guests' only one; a cache for signed-in players) follows every change.
  store.subscribe(() => {
    clearTimeout(saveTimer);
    saveTimer = window.setTimeout(persist, 1500);
  });
  // Leaving or reloading: write the local save and send the server copy now, so another device
  // (or this one after a reload) picks up exactly where this tab left off.
  const persistNow = () => { clearTimeout(saveTimer); persist(); };
  window.addEventListener('pagehide', () => persistNow());
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

bootstrap();
