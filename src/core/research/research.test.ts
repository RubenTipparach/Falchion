import { describe, expect, it } from 'vitest';
import { SHARD_SOURCES } from '../../content/shardSources';
import { TECH_NODES } from '../../content/techTree';
import { TechTree } from './TechTree';
import { EMPTY_RESEARCH, ResearchState } from './types';

const tree = new TechTree(TECH_NODES, SHARD_SOURCES);

/** Collect all shards with science and research, in order. */
function learn(state: ResearchState, ...ids: string[]): ResearchState {
  for (const id of ids) {
    state = tree.grantShards(state, id, 'science', tree.node(id).shards);
    state = tree.research(state, id);
  }
  return state;
}

describe('tech tree content', () => {
  it('is structurally valid', () => {
    expect(tree.validate()).toEqual([]);
  });
  it('has five branches with tier-1 roots', () => {
    const roots = TECH_NODES.filter((n) => n.tier === 1).map((n) => n.branch);
    expect(new Set(roots).size).toBe(5);
  });
});

describe('research rules', () => {
  it('requires prerequisites', () => {
    expect(tree.availability(EMPTY_RESEARCH, 'o-regeneration')).toBe('unavailable');
    const s = learn(EMPTY_RESEARCH, 'o-grown-hulls');
    expect(tree.availability(s, 'o-regeneration')).toBe('available');
  });

  it('exclusive choice locks the sibling and opens its analog', () => {
    let s = learn(EMPTY_RESEARCH, 'o-grown-hulls', 'o-regeneration');
    expect(tree.availability(s, 'o-parasitic')).toBe('locked');
    s = learn(s, 'o-predator');
    expect(tree.availability(s, 'o-symbiosis')).toBe('locked');
    expect(tree.availability(s, 'o-parasitic')).toBe('available');
    expect(tree.availability(s, 'o-scavenger')).toBe('locked');
  });

  it('Hive Mind crossover from organic opens technological capstone', () => {
    let s = learn(EMPTY_RESEARCH, 'o-grown-hulls', 'o-spore-drive', 'o-neural-lattice');
    expect(tree.availability(s, 't-swarm-drones')).toBe('unavailable');
    s = learn(s, 'x-hive-mind');
    expect(tree.availability(s, 't-swarm-drones')).toBe('available');
    expect(tree.branchesReached(s)).toContain('technological');
    expect(tree.traitsOf(s)).toContain('hive-mind');
  });

  it('Hive Mind is also reachable from the technological side', () => {
    const s = learn(EMPTY_RESEARCH, 't-alloys', 't-lasers', 't-distributed-ai');
    expect(tree.availability(s, 'x-hive-mind')).toBe('available');
  });
});

describe('shards', () => {
  it('node is researchable only with all shards', () => {
    let s = tree.grantShards(EMPTY_RESEARCH, 't-alloys', 'science', 9);
    expect(tree.availability(s, 't-alloys')).toBe('available');
    expect(tree.progress(s, 't-alloys')).toBeCloseTo(0.9);
    s = tree.grantShards(s, 't-alloys', 'science', 5);
    expect(tree.shardsOf(s, 't-alloys')).toBe(10);
    expect(tree.canResearch(s, 't-alloys')).toBe(true);
  });

  it('science cannot reach unconnected nodes but espionage can', () => {
    const viaScience = tree.grantShards(EMPTY_RESEARCH, 't-lasers', 'science', 50);
    expect(tree.shardsOf(viaScience, 't-lasers')).toBe(0);
    const viaSpy = tree.grantShards(EMPTY_RESEARCH, 't-lasers', 'espionage', 50);
    expect(tree.shardsOf(viaSpy, 't-lasers')).toBe(50);
    expect(tree.availability(viaSpy, 't-lasers')).toBe('unavailable');
  });

  it('locked nodes keep shards but stay unresearchable', () => {
    let s = learn(EMPTY_RESEARCH, 't-alloys', 't-fusion');
    s = tree.grantShards(s, 't-armor', 'reverse-engineering', 100);
    s = learn(s, 't-shields');
    expect(tree.shardsOf(s, 't-armor')).toBe(100);
    expect(tree.canResearch(s, 't-armor')).toBe(false);
    expect(() => tree.research(s, 't-armor')).toThrow();
  });
});
