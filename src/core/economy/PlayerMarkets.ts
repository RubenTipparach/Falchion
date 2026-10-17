import { cleanText, EMPIRE_NAME_MAX } from '../empire/Identity';
import type { Hex } from '../hex/Hex';
import type { Market } from './Trade';

/**
 * Other players' worlds are markets for trade goods (and pay the most: MarketKind 'player').
 * Both the server and the browser build them from the same public views with this function,
 * so a trade run the browser shows is the one the server accepts.
 */

/** Another empire as other players see it (server publicView / OtherPlayer). Untrusted input. */
export interface TradingEmpire {
  readonly id: string;
  /** The account name, used when the empire has not been founded. */
  readonly name?: unknown;
  readonly empire?: { readonly name?: unknown } | null;
  readonly home?: unknown;
  readonly colonies?: unknown;
}

/** What markets need of the galaxy: the star at a hex. */
export interface StarLookup {
  starAt(h: Hex): { readonly id: string; readonly name: string } | null;
}

/** Colony systems read from one empire (the server keeps at most 200). */
const MAX_WORLDS = 201;

const isHex = (h: unknown): h is Hex => !!h && Number.isInteger((h as Hex).q) && Number.isInteger((h as Hex).r);

/** The name other players trade with: the empire's, else the account's. */
export function tradingName(p: TradingEmpire): string {
  return cleanText(p.empire?.name, EMPIRE_NAME_MAX) || cleanText(p.name) || 'another empire';
}

/**
 * Every player's home and colony systems as markets, named "<Star> (<Empire>)", ordered by
 * player id (then as listed). A star may appear once per empire that has a world there.
 */
export function allPlayerMarkets(galaxy: StarLookup, players: readonly TradingEmpire[]): Market[] {
  const out: Market[] = [];
  const sorted = players.filter((p) => typeof p?.id === 'string').sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  for (const p of sorted) {
    const colonies = Array.isArray(p.colonies) ? p.colonies : [];
    const worlds = [p.home, ...colonies].slice(0, MAX_WORLDS).filter(isHex);
    const owner = tradingName(p);
    const seen = new Set<string>();
    for (const hex of worlds) {
      const star = galaxy.starAt({ q: hex.q, r: hex.r });
      if (star && !seen.has(star.id)) { seen.add(star.id); out.push({ starId: star.id, name: `${star.name} (${owner})`, kind: 'player', player: p.id }); }
    }
  }
  return out;
}

/**
 * The markets `selfId` can sell at: every other player's worlds, one market per star (a star
 * shared by two other empires is the market of the lower id), so every caller gets the same list.
 */
export function marketsFor(all: readonly Market[], selfId: string | null): Market[] {
  const out = new Map<string, Market>();
  for (const m of all) if (m.player !== selfId && !out.has(m.starId)) out.set(m.starId, m);
  return [...out.values()];
}

/** Other players' worlds as markets for `selfId` (see allPlayerMarkets and marketsFor). */
export function playerMarkets(galaxy: StarLookup, players: readonly TradingEmpire[], selfId: string | null): Market[] {
  return marketsFor(allPlayerMarkets(galaxy, players), selfId);
}
