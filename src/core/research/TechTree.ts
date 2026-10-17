import type { Availability, BranchId, Grant, ResearchState, ShardSourceDef, TechNode } from './types';

export class ResearchError extends Error {}

/** Rules for a tech tree. Stateless: every method takes and returns plain ResearchState. */
export class TechTree {
  private readonly byId: ReadonlyMap<string, TechNode>;
  private readonly sources: ReadonlyMap<string, ShardSourceDef>;

  constructor(readonly nodes: readonly TechNode[], sources: readonly ShardSourceDef[]) {
    this.byId = new Map(nodes.map((n) => [n.id, n]));
    this.sources = new Map(sources.map((s) => [s.id, s]));
  }

  node(id: string): TechNode {
    const n = this.byId.get(id);
    if (!n) throw new ResearchError(`Unknown tech node: ${id}`);
    return n;
  }

  /** Nodes excluded by a researched member of the same exclusive group. */
  isExcluded(state: ResearchState, id: string): boolean {
    const n = this.node(id);
    if (!n.exclusiveGroup || state.researched.includes(id)) return false;
    return state.researched.some((r) => r !== id && this.node(r).exclusiveGroup === n.exclusiveGroup);
  }

  /** Locked = excluded, or an analog whose original is not (yet) excluded. */
  isLocked(state: ResearchState, id: string): boolean {
    const n = this.node(id);
    if (this.isExcluded(state, id)) return true;
    return n.analogOf !== undefined && !this.isExcluded(state, n.analogOf);
  }

  prerequisitesMet(state: ResearchState, id: string): boolean {
    const n = this.node(id);
    const has = (r: string) => state.researched.includes(r);
    return n.requires.every(has) && (!n.requiresAny?.length || n.requiresAny.some(has));
  }

  shardsOf(state: ResearchState, id: string): number {
    return state.shards[id] ?? 0;
  }

  progress(state: ResearchState, id: string): number {
    return Math.min(1, this.shardsOf(state, id) / this.node(id).shards);
  }

  availability(state: ResearchState, id: string): Availability {
    if (state.researched.includes(id)) return 'researched';
    if (this.isLocked(state, id)) return 'locked';
    if (!this.prerequisitesMet(state, id)) return 'unavailable';
    return this.shardsOf(state, id) >= this.node(id).shards ? 'researchable' : 'available';
  }

  canResearch(state: ResearchState, id: string): boolean {
    return this.availability(state, id) === 'researchable';
  }

  research(state: ResearchState, id: string): ResearchState {
    if (!this.canResearch(state, id)) {
      throw new ResearchError(`Cannot research ${id}: ${this.availability(state, id)}`);
    }
    return { ...state, researched: [...state.researched, id] };
  }

  /** Can this source grant shards for this node right now? */
  canReceive(state: ResearchState, id: string, sourceId: string): boolean {
    const source = this.sources.get(sourceId);
    if (!source) throw new ResearchError(`Unknown shard source: ${sourceId}`);
    if (state.researched.includes(id)) return false;
    return source.reachesUnconnected || (this.prerequisitesMet(state, id) && !this.isLocked(state, id));
  }

  /** Adds shards (capped at the requirement). Returns state unchanged if the source can't reach the node. */
  grantShards(state: ResearchState, id: string, sourceId: string, amount: number): ResearchState {
    if (!Number.isInteger(amount) || amount < 0) throw new ResearchError('Shard amount must be a non-negative integer');
    if (!this.canReceive(state, id, sourceId)) return state;
    const next = Math.min(this.node(id).shards, this.shardsOf(state, id) + amount);
    return { ...state, shards: { ...state.shards, [id]: next } };
  }

  /** All grants from researched nodes, in research order. */
  grantsOf(state: ResearchState): Grant[] {
    return state.researched.flatMap((id) => this.node(id).grants);
  }

  traitsOf(state: ResearchState): string[] {
    const out = new Set<string>();
    for (const g of this.grantsOf(state)) if (g.kind === 'trait') out.add(g.id);
    return [...out].sort();
  }

  /** Branches the empire has a foothold in (researched any node, or crossed into). */
  branchesReached(state: ResearchState): BranchId[] {
    const out = new Set<BranchId>();
    for (const id of state.researched) {
      const n = this.node(id);
      out.add(n.branch);
      n.crossover?.forEach((b) => out.add(b));
    }
    return [...out];
  }

  /** Structural problems in the content data (empty = valid). */
  validate(): string[] {
    const errors: string[] = [];
    for (const n of this.nodes) {
      for (const r of [...n.requires, ...(n.requiresAny ?? [])]) {
        if (!this.byId.has(r)) errors.push(`${n.id} requires unknown ${r}`);
      }
      if (n.analogOf) {
        const orig = this.byId.get(n.analogOf);
        if (!orig) errors.push(`${n.id} is analog of unknown ${n.analogOf}`);
        else if (!orig.exclusiveGroup) errors.push(`${n.id} is analog of ${n.analogOf}, which can never be locked`);
      }
      if (n.crossover && n.crossover.length < 2) errors.push(`${n.id} crossover must link 2+ branches`);
      if (!Number.isInteger(n.shards) || n.shards <= 0) errors.push(`${n.id} has invalid shard count`);
    }
    // Cycle detection over requires ∪ requiresAny.
    const state = new Map<string, 0 | 1 | 2>();
    const visit = (id: string, path: string[]): void => {
      if (state.get(id) === 2) return;
      if (state.get(id) === 1) { errors.push(`cycle: ${[...path, id].join(' -> ')}`); return; }
      state.set(id, 1);
      const n = this.byId.get(id);
      n && [...n.requires, ...(n.requiresAny ?? [])].forEach((r) => visit(r, [...path, id]));
      state.set(id, 2);
    };
    this.nodes.forEach((n) => visit(n.id, []));
    return errors;
  }
}
