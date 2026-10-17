// The shared world: what every player's galaxy has in common beyond the stars themselves. It holds
// the asteroid fields that have been mined and the NPC empires that have been discovered
// (src/core/world/SharedWorld.ts). Empires change it only through the effects their simulation
// emits; this applies them in order, one writer at a time, keeps world.json on the data volume,
// and tells every connected player.
import { readFile, rename, writeFile } from 'node:fs/promises';

const LOCK = ':world';
/** At most one broadcast this often; a quiet change waits for the next window. */
const BROADCAST_MS = 2_000;

/**
 * @param {{
 *   file: string,
 *   loadSim: () => Promise<{ applyEffects(world: any, effects: any[]): any, stepWorld?(world: any, tick: number, players: any[]): { world: any, raids: any[] }, EMPTY_WORLD: any, validWorld(w: unknown): boolean } | null>,
 *   withLock: (key: string, fn: () => Promise<any>) => Promise<any>,
 *   broadcast?: (event: string, data: unknown) => void,
 *   now?: () => number,
 * }} deps
 */
export function createSharedWorld({ file, loadSim, withLock, broadcast = () => {}, now = () => Date.now() }) {
  /** @type {any} */
  let world = null;
  let lastSent = 0;
  let timer = null;

  async function load() {
    if (world) return world;
    const sim = await loadSim();
    const empty = sim?.EMPTY_WORLD ?? { tick: 0, npcs: {}, asteroids: {} };
    try {
      const stored = JSON.parse(await readFile(file, 'utf8'));
      world = sim && sim.validWorld(stored) ? stored : empty;
    } catch {
      world = empty;
    }
    return world;
  }

  async function persist() {
    const tmp = `${file}.tmp`;
    await writeFile(tmp, JSON.stringify(world));
    await rename(tmp, file);
  }

  function announce() {
    const wait = lastSent + BROADCAST_MS - now();
    if (wait > 0) {
      timer ??= setTimeout(() => { timer = null; announce(); }, wait);
      timer.unref?.();
      return;
    }
    lastSent = now();
    broadcast('world', world);
  }

  return {
    /** The world as it is now (loaded on first use). */
    get: load,
    /**
     * The NPC empires' year: step every discovered NPC to `tick` against every empire's public
     * view (colonies, fleets). Returns the raids that struck, for each empire to resolve.
     */
    async step(tick, players) {
      return withLock(LOCK, async () => {
        const sim = await loadSim();
        if (!sim?.stepWorld) return [];
        const before = await load();
        if (tick <= before.tick) return [];
        const r = sim.stepWorld(before, tick, players);
        world = r.world;
        await persist();
        if (Object.keys(world.npcs).length) announce();
        return r.raids;
      });
    },
    /** Apply effects an empire emitted, in order; save and tell everyone. */
    async apply(effects) {
      if (!Array.isArray(effects) || !effects.length) return world ?? load();
      return withLock(LOCK, async () => {
        const sim = await loadSim();
        if (!sim) return load();
        const before = await load();
        world = sim.applyEffects(before, effects);
        if (world !== before) {
          await persist();
          announce();
        }
        return world;
      });
    },
  };
}
