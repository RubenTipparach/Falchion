import { describe, expect, it } from 'vitest';
import { due, enqueue, jobProgress } from './Construction';

describe('construction queues', () => {
  it('builds one item at a time per site', () => {
    let q = enqueue([], { kind: 'ship', item: 'lancer', site: 'yard-a' }, 3, 10);
    q = enqueue(q, { kind: 'ship', item: 'lancer', site: 'yard-a' }, 3, 10);
    q = enqueue(q, { kind: 'ship', item: 'scout', site: 'yard-b' }, 2, 10);
    expect(q.map((j) => [j.startTurn, j.doneTurn])).toEqual([[10, 13], [13, 16], [10, 12]]);
  });

  it('ships and buildings at one planet do not block each other', () => {
    let q = enqueue([], { kind: 'ship', item: 'lancer', site: 'p' }, 3, 0);
    q = enqueue(q, { kind: 'building', item: 'farm', site: 'p' }, 2, 0);
    expect(q[1].doneTurn).toBe(2);
  });

  it('releases finished jobs in completion order', () => {
    let q = enqueue([], { kind: 'ship', item: 'a', site: 'x' }, 5, 0);
    q = enqueue(q, { kind: 'building', item: 'b', site: 'y' }, 2, 0);
    const { done, pending } = due(q, 5);
    expect(done.map((j) => j.item)).toEqual(['b', 'a']);
    expect(pending).toEqual([]);
    expect(due(q, 1).done).toEqual([]);
  });

  it('reports progress', () => {
    const [j] = enqueue([], { kind: 'ship', item: 'a', site: 'x' }, 4, 0);
    expect(jobProgress(j, 2)).toBe(0.5);
    expect(jobProgress(j, 9)).toBe(1);
  });
});
