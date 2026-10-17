// The server runs every empire: a player's orders arrive here as commands (POST /api/command),
// are applied with the game's own rules to the server's copy (the bundled simulation, see
// src/sim/headless.ts and src/sim/commands.ts), saved, and the result returned as the truth the
// player's browser adopts. Other players see the empire's new public view at once.

/** Commands per player per window: a burst for quick clicks, steady play well under it. */
const BURST = 40;
const WINDOW_MS = 10_000;

/**
 * @param {{
 *   store: { load(id: string): Promise<any>, save(id: string, record: any): Promise<void> },
 *   loadSim: () => Promise<{ applyCommand(save: unknown, player: object, worldTime: number, command: unknown, clientTime?: number): { ok: boolean, error?: string, save: object, public: object } | null } | null>,
 *   withLock: (key: string, fn: () => Promise<any>) => Promise<any>,
 *   worldTime: () => number,
 *   publish?: (player: object) => void,
 *   publicView?: (p: unknown) => object,
 *   now?: () => number,
 * }} deps
 */
export function createCommandService({ store, loadSim, withLock, worldTime, publish = () => {}, publicView = (p) => p, now = () => Date.now() }) {
  const recent = new Map(); // player id -> timestamps

  function allow(id) {
    const t = now();
    const list = (recent.get(id) ?? []).filter((x) => t - x < WINDOW_MS);
    if (list.length >= BURST) return false;
    list.push(t);
    recent.set(id, list);
    return true;
  }

  /** Apply one command for a signed-in user. Returns { status, body }. */
  async function apply(user, body) {
    if (!allow(user.id)) return { status: 429, body: { ok: false, error: 'too many orders: slow down a moment' } };
    const sim = await loadSim();
    if (!sim) return { status: 503, body: { ok: false, error: 'the server cannot run empires right now' } };
    return withLock(user.id, async () => {
      const record = await store.load(user.id);
      if (!record?.save) return { status: 404, body: { ok: false, error: 'no empire yet' } };
      const player = { id: user.id, name: String(record.player?.name ?? user.name ?? 'Commander') };
      const result = sim.applyCommand(record.save, player, worldTime(), body?.command, typeof body?.time === 'number' ? body.time : undefined);
      if (!result) return { status: 409, body: { ok: false, error: 'this empire cannot be loaded' } };
      const pub = publicView(result.public);
      const updatedAt = now();
      await store.save(user.id, { ...record, player: { ...record.player, ...user }, save: result.save, public: pub, updatedAt });
      publish({ ...pub, id: user.id, name: user.name, avatar: user.avatar ?? null, updatedAt });
      return { status: 200, body: { ok: result.ok, ...(result.error ? { error: result.error } : {}), save: result.save } };
    });
  }

  return { apply };
}
