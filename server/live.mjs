// Other players, live: when a player saves, their public view (empire, home, colonies, fleets)
// goes at once to every other connected player as a `player` event, so a move order shows on
// their maps within seconds instead of at the next poll. Per player, at most one push every
// `minIntervalMs`; a save inside that window is sent when it ends (the latest one wins).

/**
 * @param {{ broadcast: (event: string, data: object, opts?: { except?: string }) => void, minIntervalMs?: number, now?: () => number }} deps
 */
export function createPlayerFeed({ broadcast, minIntervalMs = 1_000, now = () => Date.now() }) {
  const last = new Map(); // player id -> time of the last push
  const waiting = new Map(); // player id -> { view, timer }

  function send(view) {
    last.set(view.id, now());
    broadcast('player', view, { except: view.id });
  }

  return {
    /** Push a player's public view ({ id, name, avatar, updatedAt, ...publicView }) to everyone else. */
    publish(view) {
      const wait = (last.get(view.id) ?? -Infinity) + minIntervalMs - now();
      const queued = waiting.get(view.id);
      if (queued) { queued.view = view; return; }
      if (wait <= 0) return send(view);
      const entry = { view, timer: null };
      entry.timer = setTimeout(() => { waiting.delete(view.id); send(entry.view); }, wait);
      entry.timer.unref?.();
      waiting.set(view.id, entry);
    },
    close() {
      for (const { timer } of waiting.values()) clearTimeout(timer);
      waiting.clear();
    },
  };
}
