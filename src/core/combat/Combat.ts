import type { Doctrine, ShipClassDef } from '../../content/shipClasses';
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
  /** Ammunition on hand as a damage multiplier (1 = full magazines). */
  readonly firepower?: number;
}

export type Band = 'long' | 'medium' | 'short';

export interface RoundLog {
  readonly round: number;
  readonly band: Band;
  readonly damage: readonly [number, number];
  readonly losses: readonly [number, number];
  readonly captured: readonly [number, number];
  readonly notes: readonly string[];
}

export interface BattleResult {
  readonly winner: 0 | 1 | null;
  readonly rounds: readonly RoundLog[];
  readonly survivors: readonly [Squadron[], Squadron[]];
  /** captured[0] = ships side 0 captured from side 1. */
  readonly captured: readonly [Squadron[], Squadron[]];
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
}

function groupsOf(side: Side, classes: ReadonlyMap<string, ShipClassDef>): Group[] {
  const hullPct = (side.bonuses?.hull ?? 0) * 5;
  return side.ships
    .filter((s) => s.count > 0 && classes.has(s.classId))
    .map((s) => {
      const def = classes.get(s.classId)!;
      return { def, count: s.count, wound: 0, hull: Math.round(def.hull * (1 + hullPct / 100)) };
    });
}

const alive = (gs: Group[]) => gs.filter((g) => g.count > 0);
const fighting = (gs: Group[]) => alive(gs).some((g) => g.def.attack > 0);
const shipsOf = (gs: Group[]) => gs.reduce((s, g) => s + g.count, 0);
const shareOf = (gs: Group[], d: Doctrine) => {
  const total = shipsOf(gs);
  return total ? gs.filter((g) => g.def.doctrine === d).reduce((s, g) => s + g.count, 0) / total : 0;
};

/** Damage a side deals this round, split by doctrine. */
function output(own: Group[], foe: Group[], b: CombatBonuses, foeB: CombatBonuses, band: Band, rng: Rng, firepower: number): number {
  const flagship = own.some((g) => g.def.id === 'flagship' && g.count > 0) ? 1.1 : 1;
  const morale = 1 + (b.morale ?? 0) / 100;
  const foeSuppression = shareOf(foe, 'suppression') + (foeB.suppression ?? 0) * 0.03;
  const jam = 1 - Math.min(0.25, shareOf(foe, 'suppression') * 0.5);
  let total = 0;
  for (const g of alive(own)) {
    const d = g.def.doctrine;
    let dmg = g.count * g.def.attack * BAND_MULT[d][band];
    dmg *= 1 + ((b as Record<string, number | undefined>)[d] ?? 0) * 0.05;
    if (d === 'barrage') dmg *= 1 - Math.min(0.6, foeSuppression * 1.5) + (foeB.vsBarrage ? -foeB.vsBarrage / 100 : 0);
    if (d === 'long' && foeB.vsLong) dmg *= 1 - foeB.vsLong / 100;
    total += dmg;
  }
  return Math.max(0, total * morale * flagship * jam * firepower * rng.range(0.9, 1.1));
}

/** Spread damage across groups in proportion to ship count; returns ships destroyed. */
function applyDamage(gs: Group[], dmg: number): number {
  const live = alive(gs);
  const total = shipsOf(live);
  let destroyed = 0;
  for (const g of live) {
    g.wound += dmg * (g.count / total);
    const lost = Math.min(g.count, Math.floor(g.wound / g.hull));
    g.count -= lost;
    g.wound -= lost * g.hull;
    destroyed += lost;
    if (g.count === 0) g.wound = 0;
  }
  return destroyed;
}

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
    const dmg0 = output(sides[0], sides[1], bon[0], bon[1], band, rng, a.firepower ?? 1);
    const dmg1 = output(sides[1], sides[0], bon[1], bon[0], band, rng, d.firepower ?? 1);
    const lost1 = applyDamage(sides[1], dmg0);
    const lost0 = applyDamage(sides[0], dmg1);
    const cap0 = capture(sides[0], sides[1], bon[0], band);
    const cap1 = capture(sides[1], sides[0], bon[1], band);
    merge(captured[0], cap0);
    merge(captured[1], cap1);
    repair(sides[0], bon[0]);
    repair(sides[1], bon[1]);
    if (r === 3) notes.push('Fleets close to medium range');
    if (r === 5) notes.push('Knife-fight range');
    const c0 = cap0.reduce((s, x) => s + x.count, 0), c1 = cap1.reduce((s, x) => s + x.count, 0);
    if (c0) notes.push(`${a.name} boarded ${c0} ship${c0 > 1 ? 's' : ''}`);
    if (c1) notes.push(`${d.name} boarded ${c1} ship${c1 > 1 ? 's' : ''}`);
    rounds.push({ round: r, band, damage: [Math.round(dmg0), Math.round(dmg1)], losses: [lost0, lost1], captured: [c0, c1], notes });
  }

  const hp = (gs: Group[]) => alive(gs).reduce((s, g) => s + g.count * g.hull - g.wound, 0);
  const f0 = fighting(sides[0]), f1 = fighting(sides[1]);
  const winner: 0 | 1 | null = f0 && !f1 ? 0 : f1 && !f0 ? 1 : !f0 && !f1 ? null : hp(sides[0]) >= hp(sides[1]) * 1.2 ? 0 : hp(sides[1]) >= hp(sides[0]) * 1.2 ? 1 : null;
  const surv = (gs: Group[]) => alive(gs).map((g) => ({ classId: g.def.id, count: g.count }));
  return { winner, rounds, survivors: [surv(sides[0]), surv(sides[1])], captured };
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
}

/** Planetary assault: win the space battle, bombard the defences, then land troops. */
export function resolveAssault(attacker: Side, planet: PlanetTarget, classes: readonly ShipClassDef[], seed: number, defenseBonusPct = 0): AssaultResult {
  const byId = new Map(classes.map((c) => [c.id, c]));
  let ships = attacker.ships.filter((s) => s.count > 0);
  let space: BattleResult | null = null;
  if (planet.garrison.ships.some((s) => s.count > 0)) {
    space = resolveBattle({ ...attacker, ships }, planet.garrison, classes, hashSeed(seed, 'space'));
    ships = space.survivors[0];
    if (space.winner !== 0) {
      return { space, bombardment: [], troopsLanded: 0, troopsNeeded: 0, captured: false, phaseReached: 'space', survivors: ships };
    }
  }
  const b = attacker.bonuses ?? {};
  const maxDefense = Math.round(planet.defense * (1 + defenseBonusPct / 100));
  let defense = maxDefense;
  const groups = groupsOf({ ...attacker, ships }, byId);
  const bombardment: Array<{ round: number; damage: number; defenseLeft: number; lost: number }> = [];
  for (let r = 1; r <= 5 && defense > maxDefense * 0.25; r++) {
    let dmg = 0;
    for (const g of alive(groups)) {
      const m = g.def.doctrine === 'siege' ? 3 * (1 + (b.siege ?? 0) * 0.05) : g.def.doctrine === 'assault' ? 0.2 : 0.3;
      dmg += g.count * g.def.attack * m * (attacker.firepower ?? 1);
    }
    defense = Math.max(0, Math.round(defense - dmg));
    const lost = applyDamage(groups, defense * 0.25);
    bombardment.push({ round: r, damage: Math.round(dmg), defenseLeft: defense, lost });
  }
  ships = alive(groups).map((g) => ({ classId: g.def.id, count: g.count }));
  if (defense > maxDefense * 0.25) {
    return { space, bombardment, troopsLanded: 0, troopsNeeded: 0, captured: false, phaseReached: 'bombardment', survivors: ships };
  }
  const troopsLanded = Math.round(alive(groups).reduce((s, g) => s + g.count * (g.def.doctrine === 'assault' ? g.def.troops ?? 0 : 0), 0) * (1 + (b.troops ?? 0) / 100));
  const troopsNeeded = Math.round(planet.troops * (0.5 + (defense / maxDefense) * 2));
  return { space, bombardment, troopsLanded, troopsNeeded, captured: troopsLanded > troopsNeeded, phaseReached: 'ground', survivors: ships };
}
