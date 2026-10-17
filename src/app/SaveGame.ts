import type { GameState } from './GameState';

/** Fields that persist between sessions; the rest is view state or derived from the world. */
const SAVED = [
  'turn', 'empire', 'economy', 'designs', 'shipyardClass', 'hiddenTraits', 'explored', 'openedCrates', 'collectedCaches',
  'fleets', 'loadouts', 'dockSpent', 'depots', 'lastReport', 'dispatches', 'engaged',
] as const satisfies ReadonlyArray<keyof GameState>;

export type SavedGame = Pick<GameState, (typeof SAVED)[number]> & { readonly version: number; readonly seed: number };

const VERSION = 1;
const KEY = 'falchion.save';

/** Browser save of one empire. Storage can be missing or blocked; every call tolerates that. */
export class SaveGame {
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
    const out: Record<string, unknown> = { version: VERSION, seed: this.seed };
    for (const k of SAVED) out[k] = state[k];
    try {
      this.storage?.setItem(KEY, JSON.stringify(out));
    } catch {
      // Quota or privacy mode: the game keeps running without a save.
    }
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
