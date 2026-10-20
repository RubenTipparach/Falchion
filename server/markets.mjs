// Other players' worlds are markets for trade goods (src/core/economy/PlayerMarkets.ts). An order
// needs the list of the other empires, and reading every save for each order would be slow: the
// list is read once a world year and shared by every order in that year.

/**
 * Memoise `load` for the current world tick. Calls in the same tick share one read (even while
 * it is in flight); a failed read is not kept, so the next call tries again.
 * @param {() => Promise<any[]>} load
 * @param {() => number} tickNow
 */
export function oncePerTick(load, tickNow) {
  let at = null;
  let value = null;
  return function get() {
    const t = tickNow();
    if (at !== t || !value) {
      at = t;
      const read = Promise.resolve().then(load).then((list) => (Array.isArray(list) ? list : []));
      const kept = read.catch(() => {
        if (value === kept) at = null; // forget it: the next call reads again
        return [];
      });
      value = kept;
    }
    return value;
  };
}
