// The server runs every empire. Once a world year each stored empire is played forward to the
// current year with the game's own rules (the bundled simulation, built from src/sim/headless.ts
// into ./sim/), saved, shown to the other players, and sent to its owner if they are online:
// their browser shows what the server decides. Orders arrive separately (commands.mjs); a
// per-empire lock keeps the two from interleaving. A catch-up of several years at once (after the
// server was down) is logged, so a replay of the empire's event log plays it the same way. Other
// players' worlds are markets for trade goods: every empire is read once a year and each plays
// against that list of the others.

import { appendSafely } from './eventLog.mjs';

/**
 * @param {{
 *   store: { ids(): Promise<string[]>, load(id: string): Promise<any>, save(id: string, record: any): Promise<void> },
 *   loadSim: () => Promise<{
 *     advanceSave(save: unknown, player: { id: string, name: string }, toTurn: number, world?: unknown, raids?: any[], others?: any[]): { save: object, public: object, effects?: any[], years: number } | null,
 *     findContacts?(players: { id: string, public: object | null }[], tick: number): { a: { player: string, fleet: string }, b: { player: string, fleet: string } }[],
 *     resolveContact?(saveA: unknown, playerA: object, fleetA: string, saveB: unknown, playerB: object, fleetB: string, tick: number): { saveA: object, publicA: object, saveB: object, publicB: object } | null,
 *   } | null>,
 *   withLock?: (key: string, fn: () => Promise<any>) => Promise<any>,
 *   world?: { get(): Promise<any>, apply(effects: any[]): Promise<any>, step?(tick: number, players: any[]): Promise<any[]> },
 *   publish?: (player: object) => void,
 *   notifyOwner?: (id: string, save: object) => void,
 *   publicView?: (p: unknown) => object,
 *   events?: { append(id: string, entry: object): Promise<void> | void },
 *   now?: () => number,
 *   log?: (msg: string) => void,
 * }} deps
 */
export function createSimTicker({ store, loadSim, world = null, withLock = (_key, fn) => fn(), publish = () => {}, notifyOwner = () => {}, publicView = (p) => p, events = null, now = () => Date.now(), log = () => {} }) {
  let running = null;
  // The last world year whose contacts were fought: a year's battles are fought once.
  let foughtTick = -Infinity;

  // Not waited on: a log failure never stops the year.
  const logEvent = appendSafely(events, log);

  /** Play every empire forward to `worldTick`. Returns how many were advanced. */
  async function tick(worldTick) {
    if (running) return running; // a long catch-up is still going: never run two at once
    running = (async () => {
      const sim = await loadSim();
      if (!sim) return 0;
      let advanced = 0;
      const ids = await store.ids();
      // Every empire as the others see it, read once: the NPCs' raid targets and the markets.
      const players = [];
      for (const id of ids) {
        try {
          const record = await store.load(id);
          players.push({ id, name: String(record?.player?.name ?? 'Commander'), public: record?.public ?? null });
        } catch {
          // Unreadable record: its empire is skipped below too.
        }
      }
      const others = othersOf(players);
      // First the NPC empires' year, against every empire as others see it; then each empire plays
      // its year and resolves the raids that reached it.
      let raids = [];
      if (world?.step) {
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
            const result = sim.advanceSave(record.save, player, worldTick, world ? await world.get() : undefined, mine, others);
            if (!result) return false;
            if (world && result.effects?.length) await world.apply(result.effects);
            const pub = publicView(result.public);
            await store.save(id, { ...record, save: result.save, public: pub, simulatedAt: now() });
            // One year is what a replay plays by default; more at once is not, so it is logged.
            if (result.years > 1) logEvent(id, { at: now(), worldTime: worldTick, turn: record.save.turn, command: 'advance', ok: true });
            publish({ ...pub, id, name: player.name, avatar: record.player?.avatar ?? null, updatedAt: now() });
            notifyOwner(id, result.save);
            return true;
          });
          if (done) advanced++;
        } catch (err) {
          log(`sim: empire ${id} skipped (${err?.message ?? err})`);
        }
      }
      // Then the fleets that met at sea this year fight (after every empire has moved on).
      if (typeof sim.findContacts === 'function' && typeof sim.resolveContact === 'function' && worldTick > foughtTick) {
        foughtTick = worldTick;
        try {
          await fightContacts(sim, worldTick, ids);
        } catch (err) {
          log(`sim: contacts skipped (${err?.message ?? err})`);
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

  /**
   * Battles between players' fleets that met at sea in `worldTick`. Each pair is resolved with both
   * empires locked, always in id order so two pairs can never wait on each other.
   */
  async function fightContacts(sim, worldTick, ids) {
    const players = [];
    for (const id of ids) {
      try {
        const record = await store.load(id);
        if (record?.save) players.push({ id, public: record.public ?? null });
      } catch {
        // Unreadable record: its fleets take no part in contacts.
      }
    }
    // Fleets side by side on station fight; then faster fleets run down the ones that broke off.
    const contacts = sim.findContacts(players, worldTick);
    const pursuits = typeof sim.findPursuits === 'function' && typeof sim.resolvePursuit === 'function' ? sim.findPursuits(players, worldTick, contacts) : [];
    for (const c of [...contacts, ...pursuits]) {
      const [first, second] = [c.a.player, c.b.player].sort();
      try {
        await withLock(first, () => withLock(second, async () => {
          const ra = await store.load(c.a.player);
          const rb = await store.load(c.b.player);
          if (!ra?.save || !rb?.save) return;
          const resolve = c.pursuit ? sim.resolvePursuit : sim.resolveContact;
          const battle = resolve(ra.save, playerOf(c.a.player, ra), c.a.fleet, rb.save, playerOf(c.b.player, rb), c.b.fleet, worldTick);
          if (!battle) return;
          const sides = [[c.a.player, ra, battle.saveA, battle.publicA], [c.b.player, rb, battle.saveB, battle.publicB]];
          // Both empires keep the battle or neither does: if the second save fails, the first is put back.
          const kept = [];
          try {
            for (const [id, record, save, pub] of sides) {
              await store.save(id, { ...record, save, public: publicView(pub), simulatedAt: now() });
              kept.push([id, record]);
            }
          } catch (err) {
            for (const [id, record] of kept) await store.save(id, record).catch(() => {});
            throw err;
          }
          for (const [id, record, save, pub] of sides) {
            publish({ ...publicView(pub), id, name: playerOf(id, record).name, avatar: record.player?.avatar ?? null, updatedAt: now() });
            notifyOwner(id, save);
          }
        }));
      } catch (err) {
        log(`sim: contact ${c.a.player} / ${c.b.player} skipped (${err?.message ?? err})`);
      }
    }
  }

  return { tick };
}

/**
 * Every empire's public view as a trading partner (src/core/economy/PlayerMarkets.ts): its home,
 * colonies and names. Each empire's own entry is left out by the simulation.
 */
export function othersOf(players) {
  return players.filter((p) => p.public && typeof p.public === 'object').map((p) => ({ ...p.public, id: p.id, name: p.name }));
}

/** The player an empire is played as: its id and the name its fleets are formed under. */
function playerOf(id, record) {
  return { id, name: String(record?.player?.name ?? 'Commander') };
}
