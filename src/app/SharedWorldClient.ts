import type { SharedLink } from '../sim/EmpireSim';
import { applyEffects, EMPTY_WORLD, validWorld, type SharedEffect, type SharedWorld } from '../core/world/SharedWorld';

const GUEST_KEY = 'falchion.world';

/**
 * The browser's copy of the shared world (asteroid fields, NPC empires).
 *
 * Signed in, the server holds the real one: it is fetched at start-up and replaced whenever the
 * server announces a change, while this empire's own changes apply here at once so the game
 * answers without waiting. A guest's world is its own and lives in this browser.
 */
export class SharedWorldClient implements SharedLink {
  private current: SharedWorld = EMPTY_WORLD;

  private constructor(private readonly storage: Storage | null) {}

  /** Signed in: the server's world. Guest: the one saved in this browser. */
  static async connect(signedIn: boolean): Promise<SharedWorldClient> {
    if (signedIn) {
      const c = new SharedWorldClient(null);
      try {
        const res = await fetch('./api/world', { credentials: 'same-origin', signal: AbortSignal.timeout(5_000) });
        if (res.ok) c.adopt(await res.json());
      } catch {
        // Offline or slow: start empty; the server's next announcement fills it in.
      }
      return c;
    }
    const storage = safeStorage();
    const c = new SharedWorldClient(storage);
    try {
      const raw = storage?.getItem(GUEST_KEY);
      if (raw) c.adopt(JSON.parse(raw));
    } catch {
      // Unreadable: a fresh world.
    }
    return c;
  }

  world(): SharedWorld {
    return this.current;
  }

  emit(effects: readonly SharedEffect[]): void {
    this.current = applyEffects(this.current, effects);
    try {
      this.storage?.setItem(GUEST_KEY, JSON.stringify(this.current));
    } catch {
      // Quota or privacy mode: the world lives for this page only.
    }
  }

  /** The server's world replaces ours (its announcement, or the start-up fetch). */
  adopt(world: unknown): void {
    if (validWorld(world)) this.current = world;
  }
}

function safeStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}
