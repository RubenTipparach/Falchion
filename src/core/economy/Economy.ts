import { FOOD_PER_POP, growWorld, populationOf } from './Population';
import { BIOMES } from '../../content/biomes';
import { BIOME_SCIENCE, BIOME_YIELDS, CAPITAL_YIELDS, RESOURCES, Resource } from '../../content/resources';
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
  /** Population (at least 1; see Population.ts), and food put towards the next point of it. */
  readonly pop?: number;
  readonly growth?: number;
}

/** Food a colony of population 1 eats per turn (each point of population eats this much). */
export const FOOD_PER_COLONY = FOOD_PER_POP;

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
  return upkeepParts(e, t).reduce((sum, x) => sum + x.credits, 0);
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
  /** Technology spies can steal from each empire (beyond the tables' alienTech). */
  readonly techOf?: Readonly<Record<string, readonly string[]>>;
}

export interface TurnReport {
  readonly income: Partial<Record<Resource, number>>;
  readonly lines: readonly string[];
  readonly science: number;
  /**
   * Where the year's income came from and where its costs went, item by item, as the rules added
   * them (change resource-ledger). Adjustments (stability, famine, a full store, an empty one) are
   * items of their own, so a resource's items add up to its change in the store. Missing on
   * reports from before the change.
   */
  readonly ledger?: readonly LedgerEntry[];
}

/** One item of the yearly ledger: `n` of resource `r` from `label`, under a heading `group`. */
export interface LedgerEntry {
  readonly r: Resource;
  readonly n: number;
  readonly group: string;
  readonly label: string;
}

/** A colony's yearly output, part by part: its world, the capital's due, each building, its people. */
export function colonyParts(c: Colony, t: EconomyTables): Array<{ r: Resource; n: number; label: string }> {
  const out: Array<{ r: Resource; n: number; label: string }> = [];
  const biome = BIOME_YIELDS[c.biome] ?? {};
  const world = `${BIOMES.find((b) => b.id === c.biome)?.name ?? c.biome} world`;
  for (const [r, n] of Object.entries(biome)) out.push({ r: r as Resource, n: n!, label: world });
  if (c.capital) for (const [r, n] of Object.entries(CAPITAL_YIELDS)) out.push({ r: r as Resource, n: n!, label: 'Capital' });
  for (const id of c.buildings ?? []) {
    const b = t.buildings?.find((x) => x.id === id);
    if (!b) continue;
    for (const [r, n] of Object.entries(b.yields ?? {})) out.push({ r: r as Resource, n: n!, label: b.name });
    if (b.mineralBoost) for (const [r, n] of Object.entries(biome)) if (MINERALS.has(r as Resource)) out.push({ r: r as Resource, n: n! * b.mineralBoost, label: `${b.name} (mineral boost)` });
  }
  const pop = populationOf(c);
  out.push({ r: 'food', n: -FOOD_PER_POP * pop, label: `Population ${pop} eats` });
  return out;
}

/** Fleet upkeep by ship class (credits a year). */
export function upkeepParts(e: Pick<EconomyState, 'roster' | 'policies'>, t: EconomyTables): Array<{ classId: string; name: string; count: number; credits: number }> {
  const conscription = e.policies.includes('conscription');
  const out: Array<{ classId: string; name: string; count: number; credits: number }> = [];
  for (const c of t.classes) {
    const n = e.roster[c.id] ?? 0;
    if (!n) continue;
    const military = c.role === 'combat' || c.role === 'capital';
    if (military && conscription) continue;
    const credits = n * (t.upkeepOf ? t.upkeepOf(c) : military ? 2 : 0);
    if (credits) out.push({ classId: c.id, name: c.name, count: n, credits });
  }
  return out;
}

/** Sum of a numeric research bonus, e.g. bonusOf(research, 'trade'). */
export function bonusOf(tree: TechTree, research: ResearchState, stat: string): number {
  return tree.grantsOf(research).reduce((s, g) => s + (g.kind === 'bonus' && g.stat === stat ? g.amount : 0), 0);
}

export function hasGrant(tree: TechTree, research: ResearchState, partId: string): boolean {
  return tree.grantsOf(research).some((g) => g.kind === 'part' && g.id === partId);
}

/** Effects from government + policies + faith tenets, each with what it comes from. */
export function activeSources(e: EconomyState, t: EconomyTables): Array<{ name: string; effects: Effects }> {
  const gov = t.governments.find((g) => g.id === e.government);
  const pols = t.policies.filter((p) => e.policies.includes(p.id));
  const tenets = e.faith ? t.tenets.filter((x) => e.faith!.tenets.includes(x.id)) : [];
  return [
    ...(gov ? [{ name: gov.name, effects: gov.effects }] : []),
    ...pols.map((p) => ({ name: p.name, effects: p.effects })),
    ...tenets.map((x) => ({ name: `Tenet: ${x.id.replace(/-/g, ' ')}`, effects: x.effects })),
  ];
}

/** Effects from government + policies + faith tenets. */
export function activeEffects(e: EconomyState, t: EconomyTables): Effects[] {
  return activeSources(e, t).map((x) => x.effects);
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
  for (const x of colonyParts(c, t)) income[x.r] = (income[x.r] ?? 0) + x.n;
  let science = BIOME_SCIENCE[c.biome] ?? 0;
  for (const id of c.buildings ?? []) science += t.buildings?.find((x) => x.id === id)?.science ?? 0;
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

/** What one mining ship of a class takes from an asteroid field in a year (as resolveTurn mines). */
export function miningYield(e: EconomyState, t: EconomyTables, research: ResearchState, classId: string): number {
  const c = t.classes.find((x) => x.id === classId);
  if (!c?.mines) return 0;
  const perShip = 3 + bonusOf(t.tree, research, 'mining');
  const miningPct = sumEff(activeEffects(e, t), (x) => x.miningPct);
  return Math.round(perShip * (c.rate ?? 1) * ASTEROID_RATE * (1 + miningPct / 100));
}

export function resolveTurn(e: EconomyState, research: ResearchState, turn: number, t: EconomyTables, presence?: Presence): { economy: EconomyState; research: ResearchState; report: TurnReport; mined: Record<string, number> } {
  const effs = activeEffects(e, t);
  const income: Partial<Record<Resource, number>> = {};
  const ledger: LedgerEntry[] = [];
  // Every item goes into the year's income and, named, into the ledger.
  const add = (r: Resource, n: number, group = 'Other', label = group) => {
    if (!n) return;
    income[r] = (income[r] ?? 0) + n;
    ledger.push({ r, n, group, label });
  };
  const lines: string[] = [];

  const approval = factionApproval(e, t, research);
  const stability = stabilityOf(approval);
  const unrest = stability < 40 ? 0.8 : stability > 70 ? 1.1 : 1;

  // Colonies
  for (const c of e.colonies) for (const x of colonyParts(c, t)) add(x.r, x.n, c.name, x.label);
  add('credits', bonusOf(t.tree, research, 'credits'), 'Research', 'Research bonuses');
  add('influence', bonusOf(t.tree, research, 'influence'), 'Research', 'Research bonuses');
  add('faith', bonusOf(t.tree, research, 'faith'), 'Research', 'Research bonuses');
  add('crystals', bonusOf(t.tree, research, 'crystals'), 'Research', 'Research bonuses');

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
      add(c.mines, take, 'Mining ships', `${c.name} ×${crew.count}`);
      continue;
    }
    if (!crew.deposits?.includes(c.mines)) { idleMiners += crew.count; continue; }
    add(c.mines, Math.round(crew.count * perShip * (c.rate ?? 1) * (1 + miningPct / 100)), 'Mining ships', `${c.name} ×${crew.count}`);
  }
  if (idleMiners) lines.push(pools
    ? `${idleMiners} mining ship${idleMiners === 1 ? '' : 's'} idle: no asteroid field of their kind where they are, or it is mined out`
    : `${idleMiners} mining ship${idleMiners === 1 ? '' : 's'} idle: nothing they can mine where they are`);
  const reached = (empire: string) => !presence || presence.reached.includes(empire);

  // Government, policies, tenets
  for (const x of activeSources(e, t)) for (const [r, n] of Object.entries(x.effects.income ?? {})) add(r as Resource, n!, 'Government & policies', x.name);

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
    add('faith', Math.round(followers / 10), 'Religion', `${faith.name} followers`);
    add('influence', Math.round(followers / 40), 'Religion', `${faith.name} followers`);
    if (working.length) lines.push(`${faith.name} spread ${spread}% in ${working.join(', ')}`);
  }

  // Upkeep
  for (const u of upkeepParts(e, t)) add('credits', -u.credits, 'Fleet upkeep', `${u.name} ×${u.count}`);

  // Famine: colonies that cannot eat produce less
  const famine = (e.stock.food ?? 0) + (income.food ?? 0) < 0;
  if (famine) lines.push('Famine: not enough food. Build farms; output cut by 20%');
  const factor = unrest * (famine ? 0.8 : 1);

  // Apply stability modifier to positive income
  for (const r of Object.keys(income) as Resource[]) {
    if (income[r]! <= 0) continue;
    const before = income[r]!;
    income[r] = Math.round(before * factor);
    if (income[r] !== before) ledger.push({ r, n: income[r]! - before, group: 'Adjustments', label: famine && unrest < 1 ? 'Famine and unrest' : famine ? 'Famine (−20%)' : unrest < 1 ? `Unrest (stability ${stability}%)` : `High stability (${stability}%)` });
  }
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
    // The store can only take so much, and cannot go below empty: those are items too.
    const lost = next - stock[r.id] - inc;
    if (lost) ledger.push({ r: r.id, n: lost, group: 'Adjustments', label: lost < 0 ? 'Storage full: turned away' : 'Ran out: not paid' });
    stock[r.id] = next;
  }
  if (full.length) lines.push(`Storage full: ${full.join(', ')}. Spend it, or build Warehouses`);

  // Research: science into focus (or the next step on the way to it), espionage into alien tech
  let res = research;
  const science = sciencePerTurn(e, t, research);
  let focus = e.focus;
  if (focus) {
    // Shards go where they can land: the focus, or the next unfinished prerequisite on its path; what
    // one node cannot hold flows on to the next, and full nodes research themselves (choices aside).
    let left = science;
    const fed = new Map<string, number>();
    for (let guard = 0; left > 0 && guard < 12; guard++) {
      res = autoResearch(res, t, lines);
      const target = t.tree.scienceTarget(res, focus);
      if (!target) break;
      const before = t.tree.shardsOf(res, target);
      res = t.tree.grantShards(res, target, 'science', left);
      const given = t.tree.shardsOf(res, target) - before;
      if (!given) break;
      fed.set(target, (fed.get(target) ?? 0) + given);
      left -= given;
    }
    res = autoResearch(res, t, lines);
    const goal = t.tree.node(focus).name;
    for (const [id, n] of fed) lines.push(id === focus ? `Science: +${n} shards to ${goal}` : `Science: +${n} shards to ${t.tree.node(id).name}, on the way to ${goal}`);
    if (res.researched.includes(focus)) {
      lines.push(`${goal} researched: pick a new research focus`);
      focus = null;
    } else if (!fed.size) {
      const ready = t.tree.canResearch(res, focus) ? goal : null;
      lines.push(ready ? `Science idle: ${ready} is ready. Research it to choose it` : `Science idle: nothing on the way to ${goal} can take shards yet`);
    }
  } else {
    lines.push('Science idle: pick a research focus');
  }
  const espionage = 3 + bonusOf(t.tree, research, 'espionage');
  for (const target of e.spyNetworks) {
    if (!reached(target)) { lines.push(`Spy network in ${target} dark: no ship in their space`); continue; }
    const pool = (presence?.techOf?.[target] ?? t.alienTech[target] ?? []).filter((id) => !res.researched.includes(id));
    if (!pool.length) continue;
    const rng = new Rng(hashSeed(turn, 'spy', target));
    const nodeId = rng.pick(pool);
    res = t.tree.grantShards(res, nodeId, 'espionage', espionage);
    lines.push(`Spies in ${target} stole ${espionage} shards of ${t.tree.node(nodeId).name}`);
  }

  // Population: each world grows from its own food surplus; a shortfall is fed from the stores,
  // and only what the stores cannot cover makes it shrink.
  const colonies = populationYear(e, t, income.food ?? 0, lines);

  res = autoResearch(res, t, lines);
  return { economy: { ...e, stock, faith, colonies, focus }, research: res, report: { income, lines, science, ledger }, mined };
}

/**
 * One year of every colony's population. Each world's own food balance drives it; when the empire's
 * stores plus this year's food cannot cover every shortfall, the gap is shared among the hungry
 * worlds in proportion to their shortfall.
 */
function populationYear(e: EconomyState, t: EconomyTables, foodIncome: number, lines: string[]): Colony[] {
  const balances = e.colonies.map((c) => colonyYield(c, t).income.food ?? 0);
  const gap = Math.max(0, -((e.stock.food ?? 0) + foodIncome));
  const short = balances.reduce((n, b) => n + Math.max(0, -b), 0);
  let changed = false;
  const out = e.colonies.map((c, i) => {
    const uncovered = gap > 0 && balances[i] < 0 ? Math.min(-balances[i], (gap * -balances[i]) / short) : 0;
    const r = growWorld(c, balances[i], uncovered);
    if (r.colony !== c) changed = true;
    if (r.change > 0) lines.push(`${c.name} grew to population ${r.colony.pop}`);
    if (r.change < 0) lines.push(`${c.name} is starving: population fell to ${r.colony.pop}. Build farms there, or more food elsewhere`);
    return r.colony;
  });
  return changed ? out : (e.colonies as Colony[]);
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

/** Research every full node that is not a choice; report each. */
function autoResearch(res: ResearchState, t: EconomyTables, lines: string[]): ResearchState {
  for (let ids = t.tree.autoResearchable(res); ids.length; ids = t.tree.autoResearchable(res)) {
    for (const id of ids) {
      res = t.tree.research(res, id);
      lines.push(`Researched ${t.tree.node(id).name}`);
    }
  }
  return res;
}

/** A one-off change to the stores outside the yearly economy: a purchase, a sale, loot, plunder. */
export interface Flow {
  readonly turn: number;
  readonly r: Resource;
  readonly n: number;
  /** What caused it, e.g. "Built a Lancer". */
  readonly what: string;
}

/** How many recent flows a save keeps. */
export const FLOW_LOG = 60;
