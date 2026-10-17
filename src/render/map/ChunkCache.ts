/** Small LRU cache for generated map chunks. Evicted values are passed to `onEvict` for disposal. */
export class ChunkCache<V> {
  private readonly map = new Map<string, V>();

  constructor(private readonly capacity: number, private readonly onEvict: (v: V) => void) {}

  get(key: string): V | undefined {
    const v = this.map.get(key);
    if (v !== undefined) {
      this.map.delete(key);
      this.map.set(key, v);
    }
    return v;
  }

  set(key: string, value: V): void {
    this.map.delete(key);
    this.map.set(key, value);
    while (this.map.size > this.capacity) {
      const oldest = this.map.keys().next().value as string;
      this.onEvict(this.map.get(oldest)!);
      this.map.delete(oldest);
    }
  }

  clear(): void {
    this.map.forEach((v) => this.onEvict(v));
    this.map.clear();
  }
}
