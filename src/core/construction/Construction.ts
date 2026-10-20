/**
 * Construction queues. Work takes whole years (ticks). Each site (a shipyard
 * for ships, a colony for buildings) builds one item at a time, in order.
 * Pure: (queue, turn) -> (finished, still queued).
 */
export interface Job {
  readonly id: string;
  readonly kind: 'ship' | 'building';
  /** Ship class or building id. */
  readonly item: string;
  /** Planet id of the yard (ships) or colony (buildings). */
  readonly site: string;
  readonly startTurn: number;
  readonly doneTurn: number;
  /** A civilian ship that founds a company when it is launched (change commerce). */
  readonly charter?: boolean;
}

/** Queue a job at a site: it starts when the site's previous job finishes. */
export function enqueue(queue: readonly Job[], job: Omit<Job, 'startTurn' | 'doneTurn' | 'id'>, years: number, turn: number): Job[] {
  const busyUntil = queue.filter((j) => j.site === job.site && j.kind === job.kind).reduce((t, j) => Math.max(t, j.doneTurn), turn);
  const startTurn = Math.max(turn, busyUntil);
  const id = `${job.kind}:${job.site}:${job.item}:${startTurn}:${queue.length}`;
  return [...queue, { ...job, id, startTurn, doneTurn: startTurn + Math.max(1, Math.round(years)) }];
}

/** Split the queue into jobs finished by `turn` (in completion order) and the rest. */
export function due(queue: readonly Job[], turn: number): { readonly done: Job[]; readonly pending: Job[] } {
  const done = queue.filter((j) => j.doneTurn <= turn).sort((a, b) => a.doneTurn - b.doneTurn || a.id.localeCompare(b.id));
  return { done, pending: queue.filter((j) => j.doneTurn > turn) };
}

/** Progress of a job at a turn, in [0, 1]. */
export function jobProgress(j: Job, turn: number): number {
  return Math.min(1, Math.max(0, (turn - j.startTurn) / Math.max(1, j.doneTurn - j.startTurn)));
}

/**
 * Lay a site's jobs end to end again in the order given (`order`: their ids), each keeping its
 * length; a job already under way stays first and keeps its start.
 */
function relay(queue: readonly Job[], site: string, kind: Job['kind'], order: readonly string[], turn: number): Job[] {
  const mine = new Map(queue.filter((j) => j.site === site && j.kind === kind).map((j) => [j.id, j]));
  let at = turn;
  const laid = new Map<string, Job>();
  for (const id of order) {
    const j = mine.get(id);
    if (!j) continue;
    const length = j.doneTurn - j.startTurn;
    const startTurn = j.startTurn <= turn ? j.startTurn : at;
    laid.set(id, { ...j, startTurn, doneTurn: startTurn + length });
    at = startTurn + length;
  }
  return queue.filter((j) => !(j.site === site && j.kind === kind && !laid.has(j.id))).map((j) => laid.get(j.id) ?? j);
}

/** A site's jobs in the order they run. */
const runOrder = (queue: readonly Job[], site: string, kind: Job['kind']): Job[] =>
  queue.filter((j) => j.site === site && j.kind === kind).sort((a, b) => a.startTurn - b.startTurn || a.id.localeCompare(b.id));

/**
 * Take a job off the queue; those after it at its site move up. Also how much of it had been built
 * (0 to 1), for a refund of the rest.
 */
export function cancelJob(queue: readonly Job[], id: string, turn: number): { readonly queue: Job[]; readonly built: number } | null {
  const job = queue.find((j) => j.id === id);
  if (!job) return null;
  const order = runOrder(queue, job.site, job.kind).map((j) => j.id).filter((x) => x !== id);
  const rest = queue.filter((j) => j.id !== id);
  return { queue: relay(rest, job.site, job.kind, order, turn), built: jobProgress(job, turn) };
}

/** Move a waiting job one place earlier (`up`) or later at its site; the job under way stays first. */
export function moveJob(queue: readonly Job[], id: string, up: boolean, turn: number): Job[] | null {
  const job = queue.find((j) => j.id === id);
  if (!job || job.startTurn <= turn) return null;
  const order = runOrder(queue, job.site, job.kind);
  const i = order.findIndex((j) => j.id === id);
  const k = up ? i - 1 : i + 1;
  if (k < 0 || k >= order.length || order[k].startTurn <= turn) return null;
  [order[i], order[k]] = [order[k], order[i]];
  return relay(queue, job.site, job.kind, order.map((j) => j.id), turn);
}
