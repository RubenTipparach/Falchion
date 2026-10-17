export type BranchId = 'organic' | 'technological' | 'utilitarian' | 'geometric' | 'aesthetic';
export type DomainId = 'hulls' | 'weapons' | 'defense' | 'industry' | 'society' | 'intel' | 'colonies';

export type Grant =
  | { readonly kind: 'trait'; readonly id: string }
  /** A ship style the empire may build in and mix into its designs. */
  | { readonly kind: 'style'; readonly id: string }
  | { readonly kind: 'chassis'; readonly id: string }
  | { readonly kind: 'part'; readonly id: string }
  | { readonly kind: 'biome'; readonly id: string }
  | { readonly kind: 'bonus'; readonly stat: string; readonly amount: number };

export interface TechNode {
  readonly id: string;
  readonly name: string;
  readonly branch: BranchId;
  /** Research area the node belongs to (hulls, weapons, society…). */
  readonly domain: DomainId;
  readonly tier: number;
  /** Whole shards needed (e.g. 10, 100, 500). */
  readonly shards: number;
  /** All of these must be researched. */
  readonly requires: readonly string[];
  /** At least one of these must be researched (crossover entry points). */
  readonly requiresAny?: readonly string[];
  /** Researching one member locks the rest of the group. */
  readonly exclusiveGroup?: string;
  /** This node only becomes available when `analogOf` is locked. */
  readonly analogOf?: string;
  /** Branches a crossover node links together. */
  readonly crossover?: readonly BranchId[];
  readonly grants: readonly Grant[];
  readonly description: string;
}

export interface BranchDef {
  readonly id: BranchId;
  readonly name: string;
  readonly color: string;
}

export interface DomainDef {
  readonly id: DomainId;
  readonly name: string;
  readonly blurb: string;
}

export type Availability =
  | 'researched'
  | 'researchable' // connected and all shards collected
  | 'available' // connected, collecting shards
  | 'unavailable' // prerequisites unmet (shards still collectable from some sources)
  | 'locked'; // excluded by an exclusive choice, or analog not yet opened

/** Plain, serialisable research progress for one empire. */
export interface ResearchState {
  readonly shards: Readonly<Record<string, number>>;
  readonly researched: readonly string[];
}

export const EMPTY_RESEARCH: ResearchState = { shards: {}, researched: [] };

export interface ShardSourceDef {
  readonly id: string;
  readonly name: string;
  /** May grant shards for nodes whose prerequisites are unmet. */
  readonly reachesUnconnected: boolean;
}
