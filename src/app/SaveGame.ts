import type { GameState } from './GameState';

/** Fields that persist between sessions; the rest is view state or derived from the world. */
const SAVED = [
  'turn', 'empire', 'economy', 'designs', 'shipyardClass', 'hiddenTraits', 'explored', 'openedCrates', 'collectedCaches',
  'fleets', 'loadouts', 'dockSpent', 'depots', 'construction', 'lastReport', 'dispatches', 'engaged', 'identity',
] as const satisfies ReadonlyArray<keyof GameState>;

export type SavedGame = Pick<GameState, (typeof SAVED)[number]> & { readonly version: number; readonly seed: number };

const VERSION = 1;
const BASE_KEY = 'falchion.save';

/** Browser save of one empire. Storage can be missing or blocked; every call tolerates that. */
export class SaveGame {
  /** Set when the empire is abandoned (or another tab took over): nothing more is written. */
  private stopped = false;
  /** Identifies this tab's writes, to notice another tab playing the same empire. */
  readonly tabId = Math.random().toString(36).slice(2);

  private readonly key: string;

  /** `slot` separates players sharing a browser (the guest keeps the original key). */
  constructor(private readonly seed: number, private readonly storage: Storage | null = safeStorage(), slot?: string) {
    this.key = slot ? `${BASE_KEY}.${slot}` : BASE_KEY;
  }

  /** The persistent fields of a state, ready to store. */
  snapshot(state: GameState): Record<string, unknown> {
    const out: Record<string, unknown> = { version: VERSION, seed: this.seed, tab: this.tabId };
    for (const k of SAVED) out[k] = state[k];
    return out;
  }

  /** Accept a save (e.g. from the server) only if it belongs to this galaxy and version. */
  valid(save: unknown): save is SavedGame {
    const s = save as SavedGame | null;
    return !!s && s.version === VERSION && s.seed === this.seed && Number.isInteger(s.turn);
  }

  load(): SavedGame | null {
    try {
      const raw = this.storage?.getItem(this.key);
      if (!raw) return null;
      const save = JSON.parse(raw) as SavedGame;
      return this.valid(save) ? save : null;
    } catch {
      return null;
    }
  }

  /** True once stop() was called (reset or another tab took over). */
  get stoppedSaving(): boolean {
    return this.stopped;
  }

  save(state: GameState): void {
    if (this.stopped) return;
    try {
      this.storage?.setItem(this.key, JSON.stringify(this.snapshot(state)));
    } catch {
      // Quota or privacy mode: the game keeps running without a save.
    }
  }

  /** Stop saving for the rest of this page's life (e.g. before a reset reload). */
  stop(): void {
    this.stopped = true;
  }

  /**
   * Calls back when another tab writes this empire. Only one tab may play it:
   * the caller should stop saving here, or the tabs overwrite each other.
   */
  onOtherTab(fn: () => void): void {
    if (typeof window === 'undefined') return;
    window.addEventListener('storage', (e) => {
      if (e.key !== this.key || !e.newValue) return;
      try {
        if ((JSON.parse(e.newValue) as { tab?: string }).tab !== this.tabId) fn();
      } catch {
        // Unreadable write: ignore.
      }
    });
  }

  clear(): void {
    try {
      this.storage?.removeItem(this.key);
    } catch {
      // Nothing to clear.
    }
  }
}

function safeStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}
