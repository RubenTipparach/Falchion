// The server reset (change admin-snapshots-and-fog): every empire goes back to its start as first
// founded, and the shared world starts fresh. Players keep their empire (its name, ruler, capital,
// colours, flag, ship style and home system) and do not found it again: each is rebuilt with the
// game's own founding rules at the current world year (refoundSave in src/sim/headless.ts), from
// the save it was founded with (kept since this change, in the `foundings` table) or, for an empire
// founded before that, from the choices in its current save. Snapshots and the event log are kept:
// every empire is snapshotted just before (reason `reset`) and the reset is logged.

/** What an admin types to confirm a reset. */
export const RESET_CONFIRMATION = 'RESET';

/**
 * @param {{
 *   store: { ids(): Promise<string[]>, load(id: string): Promise<any>, save(id: string, record: any): Promise<void>, founding(id: string): Promise<any> },
 *   loadSim: () => Promise<any>,
 *   withLock: (key: string, fn: () => Promise<any>) => Promise<any>,
 *   world: { reset(tick: number): Promise<any> },
 *   snapshots: { takeAll(worldYear: number, reason: string): Promise<number> },
 *   ticker?: { exclusive(fn: () => Promise<any>): Promise<any> } | null,
 *   events?: { record(event: object): unknown } | null,
 *   worldTick: () => number,
 *   publicView?: (p: unknown) => object,
 *   publish?: (player: object) => void,
 *   notifyOwner?: (id: string, save: object) => void,
 *   afterReset?: () => void,
 *   now?: () => number,
 *   log?: (msg: string) => void,
 * }} deps
 */
export function createReset({ store, loadSim, withLock, world, snapshots, ticker = null, events = null, worldTick, publicView = (p) => p, publish = () => {}, notifyOwner = () => {}, afterReset = () => {}, now = () => Date.now(), log = () => {} }) {
  const record = (event) => {
    try {
      events?.record(event);
    } catch (err) {
      log(`event log: ${err?.message ?? err}`);
    }
  };

  /** Reset the server for `admin` ({ id, name }). Returns what was done. */
  async function run(admin) {
    const sim = await loadSim();
    if (!sim?.refoundSave || !sim?.foundingOf) throw Object.assign(new Error('the server cannot run empires right now'), { status: 503 });
    const go = async () => {
      const tick = Math.floor(worldTick());
      const snapshotted = await snapshots.takeAll(tick, 'reset');
      const reset = [], skipped = [];
      for (const id of await store.ids()) {
        try {
          const done = await withLock(id, async () => {
            const before = await store.load(id);
            if (!before?.save) return false;
            const player = { id, name: String(before.player?.name ?? 'Commander') };
            const kept = await store.founding(id);
            const founding = sim.foundingOf(kept?.save, player) ?? sim.foundingOf(before.save, player);
            if (!founding) return false;
            const r = sim.refoundSave(founding, player, tick);
            const pub = publicView(r.public);
            const at = now();
            await store.save(id, { ...before, save: r.save, public: pub, updatedAt: at, simulatedAt: at, resetAt: at });
            record({ actor: admin.id, subject: id, kind: 'reset-empire', worldTime: tick, data: { from: before.save.turn ?? null, founding: kept ? 'kept' : 'from-save', text: `Reset to its founding (${founding.identity?.name ?? 'unnamed empire'})` } });
            publish({ ...pub, id, name: player.name, avatar: before.player?.avatar ?? null, updatedAt: at });
            notifyOwner(id, r.save);
            return true;
          });
          (done ? reset : skipped).push(id);
        } catch (err) {
          skipped.push(id);
          log(`reset: empire ${id} skipped (${err?.message ?? err})`);
        }
      }
      await world.reset(tick);
      afterReset();
      const result = { worldYear: tick, empires: reset.length, skipped, snapshots: snapshotted };
      record({ actor: admin.id, kind: 'reset', worldTime: tick, data: { ...result, by: admin.name ?? null, text: `Server reset by ${admin.name ?? admin.id}: ${reset.length} empires back to their founding, the shared world fresh` } });
      log(`admin ${admin.id} reset the server: ${reset.length} empires, ${skipped.length} skipped`);
      return result;
    };
    return ticker ? ticker.exclusive(go) : go();
  }

  return { run };
}
