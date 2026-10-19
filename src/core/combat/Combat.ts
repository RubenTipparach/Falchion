import { hullsOf, vsHulls, type Doctrine, type ShipClassDef } from '../../content/shipClasses';
import { Rng, hashSeed } from '../rng/Rng';

export interface Squadron {
  readonly classId: string;
  readonly count: number;
}

/** Research bonuses that matter in battle (all optional, whole numbers). */
export interface CombatBonuses {
  readonly long?: number;
  readonly short?: number;
  readonly barrage?: number;
  readonly siege?: number;
  readonly suppression?: number;
  readonly capture?: number;
  readonly morale?: number;
  readonly repair?: number;
  readonly hull?: number;
  readonly vsLong?: number;
  readonly vsBarrage?: number;
  readonly troops?: number;
}

export interface Side {
  readonly name: string;
  readonly ships: readonly Squadron[];
  readonly bonuses?: CombatBonuses;
  /** Damage its ships carry in from earlier fights: hull points per ship class. */
  readonly damage?: Damage;
}

/** Damage a fleet carries, in hull points per ship class (on the class's most damaged ship). */
export type Damage = Readonly<Record<string, number>>;

export type Band = 'long' | 'medium' | 'short';

/** Counts or amounts by key (class id or doctrine). */
export type Tally = Readonly<Record<string, number>>;

/**
 * What a round at sea did, in enough detail to draw it (resolveRound fills it). Pairs are by side.
 */
export interface RoundDetail {
  /** Ships each side lost, by class. */
  readonly lostBy: readonly [Tally, Tally];
  /** Ships of each side the other side's boarders took, by class. */
  readonly takenBy: readonly [Tally, Tally];
  /** Damage each side dealt, by doctrine (rounded). */
  readonly by: readonly [Tally, Tally];
  /** Multiplier on each side's fire from the other side's jammers (1 = not jammed). */
  readonly jam: readonly [number, number];
  /** Share of each side's barrage the other side's flak and suppression cut (0 to 0.6). */
  readonly flak: readonly [number, number];
  /** Hull points of one ship of each class, with research bonuses. */
  readonly hull: readonly [Tally, Tally];
  /** Damage (hull points) each class group still carries at the end of the round, before it is cleared. */
  readonly wounds: readonly [Tally, Tally];
}

export interface RoundLog {
  readonly round: number;
  readonly band: Band;
  readonly damage: readonly [number, number];
  readonly losses: readonly [number, number];
  readonly captured: readonly [number, number];
  readonly notes: readonly string[];
  /** The round's breakdown (what the battle view draws). */
  readonly detail?: RoundDetail;
  /** Each side's ships going into the round, and the damage each class carried in (resolveBattle). */
  readonly before?: readonly [RoundForce, RoundForce];
}

/** A side as it went into a round. */
export interface RoundForce {
  readonly ships: readonly Squadron[];
  readonly damage?: Tally;
}

export interface BattleResult {
  readonly winner: 0 | 1 | null;
  readonly rounds: readonly RoundLog[];
  readonly survivors: readonly [Squadron[], Squadron[]];
  /** captured[0] = ships side 0 captured from side 1. */
  readonly captured: readonly [Squadron[], Squadron[]];
  /** The damage each side's survivors carry out of the fight. */
  readonly damage: readonly [Damage, Damage];
}

/** Damage multiplier by doctrine and range band. Fleets start far apart and close in. */
export const BAND_MULT: Readonly<Record<Doctrine, Readonly<Record<Band, number>>>> = {
  long: { long: 1.5, medium: 1.0, short: 0.5 },
  short: { long: 0.2, medium: 0.8, short: 1.7 },
  barrage: { long: 1.0, medium: 1.0, short: 1.0 },
  siege: { long: 0.5, medium: 0.5, short: 0.5 },
  suppression: { long: 0.4, medium: 0.4, short: 0.4 },
  capture: { long: 0.1, medium: 0.3, short: 0.4 },
  assault: { long: 0.2, medium: 0.2, short: 0.2 },
  support: { long: 0.5, medium: 0.5, short: 0.5 },
  civilian: { long: 0, medium: 0, short: 0 },
};

export const MAX_ROUNDS = 8;
export const bandOf = (round: number): Band => (round <= 2 ? 'long' : round <= 4 ? 'medium' : 'short');

interface Group {
  readonly def: ShipClassDef;
  count: number;
  /** Damage on the current (front) ship of the group. */
  wound: number;
  readonly hull: number;
  /** Hulls one ship of it stands for (its squadron): a fighter 8, a capital ship 1. */
  readonly hulls: number;
}

/**
 * Ships a group fights with: its whole ships, plus the share of the damaged one's squadron still
 * flying (each hull lives until its share of the hull points is gone, so a one-hull ship fires
 * fully until it is destroyed).
 */
function firing(g: Group): number {
  if (g.count <= 0) return 0;
  const left = Math.ceil(g.hulls * Math.max(0, 1 - g.wound / g.hull) - 1e-9);
  return g.count - 1 + left / g.hulls;
}

function groupsOf(side: Side, classes: ReadonlyMap<string, ShipClassDef>): Group[] {
  const hullPct = (side.bonuses?.hull ?? 0) * 5;
  return side.ships
    .filter((s) => s.count > 0 && classes.has(s.classId))
    .map((s) => {
      const def = classes.get(s.classId)!;
      const hull = Math.round(def.hull * (1 + hullPct / 100));
      // Damage carried in never quite kills a ship: that takes a new blow.
      return { def, count: s.count, wound: Math.min(hull - 1, Math.max(0, side.damage?.[s.classId] ?? 0)), hull, hulls: hullsOf(def.id) };
    });
}

/** The damage each surviving class carries out of a fight. */
function damageOf(gs: Group[]): Damage {
  const out: Record<string, number> = {};
  for (const g of alive(gs)) if (g.wound > 0) out[g.def.id] = Math.round(g.wound);
  return out;
}

const alive = (gs: Group[]) => gs.filter((g) => g.count > 0);
const fighting = (gs: Group[]) => alive(gs).some((g) => g.def.attack > 0);
const shipsOf = (gs: Group[]) => gs.reduce((s, g) => s + g.count, 0);
const shareOf = (gs: Group[], d: Doctrine) => {
  const total = shipsOf(gs);
  return total ? gs.filter((g) => g.def.doctrine === d).reduce((s, g) => s + g.count, 0) / total : 0;
};

interface Output {
  readonly total: number;
  /** The total split by doctrine. */
  readonly by: Record<string, number>;
  readonly jam: number;
  readonly flak: number;
}

/** Damage a side deals this round, split by doctrine. */
function outputOf(own: Group[], foe: Group[], b: CombatBonuses, foeB: CombatBonuses, band: Band, rng: Rng): Output {
  const flagship = own.some((g) => g.def.id === 'flagship' && g.count > 0) ? 1.1 : 1;
  const morale = 1 + (b.morale ?? 0) / 100;
  const foeSuppression = shareOf(foe, 'suppression') + (foeB.suppression ?? 0) * 0.03;
  const jam = 1 - Math.min(0.25, shareOf(foe, 'suppression') * 0.5);
  const flak = Math.min(0.6, foeSuppression * 1.5);
  const by: Record<string, number> = {};
  let total = 0;
  for (const g of alive(own)) {
    const d = g.def.doctrine;
    let dmg = firing(g) * g.def.attack * BAND_MULT[d][band];
    dmg *= 1 + ((b as Record<string, number | undefined>)[d] ?? 0) * 0.05;
    if (d === 'barrage') dmg *= 1 - flak + (foeB.vsBarrage ? -foeB.vsBarrage / 100 : 0);
    if (d === 'long' && foeB.vsLong) dmg *= 1 - foeB.vsLong / 100;
    total += dmg;
    by[d] = (by[d] ?? 0) + dmg;
  }
  const roll = rng.range(0.9, 1.1);
  const k = morale * flagship * jam * roll;
  for (const d of Object.keys(by)) by[d] = Math.max(0, by[d] * k);
  return { total: Math.max(0, total * morale * flagship * jam * roll), by, jam, flak };
}

/**
 * A side's fire, by doctrine, spread across the target's groups in proportion to ship count and
 * scaled by how well each doctrine works on that group's squadrons (vsHulls: missiles and flak on
 * swarms, beams on capital ships). Returns ships destroyed (tallied by class in `lostBy`).
 */
function applyFire(gs: Group[], by: Readonly<Record<string, number>>, lostBy?: Record<string, number>): number {
  const live = alive(gs);
  return wound(live, spreadFire(by, live.map((g) => ({ classId: g.def.id, count: g.count }))), lostBy);
}

/** The damage each of a target's squadrons takes from fire split by doctrine (see applyFire). */
export function spreadFire(by: Readonly<Record<string, number>>, target: readonly Squadron[]): number[] {
  const total = target.reduce((n, x) => n + Math.max(0, x.count), 0);
  if (!total) return target.map(() => 0);
  return target.map((x) => Object.entries(by).reduce((n, [d, dmg]) => n + dmg * (Math.max(0, x.count) / total) * vsHulls(d as Doctrine, hullsOf(x.classId)), 0));
}

/** Spread damage across groups in proportion to ship count; returns ships destroyed (tallied by class in `lostBy`). */
function applyDamage(gs: Group[], dmg: number, lostBy?: Record<string, number>): number {
  const live = alive(gs);
  const total = shipsOf(live);
  return wound(live, live.map((g) => dmg * (g.count / total)), lostBy);
}

function wound(live: Group[], per: readonly number[], lostBy?: Record<string, number>): number {
  let destroyed = 0;
  for (let i = 0; i < live.length; i++) {
    const g = live[i];
    g.wound += per[i];
    const lost = Math.min(g.count, Math.floor(g.wound / g.hull));
    g.count -= lost;
    g.wound -= lost * g.hull;
    destroyed += lost;
    if (lost && lostBy) count(lostBy, g.def.id, lost);
    if (g.count === 0) g.wound = 0;
  }
  return destroyed;
}

const count = (into: Record<string, number>, key: string, n: number) => { into[key] = (into[key] ?? 0) + n; };
const tallyOf = (ships: readonly Squadron[]): Record<string, number> => {
  const out: Record<string, number> = {};
  for (const s of ships) count(out, s.classId, s.count);
  return out;
};
/** Rounded, positive entries only: what goes in a log. */
const rounded = (t: Record<string, number>, digits = 0): Record<string, number> => {
  const k = 10 ** digits;
  const out: Record<string, number> = {};
  for (const key of Object.keys(t).sort()) { const v = Math.round(t[key] * k) / k; if (v > 0) out[key] = v; }
  return out;
};

function repair(gs: Group[], b: CombatBonuses): void {
  const menders = alive(gs).filter((g) => g.def.id === 'repair-tender').reduce((s, g) => s + g.count, 0);
  const heal = menders * 8 * (1 + (b.repair ?? 0) / 100) + (b.repair ?? 0);
  for (const g of alive(gs)) g.wound = Math.max(0, g.wound - heal);
}

/** Capture crippled enemy ships. Needs medium or short range. */
function capture(own: Group[], foe: Group[], b: CombatBonuses, band: Band): Squadron[] {
  if (band === 'long') return [];
  let strength = alive(own).filter((g) => g.def.doctrine === 'capture').reduce((s, g) => s + g.count * (g.def.troops ?? 3), 0);
  strength *= 1 + (b.capture ?? 0) * 0.1;
  const taken: Squadron[] = [];
  const targets = alive(foe).filter((g) => g.wound > g.hull * 0.3).sort((a, z) => z.wound / z.hull - a.wound / a.hull);
  for (const g of targets) {
    const costEach = Math.max(4, g.hull / 12);
    const n = Math.min(g.count, Math.floor(strength / costEach));
    if (n <= 0) continue;
    g.count -= n;
    if (g.count === 0) g.wound = 0;
    strength -= n * costEach;
    taken.push({ classId: g.def.id, count: n });
  }
  return taken;
}

const merge = (into: Squadron[], add: Squadron[]) => {
  for (const s of add) {
    const i = into.findIndex((x) => x.classId === s.classId);
    if (i >= 0) into[i] = { classId: s.classId, count: into[i].count + s.count };
    else into.push(s);
  }
};

/**
 * Automated, deterministic fleet battle: same sides + seed => same result.
 * Fleets open at long range and close a band every two rounds.
 */
export function resolveBattle(a: Side, d: Side, classes: readonly ShipClassDef[], seed: number): BattleResult {
  const byId = new Map(classes.map((c) => [c.id, c]));
  const sides = [groupsOf(a, byId), groupsOf(d, byId)] as const;
  const bon = [a.bonuses ?? {}, d.bonuses ?? {}] as const;
  const rng = new Rng(hashSeed(seed, 'battle'));
  const rounds: RoundLog[] = [];
  const captured: [Squadron[], Squadron[]] = [[], []];

  for (let r = 1; r <= MAX_ROUNDS; r++) {
    if (!fighting(sides[0]) || !fighting(sides[1])) break;
    const band = bandOf(r);
    const notes: string[] = [];
    // What the battle view needs to replay the round (recorded only: it changes nothing below).
    const forceOf = (gs: Group[]): RoundForce => {
      const damage = damageOf(gs);
      return { ships: alive(gs).map((g) => ({ classId: g.def.id, count: g.count })), ...(Object.keys(damage).length ? { damage } : {}) };
    };
    const before = [forceOf(sides[0]), forceOf(sides[1])] as const;
    const hull = [Object.fromEntries(sides[0].map((g) => [g.def.id, g.hull])), Object.fromEntries(sides[1].map((g) => [g.def.id, g.hull]))] as const;
    const lostBy: [Record<string, number>, Record<string, number>] = [{}, {}];
    const out0 = outputOf(sides[0], sides[1], bon[0], bon[1], band, rng);
    const out1 = outputOf(sides[1], sides[0], bon[1], bon[0], band, rng);
    const dmg0 = out0.total, dmg1 = out1.total;
    const lost1 = applyFire(sides[1], out0.by, lostBy[1]);
    const lost0 = applyFire(sides[0], out1.by, lostBy[0]);
    const cap0 = capture(sides[0], sides[1], bon[0], band);
    const cap1 = capture(sides[1], sides[0], bon[1], band);
    merge(captured[0], cap0);
    merge(captured[1], cap1);
    repair(sides[0], bon[0]);
    repair(sides[1], bon[1]);
    const woundsOf = (gs: Group[]) => rounded(Object.fromEntries(alive(gs).map((g) => [g.def.id, Math.min(g.wound, g.count * g.hull)])));
    const detail: RoundDetail = {
      lostBy: [rounded(lostBy[0]), rounded(lostBy[1])],
      takenBy: [rounded(tallyOf(cap1)), rounded(tallyOf(cap0))],
      by: [rounded(out0.by), rounded(out1.by)],
      jam: [Math.round(out0.jam * 1000) / 1000, Math.round(out1.jam * 1000) / 1000],
      flak: [Math.round(out0.flak * 1000) / 1000, Math.round(out1.flak * 1000) / 1000],
      hull: [hull[0], hull[1]],
      wounds: [woundsOf(sides[0]), woundsOf(sides[1])],
    };
    if (r === 3) notes.push('Fleets close to medium range');
    if (r === 5) notes.push('Knife-fight range');
    const c0 = cap0.reduce((s, x) => s + x.count, 0), c1 = cap1.reduce((s, x) => s + x.count, 0);
    if (c0) notes.push(`${a.name} boarded ${c0} ship${c0 > 1 ? 's' : ''}`);
    if (c1) notes.push(`${d.name} boarded ${c1} ship${c1 > 1 ? 's' : ''}`);
    rounds.push({ round: r, band, damage: [Math.round(dmg0), Math.round(dmg1)], losses: [lost0, lost1], captured: [c0, c1], notes, detail, before });
  }

  const hp = (gs: Group[]) => alive(gs).reduce((s, g) => s + g.count * g.hull - g.wound, 0);
  const f0 = fighting(sides[0]), f1 = fighting(sides[1]);
  const winner: 0 | 1 | null = f0 && !f1 ? 0 : f1 && !f0 ? 1 : !f0 && !f1 ? null : hp(sides[0]) >= hp(sides[1]) * 1.2 ? 0 : hp(sides[1]) >= hp(sides[0]) * 1.2 ? 1 : null;
  const surv = (gs: Group[]) => alive(gs).map((g) => ({ classId: g.def.id, count: g.count }));
  return { winner, rounds, survivors: [surv(sides[0]), surv(sides[1])], captured, damage: [damageOf(sides[0]), damageOf(sides[1])] };
}

export interface PlanetTarget {
  readonly name: string;
  readonly defense: number;
  readonly troops: number;
  readonly garrison: Side;
}

export interface AssaultResult {
  readonly space: BattleResult | null;
  readonly bombardment: ReadonlyArray<{ round: number; damage: number; defenseLeft: number; lost: number }>;
  readonly troopsLanded: number;
  readonly troopsNeeded: number;
  readonly captured: boolean;
  readonly phaseReached: 'space' | 'bombardment' | 'ground';
  readonly survivors: Squadron[];
  /** The damage the strike group's survivors carry out of the assault. */
  readonly damage: Damage;
}

/** Planetary assault: win the space battle, bombard the defences, then land troops. */
export function resolveAssault(attacker: Side, planet: PlanetTarget, classes: readonly ShipClassDef[], seed: number, defenseBonusPct = 0): AssaultResult {
  const byId = new Map(classes.map((c) => [c.id, c]));
  let ships = attacker.ships.filter((s) => s.count > 0);
  let carried: Damage = attacker.damage ?? {};
  let space: BattleResult | null = null;
  if (planet.garrison.ships.some((s) => s.count > 0)) {
    space = resolveBattle({ ...attacker, ships }, planet.garrison, classes, hashSeed(seed, 'space'));
    ships = space.survivors[0];
    carried = space.damage[0];
    if (space.winner !== 0) {
      return { space, bombardment: [], troopsLanded: 0, troopsNeeded: 0, captured: false, phaseReached: 'space', survivors: ships, damage: carried };
    }
  }
  const b = attacker.bonuses ?? {};
  const maxDefense = Math.round(planet.defense * (1 + defenseBonusPct / 100));
  let defense = maxDefense;
  const groups = groupsOf({ ...attacker, ships, damage: carried }, byId);
  const bombardment: Array<{ round: number; damage: number; defenseLeft: number; lost: number }> = [];
  for (let r = 1; r <= 5 && defense > maxDefense * 0.25; r++) {
    let dmg = 0;
    for (const g of alive(groups)) {
      const m = g.def.doctrine === 'siege' ? 3 * (1 + (b.siege ?? 0) * 0.05) : g.def.doctrine === 'assault' ? 0.2 : 0.3;
      dmg += g.count * g.def.attack * m;
    }
    defense = Math.max(0, Math.round(defense - dmg));
    const lost = applyDamage(groups, defense * 0.25);
    bombardment.push({ round: r, damage: Math.round(dmg), defenseLeft: defense, lost });
  }
  ships = alive(groups).map((g) => ({ classId: g.def.id, count: g.count }));
  if (defense > maxDefense * 0.25) {
    return { space, bombardment, troopsLanded: 0, troopsNeeded: 0, captured: false, phaseReached: 'bombardment', survivors: ships, damage: damageOf(groups) };
  }
  const troopsLanded = Math.round(alive(groups).reduce((s, g) => s + g.count * (g.def.doctrine === 'assault' ? g.def.troops ?? 0 : 0), 0) * (1 + (b.troops ?? 0) / 100));
  const troopsNeeded = Math.round(planet.troops * (0.5 + (defense / maxDefense) * 2));
  return { space, bombardment, troopsLanded, troopsNeeded, captured: troopsLanded > troopsNeeded, phaseReached: 'ground', survivors: ships, damage: damageOf(groups) };
}

/**
 * One round of a running battle (player fleets that meet at sea fight a round a world year until
 * one side is gone or breaks off). `round` sets the range: fleets open at long range and close in
 * over the rounds. Damage carries over: each side comes in with the damage its fleet carries
 * (`Side.damage`) and leaves with what is left after this round (`BattleResult.damage`), Menders
 * having patched some of it. Boarders take ships the fire has crippled. Every round costs at least
 * one ship: when nothing would die, the side that took more damage (the defender, side 1, on a
 * tie) loses its lightest hull, its most damaged one.
 */
export function resolveRound(a: Side, d: Side, classes: readonly ShipClassDef[], seed: number, round: number): BattleResult {
  const byId = new Map(classes.map((c) => [c.id, c]));
  const sides = [groupsOf(a, byId), groupsOf(d, byId)] as const;
  const bon = [a.bonuses ?? {}, d.bonuses ?? {}] as const;
  const rng = new Rng(hashSeed(seed, 'round', round));
  const band = bandOf(round);
  const hull = [Object.fromEntries(sides[0].map((g) => [g.def.id, g.hull])), Object.fromEntries(sides[1].map((g) => [g.def.id, g.hull]))] as const;
  const out0 = outputOf(sides[0], sides[1], bon[0], bon[1], band, rng);
  const out1 = outputOf(sides[1], sides[0], bon[1], bon[0], band, rng);
  const dmg0 = out0.total, dmg1 = out1.total;
  const lostBy: [Record<string, number>, Record<string, number>] = [{}, {}];
  const losses = [applyFire(sides[0], out1.by, lostBy[0]), applyFire(sides[1], out0.by, lostBy[1])];
  // Boarders take the ships this round's fire crippled.
  const cap0 = capture(sides[0], sides[1], bon[0], band);
  const cap1 = capture(sides[1], sides[0], bon[1], band);
  const c0 = cap0.reduce((s, x) => s + x.count, 0), c1 = cap1.reduce((s, x) => s + x.count, 0);
  if (losses[0] + losses[1] + c0 + c1 === 0) {
    const hullOf = (gs: Group[]) => Math.max(1, alive(gs).reduce((s, g) => s + g.count * g.hull, 0));
    const loser = dmg0 / hullOf(sides[1]) >= dmg1 / hullOf(sides[0]) ? 1 : 0;
    const light = alive(sides[loser]).sort((x, y) => x.hull - y.hull || (x.def.id < y.def.id ? -1 : 1))[0];
    if (light) { light.count--; light.wound = 0; losses[loser]++; count(lostBy[loser], light.def.id, 1); }
  }
  // Menders patch their fleet before the next round.
  repair(sides[0], bon[0]);
  repair(sides[1], bon[1]);
  // The damage each class carries out of the round (what the battle view's health bars end on).
  const woundsOf = (gs: Group[]) => rounded(Object.fromEntries(alive(gs).map((g) => [g.def.id, Math.min(g.wound, g.count * g.hull)])));
  const wounds = [woundsOf(sides[0]), woundsOf(sides[1])] as const;
  const detail: RoundDetail = {
    lostBy: [rounded(lostBy[0]), rounded(lostBy[1])],
    takenBy: [rounded(tallyOf(cap1)), rounded(tallyOf(cap0))],
    by: [rounded(out0.by), rounded(out1.by)],
    jam: [Math.round(out0.jam * 1000) / 1000, Math.round(out1.jam * 1000) / 1000],
    flak: [Math.round(out0.flak * 1000) / 1000, Math.round(out1.flak * 1000) / 1000],
    hull: [hull[0], hull[1]],
    wounds,
  };
  const notes: string[] = [];
  if (c0) notes.push(`${a.name} boarded ${c0} ship${c0 > 1 ? 's' : ''}`);
  if (c1) notes.push(`${d.name} boarded ${c1} ship${c1 > 1 ? 's' : ''}`);
  const left0 = shipsOf(alive(sides[0])), left1 = shipsOf(alive(sides[1]));
  const winner: 0 | 1 | null = left0 && !left1 ? 0 : left1 && !left0 ? 1 : null;
  const surv = (gs: Group[]) => alive(gs).map((g) => ({ classId: g.def.id, count: g.count }));
  return {
    winner,
    rounds: [{ round, band, damage: [Math.round(dmg0), Math.round(dmg1)], losses: [losses[0], losses[1]], captured: [c0, c1], notes, detail }],
    survivors: [surv(sides[0]), surv(sides[1])],
    captured: [cap0, cap1],
    damage: [damageOf(sides[0]), damageOf(sides[1])],
  };
}

/** A fleet's damage after `heal` hull points of repair on each class (Infinity: fully repaired). */
export function repairDamage(damage: Damage | undefined, heal: number): Damage | undefined {
  if (!damage) return undefined;
  const out: Record<string, number> = {};
  for (const [id, d] of Object.entries(damage)) if (d - heal > 0) out[id] = Math.round(d - heal);
  return Object.keys(out).length ? out : undefined;
}

/** The hull points Menders in a fleet restore each round or year. */
export function menderRepair(ships: readonly Squadron[], b: CombatBonuses = {}): number {
  const menders = ships.filter((s) => s.classId === 'repair-tender').reduce((n, s) => n + s.count, 0);
  return menders ? menders * 8 * (1 + (b.repair ?? 0) / 100) + (b.repair ?? 0) : 0;
}
