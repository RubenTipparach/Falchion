import { CAPITAL_START_POP } from '../core/economy/Population';
import type { GameState } from './GameState';
import type { Hex } from '../core/hex/Hex';
import { LEGACY_MATERIALS, RESOURCES } from '../content/resources';

/** Fields that persist between sessions; the rest is view state or derived from the world. */
export const SAVED = [
  'turn', 'empire', 'economy', 'designs', 'shipyardClass', 'hiddenTraits', 'explored', 'openedCrates', 'collectedCaches',
  'fleets', 'loadouts', 'dockSpent', 'depots', 'construction', 'lastReport', 'dispatches', 'engaged', 'identity', 'home', 'relations', 'battleLog', 'flows',
] as const satisfies ReadonlyArray<keyof GameState>;

/** The persistent fields of a save, as a patch for the game state (view state untouched). */
export function savedFields(save: SavedGame): Partial<GameState> {
  save = upgradeSave(save);
  const out: Record<string, unknown> = {};
  for (const k of SAVED) if (k in save) out[k] = (save as unknown as Record<string, unknown>)[k];
  return out as Partial<GameState>;
}

export type SavedGame = Omit<Pick<GameState, (typeof SAVED)[number]>, 'home'> & { readonly version: number; readonly seed: number; readonly home?: GameState['home'] };

/**
 * Where a save's empire lives: its recorded home, or (saves from before homes were recorded)
 * the star of its capital colony. Keeps a player's home when the galaxy's star layout changes.
 */
export function savedHome(save: SavedGame | null): Hex | null {
  const h = save?.home?.hex;
  if (h && Number.isInteger(h.q) && Number.isInteger(h.r)) return { q: h.q, r: h.r };
  const id = save?.economy?.colonies?.find((c) => c.capital)?.starId;
  const [q, r] = (id ?? '').split(',').map(Number);
  return Number.isInteger(q) && Number.isInteger(r) ? { q, r } : null;
}

/**
 * A save in today's terms. Saves from before the three raw materials have their old minerals
 * folded into metals, gases and crystals (and gain trade goods); abstract trade routes, which
 * freighters replaced, are dropped, and so are the scenery fleets of the old fake neighbours
 * (fleets with no ships of yours aboard). Idempotent: an up-to-date save comes back unchanged.
 */
export function upgradeSave<T extends SavedGame>(save: T): T {
  save = dropAmmunition(givePopulation(save));
  const old = save.empire?.materials as Record<string, number> | undefined;
  const routes = 'routes' in (save.economy ?? {});
  const scenery = (save.fleets ?? []).some((f) => !save.loadouts?.[f.id]);
  if (!old || (!routes && !scenery && 'goods' in old && !Object.keys(old).some((k) => k in LEGACY_MATERIALS))) return save;
  const materials: Record<string, number> = {};
  for (const r of RESOURCES) materials[r.id] = Number(old[r.id]) || 0;
  for (const [k, [to, rate]] of Object.entries(LEGACY_MATERIALS)) materials[to] += Math.round((Number(old[k]) || 0) * rate);
  const { routes: _routes, ...economy } = save.economy as typeof save.economy & { routes?: unknown };
  const fleets = (save.fleets ?? []).filter((f) => save.loadouts?.[f.id]);
  return { ...save, economy, fleets, empire: { ...save.empire, materials } };
}

/** Saves from before population: every colony gets population 1, the capital its starting population. */
function givePopulation<T extends SavedGame>(save: T): T {
  const colonies = save.economy?.colonies;
  if (!colonies?.some((c) => c.pop === undefined)) return save;
  return { ...save, economy: { ...save.economy, colonies: colonies.map((c) => (c.pop === undefined ? { ...c, pop: c.capital ? CAPITAL_START_POP : 1 } : c)) } };
}

/** Saves from before ammunition was removed: drop it from fleets and the home dock. */
function dropAmmunition<T extends SavedGame>(save: T): T {
  const loadouts = save.loadouts as unknown as Record<string, Record<string, unknown>> | undefined;
  const dock = save.dockSpent as unknown as Record<string, unknown> | undefined;
  const has = (o: Record<string, unknown> | undefined) => !!o && 'ammo' in o;
  if (!has(dock) && !Object.values(loadouts ?? {}).some(has)) return save;
  const strip = (o: Record<string, unknown>) => { const { ammo: _a, ...rest } = o; return rest; };
  return {
    ...save,
    ...(loadouts ? { loadouts: Object.fromEntries(Object.entries(loadouts).map(([id, l]) => [id, strip(l)])) } : {}),
    ...(dock ? { dockSpent: strip(dock) } : {}),
  };
}

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
      return this.valid(save) ? upgradeSave(save) : null;
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
