// The server runs every empire. Once a world year each stored empire is played forward to the
// current year with the game's own rules (the bundled simulation, built from src/sim/headless.ts
// into ./sim/), saved, shown to the other players, and sent to its owner if they are online:
// their browser shows what the server decides. Orders arrive separately (commands.mjs); a
// per-empire lock keeps the two from interleaving.

/**
 * @param {{
 *   store: { ids(): Promise<string[]>, load(id: string): Promise<any>, save(id: string, record: any): Promise<void> },
 *   loadSim: () => Promise<{ advanceSave(save: unknown, player: { id: string, name: string }, toTurn: number, world?: unknown): { save: object, public: object, effects?: any[], years: number } | null } | null>,
 *   withLock?: (key: string, fn: () => Promise<any>) => Promise<any>,
 *   world?: { get(): Promise<any>, apply(effects: any[]): Promise<any>, step?(tick: number, players: any[]): Promise<any[]> },
 *   publish?: (player: object) => void,
 *   notifyOwner?: (id: string, save: object) => void,
 *   publicView?: (p: unknown) => object,
 *   now?: () => number,
 *   log?: (msg: string) => void,
 * }} deps
 */
export function createSimTicker({ store, loadSim, world = null, withLock = (_key, fn) => fn(), publish = () => {}, notifyOwner = () => {}, publicView = (p) => p, now = () => Date.now(), log = () => {} }) {
  let running = null;

  /** Play every empire forward to `worldTick`. Returns how many were advanced. */
  async function tick(worldTick) {
    if (running) return running; // a long catch-up is still going: never run two at once
    running = (async () => {
      const sim = await loadSim();
      if (!sim) return 0;
      let advanced = 0;
      const ids = await store.ids();
      // First the NPC empires' year, against every empire as others see it; then each empire plays
      // its year and resolves the raids that reached it.
      let raids = [];
      if (world?.step) {
        const players = [];
        for (const id of ids) {
          try {
            players.push({ id, public: (await store.load(id))?.public ?? null });
          } catch {
            // Unreadable record: its empire is skipped below too.
          }
        }
        try {
          raids = await world.step(worldTick, players);
        } catch (err) {
          log(`sim: NPC year skipped (${err?.message ?? err})`);
        }
      }
      for (const id of ids) {
        try {
          const done = await withLock(id, async () => {
            const record = await store.load(id);
            if (!record?.save) return false;
            const player = { id, name: String(record.player?.name ?? 'Commander') };
            // Each empire plays on the shared world as the ones before it left it.
            const mine = raids.filter((r) => r.player === id);
            const result = sim.advanceSave(record.save, player, worldTick, world ? await world.get() : undefined, mine);
            if (!result) return false;
            if (world && result.effects?.length) await world.apply(result.effects);
            const pub = publicView(result.public);
            await store.save(id, { ...record, save: result.save, public: pub, simulatedAt: now() });
            publish({ ...pub, id, name: player.name, avatar: record.player?.avatar ?? null, updatedAt: now() });
            notifyOwner(id, result.save);
            return true;
          });
          if (done) advanced++;
        } catch (err) {
          log(`sim: empire ${id} skipped (${err?.message ?? err})`);
        }
      }
      return advanced;
    })();
    try {
      return await running;
    } finally {
      running = null;
    }
  }

  return { tick };
}
