// Galaxy activity: the shape of the server's live news feed, validation of what arrives
// (it is other players' input), and merging live and loaded events. Pure: no DOM, no network.

/** Kinds a player reports about their own empire. */
export type ReportKind = 'found' | 'colony' | 'depot' | 'battle' | 'survey';
/** Every kind in the feed: reports, plus comings and goings the server logs itself. */
export type ActivityKind = ReportKind | 'online' | 'offline';

const KINDS: ReadonlySet<string> = new Set<ActivityKind>(['found', 'colony', 'depot', 'battle', 'survey', 'online', 'offline']);

/** A star (by its hex) an event links to. */
export interface ActivityPlace {
  readonly name: string;
  readonly q: number;
  readonly r: number;
}

/** One entry of the feed, as the server stores and sends it. */
export interface ActivityEvent {
  readonly id: string;
  readonly at: number;
  readonly player: { readonly id: string; readonly name: string };
  /** The player's empire when the event happened (null before founding). */
  readonly empire: { readonly name: string; readonly color: string } | null;
  readonly kind: ActivityKind;
  readonly text: string;
  readonly place?: ActivityPlace;
}

const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const str = (x: unknown, max: number): string | null => (typeof x === 'string' && x.length <= max ? x : null);

/** A well-formed event, or null: arrives from the server but carries other players' text. */
export function cleanEvent(raw: unknown): ActivityEvent | null {
  const e = raw as Partial<Record<keyof ActivityEvent, unknown>> | null;
  if (!e || typeof e !== 'object') return null;
  const id = str(e.id, 64);
  const text = str(e.text, 200);
  const p = e.player as { id?: unknown; name?: unknown } | null;
  const pid = str(p?.id, 32);
  const pname = str(p?.name, 64);
  if (!id || text === null || !pid || pname === null || typeof e.at !== 'number' || !Number.isFinite(e.at) || !KINDS.has(e.kind as string)) return null;
  const em = e.empire as { name?: unknown; color?: unknown } | null;
  const empire = em && str(em.name, 40) && typeof em.color === 'string' && HEX_COLOR.test(em.color) ? { name: em.name as string, color: em.color } : null;
  const pl = e.place as { name?: unknown; q?: unknown; r?: unknown } | undefined;
  const place = pl && str(pl.name, 40) && Number.isInteger(pl.q) && Number.isInteger(pl.r) ? { name: pl.name as string, q: pl.q as number, r: pl.r as number } : undefined;
  return { id, at: e.at, player: { id: pid, name: pname }, empire, kind: e.kind as ActivityKind, text, ...(place ? { place } : {}) };
}

/** Add events to a newest-first feed: each id once, newest first, at most `keep`. */
export function mergeActivity(current: readonly ActivityEvent[], incoming: readonly unknown[], keep = 300): ActivityEvent[] {
  const byId = new Map(current.map((e) => [e.id, e]));
  for (const raw of incoming) {
    const e = cleanEvent(raw);
    if (e) byId.set(e.id, e);
  }
  return [...byId.values()].sort((a, b) => b.at - a.at || (a.id < b.id ? 1 : -1)).slice(0, keep);
}

/**
 * The event text split around its place name, so the name can become a link
 * ("settled Vela II in Karon" with place Karon -> before "settled Vela II in ", name, after "").
 * Null when there is no place or the text does not name it.
 */
export function splitOnPlace(e: Pick<ActivityEvent, 'text' | 'place'>): { before: string; name: string; after: string } | null {
  if (!e.place) return null;
  const i = e.text.toLowerCase().lastIndexOf(e.place.name.toLowerCase());
  if (i < 0) return null;
  return { before: e.text.slice(0, i), name: e.text.slice(i, i + e.place.name.length), after: e.text.slice(i + e.place.name.length) };
}
