// The galaxy's roster of empires: ordering for the Players panel, "last seen" wording and
// merging live updates into the polled list. Pure: the current time is passed in.

/** What the roster needs to order an entry. */
export interface RosterKey {
  readonly id: string;
  /** This is you (always listed first). */
  readonly you: boolean;
  readonly online: boolean;
  /** Wall-clock ms of their last save (or now, for you). */
  readonly lastSeen: number;
  readonly empireName: string;
}

/** You first, then players online now, then the most recently seen; ties by name, then id. */
export function sortRoster<T extends RosterKey>(list: readonly T[]): T[] {
  return [...list].sort((a, b) =>
    Number(b.you) - Number(a.you)
    || Number(b.online) - Number(a.online)
    || b.lastSeen - a.lastSeen
    || a.empireName.localeCompare(b.empireName)
    || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** "just now", "5 min ago", "3 h ago", "2 d ago", "4 wk ago", "7 mo ago", "2 yr ago" (real time). */
export function relativeTime(then: number, now: number): string {
  const s = Math.max(0, Math.round((now - then) / 1000));
  if (s < 45) return 'just now';
  const min = Math.round(s / 60);
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} h ago`;
  const d = Math.floor(hr / 24);
  if (d < 14) return `${d} d ago`;
  if (d < 60) return `${Math.floor(d / 7)} wk ago`;
  if (d < 365) return `${Math.floor(d / 30)} mo ago`;
  return `${Math.floor(d / 365)} yr ago`;
}

/** Something with an id and the time it was last saved. */
export interface Versioned {
  readonly id: string;
  readonly updatedAt?: number;
}

/** Insert or replace one entry, unless the list already holds a newer copy of it. */
export function upsertNewer<T extends Versioned>(list: readonly T[], item: T): T[] {
  const i = list.findIndex((x) => x.id === item.id);
  if (i < 0) return [...list, item];
  if ((list[i].updatedAt ?? 0) > (item.updatedAt ?? 0)) return [...list];
  return list.map((x, j) => (j === i ? item : x));
}

/**
 * A polled snapshot replaces the list, except where a live update already brought a newer copy
 * of a player (the poll can be older than the stream). Players missing from the poll are dropped.
 */
export function mergeSnapshot<T extends Versioned>(current: readonly T[], polled: readonly T[]): T[] {
  const live = new Map(current.map((x) => [x.id, x]));
  return polled.map((p) => {
    const mine = live.get(p.id);
    return mine && (mine.updatedAt ?? 0) > (p.updatedAt ?? 0) ? mine : p;
  });
}
