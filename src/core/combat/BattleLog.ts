import type { Resource } from '../../content/resources';
import { cleanBattleRecord, type BattleRecord } from './BattleRecord';

/**
 * An empire's battle log: every raid on its worlds and fleets, every round of a battle at sea,
 * and its own assaults, newest first and bounded. Pure data in the empire's save.
 */
export type BattleKind = 'raid' | 'sea' | 'pursuit' | 'assault';
export type BattleOutcome = 'won' | 'lost' | 'draw' | 'ongoing' | 'plundered';

/** Ships by class id. */
export type ShipTally = Readonly<Record<string, number>>;

export interface BattleLogEntry {
  /** Unique within the log: the year, the kind and a counter. */
  readonly id: string;
  readonly year: number;
  readonly kind: BattleKind;
  /** We were attacked (a raid, or another empire's fleet came for us), rather than attacking. */
  readonly attacked: boolean;
  readonly place: { readonly name: string; readonly q: number; readonly r: number } | null;
  /** Our fleet or world, and its fleet id when it is a fleet (to locate or watch it). */
  readonly ours: string;
  readonly fleetId?: string;
  readonly foe: string;
  readonly foeEmpire: string;
  /** Round of a battle at sea. */
  readonly round?: number;
  readonly outcome: BattleOutcome;
  /** Our ships destroyed, theirs destroyed, theirs we boarded, ours they boarded. */
  readonly lost: ShipTally;
  readonly killed: ShipTally;
  readonly boarded?: ShipTally;
  readonly taken?: ShipTally;
  /** What raiders carried off from a world. */
  readonly plunder?: Partial<Record<Resource, number>>;
  /** One line for people. */
  readonly summary: string;
  /**
   * The battle's rounds as the battle view draws them, our side first (change battle-replay): a
   * raid or an assault keeps all its rounds; a battle at sea keeps the round this entry logs.
   */
  readonly records?: readonly BattleRecord[];
}

/** Entries kept: the oldest go first. */
export const BATTLE_LOG_CAP = 60;
/** Entries that keep their rounds for replaying: the newest (the save goes to the browser every year). */
export const REPLAY_CAP = 24;
/** Rounds one entry keeps (a raid fights at most 8). */
const MAX_RECORDS = 8;

/** The log with a new entry on top (its id made unique), bounded; only the newest keep their rounds. */
export function logBattle(log: readonly BattleLogEntry[] | undefined, entry: Omit<BattleLogEntry, 'id'>): BattleLogEntry[] {
  const list = log ?? [];
  const same = list.filter((e) => e.year === entry.year && e.kind === entry.kind).length;
  const top: BattleLogEntry = { ...entry, id: `${entry.year}:${entry.kind}:${same}`, ...(entry.records?.length ? { records: entry.records.slice(0, MAX_RECORDS) } : {}) };
  if (!top.records) delete (top as { records?: unknown }).records;
  return [top, ...list].slice(0, BATTLE_LOG_CAP).map((e, i) => (i >= REPLAY_CAP && e.records ? withoutRecords(e) : e));
}

const withoutRecords = (e: BattleLogEntry): BattleLogEntry => {
  const { records: _, ...rest } = e;
  return rest;
};

/** An entry's rounds from a save or the server, checked and bounded (untrusted: they came over the wire). */
export function cleanRecords(x: unknown): BattleRecord[] {
  if (!Array.isArray(x)) return [];
  return x.slice(0, MAX_RECORDS).map(cleanBattleRecord).filter((r): r is BattleRecord => !!r);
}

/** Attacks on us logged after the entry last read (all of them when none was read, or it has gone). */
export function unseenAttacks(log: readonly BattleLogEntry[] | undefined, lastSeen: string | null): number {
  let n = 0;
  for (const e of log ?? []) {
    if (e.id === lastSeen) break;
    if (e.attacked) n++;
  }
  return n;
}

/** Ships lost between two lists of squadrons (before, after), by class. */
export function tallyLost(before: ReadonlyArray<{ classId: string; count: number }>, after: ReadonlyArray<{ classId: string; count: number }>): ShipTally {
  const out: Record<string, number> = {};
  for (const x of before) {
    const left = after.filter((y) => y.classId === x.classId).reduce((n, y) => n + y.count, 0);
    if (x.count - left > 0) out[x.classId] = (out[x.classId] ?? 0) + x.count - left;
  }
  return out;
}

/** A squadron list as a tally (boarded ships). */
export function tallyOf(ships: ReadonlyArray<{ classId: string; count: number }>): ShipTally {
  const out: Record<string, number> = {};
  for (const x of ships) if (x.count > 0) out[x.classId] = (out[x.classId] ?? 0) + x.count;
  return out;
}
