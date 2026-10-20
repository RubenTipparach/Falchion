import type { GalaxyModel } from '../core/galaxy/GalaxyModel';
import { COLONY_SIGHT, HOME_SIGHT, hexOfStarId, lensOf, NO_VISION, visionInputOf, visionOf, visionSets, type StarLens, type Vision } from '../core/visibility/Vision';
import { hexToWorld } from '../core/hex/Hex';
import type { GameState } from './GameState';
import type { Store } from './Store';

/** How far (ly) the fog clears round an explored system, a sighted one and one of your fleets. */
export const CLEAR_EXPLORED = 3.4, CLEAR_SIGHTED = 2.2, CLEAR_FLEET = 2.8;

/**
 * The player's view of the galaxy (change admin-snapshots-and-fog): their own vision, worked out
 * from their state with the rules in src/core/visibility/Vision.ts, what their allies share (from
 * the server), and the server's hide-systems flag. Views read it through `lens` and redraw when
 * `onChange` fires; the fog of war reads `clearings`.
 */
export class PlayerVision {
  private own: Vision = NO_VISION;
  private shared: Vision = NO_VISION;
  private hide = false;
  private version = 0;
  private current: StarLens;
  private points: Float32Array = new Float32Array(0);
  private readonly listeners = new Set<() => void>();

  private readonly state: () => GameState;

  constructor(store: Store<GameState>, private readonly galaxy: GalaxyModel) {
    this.state = () => store.state;
    this.own = this.work(store.state);
    this.current = this.make();
    store.subscribe((s, prev) => {
      if (s.turn === prev.turn && s.explored === prev.explored && s.visited === prev.visited && s.economy.colonies === prev.economy.colonies
        && s.depots === prev.depots && s.fleets === prev.fleets && s.loadouts === prev.loadouts && s.home === prev.home) return;
      const next = this.work(s);
      if (same(next, this.own)) return;
      this.own = next;
      this.changed();
    });
  }

  /** What the player sees now. */
  get lens(): StarLens {
    return this.current;
  }

  get hideSystems(): boolean {
    return this.hide;
  }

  /** Calls back whenever what the player sees changes. */
  onChange(fn: () => void): void {
    this.listeners.add(fn);
  }

  /** The server's hide-systems flag. */
  setHideSystems(on: boolean): void {
    if (on === this.hide) return;
    this.hide = on;
    this.changed();
  }

  /** What allies share (their explored and sighted systems, from the server). */
  setShared(v: Vision): void {
    if (same(v, this.shared)) return;
    this.shared = v;
    this.changed();
  }

  /**
   * Where the fog clears: x, z (absolute galaxy coordinates), radius (ly) and strength (1 explored,
   * less sighted), four floats per system.
   */
  clearings(): Float32Array {
    return this.points;
  }

  /** Read the flag and what allies share from the server (signed in), or just the flag (a guest). */
  async poll(signedIn: boolean): Promise<void> {
    try {
      const res = await fetch(signedIn ? './api/vision' : './api/info', { credentials: 'same-origin', cache: 'no-store' });
      if (!res.ok || !res.headers.get('content-type')?.includes('json')) return;
      const body = (await res.json()) as { hideSystems?: boolean; explored?: string[]; sighted?: string[] };
      if (signedIn) this.setShared({ explored: strings(body.explored), sighted: strings(body.sighted) });
      this.setHideSystems(body.hideSystems === true);
    } catch {
      // Offline or no server: keep what we have.
    }
  }

  private work(s: GameState): Vision {
    return visionOf(visionInputOf(s), (h) => this.galaxy.starAt(h));
  }

  private make(): StarLens {
    const sets = visionSets([this.own, this.shared]);
    const out: number[] = [];
    const add = (id: string, r: number, strength: number) => {
      const h = hexOfStarId(id);
      if (!h) return;
      const p = this.galaxy.starAt(h)?.position ?? hexToWorld(h);
      out.push(p.x, p.z, r, strength);
    };
    for (const id of sets.explored) add(id, CLEAR_EXPLORED, 1);
    for (const id of sets.sighted) add(id, CLEAR_SIGHTED, 0.75);
    // Your own territory is charted all through: the home's, and each colony's.
    const s = this.state();
    add(s.home.id, HOME_SIGHT + 0.5, 1);
    for (const id of new Set(s.economy.colonies.map((c) => c.starId).filter((x): x is string => !!x))) add(id, COLONY_SIGHT + 0.5, 1);
    this.points = new Float32Array(out);
    return lensOf(sets, this.hide, ++this.version);
  }

  private changed(): void {
    this.current = this.make();
    for (const fn of this.listeners) fn();
  }
}

const strings = (x: unknown): string[] => (Array.isArray(x) ? x.filter((s): s is string => typeof s === 'string').slice(0, 200_000) : []);

function same(a: Vision, b: Vision): boolean {
  return a.explored.length === b.explored.length && a.sighted.length === b.sighted.length
    && a.explored.every((x, i) => x === b.explored[i]) && a.sighted.every((x, i) => x === b.sighted[i]);
}
