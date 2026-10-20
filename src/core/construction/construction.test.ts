import { describe, expect, it } from 'vitest';
import { cancelJob, due, enqueue, jobProgress, moveJob } from './Construction';

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

  const three = () => {
    let q = enqueue([], { kind: 'ship', item: 'a', site: 'y' }, 3, 10);
    q = enqueue(q, { kind: 'ship', item: 'b', site: 'y' }, 2, 10);
    q = enqueue(q, { kind: 'ship', item: 'c', site: 'y' }, 4, 10);
    return enqueue(q, { kind: 'ship', item: 'z', site: 'other' }, 5, 10);
  };
  const at = (q: ReturnType<typeof three>) => q.filter((j) => j.site === 'y').sort((a, b) => a.startTurn - b.startTurn).map((j) => [j.item, j.startTurn, j.doneTurn]);

  it('cancelling a job moves the ones after it up; another site is untouched', () => {
    const q = three();
    const r = cancelJob(q, q[1].id, 11)!;
    expect(at(r.queue)).toEqual([['a', 10, 13], ['c', 13, 17]]);
    expect(r.queue.find((j) => j.site === 'other')).toEqual(q[3]);
    expect(r.built).toBe(0);
    // The one under way: what it had built, for the refund.
    expect(cancelJob(q, q[0].id, 11)!.built).toBeCloseTo(1 / 3);
    expect(at(cancelJob(q, q[0].id, 11)!.queue)).toEqual([['b', 11, 13], ['c', 13, 17]]);
  });

  it('a waiting job moves earlier or later; the one under way stays first', () => {
    const q = three();
    expect(at(moveJob(q, q[2].id, true, 11)!)).toEqual([['a', 10, 13], ['c', 13, 17], ['b', 17, 19]]);
    expect(at(moveJob(q, q[1].id, false, 11)!)).toEqual([['a', 10, 13], ['c', 13, 17], ['b', 17, 19]]);
    expect(moveJob(q, q[1].id, true, 11)).toBeNull();
    expect(moveJob(q, q[0].id, false, 11)).toBeNull();
    expect(moveJob(q, q[2].id, false, 11)).toBeNull();
  });
});
