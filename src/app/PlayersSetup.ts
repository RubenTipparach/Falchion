import { cleanIdentity, type Flag } from '../core/empire/Identity';
import { arrivalTurn, type FleetMovement } from '../core/fleet/Fleet';
import type { GalaxyModel } from '../core/galaxy/GalaxyModel';
import { hexDistance, type Hex } from '../core/hex/Hex';
import type { ActivityEvent, ActivityPlace } from '../core/social/Activity';
import { sortRoster } from '../core/social/Roster';
import { formatDuration } from '../core/time/WorldTime';
import { HERALDRY } from '../content/heraldry';
import type { TerritoryLayer } from '../render/map/TerritoryLayer';
import type { Drawer } from '../ui/Drawer';
import { activityText, PlayersPanel, type PlayerFleetRow, type PlayerRow } from '../ui/PlayersPanel';
import { Toasts } from '../ui/Toasts';
import type { LiveHooks } from './ChatSetup';
import { fetchActivity } from './GalaxyApi';
import { GalaxyPlayers } from './GalaxyPlayers';
import type { GameController } from './GameController';
import type { GameState } from './GameState';
import type { PlayerIdentity } from './identity';
import { colorFor, isFleetMovement, othersOnMap, ownClaim, publicEmpire, type OtherPlayer } from './ServerSync';
import type { Store } from './Store';
import { CLOCK } from './WorldClock';

export interface PlayersSetupDeps {
  readonly identity: PlayerIdentity;
  /** Discord sign-in is available on this server (guests get a sign-in link). */
  readonly canSignIn: boolean;
  readonly galaxy: GalaxyModel;
  readonly controller: GameController;
  readonly store: Store<GameState>;
  readonly territory: TerritoryLayer;
  /** The polled list of other players (null for guests: no server galaxy). */
  readonly fetchPlayers: (() => Promise<OtherPlayer[]>) | null;
  /** Open a direct-message thread with a player (the chat drawer). */
  readonly message: (playerId: string) => void;
}

export interface PlayersSetup {
  readonly panel: PlayersPanel;
  readonly toasts: Toasts;
  /** Hand to the chat: its live stream carries `player` and `activity` events and presence. */
  readonly live: LiveHooks;
  /** Poll the player list (the fallback for the live stream; once a world tick). */
  refresh(): Promise<void>;
  /** One drawer at a time on the right: the Players drawer closes these and they close it. */
  alongside(drawers: readonly Drawer[]): void;
}

/**
 * Composition for "see what other players are doing": the galaxy model (polled and live), its
 * map effects (other players' fleets and territory, clickable markers), the Players drawer with
 * its Galaxy feed, and toasts for other players' news.
 */
export function setupPlayers({ identity, canSignIn, galaxy, controller, store, territory, fetchPlayers, message }: PlayersSetupDeps): PlayersSetup {
  const signedIn = identity.provider === 'discord' && !!fetchPlayers;
  const meId = signedIn ? identity.id : null;
  const model = new GalaxyPlayers(meId);
  const others = new Map<string, OtherPlayer>();

  const placeOf = (h: Hex | null | undefined): ActivityPlace | null => {
    const star = h ? galaxy.starAt(h) : null;
    return star ? { name: star.name, q: star.hex.q, r: star.hex.r } : null;
  };
  const teleport = (p: ActivityPlace) => {
    const star = galaxy.starAt({ q: p.q, r: p.r });
    if (!star) return;
    const planet = controller.planets(star).find((x) => x.name.toLowerCase() === p.name.toLowerCase());
    if (planet) return controller.focusPlanet(star, planet);
    controller.select(star);
    controller.flyTo(star, false);
  };
  const where = (m: FleetMovement): string => {
    const turn = controller.state.turn;
    const dest = galaxy.starAt(m.route[m.route.length - 1])?.name ?? 'deep space';
    const eta = arrivalTurn(m) - turn;
    return eta <= 0 ? `On station at ${dest}` : `To ${dest} · ETA ${formatDuration(eta, CLOCK)}`;
  };

  // ── Rows for the panel ──
  const identityOf = (p: OtherPlayer) => (p.empire ? cleanIdentity({ ...p.empire, color: p.color }, HERALDRY) : null);
  function rows(): PlayerRow[] {
    const s = controller.state;
    const myHome = s.home.hex;
    const out: PlayerRow[] = [];
    if (meId) {
      const pub = publicEmpire(s, colorFor(identity.id));
      const id = s.identity;
      out.push({
        id: meId, you: true, online: true, lastSeen: Date.now(), empireName: id?.name ?? 'Your empire',
        discordName: identity.displayName, avatar: identity.avatar ?? null, color: ownClaim(s).color, flag: id?.flag ?? null,
        ruler: id?.ruler ?? '', title: id?.title ?? '', colonies: pub.colonies.length,
        fleets: pub.fleets.map((f): PlayerFleetRow => ({ id: f.id, name: f.name, where: where(f.movement) })),
        distance: 0, homeName: s.home.name,
      });
    }
    for (const p of model.others) {
      const id = identityOf(p);
      const home = p.home && Number.isInteger(p.home.q) && Number.isInteger(p.home.r) ? p.home : null;
      out.push({
        id: p.id, you: false, online: model.isOnline(p.id), lastSeen: p.updatedAt ?? 0, empireName: id?.name ?? p.name,
        discordName: p.name, avatar: p.avatar ?? null, color: id?.color ?? colorFor(p.id), flag: id?.flag ?? null,
        ruler: id?.ruler ?? '', title: id?.title ?? '', colonies: new Set((p.colonies ?? []).map((c) => `${c.q},${c.r}`)).size,
        fleets: (p.fleets ?? []).filter((f) => isFleetMovement(f.movement)).map((f) => ({ id: `${p.id}:${f.id}`, name: f.name, where: where(f.movement) })),
        distance: home ? hexDistance(myHome, home) : null, homeName: placeOf(home)?.name ?? null,
      });
    }
    return sortRoster(out);
  }
  const empireOf = (playerId: string): { flag: Flag | null; color: string } | null => {
    if (playerId === meId) return { flag: controller.state.identity?.flag ?? null, color: ownClaim(controller.state).color };
    const p = others.get(playerId);
    if (!p) return null;
    const id = identityOf(p);
    return { flag: id?.flag ?? null, color: id?.color ?? colorFor(p.id) };
  };

  const panel = new PlayersPanel({
    signedIn,
    signInUrl: canSignIn ? `./auth/discord?next=${encodeURIComponent(location.pathname)}` : null,
    rows,
    activity: () => model.activity,
    empireOf,
    now: () => Date.now(),
    locateHome: (playerId, closeUp) => {
      const home = playerId === meId ? controller.state.home.hex : others.get(playerId)?.home;
      const star = home ? galaxy.starAt(home) : null;
      if (!star) return;
      controller.select(star);
      controller.flyTo(star, closeUp);
    },
    locateFleet: (fleetId, closeUp) => controller.focusFleet(fleetId, closeUp),
    message,
    teleport,
  });
  const toasts = new Toasts();

  // ── Model -> map, panel and toasts ──
  let drawnClaims = '';
  model.onChange((what, fresh) => {
    if (what === 'players') {
      others.clear();
      for (const p of model.others) others.set(p.id, p);
      const { fleets, claims } = othersOnMap(model.others);
      controller.setOtherFleets(fleets);
      // Territory changes rarely (a new colony or a new empire): rebuild it only then.
      const key = JSON.stringify(claims);
      if (key !== drawnClaims) { drawnClaims = key; territory.setDynamic(claims); }
    }
    if (what === 'activity') {
      panel.noteActivity(fresh.filter((e) => e.player.id !== meId));
      if (!panel.feedVisible) for (const e of fresh) toast(e);
    }
    panel.refresh();
  });
  function toast(e: ActivityEvent): void {
    if (e.player.id === meId || e.kind === 'offline') return;
    const now = empireOf(e.player.id);
    toasts.show({
      color: e.empire?.color ?? now?.color ?? '#7fd3e6', flag: now?.flag ?? null, who: e.empire?.name || e.player.name,
      body: activityText(e, teleport),
      onClick: () => panel.show(e.player.id),
    });
  }
  // Your own card follows your state (fleets, colonies, ETAs).
  store.subscribe((s, prev) => { if (s.fleets !== prev.fleets || s.turn !== prev.turn || s.identity !== prev.identity || s.economy.colonies !== prev.economy.colonies) panel.refresh(); });
  // Clicking another empire's name on the map opens it in the panel.
  territory.onMarkerClick = (claim) => { if (claim.id) panel.show(claim.id); };

  let polling = false;
  async function refresh(): Promise<void> {
    if (!fetchPlayers || polling) return;
    polling = true;
    try {
      model.setPlayers(await fetchPlayers());
    } finally {
      polling = false;
    }
  }
  const live: LiveHooks = signedIn ? {
    taps: {
      player: (data) => model.upsert(data),
      activity: (data) => model.addActivity([data], true),
    },
    presence: (online) => model.setOnline(online),
    // (Re)connected: catch up on anything the stream missed.
    status: (on) => { if (on) { void refresh(); void fetchActivity().then((list) => model.addActivity(list, false)); } },
  } : {};

  return {
    panel, toasts, live, refresh,
    alongside(drawers) {
      panel.onChange((open) => { if (open) drawers.forEach((d) => d.close()); });
      drawers.forEach((d) => d.onChange((open) => { if (open) panel.close(); }));
    },
  };
}
