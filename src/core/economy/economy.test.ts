import { describe, expect, it } from 'vitest';
import { BUILDINGS, STORAGE } from '../../content/buildings';
import { upkeepOf as classUpkeep } from '../../content/logistics';
import { START_RESOURCES } from '../../content/resources';
import { SHARD_SOURCES } from '../../content/shardSources';
import { SHIP_CLASSES } from '../../content/shipClasses';
import { GOVERNMENTS, POLICIES, TENETS } from '../../content/society';
import { TECH_NODES } from '../../content/techTree';
import { TechTree } from '../research/TechTree';
import { EMPTY_RESEARCH } from '../research/types';
import { capsOf, colonyYield, EconomyState, EconomyTables, FOOD_PER_COLONY, resolveTurn, upkeepOf } from './Economy';

const tables: EconomyTables = {
  tree: new TechTree(TECH_NODES, SHARD_SOURCES), classes: SHIP_CLASSES, governments: GOVERNMENTS, policies: POLICIES, tenets: TENETS,
  alienTech: { Vossk: ['t-lasers'] }, buildings: BUILDINGS,
};
const econ = (patch: Partial<EconomyState> = {}): EconomyState => ({
  stock: START_RESOURCES, roster: {}, government: 'council', policies: [], faith: null, spyNetworks: [], focus: null, colonies: [], ...patch,
});

describe('economy', () => {
  it('buildings add to a colony', () => {
    const bare = colonyYield({ name: 'A', biome: 'barren', size: 3 }, tables);
    const built = colonyYield({ name: 'A', biome: 'barren', size: 3, buildings: ['mine', 'farm', 'trade-hub', 'lab'] }, tables);
    expect(built.income.metals).toBe(bare.income.metals! * 2 + 2);
    expect(built.income.food).toBe(4 - FOOD_PER_COLONY);
    expect(built.income.credits).toBe(15);
    expect(built.science).toBe(4);
  });

  it('famine cuts output when colonies cannot eat', () => {
    const colonies = [{ name: 'A', biome: 'barren' }, { name: 'B', biome: 'barren' }];
    const fed = resolveTurn(econ({ colonies }), EMPTY_RESEARCH, 1, tables);
    const starving = resolveTurn(econ({ colonies, stock: { ...START_RESOURCES, food: 0 } }), EMPTY_RESEARCH, 1, tables);
    expect(starving.report.lines.some((l) => l.startsWith('Famine'))).toBe(true);
    expect(starving.report.income.metals!).toBeLessThan(fed.report.income.metals!);
  });

  it('mining ships only mine minerals present where they are', () => {
    const e = econ({ roster: { 'ice-cutter': 2 } });
    const onIce = resolveTurn(e, EMPTY_RESEARCH, 1, tables, { miners: [{ classId: 'ice-cutter', count: 2, deposits: ['gases', 'metals'] }], reached: [] });
    const offIce = resolveTurn(e, EMPTY_RESEARCH, 1, tables, { miners: [{ classId: 'ice-cutter', count: 2, deposits: ['metals'] }], reached: [] });
    expect(onIce.report.income.gases).toBeGreaterThan(0);
    expect(offIce.report.income.gases ?? 0).toBe(0);
    expect(offIce.report.lines.some((l) => l.includes('idle'))).toBe(true);
  });

  it('spies need a ship in the target empire', () => {
    const e = econ({ spyNetworks: ['Vossk'] });
    const away = resolveTurn(e, EMPTY_RESEARCH, 1, tables, { miners: [], reached: [] });
    const there = resolveTurn(e, EMPTY_RESEARCH, 1, tables, { miners: [], reached: ['Vossk'] });
    expect(away.research.shards['t-lasers'] ?? 0).toBe(0);
    expect(there.research.shards['t-lasers']).toBeGreaterThan(0);
  });

  it('stops income at the storage cap and keeps stock above it', () => {
    const capped = { ...tables, storage: STORAGE };
    const colonies = [{ name: 'A', biome: 'barren', buildings: ['mine'] }];
    const caps = capsOf({ colonies }, capped);
    const nearFull = resolveTurn(econ({ colonies, stock: { ...START_RESOURCES, metals: caps.metals! - 1 } }), EMPTY_RESEARCH, 1, capped);
    expect(nearFull.economy.stock.metals).toBe(caps.metals);
    expect(nearFull.report.lines.some((l) => l.startsWith('Storage full'))).toBe(true);
    const over = resolveTurn(econ({ colonies, stock: { ...START_RESOURCES, metals: caps.metals! + 500 } }), EMPTY_RESEARCH, 1, capped);
    expect(over.economy.stock.metals).toBe(caps.metals! + 500);
  });

  it('warehouses and colonies raise caps', () => {
    const capped = { ...tables, storage: STORAGE };
    const one = capsOf({ colonies: [{ name: 'A', biome: 'barren' }] }, capped);
    const two = capsOf({ colonies: [{ name: 'A', biome: 'barren', buildings: ['warehouse'] }, { name: 'B', biome: 'ice' }] }, capped);
    expect(two.metals! - one.metals!).toBe(STORAGE.perColony + 1000);
    expect(two.credits! - one.credits!).toBe(STORAGE.creditsPerColony);
  });

  it('charges upkeep for every ship; conscription waives warships', () => {
    const t = { ...tables, upkeepOf: classUpkeep };
    expect(upkeepOf({ roster: { prospector: 3, lancer: 2, dreadnought: 1 }, policies: [] }, t)).toBe(3 + 4 + 8);
    expect(upkeepOf({ roster: { prospector: 3, lancer: 2 }, policies: ['conscription'] }, t)).toBe(3);
  });
});
