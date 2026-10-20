import { describe, expect, it } from 'vitest';
import { BUILDINGS } from '../../content/buildings';
import { SHARD_SOURCES } from '../../content/shardSources';
import { TECH_NODES } from '../../content/techTree';
import { FOCI } from '../../content/governor';
import { TechTree } from '../research/TechTree';
import { buildingScore, pickBuilding, pickResearch, type SiteContext } from './Governor';

const site: SiteContext = { biomeYields: { metals: 4, crystals: 2 }, buildings: [], foodIncome: 10, nearlyFull: 0 };
const all = () => true;

describe('the governor picks buildings for its focus', () => {
  it('a lab for science, a mine on a mineral world for industry, a trade hub for wealth, a farm for growth', () => {
    expect(pickBuilding(BUILDINGS, 'science', site, all)?.id).toBe('lab');
    expect(pickBuilding(BUILDINGS, 'industry', site, all)?.id).toBe('mine');
    expect(pickBuilding(BUILDINGS, 'wealth', site, all)?.id).toBe('trade-hub');
    expect(pickBuilding(BUILDINGS, 'growth', site, all)?.id).toBe('farm');
  });

  it('builds food first when the empire is short of it, whatever the focus', () => {
    expect(pickBuilding(BUILDINGS, 'science', { ...site, foodIncome: -3 }, all)?.id).toBe('farm');
  });

  it('never builds a shipyard, nor what it cannot build', () => {
    expect(buildingScore(BUILDINGS.find((b) => b.id === 'shipyard')!, 'industry', site)).toBe(0);
    expect(pickBuilding(BUILDINGS, 'science', site, (b) => b.id !== 'lab')?.id).not.toBe('lab');
    expect(pickBuilding(BUILDINGS, 'science', site, () => false)).toBeNull();
  });

  it('prefers variety: each copy a colony has makes another worth less', () => {
    const lab = BUILDINGS.find((b) => b.id === 'lab')!;
    expect(buildingScore(lab, 'science', { ...site, buildings: ['lab', 'lab'] })).toBeLessThan(buildingScore(lab, 'science', site));
  });

  it('values warehouses when stores are filling up', () => {
    const wh = BUILDINGS.find((b) => b.id === 'warehouse')!;
    expect(buildingScore(wh, 'balanced', site)).toBe(0);
    expect(buildingScore(wh, 'balanced', { ...site, nearlyFull: 3 })).toBeGreaterThan(0);
  });
});

describe('the governor picks research', () => {
  const tree = new TechTree(TECH_NODES, SHARD_SOURCES);
  const state = { shards: {}, researched: TECH_NODES.filter((n) => n.tier <= 1).map((n) => n.id) };

  it('an open node with a bonus the focus looks for, never a locked or exclusive one', () => {
    for (const f of Object.keys(FOCI) as Array<keyof typeof FOCI>) {
      const id = pickResearch(tree, state, f);
      expect(id).toBeTruthy();
      const n = tree.node(id!);
      expect(state.researched).not.toContain(id);
      expect(tree.prerequisitesMet(state, id!)).toBe(true);
      expect(n.exclusiveGroup).toBeUndefined();
    }
    const sci = tree.node(pickResearch(tree, state, 'science')!);
    expect(sci.grants.some((g) => g.kind === 'bonus' && FOCI.science.stats.includes(g.stat))).toBe(true);
  });

  it('nothing when everything is researched', () => {
    expect(pickResearch(tree, { shards: {}, researched: TECH_NODES.map((n) => n.id) }, 'balanced')).toBeNull();
  });
});
