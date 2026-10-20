/// <reference lib="webworker" />
import { bakeFace, type BakeJob } from '../../../core/surface/GlobeBake';

/** Bakes globe faces off the main thread (change surface-perf): a job in, the face's arrays back (transferred). */
self.onmessage = (e: MessageEvent<{ id: number; job: BakeJob }>) => {
  const f = bakeFace(e.data.job);
  (self as unknown as Worker).postMessage({ id: e.data.id, face: f }, [f.position.buffer, f.normal.buffer, f.height.buffer, f.index.buffer]);
};
