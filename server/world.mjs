// The shared world: what every player's galaxy has in common beyond the stars themselves. It holds
// the asteroid fields that have been mined and the NPC empires that have been discovered
// (src/core/world/SharedWorld.ts). Empires change it only through the effects their simulation
// emits; this applies them in order, one writer at a time, keeps it in the database,
// and tells every connected player.
import { fileDoc } from './db.mjs';

const LOCK = ':world';
/** At most one broadcast this often; a quiet change waits for the next window. */
const BROADCAST_MS = 2_000;

/**
 * @param {{
 *   doc?: { read(): Promise<string | null>, write(text: string): Promise<void> },
 *   file?: string,
 *   loadSim: () => Promise<{ applyEffects(world: any, effects: any[]): any, stepWorld?(world: any, tick: number, players: any[]): { world: any, raids: any[] }, EMPTY_WORLD: any, validWorld(w: unknown): boolean } | null>,
 *   withLock: (key: string, fn: () => Promise<any>) => Promise<any>,
 *   broadcast?: (event: string, data: unknown) => void,
 *   record?: (event: { actor: string, subject?: string | null, kind: string, worldTime?: number | null, data?: object }) => void,
 *   now?: () => number,
 * }} deps
 *   record logs to the event log what the NPCs decided and what players did to the world.
 */
export function createSharedWorld({ doc, file, loadSim, withLock, broadcast = () => {}, record = () => {}, now = () => Date.now() }) {
  const store = doc ?? fileDoc(file);
  /** @type {any} */
  let world = null;
  let lastSent = 0;
  let timer = null;

  async function load() {
    if (world) return world;
    const sim = await loadSim();
    const empty = sim?.EMPTY_WORLD ?? { tick: 0, npcs: {}, asteroids: {} };
    try {
      const stored = JSON.parse((await store.read()) ?? 'null');
      world = sim && sim.validWorld(stored) ? stored : empty;
    } catch {
      world = empty;
    }
    return world;
  }

  async function persist() {
    await store.write(JSON.stringify(world));
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
        for (const d of r.decisions ?? []) {
          record({ actor: `npc:${d.npc}`, subject: d.player ?? null, kind: d.kind, worldTime: d.year, data: { text: d.text, ...(d.fleet ? { fleet: d.fleet } : {}), ...(d.at ? { at: d.at } : {}) } });
        }
        if (Object.keys(world.npcs).length) announce();
        return r.raids;
      });
    },
    /**
     * The server reset (server/reset.mjs): a fresh world at world year `tick`. Every NPC empire is
     * dormant again, every asteroid field full, and no relations, contacts, stakes or payouts are
     * left. Saved and told to everyone at once.
     */
    async reset(tick) {
      return withLock(LOCK, async () => {
        const sim = await loadSim();
        const empty = sim?.EMPTY_WORLD ?? { tick: 0, npcs: {}, asteroids: {} };
        world = { ...empty, tick: Number.isFinite(tick) ? Math.floor(tick) : empty.tick };
        await persist();
        lastSent = 0;
        announce();
        return world;
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
          for (const e of effects) {
            const event = eventOf(e, before, world);
            if (event) record(event);
          }
        }
        return world;
      });
    },
  };
}

/** The event log line for an effect worth recording (players' doings in the shared world), or null. */
function eventOf(e, before, after) {
  const pair = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  switch (e?.kind) {
    case 'discover':
      return before.npcs?.[e.npc?.id]?.knownBy?.includes(e.by) ? null : { actor: e.by, kind: 'discover', worldTime: e.npc?.discoveredAt ?? null, data: { npc: e.npc?.id, text: `Discovered NPC empire ${e.npc?.id}` } };
    case 'npcColony':
      return e.capturedBy ? { actor: e.capturedBy, kind: 'capture', data: { npc: e.npc, star: e.star, text: `Captured ${e.star} from NPC empire ${e.npc}` } } : null;
    case 'diplomacy':
      // Only what took effect (an action not open to them, or before first contact, is ignored).
      if (before.relations?.[pair(e.by, e.other)] === after.relations?.[pair(e.by, e.other)]) return null;
      return { actor: e.by, subject: e.other, kind: 'diplomacy', worldTime: e.at, data: { action: e.action, text: `${e.action} toward ${e.other}` } };
    case 'contact':
      if (before.contacts?.[pair(e.a, e.b)] !== undefined) return null;
      return { actor: e.a, subject: e.b, kind: 'contact', worldTime: e.at, data: { text: `First contact between ${e.a} and ${e.b}` } };
    default:
      return null;
  }
}
