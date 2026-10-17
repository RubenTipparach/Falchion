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
