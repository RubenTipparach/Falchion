import type { GalaxyModel } from '../core/galaxy/GalaxyModel';
import { hexToWorld } from '../core/hex/Hex';
import type { MapView } from '../render/map/MapView';
import type { GameController } from './GameController';
import type { GameState } from './GameState';
import type { Store } from './Store';
import { parseRoute, routePath, systemRoute } from './Routes';

export interface RouterDeps {
  readonly controller: GameController;
  readonly store: Store<GameState>;
  readonly galaxy: GalaxyModel;
  readonly map: MapView;
  /** Open a player in the Players drawer. */
  readonly showPlayer: (id: string) => void;
}

/**
 * Hotlinks: opening /system/q,r/Name flies straight to that system (a planet link opens the
 * planet), /hex/q,r to that spot in deep space and /player/id to that player. From then on the
 * address bar follows the selection, so it can always be copied and shared.
 */
export function setupRouting({ controller, store, galaxy, map, showPlayer }: RouterDeps): { apply(path: string): void } {
  const apply = (path: string): void => {
    const route = parseRoute(path);
    if (route.kind === 'player') return showPlayer(route.id);
    if (route.kind === 'home') return;
    const at = hexToWorld(route.hex);
    const star = galaxy.starAt(route.hex);
    // Arrive at the place rather than flying across the galaxy from home.
    map.controller.focus.set(star?.position.x ?? at.x, star?.position.z ?? at.z);
    if (route.kind === 'hex' || !star) {
      controller.select(null);
      map.controller.flyTo(at.x, at.z, 40);
      return;
    }
    const planet = route.planet ? controller.planets(star)[route.planet - 1] : undefined;
    if (planet) return controller.focusPlanet(star, planet);
    controller.select(star);
    controller.flyTo(star, true);
  };

  apply(location.pathname);
  addEventListener('popstate', () => apply(location.pathname));

  // The address bar and tab title follow the selection (replaced, not pushed: selecting is not navigating).
  const sync = (s: GameState): void => {
    const planet = s.selectedPlanet && s.selected && s.selectedPlanet.starId === s.selected.id ? s.selectedPlanet : null;
    const path = routePath(systemRoute(s.selected, planet ? planet.index : null));
    if (path !== location.pathname) history.replaceState(null, '', path);
    document.title = planet ? `${planet.name} · Falchion` : s.selected ? `${s.selected.name} · Falchion` : 'Falchion';
  };
  store.subscribe((s, prev) => { if (s.selected !== prev.selected || s.selectedPlanet !== prev.selectedPlanet) sync(s); });
  // The link opened: title the tab after it (a link to deep space or a player keeps its own address).
  const opened = parseRoute(location.pathname);
  if (opened.kind === 'system') sync(store.state);
  return { apply };
}
