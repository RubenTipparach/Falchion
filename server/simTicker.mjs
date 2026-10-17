// The server runs every empire. Once a world year each stored empire is played forward to the
// current year with the game's own rules (the bundled simulation, built from src/sim/headless.ts
// into ./sim/), saved, shown to the other players, and sent to its owner if they are online:
// their browser shows what the server decides. Orders arrive separately (commands.mjs); a
// per-empire lock keeps the two from interleaving.

/**
 * @param {{
 *   store: { ids(): Promise<string[]>, load(id: string): Promise<any>, save(id: string, record: any): Promise<void> },
 *   loadSim: () => Promise<{ advanceSave(save: unknown, player: { id: string, name: string }, toTurn: number): { save: object, public: object, years: number } | null } | null>,
 *   withLock?: (key: string, fn: () => Promise<any>) => Promise<any>,
 *   publish?: (player: object) => void,
 *   notifyOwner?: (id: string, save: object) => void,
 *   publicView?: (p: unknown) => object,
 *   now?: () => number,
 *   log?: (msg: string) => void,
 * }} deps
 */
export function createSimTicker({ store, loadSim, withLock = (_key, fn) => fn(), publish = () => {}, notifyOwner = () => {}, publicView = (p) => p, now = () => Date.now(), log = () => {} }) {
  let running = null;

  /** Play every empire forward to `worldTick`. Returns how many were advanced. */
  async function tick(worldTick) {
    if (running) return running; // a long catch-up is still going: never run two at once
    running = (async () => {
      const sim = await loadSim();
      if (!sim) return 0;
      let advanced = 0;
      for (const id of await store.ids()) {
        try {
          const done = await withLock(id, async () => {
            const record = await store.load(id);
            if (!record?.save) return false;
            const player = { id, name: String(record.player?.name ?? 'Commander') };
            const result = sim.advanceSave(record.save, player, worldTick);
            if (!result) return false;
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
