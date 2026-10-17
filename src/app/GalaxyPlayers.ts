import type { ChatUser } from '../core/chat/ChatText';
import { mergeActivity, type ActivityEvent } from '../core/social/Activity';
import { mergeSnapshot, upsertNewer } from '../core/social/Roster';
import type { OtherPlayer } from './ServerSync';

export type GalaxyChange = 'players' | 'online' | 'activity';
type Listener = (what: GalaxyChange, fresh: readonly ActivityEvent[]) => void;

/** A player view pushed by the server: just enough shape to store it (othersOnMap validates the rest). */
export function isOtherPlayer(x: unknown): x is OtherPlayer {
  const p = x as OtherPlayer | null;
  return !!p && typeof p.id === 'string' && /^\d{5,25}$/.test(p.id) && typeof p.name === 'string'
    && typeof p.color === 'string' && Array.isArray(p.fleets) && Array.isArray(p.colonies);
}

/**
 * Everyone else in the galaxy, kept current: the once-a-minute poll of /api/players, live
 * `player` pushes from the stream (whichever copy is newer wins), who is online, and the
 * activity feed. Views subscribe with onChange. No DOM, no network.
 */
export class GalaxyPlayers {
  private list: OtherPlayer[] = [];
  private onlineIds = new Set<string>();
  private feed: ActivityEvent[] = [];
  private readonly listeners = new Set<Listener>();

  constructor(private readonly meId: string | null) {}

  get others(): readonly OtherPlayer[] {
    return this.list;
  }

  get activity(): readonly ActivityEvent[] {
    return this.feed;
  }

  isOnline(id: string): boolean {
    return this.onlineIds.has(id);
  }

  /** The polled list (everyone but you). */
  setPlayers(polled: readonly unknown[]): void {
    this.list = mergeSnapshot(this.list, polled.filter(isOtherPlayer).filter((p) => p.id !== this.meId));
    this.emit('players');
  }

  /** One player's new public view, pushed live after they saved. */
  upsert(raw: unknown): void {
    if (!isOtherPlayer(raw) || raw.id === this.meId) return;
    const next = upsertNewer(this.list, raw);
    if (next.some((p, i) => p !== this.list[i]) || next.length !== this.list.length) {
      this.list = next;
      this.emit('players');
    }
  }

  setOnline(users: readonly ChatUser[]): void {
    this.onlineIds = new Set(users.map((u) => u.id));
    this.emit('online');
  }

  /** Loaded (`live` false) or streamed events; listeners get the newly seen live ones. */
  addActivity(raw: readonly unknown[], live: boolean): void {
    const known = new Set(this.feed.map((e) => e.id));
    const next = mergeActivity(this.feed, raw);
    const fresh = live ? next.filter((e) => !known.has(e.id)) : [];
    this.feed = next;
    this.emit('activity', fresh);
  }

  onChange(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(what: GalaxyChange, fresh: readonly ActivityEvent[] = []): void {
    this.listeners.forEach((l) => l(what, fresh));
  }
}
