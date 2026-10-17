// One empire, one writer at a time: a player's commands and the yearly tick of their empire
// queue behind each other, so no read-modify-write of a save can interleave with another.

export function createLocks() {
  const tails = new Map();
  /** Run `fn` once every earlier task for `key` has finished; returns its result. */
  return function withLock(key, fn) {
    const prev = tails.get(key) ?? Promise.resolve();
    const run = prev.then(fn, fn);
    const tail = run.then(() => {}, () => {});
    tails.set(key, tail);
    void tail.then(() => { if (tails.get(key) === tail) tails.delete(key); });
    return run;
  };
}
