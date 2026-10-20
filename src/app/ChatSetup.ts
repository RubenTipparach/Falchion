import type { ChatPlace, ChatUser } from '../core/chat/ChatText';
import type { GalaxyModel } from '../core/galaxy/GalaxyModel';
import type { Drawer } from '../ui/Drawer';
import { ChatPanel } from '../ui/Chat';
import { ChatClient, type StreamTaps } from './ChatClient';
import { knownPlaces } from './chatPlaces';
import type { GameController } from './GameController';
import type { PlayerIdentity } from './identity';
import type { OtherPlayer } from './ServerSync';

export interface ChatSetupDeps {
  readonly identity: PlayerIdentity;
  /** Discord sign-in is available on this server (guests get a sign-in link). */
  readonly canSignIn: boolean;
  readonly galaxy: GalaxyModel;
  readonly controller: GameController;
  /** The game's drawers: opening one closes chat, and the other way round. */
  readonly panels: readonly Drawer[];
  /** Others listening on the same live stream: extra events, presence and connection state. */
  readonly live?: LiveHooks;
}

/** What other systems (e.g. the Players panel) hear from the chat's live stream. */
export interface LiveHooks {
  readonly taps?: StreamTaps;
  presence?(online: readonly ChatUser[]): void;
  /** true when the stream (re)connects: a moment to reload anything missed. */
  status?(live: boolean): void;
}

/** Composition for in-game chat: the Comms drawer, its server connection and its links into the map. */
export function setupChat({ identity, canSignIn, galaxy, controller, panels, live }: ChatSetupDeps): ChatPanel {
  const me: ChatUser | null = identity.provider === 'discord' ? { id: identity.id, name: identity.displayName, avatar: identity.avatar ?? null } : null;
  let others: OtherPlayer[] = [];
  let cache: { state: unknown; others: unknown; places: ChatPlace[] } | null = null;
  const placeOf = (h: { q: number; r: number } | null): ChatPlace | null => {
    const star = h ? galaxy.starAt(h) : null;
    return star ? { name: star.name, q: star.hex.q, r: star.hex.r } : null;
  };

  // Live messages and presence from the server (created first; its handlers run only after start()).
  const client = me ? new ChatClient({
    messages: (list, backfill) => chat.receive(list, backfill),
    presence: (online) => { chat.setOnline(online); live?.presence?.(online); if (online.some((u) => u.id !== me.id && !others.some((p) => p.id === u.id))) void refreshPlayers(); },
    status: (on) => { chat.setStatus(on); live?.status?.(on); },
  }, './api', live?.taps) : null;

  const chat: ChatPanel = new ChatPanel({
    me,
    signInUrl: canSignIn ? `./auth/discord?next=${encodeURIComponent(location.pathname)}` : null,
    knownPlaces: () => {
      const s = controller.state;
      if (cache?.state !== s || cache.others !== others) cache = { state: s, others, places: knownPlaces(s, galaxy, controller.planets, others.map((p) => p.home)) };
      return cache.places;
    },
    homeOf: (id) => (id === me?.id ? placeOf(controller.state.home.hex) : placeOf(others.find((p) => p.id === id)?.home ?? null)),
    // The "teleport": a planet name dives into its system; a star is selected and centred.
    teleport: (p) => {
      const star = galaxy.starAt({ q: p.q, r: p.r });
      if (!star) return;
      const planet = controller.planets(star).find((x) => x.name.toLowerCase() === p.name.toLowerCase());
      if (planet) return controller.focusPlanet(star, planet);
      controller.select(star);
      controller.flyTo(star, false);
    },
  }, client);

  // Every known player, for @autocomplete, DMs to players who are away, and links to their homes.
  let fetching = false;
  async function refreshPlayers(): Promise<void> {
    if (fetching) return;
    fetching = true;
    try {
      const res = await fetch('./api/players', { credentials: 'same-origin', cache: 'no-store' });
      if (res.ok) {
        others = (await res.json()) as OtherPlayer[];
        chat.setPlayers(others.map((p) => ({ id: p.id, name: p.name, avatar: p.avatar ?? null })));
      }
    } catch {
      // Offline: try again next time.
    } finally {
      fetching = false;
    }
  }

  // One drawer at a time on the right.
  chat.onChange((open) => { if (open) panels.forEach((p) => p.close()); });
  panels.forEach((p) => p.onChange((open) => { if (open) chat.close(); }));

  if (client) {
    void refreshPlayers();
    setInterval(() => void refreshPlayers(), 120_000);
    client.start();
  }
  return chat;
}
