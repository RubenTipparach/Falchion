import type { Squadron } from '../combat/Combat';
import { arrivalTurn, type FleetMovement } from './Fleet';
import type { Stores } from './Logistics';

/** What a fleet does on its own while the player is away. */
export interface FleetOrders {
  /** Survey unexplored planets wherever it is on station, while supply lasts. */
  readonly autoExplore?: boolean;
  /** Head home to resupply when it can explore nothing more here. */
  readonly autoReturn?: boolean;
  /** Mining ships move on to the nearest asteroid field of their resource when theirs runs dry. */
  readonly autoMine?: boolean;
  /** Trade run: load goods at `from` (a colony system), sell them at `to` (a market), repeat. */
  readonly trade?: { readonly from: string; readonly to: string };
  /** Attacks other empires' fleets it meets at sea (absent = passive). Only fleets with warships may be aggressive. */
  readonly stance?: 'aggressive';
}

/** A deployed group of ships with its own supply and ammunition. */
export interface Loadout extends Stores {
  readonly ships: readonly Squadron[];
  readonly orders?: FleetOrders;
  /** Trade goods aboard, and the system they were loaded at (their price grows with distance from it). */
  readonly cargo?: number;
  readonly cargoFrom?: string;
}

/** A fleet is on station (can explore, fight, mine, settle) once it has arrived. */
export function isStationed(m: FleetMovement, turn: number): boolean {
  return turn >= arrivalTurn(m);
}

export function countOf(ships: readonly Squadron[], classId: string): number {
  return ships.find((s) => s.classId === classId)?.count ?? 0;
}

export function shipTotal(ships: readonly Squadron[]): number {
  return ships.reduce((n, s) => n + s.count, 0);
}

/** Add (positive) or remove (negative) ships, dropping empty squadrons. */
export function adjustShips(ships: readonly Squadron[], delta: readonly Squadron[]): Squadron[] {
  const out = new Map(ships.map((s) => [s.classId, s.count]));
  for (const d of delta) out.set(d.classId, Math.max(0, (out.get(d.classId) ?? 0) + d.count));
  return [...out].filter(([, n]) => n > 0).map(([classId, count]) => ({ classId, count }));
}

/** Ships at the home dock: everything owned minus what is deployed in fleets. */
export function dockedShips(roster: Readonly<Record<string, number>>, deployed: Iterable<Loadout>): Squadron[] {
  const left = { ...roster };
  for (const l of deployed) for (const s of l.ships) left[s.classId] = (left[s.classId] ?? 0) - s.count;
  return Object.entries(left).filter(([, n]) => n > 0).map(([classId, count]) => ({ classId, count }));
}

/** True when `want` can be drawn from `have`. */
export function hasShips(have: readonly Squadron[], want: readonly Squadron[]): boolean {
  return want.every((w) => w.count >= 0 && countOf(have, w.classId) >= w.count);
}

/** Whether a fleet's orders make it attack the fleets of other empires it meets. */
export const isAggressive = (orders?: FleetOrders): boolean => orders?.stance === 'aggressive';

/** What a fleet brings to a meeting at sea. */
export interface Encounter {
  readonly aggressive: boolean;
  /** Has warships: only an armed fleet can attack. */
  readonly armed: boolean;
}

/** An aggressive armed fleet attacks what it meets. */
export const attacks = (e: Encounter): boolean => e.aggressive && e.armed;

/** Two fleets on the same hex fight when at least one of them attacks. Two passive fleets pass each other. */
export const startsFight = (a: Encounter, b: Encounter): boolean => attacks(a) || attacks(b);
