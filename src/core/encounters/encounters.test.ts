import { describe, expect, it } from 'vitest';
import { DEFAULT_LOOT_TABLES } from '../../content/lootTables';
import { SHARD_SOURCES } from '../../content/shardSources';
import { TECH_NODES } from '../../content/techTree';
import { newEmpire } from '../empire/Empire';
import type { Planet } from '../galaxy/Planets';
import { TechTree } from '../research/TechTree';
import { EncounterResolver, applyCard, applyCost, applyCrate } from './Encounters';

const tree = new TechTree(TECH_NODES, SHARD_SOURCES);
const resolver = new EncounterResolver(DEFAULT_LOOT_TABLES, tree);
const planet = (i: number): Planet => ({ id: `p/${i}`, starId: 'p', index: i, name: `Test ${i}`, biome: 'ice', size: 2 });

describe('encounters', () => {
  it('replays identically for the same inputs', () => {
    const e = newEmpire('A');
    for (let i = 0; i < 20; i++) expect(resolver.resolve(1, planet(i), e)).toEqual(resolver.resolve(1, planet(i), e));
  });

  it('failures carry a cost and no crate; successes carry cards', () => {
    const results = Array.from({ length: 80 }, (_, i) => resolver.resolve(5, planet(i), newEmpire('A')));
    const fail = results.find((r) => !r.success)!;
    const win = results.find((r) => r.success)!;
    expect(fail.cost).not.toBeNull();
    expect(fail.crate).toBeNull();
    expect(win.crate!.cards.length).toBeGreaterThan(0);
    const weakened = applyCost(newEmpire('A'), fail);
    expect(weakened.fleetPower).toBeLessThan(newEmpire('A').fleetPower);
  });

  it('shard cards add to node progress, even for unconnected nodes', () => {
    const e = applyCard(newEmpire('A'), { type: 'shards', rarity: 'rare', nodeId: 't-lasers', amount: 12 }, tree);
    expect(tree.shardsOf(e.research, 't-lasers')).toBe(12);
  });

  it('applying a crate applies every card', () => {
    const e0 = newEmpire('A');
    const e1 = applyCrate(e0, { tier: 'rare', cards: [
      { type: 'materials', rarity: 'common', material: 'metals', amount: 40 },
      { type: 'part', rarity: 'rare', id: 'tractor-beam' },
    ] }, tree);
    expect(e1.materials.metals).toBe(e0.materials.metals + 40);
    expect(e1.parts).toContain('tractor-beam');
  });
});
