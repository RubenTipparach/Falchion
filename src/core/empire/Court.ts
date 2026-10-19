import { ADVISOR_NAMES, LEADER_PER_LEVEL, SEATS, SEAT_BY_ID, type Seat } from '../../content/advisors';
import type { Effects } from '../../content/society';
import { Rng, hashSeed } from '../rng/Rng';

/**
 * The court (change missions-and-court): the ruler and the advisors who sit in the empire's
 * administration. Pure: levels from experience, which seats are open, candidates drawn from a
 * seed, and the bonuses everyone brings (as `Boon`s the economy adds to government and policies).
 */
export interface Advisor {
  readonly id: string;
  readonly name: string;
  readonly seat: Seat;
  readonly trait: string;
  readonly level: number;
  /** Experience toward the next level. */
  readonly xp: number;
  /** Where they came from: the council at home, or a faction's envoy. */
  readonly origin?: string;
  /** Their decisions are delegated: they act for you each year. */
  readonly delegate?: boolean;
}

export interface CourtState {
  readonly leader: { readonly level: number; readonly xp: number };
  readonly seats: Readonly<Partial<Record<Seat, Advisor>>>;
  /** People who would serve: appointed from here into their seat. */
  readonly candidates: readonly Advisor[];
  /** Candidates drawn so far (names them). */
  readonly drawn: number;
  /** The year the Chancellor last sent tribute on your behalf. */
  readonly lastTribute?: number;
}

/** A named bonus the economy counts beside government and policies; `until` a year when it lapses. */
export interface Boon {
  readonly name: string;
  readonly effects: Effects;
  readonly until?: number;
}

export const LEADER_MAX = 20;
export const ADVISOR_MAX = 10;
export const MAX_CANDIDATES = 6;

/** Experience from one level to the next. */
export const xpToNext = (level: number, leader = false): number => (leader ? 150 : 100) * level;

/** Add experience: the new level and experience, and how many levels were gained. */
export function addXp<T extends { readonly level: number; readonly xp: number }>(who: T, xp: number, max: number, leader = false): { next: T; gained: number } {
  let { level, xp: have } = who;
  have += Math.max(0, Math.round(xp));
  let gained = 0;
  while (level < max && have >= xpToNext(level, leader)) {
    have -= xpToNext(level, leader);
    level++;
    gained++;
  }
  if (level >= max) have = 0;
  return { next: { ...who, level, xp: have }, gained };
}

/** Seats the ruler can fill: two at first, one more every second level, all six at level 9. */
export const openSeats = (leaderLevel: number): number => Math.min(SEATS.length, 2 + Math.floor((Math.max(1, leaderLevel) - 1) / 2));

export const NEW_COURT: CourtState = { leader: { level: 1, xp: 0 }, seats: {}, candidates: [], drawn: 0 };

/** A candidate for a seat, drawn from a seed (the same everywhere for the same seed). */
export function drawCandidate(seed: number, seat: Seat, n: number, origin?: string): Advisor {
  const rng = new Rng(hashSeed(seed, 'advisor', seat, n));
  const def = SEAT_BY_ID[seat];
  return {
    id: `adv-${n}`,
    name: `${rng.pick(ADVISOR_NAMES.first)} ${rng.pick(ADVISOR_NAMES.last)}`,
    seat,
    trait: rng.pick(def.traits).id,
    level: 1,
    xp: 0,
    ...(origin ? { origin } : {}),
  };
}

/** Add a candidate (the oldest makes way when the list is full). */
export function withCandidate(court: CourtState, c: Advisor): CourtState {
  return { ...court, candidates: [...court.candidates, c].slice(-MAX_CANDIDATES), drawn: court.drawn + 1 };
}

/** Appoint a candidate to their seat; whoever sat there goes back to the candidates. False reason when not allowed. */
export function appoint(court: CourtState, candidateId: string): { court: CourtState } | { error: string } {
  const c = court.candidates.find((x) => x.id === candidateId);
  if (!c) return { error: 'no such candidate' };
  const sitting = court.seats[c.seat];
  const filled = Object.keys(court.seats).length;
  if (!sitting && filled >= openSeats(court.leader.level)) return { error: `your ruler can keep ${openSeats(court.leader.level)} advisors at this level` };
  const candidates = court.candidates.filter((x) => x.id !== c.id);
  return {
    court: {
      ...court,
      seats: { ...court.seats, [c.seat]: { ...c, delegate: sitting?.delegate ?? false } },
      candidates: sitting ? [...candidates, { ...sitting, delegate: false }].slice(-MAX_CANDIDATES) : candidates,
    },
  };
}

/** Effects times a level. */
function scaled(e: Effects, k: number): Effects {
  const mul = <K extends string>(r?: Partial<Record<K, number>>) => (r ? (Object.fromEntries(Object.entries(r).map(([key, v]) => [key, (v as number) * k])) as Partial<Record<K, number>>) : undefined);
  return {
    ...(e.income ? { income: mul(e.income) } : {}),
    ...(e.approval ? { approval: mul(e.approval) } : {}),
    ...(e.tradePct ? { tradePct: e.tradePct * k } : {}),
    ...(e.miningPct ? { miningPct: e.miningPct * k } : {}),
    ...(e.science ? { science: e.science * k } : {}),
    ...(e.spread ? { spread: e.spread * k } : {}),
  };
}

/** An advisor's bonus at their level: the seat's, plus their trait's. */
export function advisorEffects(a: Advisor): Effects[] {
  const seat = SEAT_BY_ID[a.seat];
  const trait = seat.traits.find((t) => t.id === a.trait);
  return [scaled(seat.perLevel, a.level), ...(trait ? [scaled(trait.perLevel, a.level)] : [])];
}

/** The court's bonuses as boons: the ruler's, then each seated advisor's. */
export function courtBoons(court: CourtState, ruler: string): Boon[] {
  const out: Boon[] = [{ name: `${ruler} (level ${court.leader.level})`, effects: scaled(LEADER_PER_LEVEL, court.leader.level) }];
  for (const s of SEATS) {
    const a = court.seats[s.id];
    if (!a) continue;
    for (const effects of advisorEffects(a)) out.push({ name: `${s.name} ${a.name}`, effects });
  }
  return out;
}

/** One line for an effects bundle: "+3 credits, +2% mining". */
export function describeEffects(e: Effects): string {
  const parts: string[] = [];
  for (const [r, n] of Object.entries(e.income ?? {})) if (n) parts.push(`${n > 0 ? '+' : ''}${n} ${r}`);
  if (e.science) parts.push(`+${e.science} science`);
  if (e.tradePct) parts.push(`+${e.tradePct}% trade`);
  if (e.miningPct) parts.push(`+${e.miningPct}% mining`);
  if (e.spread) parts.push(`+${e.spread} faith spread`);
  const approval = Object.entries(e.approval ?? {}).filter(([, n]) => n);
  if (approval.length === 5 && approval.every(([, n]) => n === approval[0][1])) parts.push(`+${approval[0][1]} approval everywhere`);
  else for (const [f, n] of approval) parts.push(`${n! > 0 ? '+' : ''}${n} ${f} approval`);
  return parts.join(', ');
}
