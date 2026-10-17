// Keeps every empire going while its owner is away. Once a world year, each stored empire whose
// owner is not playing right now is played forward to the current year with the game's own
// rules (the bundled simulation, built from src/sim/headless.ts into ./sim/), saved, and shown
// to the other players. While the owner plays, their browser runs the empire and saves it; the
// moment they leave, the server carries on from their last save.

/** An owner who saved this recently (ms) is playing: their browser drives the empire. */
export const PLAYING_GRACE_MS = 150_000;

/**
 * @param {{
 *   store: { ids(): Promise<string[]>, load(id: string): Promise<any>, save(id: string, record: any): Promise<void> },
 *   loadSim: () => Promise<{ advanceSave(save: unknown, player: { id: string, name: string }, toTurn: number): { save: object, public: object, years: number } | null } | null>,
 *   isOnline: (id: string) => boolean,
 *   publish?: (player: object) => void,
 *   publicView?: (p: unknown) => object,
 *   now?: () => number,
 *   log?: (msg: string) => void,
 * }} deps
 */
export function createSimTicker({ store, loadSim, isOnline, publish = () => {}, publicView = (p) => p, now = () => Date.now(), log = () => {} }) {
  let running = null;

  /** Play every away empire forward to `worldTick`. Returns how many were advanced. */
  async function tick(worldTick) {
    if (running) return running; // a long catch-up is still going: never run two at once
    running = (async () => {
      const sim = await loadSim();
      if (!sim) return 0;
      let advanced = 0;
      for (const id of await store.ids()) {
        try {
          if (isOnline(id)) continue;
          const record = await store.load(id);
          if (!record?.save || now() - (record.updatedAt ?? 0) < PLAYING_GRACE_MS) continue;
          const player = { id, name: String(record.player?.name ?? 'Commander') };
          const result = sim.advanceSave(record.save, player, worldTick);
          if (!result) continue;
          // The owner may have come back and saved while we worked: their save wins.
          const latest = await store.load(id);
          if ((latest?.updatedAt ?? 0) !== (record.updatedAt ?? 0)) continue;
          const pub = publicView(result.public);
          await store.save(id, { ...record, save: result.save, public: pub, simulatedAt: now() });
          publish({ ...pub, id, name: player.name, avatar: record.player?.avatar ?? null, updatedAt: now() });
          advanced++;
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
