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
  });

  it('puts ore mined away from a friendly system into the fleet\'s hold, as far as it holds', () => {
    const e = econ({ colonies: [{ name: 'A', biome: 'barren' }] });
    const presence = (room: number) => ({ miners: [{ classId: 'prospector', count: 3, pool: 'p', fleet: 'f1' }], pools: { p: 10_000 }, holds: { f1: room }, reached: [] });
    const away = resolveTurn(e, EMPTY_RESEARCH, 1, tables, presence(10_000));
    const ore = away.held.f1?.metals ?? 0;
    expect(ore).toBeGreaterThan(0);
    expect(away.report.income.metals ?? 0).toBe(resolveTurn(e, EMPTY_RESEARCH, 1, tables, { miners: [], pools: {}, reached: [] }).report.income.metals ?? 0);
    expect(away.mined.p).toBe(ore);
    // A hold with room for 5 takes 5, and leaves the rest of the field.
    const tight = resolveTurn(e, EMPTY_RESEARCH, 1, tables, presence(5));
    expect(tight.held.f1?.metals).toBe(5);
    expect(tight.mined.p).toBe(5);
    const full = resolveTurn(e, EMPTY_RESEARCH, 1, tables, presence(0));
    expect(full.held.f1).toBeUndefined();
    expect(full.report.lines.some((l) => l.includes('hold is full'))).toBe(true);
  });

  it('caps nothing that is not stored: credits, influence and faith', () => {
    const capped = { ...tables, storage: STORAGE };
    const caps = capsOf({ colonies: [{ name: 'A', biome: 'barren', buildings: ['warehouse'] }] }, capped);
    expect(caps.credits).toBeUndefined();
    expect(caps.influence).toBeUndefined();
    expect(caps.faith).toBeUndefined();
    const rich = resolveTurn(econ({ colonies: [{ name: 'A', biome: 'barren' }], stock: { ...START_RESOURCES, credits: 1_000_000 } }), EMPTY_RESEARCH, 1, capped);
    expect(rich.economy.stock.credits).toBeGreaterThan(1_000_000 - 1000);
    expect(rich.report.lines.some((l) => l.startsWith('Storage full') && l.includes('Credits'))).toBe(false);
  });

  it('charges upkeep for every ship; conscription waives warships', () => {
    const t = { ...tables, upkeepOf: classUpkeep };
    expect(upkeepOf({ roster: { prospector: 3, lancer: 2, dreadnought: 1 }, policies: [] }, t)).toBe(3 + 4 + 8);
    expect(upkeepOf({ roster: { prospector: 3, lancer: 2 }, policies: ['conscription'] }, t)).toBe(3);
  });
});

describe('population and food', () => {
  const year = (e: EconomyState, n = 1) => { let s = e; for (let i = 0; i < n; i++) s = resolveTurn(s, EMPTY_RESEARCH, i, tables).economy; return s; };

  it('each point of population eats 2 food', () => {
    const one = colonyYield({ name: 'A', biome: 'terran', size: 4, pop: 1 }, tables).income.food!;
    const three = colonyYield({ name: 'A', biome: 'terran', size: 4, pop: 3 }, tables).income.food!;
    expect(one - three).toBe(4);
  });

  it('a world grows on its own surplus, and says so', () => {
    // A terran world with a farm makes 8 food; at population 1 it eats 2: +6 a year.
    const e = econ({ colonies: [{ name: 'Farmworld', biome: 'terran', size: 4, pop: 1, buildings: ['farm'] }] });
    const r = resolveTurn(year(e, 1), EMPTY_RESEARCH, 1, tables);
    expect(r.economy.colonies[0].pop).toBe(2);
    expect(r.report.lines).toContain('Farmworld grew to population 2');
  });

  it('a hungry world fed from the stores neither grows nor shrinks; with the stores empty it shrinks', () => {
    // Barren: no food of its own; population 3 eats 6.
    const hungry = { name: 'Rock', biome: 'barren', size: 4, pop: 3 };
    const fed = year(econ({ colonies: [hungry], stock: { ...START_RESOURCES, food: 500 } }), 10);
    expect(fed.colonies[0]).toMatchObject({ pop: 3 });
    expect(fed.colonies[0].growth ?? 0).toBe(0);
    const starved = year(econ({ colonies: [hungry], stock: { ...START_RESOURCES, food: 0 } }), 1);
    expect(starved.colonies[0].pop).toBe(2);
  });

  it('when the stores run dry, the most populous world starves first', () => {
    // Two barren worlds eat 12; the stores hold 4, so 8 go without: all of it on the bigger world,
    // which eats 8.
    const colonies = [{ name: 'Small', biome: 'barren', size: 6, pop: 2 }, { name: 'Big', biome: 'barren', size: 6, pop: 4 }];
    const r = year(econ({ colonies, stock: { ...START_RESOURCES, food: 4 } }), 1);
    expect(r.colonies.find((c) => c.name === 'Big')!.pop).toBe(3);
    expect(r.colonies.find((c) => c.name === 'Small')!.pop).toBe(2);
  });

  it('another world\'s surplus keeps a hungry world from shrinking, but does not make it grow', () => {
    const colonies = [{ name: 'Rock', biome: 'barren', size: 4, pop: 2 }, { name: 'Farm', biome: 'terran', size: 6, pop: 1, buildings: ['farm', 'farm'] }];
    const e = year(econ({ colonies, stock: { ...START_RESOURCES, food: 0 } }), 6);
    expect(e.colonies[0].pop).toBe(2);
    expect(e.colonies[1].pop).toBeGreaterThan(1);
  });
});
