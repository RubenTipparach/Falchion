/** Deterministic hashing and seeded random numbers. Never use Math.random in core. */

/** 32-bit integer hash of any number of integer/string parts (FNV-1a + avalanche). */
export function hashSeed(...parts: Array<number | string>): number {
  let h = 0x811c9dc5;
  for (const part of parts) {
    const s = String(part);
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    h ^= 0x7f; // part separator
    h = Math.imul(h, 0x01000193);
  }
  return avalanche(h);
}

function avalanche(x: number): number {
  x ^= x >>> 16;
  x = Math.imul(x, 0x7feb352d);
  x ^= x >>> 15;
  x = Math.imul(x, 0x846ca68b);
  x ^= x >>> 16;
  return x >>> 0;
}

/** Fast integer-coordinate hash → [0, 1). Used for per-hex star rolls. */
export function hash01(seed: number, a: number, b: number): number {
  let h = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1) ^ seed;
  return avalanche(h) / 4294967296;
}

/** Mulberry32 seeded generator. */
export class Rng {
  private state: number;

  constructor(readonly seed: number) {
    this.state = seed >>> 0;
  }

  /** Uniform float in [0, 1). */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  range(min: number, max: number): number {
    return min + (max - min) * this.next();
  }

  /** Integer in [min, max] inclusive. */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error('Rng.pick on empty array');
    return items[Math.floor(this.next() * items.length)];
  }

  /** Pick by weight. Entries with weight <= 0 are never chosen. */
  weighted<T>(entries: ReadonlyArray<readonly [T, number]>): T {
    const total = entries.reduce((s, [, w]) => s + Math.max(0, w), 0);
    if (total <= 0) throw new Error('Rng.weighted needs a positive total weight');
    let roll = this.next() * total;
    for (const [item, w] of entries) {
      if (w <= 0) continue;
      roll -= w;
      if (roll < 0) return item;
    }
    return entries[entries.length - 1][0];
  }

  /** Independent child stream; adding forks never shifts the parent's sequence. */
  fork(label: string | number): Rng {
    return new Rng(hashSeed(this.seed, label));
  }
}
