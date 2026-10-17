import { describe, expect, it } from 'vitest';
import { cleanEvent, mergeActivity, splitOnPlace, type ActivityEvent } from './Activity';
import { mergeSnapshot, relativeTime, sortRoster, upsertNewer } from './Roster';

const ev = (id: string, at: number, extra: Partial<ActivityEvent> = {}): ActivityEvent => ({
  id, at, player: { id: '111111111111111111', name: 'Ruben' }, empire: { name: 'Solar Union', color: '#ff8800' }, kind: 'colony', text: 'settled Vela II in Karon', ...extra,
});

describe('activity feed', () => {
  it('keeps each event once, newest first, bounded', () => {
    const a = mergeActivity([], [ev('a', 1), ev('b', 3), ev('c', 2)]);
    expect(a.map((e) => e.id)).toEqual(['b', 'c', 'a']);
    const b = mergeActivity(a, [ev('b', 3), ev('d', 4)], 3);
    expect(b.map((e) => e.id)).toEqual(['d', 'b', 'c']);
  });

  it('drops malformed events and bad colours or places from the server', () => {
    expect(cleanEvent(null)).toBeNull();
    expect(cleanEvent({ ...ev('x', 1), kind: 'hack' })).toBeNull();
    expect(cleanEvent({ ...ev('x', 1), at: 'soon' })).toBeNull();
    expect(cleanEvent({ ...ev('x', 1), player: { id: 5, name: 'x' } })).toBeNull();
    const e = cleanEvent({ ...ev('x', 1), empire: { name: 'Evil', color: 'red;background:url(x)' }, place: { name: 'Karon', q: 1.5, r: 0 } })!;
    expect(e.empire).toBeNull();
    expect(e.place).toBeUndefined();
    expect(cleanEvent({ ...ev('y', 1), place: { name: 'Karon', q: 3, r: -4 } })!.place).toEqual({ name: 'Karon', q: 3, r: -4 });
    expect(mergeActivity([], [{ junk: true }, ev('ok', 1)]).map((x) => x.id)).toEqual(['ok']);
  });

  it('splits the text around its place for a link', () => {
    expect(splitOnPlace({ text: 'settled Vela II in Karon', place: { name: 'Karon', q: 0, r: 0 } })).toEqual({ before: 'settled Vela II in ', name: 'Karon', after: '' });
    expect(splitOnPlace({ text: 'finished surveying karon minor', place: { name: 'Karon Minor', q: 0, r: 0 } })).toEqual({ before: 'finished surveying ', name: 'karon minor', after: '' });
    expect(splitOnPlace({ text: 'came online' })).toBeNull();
    expect(splitOnPlace({ text: 'went home', place: { name: 'Elsewhere', q: 0, r: 0 } })).toBeNull();
  });
});

describe('roster', () => {
  const row = (id: string, o: { you?: boolean; online?: boolean; lastSeen?: number; empireName?: string } = {}) =>
    ({ id, you: false, online: false, lastSeen: 0, empireName: id, ...o });

  it('lists you first, then online players, then the most recently seen', () => {
    const sorted = sortRoster([
      row('old', { lastSeen: 10 }),
      row('on-b', { online: true, lastSeen: 5, empireName: 'Beta' }),
      row('me', { you: true, lastSeen: 1 }),
      row('recent', { lastSeen: 50 }),
      row('on-a', { online: true, lastSeen: 5, empireName: 'Alpha' }),
    ]);
    expect(sorted.map((r) => r.id)).toEqual(['me', 'on-a', 'on-b', 'recent', 'old']);
  });

  it('is a stable order whatever order the list arrives in', () => {
    const list = [row('a', { lastSeen: 3 }), row('b', { online: true }), row('c', { lastSeen: 3 }), row('d', { you: true })];
    const ids = sortRoster(list).map((r) => r.id);
    expect(sortRoster([...list].reverse()).map((r) => r.id)).toEqual(ids);
  });

  it('says how long ago in plain words', () => {
    const now = 1_000_000_000;
    expect(relativeTime(now, now)).toBe('just now');
    expect(relativeTime(now + 5_000, now)).toBe('just now'); // clock skew: never "in the future"
    expect(relativeTime(now - 44_000, now)).toBe('just now');
    expect(relativeTime(now - 60_000, now)).toBe('1 min ago');
    expect(relativeTime(now - 59 * 60_000, now)).toBe('59 min ago');
    expect(relativeTime(now - 3 * 3_600_000, now)).toBe('3 h ago');
    expect(relativeTime(now - 2 * 86_400_000, now)).toBe('2 d ago');
    expect(relativeTime(now - 21 * 86_400_000, now)).toBe('3 wk ago');
    expect(relativeTime(now - 90 * 86_400_000, now)).toBe('3 mo ago');
    expect(relativeTime(now - 800 * 86_400_000, now)).toBe('2 yr ago');
  });

  it('keeps the newer copy of a player between live pushes and polls', () => {
    const v = (id: string, updatedAt: number, tag = '') => ({ id, updatedAt, tag });
    const list = [v('a', 10), v('b', 10)];
    expect(upsertNewer(list, v('a', 20, 'live'))).toEqual([v('a', 20, 'live'), v('b', 10)]);
    expect(upsertNewer(list, v('a', 5, 'stale'))).toEqual(list);
    expect(upsertNewer(list, v('c', 1))).toHaveLength(3);
    // A poll older than a live push keeps the live copy; players gone from the poll are dropped.
    const live = [v('a', 30, 'live'), v('b', 10), v('gone', 10)];
    expect(mergeSnapshot(live, [v('a', 20, 'poll'), v('b', 15, 'poll'), v('new', 1)])).toEqual([v('a', 30, 'live'), v('b', 15, 'poll'), v('new', 1)]);
  });
});
