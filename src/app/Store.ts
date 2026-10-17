type Listener<S> = (state: S, prev: S) => void;

/** Minimal observable state container. UI subscribes; services stay pure. */
export class Store<S extends object> {
  private listeners = new Set<Listener<S>>();

  constructor(private current: S) {}

  get state(): S {
    return this.current;
  }

  update(patch: Partial<S> | ((s: S) => Partial<S>)): void {
    const prev = this.current;
    const p = typeof patch === 'function' ? patch(prev) : patch;
    this.current = { ...prev, ...p };
    this.listeners.forEach((l) => l(this.current, prev));
  }

  subscribe(listener: Listener<S>): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
