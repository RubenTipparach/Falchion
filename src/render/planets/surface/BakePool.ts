import type { BakeJob, BakedFace } from '../../../core/surface/GlobeBake';

/**
 * A few Web Workers that bake globe faces in parallel, off the main thread (change surface-perf).
 * One fewer than the machine's cores, at most four; none where workers are not available (tests,
 * Node), and the globe is then baked a face a frame on the main thread.
 */
class BakePool {
  private readonly workers: Worker[] = [];
  private readonly idle: Worker[] = [];
  private readonly queue: Array<{ id: number; job: BakeJob }> = [];
  private readonly waiting = new Map<number, (f: BakedFace) => void>();
  private next = 1;

  constructor(size: number) {
    for (let i = 0; i < size; i++) {
      const w = new Worker(new URL('./bake.worker.ts', import.meta.url), { type: 'module' });
      w.onmessage = (e: MessageEvent<{ id: number; face: BakedFace }>) => {
        this.waiting.get(e.data.id)?.(e.data.face);
        this.waiting.delete(e.data.id);
        this.idle.push(w);
        this.pump();
      };
      this.workers.push(w);
      this.idle.push(w);
    }
  }

  bake(job: BakeJob): Promise<BakedFace> {
    const id = this.next++;
    return new Promise((done) => {
      this.waiting.set(id, done);
      this.queue.push({ id, job });
      this.pump();
    });
  }

  private pump(): void {
    while (this.idle.length && this.queue.length) this.idle.pop()!.postMessage(this.queue.shift()!);
  }
}

let pool: BakePool | null | undefined;

/** The shared pool, or null where there are no workers. */
export function bakePool(): BakePool | null {
  if (pool === undefined) {
    const cores = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 2 : 2;
    try {
      pool = typeof Worker !== 'undefined' && typeof window !== 'undefined' ? new BakePool(Math.max(1, Math.min(4, cores - 1))) : null;
    } catch {
      pool = null;
    }
  }
  return pool;
}
