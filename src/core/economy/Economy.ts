import { BIOME_YIELDS, CAPITAL_YIELDS, RESOURCES, Resource } from '../../content/resources';
import type { BuildingDef } from '../../content/buildings';
import type { ShipClassDef } from '../../content/shipClasses';
import type { Effects, FactionId, GovernmentDef, PolicyDef } from '../../content/society';
import { FACTIONS } from '../../content/society';
import { Rng, hashSeed } from '../rng/Rng';
import { FREIGHTER } from './Trade';
import type { TechTree } from '../research/TechTree';
import type { ResearchState } from '../research/types';

export type Stockpile = Readonly<Record<Resource, number>>;

export interface Faith {
  readonly name: string;
  readonly tenets: readonly string[];
  /** Percent of each empire that follows the faith (0–100). */
  readonly adherents: Readonly<Record<string, number>>;
  /** Empires missionaries are working on. */
  readonly missions: readonly string[];
}

export interface EconomyState {
  readonly stock: Stockpile;
  readonly roster: Readonly<Record<string, number>>;
  readonly government: string;
  readonly policies: readonly string[];
  readonly faith: Faith | null;
  readonly spyNetworks: readonly string[];
  /** Node that science shards go to each turn. */
  readonly focus: string | null;
  readonly colonies: readonly Colony[];
}

/** A settled planet. Buildings fill its slots and add to its output. */
export interface Colony {
  readonly name: string;
  readonly biome: string;
  readonly planetId?: string;
  readonly starId?: string;
  readonly size?: number;
  readonly capital?: boolean;
  readonly buildings?: readonly string[];
}

/** Food each colony eats per turn. */
export const FOOD_PER_COLONY = 2;

export interface EconomyTables {
  readonly tree: TechTree;
  readonly classes: readonly ShipClassDef[];
  readonly governments: readonly GovernmentDef[];
  readonly policies: readonly PolicyDef[];
  readonly tenets: ReadonlyArray<{ id: string; effects: Effects }>;
  readonly alienTech: Readonly<Record<string, readonly string[]>>;
  readonly buildings?: readonly BuildingDef[];
  /** Storage caps; omit for unlimited storage. */
  readonly storage?: StorageTable;
  /** Credits per year per ship; omit for the legacy flat warship upkeep. */
  readonly upkeepOf?: (c: ShipClassDef) => number;
}

export interface StorageTable {
  readonly base: Readonly<Partial<Record<Resource, number>>>;
  readonly perColony: number;
  readonly creditsPerColony: number;
}

/** Most of each resource the empire can hold. Income stops at the cap. */
export function capsOf(e: Pick<EconomyState, 'colonies'>, t: EconomyTables): Partial<Record<Resource, number>> {
  const s = t.storage;
  if (!s) return {};
  const caps: Partial<Record<Resource, number>> = { ...s.base };
  const extra = e.colonies.reduce((n, c) => n + (c.buildings ?? []).reduce((m, id) => m + (t.buildings?.find((b) => b.id === id)?.storage ?? 0), 0), 0);
  for (const r of Object.keys(caps) as Resource[]) {
    if (MINERALS.has(r) || r === 'food' || r === 'goods') caps[r] = caps[r]! + e.colonies.length * s.perColony + extra;
  }
  if (caps.credits !== undefined) caps.credits += e.colonies.length * s.creditsPerColony;
  return caps;
}

/** Credits per year to keep the fleet in service. */
export function upkeepOf(e: Pick<EconomyState, 'roster' | 'policies'>, t: EconomyTables): number {
  const conscription = e.policies.includes('conscription');
  return t.classes.reduce((sum, c) => {
    const n = e.roster[c.id] ?? 0;
    if (!n) return sum;
    const military = c.role === 'combat' || c.role === 'capital';
    if (military && conscription) return sum;
    return sum + n * (t.upkeepOf ? t.upkeepOf(c) : military ? 2 : 0);
  }, 0);
}

/**
 * Where the empire's ships actually are. Mining, missionaries and spies only
 * work with a ship on location. Omit to assume every ship is in place.
 */
export interface Presence {
  /**
   * Mining crews. With `pools`, each mines the asteroid pool it is at (`pool`: a system's fields
   * of its resource); without, `deposits` lists what it can mine there (no limit).
   */
  readonly miners: ReadonlyArray<{ readonly classId: string; readonly count: number; readonly deposits?: readonly Resource[]; readonly pool?: string }>;
  /** What each asteroid pool holds this year: mining draws it down. */
  readonly pools?: Readonly<Record<string, number>>;
  /** Empires with at least one of our ships inside their territory. */
  readonly reached: readonly string[];
}

export interface TurnReport {
  readonly income: Partial<Record<Resource, number>>;
  readonly lines: readonly string[];
  readonly science: number;
}

/** Sum of a numeric research bonus, e.g. bonusOf(research, 'trade'). */
export function bonusOf(tree: TechTree, research: ResearchState, stat: string): number {
  return tree.grantsOf(research).reduce((s, g) => s + (g.kind === 'bonus' && g.stat === stat ? g.amount : 0), 0);
}

export function hasGrant(tree: TechTree, research: ResearchState, partId: string): boolean {
  return tree.grantsOf(research).some((g) => g.kind === 'part' && g.id === partId);
}

/** Effects from government + policies + faith tenets. */
export function activeEffects(e: EconomyState, t: EconomyTables): Effects[] {
  const gov = t.governments.find((g) => g.id === e.government);
  const pols = t.policies.filter((p) => e.policies.includes(p.id));
  const tenets = e.faith ? t.tenets.filter((x) => e.faith!.tenets.includes(x.id)) : [];
  return [gov?.effects, ...pols.map((p) => p.effects), ...tenets.map((x) => x.effects)].filter((x): x is Effects => !!x);
}

const sumEff = (effs: Effects[], f: (e: Effects) => number | undefined) => effs.reduce((s, e) => s + (f(e) ?? 0), 0);

export function factionApproval(e: EconomyState, t: EconomyTables, research: ResearchState): Record<FactionId, number> {
  const effs = activeEffects(e, t);
  const out = {} as Record<FactionId, number>;
  const stability = bonusOf(t.tree, research, 'stability');
  for (const f of FACTIONS) {
    let v = 50 + stability + sumEff(effs, (x) => x.approval?.[f.id]);
    if (f.id === 'militarists') v += Math.min(20, combatShips(e, t) * 2);
    if (f.id === 'industrialists') v += Math.min(20, miningShips(e, t) * 2);
    if (f.id === 'merchants') v += Math.min(20, (e.roster[FREIGHTER] ?? 0) * 5);
    if (f.id === 'faithful' && e.faith) v += 10;
    out[f.id] = Math.max(0, Math.min(100, Math.round(v)));
  }
  return out;
}

export function stabilityOf(approval: Record<FactionId, number>): number {
  const vals = Object.values(approval);
  return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
}

function miningShips(e: EconomyState, t: EconomyTables): number {
  return t.classes.filter((c) => c.mines).reduce((s, c) => s + (e.roster[c.id] ?? 0), 0);
}
function combatShips(e: EconomyState, t: EconomyTables): number {
  return t.classes.filter((c) => c.role === 'combat' || c.role === 'capital').reduce((s, c) => s + (e.roster[c.id] ?? 0), 0);
}

export function maxPolicies(t: EconomyTables, research: ResearchState): number {
  return 2 + bonusOf(t.tree, research, 'policies');
}

export function maxSpies(t: EconomyTables, research: ResearchState): number {
  return 1 + bonusOf(t.tree, research, 'spies');
}

/** Output of one colony per turn: biome yields plus its buildings. */
export function colonyYield(c: Colony, t: EconomyTables): { income: Partial<Record<Resource, number>>; science: number } {
  const income: Partial<Record<Resource, number>> = {};
  const add = (r: Resource, n: number) => (income[r] = (income[r] ?? 0) + n);
  const biome = BIOME_YIELDS[c.biome] ?? {};
  for (const [r, n] of Object.entries(biome)) add(r as Resource, n!);
  if (c.capital) for (const [r, n] of Object.entries(CAPITAL_YIELDS)) add(r as Resource, n!);
  let science = 0;
  for (const id of c.buildings ?? []) {
    const b = t.buildings?.find((x) => x.id === id);
    if (!b) continue;
    for (const [r, n] of Object.entries(b.yields ?? {})) add(r as Resource, n!);
    if (b.mineralBoost) for (const [r, n] of Object.entries(biome)) if (MINERALS.has(r as Resource)) add(r as Resource, n! * b.mineralBoost);
    science += b.science ?? 0;
  }
  add('food', -FOOD_PER_COLONY);
  return { income, science };
}

const MINERALS = new Set<Resource>(['metals', 'gases', 'crystals']);

export function sciencePerTurn(e: EconomyState, t: EconomyTables, research: ResearchState): number {
  const labs = e.colonies.reduce((s, c) => s + colonyYield(c, t).science, 0);
  return 8 + labs + bonusOf(t.tree, research, 'science') + sumEff(activeEffects(e, t), (x) => x.science);
}

export function tradePctOf(e: EconomyState, t: EconomyTables, research: ResearchState): number {
  return bonusOf(t.tree, research, 'trade') + sumEff(activeEffects(e, t), (x) => x.tradePct);
}

/**
 * Resolve one turn of the economy. Pure: returns the new state, updated research
 * and a report. Deterministic given (state, research, turn).
 */
/** Asteroids give this many times the old planet rate per mining ship. */
export const ASTEROID_RATE = 3;

export function resolveTurn(e: EconomyState, research: ResearchState, turn: number, t: EconomyTables, presence?: Presence): { economy: EconomyState; research: ResearchState; report: TurnReport; mined: Record<string, number> } {
  const effs = activeEffects(e, t);
  const income: Partial<Record<Resource, number>> = {};
  const add = (r: Resource, n: number) => (income[r] = (income[r] ?? 0) + n);
  const lines: string[] = [];

  const approval = factionApproval(e, t, research);
  const stability = stabilityOf(approval);
  const unrest = stability < 40 ? 0.8 : stability > 70 ? 1.1 : 1;

  // Colonies
  for (const c of e.colonies) for (const [r, n] of Object.entries(colonyYield(c, t).income)) add(r as Resource, n!);
  add('credits', bonusOf(t.tree, research, 'credits'));
  add('influence', bonusOf(t.tree, research, 'influence'));
  add('faith', bonusOf(t.tree, research, 'faith'));
  add('crystals', bonusOf(t.tree, research, 'crystals'));

  // Mining ships
  const miningPct = sumEff(effs, (x) => x.miningPct);
  const perShip = 3 + bonusOf(t.tree, research, 'mining');
  const crews: Presence['miners'] = presence?.miners ?? t.classes.filter((c) => c.mines).map((c) => ({ classId: c.id, count: e.roster[c.id] ?? 0, deposits: [c.mines!] }));
  let idleMiners = 0;
  const pools = presence?.pools ? { ...presence.pools } : null;
  const mined: Record<string, number> = {};
  for (const crew of crews) {
    const c = t.classes.find((x) => x.id === crew.classId);
    if (!c?.mines || !crew.count) continue;
    if (pools) {
      // Asteroids: faster than planets were, but never more than the fields hold.
      const left = crew.pool ? pools[crew.pool] ?? 0 : 0;
      if (left <= 0) { idleMiners += crew.count; continue; }
      const take = Math.min(left, Math.round(crew.count * perShip * (c.rate ?? 1) * ASTEROID_RATE * (1 + miningPct / 100)));
      pools[crew.pool!] = left - take;
      mined[crew.pool!] = (mined[crew.pool!] ?? 0) + take;
      add(c.mines, take);
      continue;
    }
    if (!crew.deposits?.includes(c.mines)) { idleMiners += crew.count; continue; }
    add(c.mines, Math.round(crew.count * perShip * (c.rate ?? 1) * (1 + miningPct / 100)));
  }
  if (idleMiners) lines.push(pools
    ? `${idleMiners} mining ship${idleMiners === 1 ? '' : 's'} idle: no asteroid field of their kind where they are, or it is mined out`
    : `${idleMiners} mining ship${idleMiners === 1 ? '' : 's'} idle: nothing they can mine where they are`);
  const reached = (empire: string) => !presence || presence.reached.includes(empire);

  // Government, policies, tenets
  for (const x of effs) for (const [r, n] of Object.entries(x.income ?? {})) add(r as Resource, n!);

  // Religion
  let faith = e.faith;
  if (faith) {
    const spread = 4 + bonusOf(t.tree, research, 'spread') + sumEff(effs, (x) => x.spread);
    const adherents = { ...faith.adherents };
    const working = faith.missions.filter(reached);
    for (const target of working) adherents[target] = Math.min(100, (adherents[target] ?? 0) + spread);
    for (const target of faith.missions.filter((m) => !reached(m))) lines.push(`Missionaries to ${target} idle: no ship in their space`);
    faith = { ...faith, adherents };
    const followers = Object.values(adherents).reduce((a, b) => a + b, 0);
    add('faith', Math.round(followers / 10));
    add('influence', Math.round(followers / 40));
    if (working.length) lines.push(`${faith.name} spread ${spread}% in ${working.join(', ')}`);
  }

  // Upkeep
  add('credits', -upkeepOf(e, t));

  // Famine: colonies that cannot eat produce less
  const famine = (e.stock.food ?? 0) + (income.food ?? 0) < 0;
  if (famine) lines.push('Famine: not enough food. Build farms; output cut by 20%');
  const factor = unrest * (famine ? 0.8 : 1);

  // Apply stability modifier to positive income
  for (const r of Object.keys(income) as Resource[]) if (income[r]! > 0) income[r] = Math.round(income[r]! * factor);
  if (unrest < 1) lines.push(`Unrest: stability ${stability}% cut income by 20%`);

  // Storage: income stops at the cap (stock above it from loot is kept, not lost).
  const caps = capsOf(e, t);
  const stock = { ...e.stock };
  const full: string[] = [];
  for (const r of RESOURCES) {
    const inc = income[r.id] ?? 0;
    const cap = caps[r.id];
    let next = Math.max(0, stock[r.id] + inc);
    if (cap !== undefined && inc > 0 && next > cap) {
      next = Math.max(stock[r.id], cap);
      full.push(r.name.toLowerCase());
    }
    stock[r.id] = next;
  }
  if (full.length) lines.push(`Storage full: ${full.join(', ')}. Spend it, or build Warehouses`);

  // Research: science into focus, espionage into alien tech
  let res = research;
  const science = sciencePerTurn(e, t, research);
  if (e.focus && t.tree.canReceive(res, e.focus, 'science')) {
    res = t.tree.grantShards(res, e.focus, 'science', science);
    lines.push(`Science: +${science} shards to ${t.tree.node(e.focus).name}`);
  } else if (e.focus) {
    lines.push(`Science idle: ${t.tree.node(e.focus).name} is not reachable yet`);
  } else {
    lines.push('Science idle: pick a research focus');
  }
  const espionage = 3 + bonusOf(t.tree, research, 'espionage');
  for (const target of e.spyNetworks) {
    if (!reached(target)) { lines.push(`Spy network in ${target} dark: no ship in their space`); continue; }
    const pool = (t.alienTech[target] ?? []).filter((id) => !res.researched.includes(id));
    if (!pool.length) continue;
    const rng = new Rng(hashSeed(turn, 'spy', target));
    const nodeId = rng.pick(pool);
    res = t.tree.grantShards(res, nodeId, 'espionage', espionage);
    lines.push(`Spies in ${target} stole ${espionage} shards of ${t.tree.node(nodeId).name}`);
  }

  return { economy: { ...e, stock, faith }, research: res, report: { income, lines, science }, mined };
}

/** Can the empire pay a cost? */
export function canAfford(stock: Stockpile, cost: Partial<Record<Resource, number>>, discountPct = 0): boolean {
  return Object.entries(cost).every(([r, n]) => stock[r as Resource] >= Math.ceil(n! * (1 - discountPct / 100)));
}

export function pay(stock: Stockpile, cost: Partial<Record<Resource, number>>, discountPct = 0): Stockpile {
  const out = { ...stock };
  for (const [r, n] of Object.entries(cost)) out[r as Resource] -= Math.ceil(n! * (1 - discountPct / 100));
  return out;
}
