import { describe, expect, it } from 'vitest';
import { Rng, hash01, hashSeed } from './Rng';

describe('Rng', () => {
  it('is deterministic for a golden seed', () => {
    const a = new Rng(42);
    const b = new Rng(42);
    const seqA = Array.from({ length: 5 }, () => a.next());
    const seqB = Array.from({ length: 5 }, () => b.next());
    expect(seqA).toEqual(seqB);
    seqA.forEach((v) => expect(v).toBeGreaterThanOrEqual(0));
    seqA.forEach((v) => expect(v).toBeLessThan(1));
  });

  it('forks do not disturb the parent sequence', () => {
    const plain = new Rng(7);
    const forked = new Rng(7);
    forked.fork('engines').next();
    expect(plain.next()).toBe(forked.next());
  });

  it('int is inclusive and in range', () => {
    const r = new Rng(1);
    const seen = new Set<number>();
    for (let i = 0; i < 500; i++) seen.add(r.int(1, 3));
    expect([...seen].sort()).toEqual([1, 2, 3]);
  });

  it('weighted ignores zero weights', () => {
    const r = new Rng(3);
    for (let i = 0; i < 100; i++) expect(r.weighted([['a', 0], ['b', 1]] as const)).toBe('b');
  });
});

describe('hashing', () => {
  it('hashSeed differs by input and is stable', () => {
    expect(hashSeed(1, 'a')).toBe(hashSeed(1, 'a'));
    expect(hashSeed(1, 'a')).not.toBe(hashSeed(1, 'b'));
  });
  it('hash01 is in [0,1)', () => {
    for (let i = -50; i < 50; i++) {
      const v = hash01(9, i, -i * 3);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});
