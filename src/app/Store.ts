type Listener<S> = (state: S, prev: S) => void;

/** Minimal observable state container. UI subscribes; services stay pure. */
export class Store<S extends object> {
  private listeners = new Set<Listener<S>>();

  constructor(private current: S) {}

  get state(): S {
    return this.current;
  }

  private batching: S | null = null;

  update(patch: Partial<S> | ((s: S) => Partial<S>)): void {
    const prev = this.current;
    const p = typeof patch === 'function' ? patch(prev) : patch;
    this.current = { ...prev, ...p };
    if (!this.batching) this.listeners.forEach((l) => l(this.current, prev));
  }

  /** Apply many updates and notify listeners once (e.g. catching up missed years). */
  batch(fn: () => void): void {
    if (this.batching) return fn();
    const before = this.current;
    this.batching = before;
    try {
      fn();
    } finally {
      this.batching = null;
      if (this.current !== before) this.listeners.forEach((l) => l(this.current, before));
    }
  }

  subscribe(listener: Listener<S>): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
