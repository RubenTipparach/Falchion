import type { GameState } from './GameState';

/** Fields that persist between sessions; the rest is view state or derived from the world. */
const SAVED = [
  'turn', 'empire', 'economy', 'designs', 'shipyardClass', 'hiddenTraits', 'explored', 'openedCrates', 'collectedCaches',
  'fleets', 'loadouts', 'dockSpent', 'depots', 'construction', 'lastReport', 'dispatches', 'engaged',
] as const satisfies ReadonlyArray<keyof GameState>;

export type SavedGame = Pick<GameState, (typeof SAVED)[number]> & { readonly version: number; readonly seed: number };

const VERSION = 1;
const KEY = 'falchion.save';

/** Browser save of one empire. Storage can be missing or blocked; every call tolerates that. */
export class SaveGame {
  /** Set when the empire is abandoned (or another tab took over): nothing more is written. */
  private stopped = false;
  /** Identifies this tab's writes, to notice another tab playing the same empire. */
  readonly tabId = Math.random().toString(36).slice(2);

  constructor(private readonly seed: number, private readonly storage: Storage | null = safeStorage()) {}

  load(): SavedGame | null {
    try {
      const raw = this.storage?.getItem(KEY);
      if (!raw) return null;
      const save = JSON.parse(raw) as SavedGame;
      return save.version === VERSION && save.seed === this.seed && Number.isInteger(save.turn) ? save : null;
    } catch {
      return null;
    }
  }

  save(state: GameState): void {
    if (this.stopped) return;
    const out: Record<string, unknown> = { version: VERSION, seed: this.seed, tab: this.tabId };
    for (const k of SAVED) out[k] = state[k];
    try {
      this.storage?.setItem(KEY, JSON.stringify(out));
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
      if (e.key !== KEY || !e.newValue) return;
      try {
        if ((JSON.parse(e.newValue) as { tab?: string }).tab !== this.tabId) fn();
      } catch {
        // Unreadable write: ignore.
      }
    });
  }

  clear(): void {
    try {
      this.storage?.removeItem(KEY);
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
