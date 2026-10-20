import type { BuildingDef } from '../../content/buildings';
import { FOCI, FOOD_FLOOR, type GovernorFocus } from '../../content/governor';
import type { Resource } from '../../content/resources';
import type { TechTree } from '../research/TechTree';
import type { ResearchState } from '../research/types';

/**
 * The empire governor (change empire-governor): pure choices of what to build in a colony's free
 * slot and what to research next, scored from the content tables with the focus's weights. The
 * server and the browser make the same choices.
 */
export interface GovernorState {
  readonly focus: GovernorFocus;
  /** Start the best building in every colony with a free slot and nothing under construction. */
  readonly build: boolean;
  /** Set a research focus whenever none is set. */
  readonly research: boolean;
  /** Credits the governor never spends below. */
  readonly reserve: number;
}

/** What a building choice needs to know about the colony and the empire. */
export interface SiteContext {
  /** The colony's world's own yields (a Deep Mine copies its minerals). */
  readonly biomeYields: Readonly<Partial<Record<Resource, number>>>;
  /** Buildings it has and has queued. */
  readonly buildings: readonly string[];
  /** The empire's food income a year: below the floor, food comes first. */
  readonly foodIncome: number;
  /** Resources at 80% or more of their storage cap: a Warehouse is worth more. */
  readonly nearlyFull: number;
}

const MINERALS: readonly Resource[] = ['metals', 'gases', 'crystals'];

/** How much a building is worth to a focus on a colony (0 or less: never built). */
export function buildingScore(b: BuildingDef, focus: GovernorFocus, site: SiteContext): number {
  if (b.shipyard) return 0;
  if (b.unique && site.buildings.includes(b.id)) return 0;
  const w = FOCI[focus].weights;
  const hungry = site.foodIncome < FOOD_FLOOR;
  const worth = (r: Resource, n: number) => n * ((w[r] ?? 0) + (hungry && r === 'food' ? 10 : 0));
  let score = 0;
  for (const [r, n] of Object.entries(b.yields ?? {})) score += worth(r as Resource, n ?? 0);
  if (b.mineralBoost) for (const r of MINERALS) score += worth(r, (site.biomeYields[r] ?? 0) * b.mineralBoost);
  score += (b.science ?? 0) * w.science;
  if (b.storage) score += site.nearlyFull * 3;
  // Variety: each one the colony already has makes another worth less.
  const same = site.buildings.filter((x) => x === b.id).length;
  return score * 0.7 ** same;
}

/**
 * The building to start on a colony: the best for the focus among those unlocked and affordable
 * (keeping the reserve), or null when nothing is worth building.
 */
export function pickBuilding(
  buildings: readonly BuildingDef[], focus: GovernorFocus, site: SiteContext,
  can: (b: BuildingDef) => boolean,
): BuildingDef | null {
  let best: BuildingDef | null = null, score = 0;
  for (const b of buildings) {
    const s = buildingScore(b, focus, site);
    if (s > score && can(b)) { best = b; score = s; }
  }
  return best;
}

/**
 * The next research for a focus: the open node (prerequisites met, not a choice) whose bonuses the
 * focus looks for, cheapest first; else the cheapest open node.
 */
export function pickResearch(tree: TechTree, state: ResearchState, focus: GovernorFocus): string | null {
  const open = tree.nodes.filter((n) => !state.researched.includes(n.id) && !n.exclusiveGroup && !n.analogOf
    && !tree.isLocked(state, n.id) && tree.prerequisitesMet(state, n.id));
  if (!open.length) return null;
  const stats = FOCI[focus].stats;
  const left = (id: string) => tree.node(id).shards - tree.shardsOf(state, id);
  const byCost = (a: { id: string }, b: { id: string }) => left(a.id) - left(b.id) || (a.id < b.id ? -1 : 1);
  const wanted = open.filter((n) => n.grants.some((g) => g.kind === 'bonus' && stats.includes(g.stat))).sort(byCost);
  return (wanted[0] ?? [...open].sort(byCost)[0]).id;
}
