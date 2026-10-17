import { describe, expect, it } from 'vitest';
import { DEFAULT_LOOT_TABLES } from '../content/lootTables';
import { BUILDINGS, STORAGE } from '../content/buildings';
import { upkeepOf } from '../content/logistics';
import { SHARD_SOURCES } from '../content/shardSources';
import { SHIP_CLASSES } from '../content/shipClasses';
import { GOVERNMENTS, POLICIES, TENETS } from '../content/society';
import { ALIEN_TECH, TECH_NODES } from '../content/techTree';
import { EncounterResolver } from '../core/encounters/Encounters';
import { goodsPrice, MAX_TRADE_DISTANCE, saleValue } from '../core/economy/Trade';
import { GalaxyModel } from '../core/galaxy/GalaxyModel';
import { hexDistance } from '../core/hex/Hex';
import { TechTree } from '../core/research/TechTree';
import type { GameState } from '../app/GameState';
import { SaveGame, upgradeSave, type SavedGame } from '../app/SaveGame';
import { Store } from '../app/Store';
import { createWorld } from '../app/World';
import { EmpireSim } from './EmpireSim';
import { newEmpireState } from './newEmpireState';

const galaxy = new GalaxyModel();
const tree = new TechTree(TECH_NODES, SHARD_SOURCES);
const world = createWorld(galaxy, '123456789012345678');
const T = 5_000;

function sim(patch: (s: GameState) => Partial<GameState> = () => ({})) {
  const base = newEmpireState({ galaxy, tree, world, playerName: 'Ruben', t0: T });
  const store = new Store<GameState>({ ...base, ...patch(base) });
  const economy = { tree, classes: SHIP_CLASSES, governments: GOVERNMENTS, policies: POLICIES, tenets: TENETS, alienTech: ALIEN_TECH, buildings: BUILDINGS, storage: STORAGE, upkeepOf };
  return { store, sim: new EmpireSim({ store, galaxy, tree, encounters: new EncounterResolver(DEFAULT_LOOT_TABLES, tree), world, economy }) };
}

describe('trade goods', () => {
  it('sell for more the farther they travel, and more abroad than at home', () => {
    expect(goodsPrice(40, 'own')).toBeGreaterThan(goodsPrice(10, 'own'));
    expect(goodsPrice(20, 'npc')).toBeGreaterThan(goodsPrice(20, 'own'));
    expect(goodsPrice(20, 'player')).toBeGreaterThan(goodsPrice(20, 'npc'));
    expect(goodsPrice(5_000, 'own')).toBe(goodsPrice(MAX_TRADE_DISTANCE, 'own'));
    expect(saleValue(50, 20, 'own', 10)).toBe(Math.round(50 * goodsPrice(20, 'own') * 1.1));
  });

  it('living colonies make goods, and Manufactories make more', () => {
    const { sim: a } = sim();
    a.skipYear();
    expect(a.state.lastReport!.income.goods).toBeGreaterThan(0);
    const { sim: b } = sim((s) => ({ economy: { ...s.economy, colonies: s.economy.colonies.map((c) => (c.capital ? { ...c, buildings: [...(c.buildings ?? []), 'manufactory'] } : c)) } }));
    b.skipYear();
    expect(b.state.lastReport!.income.goods).toBeGreaterThanOrEqual(a.state.lastReport!.income.goods! + 4);
  });

  it('a trade run loads goods at home, sells them at a foreign market, and comes back for more', () => {
    const { sim: s } = sim((st) => ({ empire: { ...st.empire, materials: { ...st.empire.materials, goods: 400 } } }));
    const market = s.markets().find((m) => m.kind !== 'own')!;
    const to = s.starById(market.starId)!;
    s.tradeRun('dock', to);
    const fleet = s.state.fleets.find((f) => s.state.loadouts[f.id]?.orders?.trade)!;
    expect(fleet).toBeTruthy();
    const loaded = s.state.loadouts[fleet.id];
    expect(loaded.cargo).toBe(50);
    expect(s.state.empire.materials.goods).toBe(350);
    const trip = hexDistance(s.state.home.hex, to.hex);
    s.advanceTo(T + trip + 2);
    const l = s.state.loadouts[fleet.id];
    const sold = s.state.dispatches.find((d) => d.text.includes('sold 50 trade goods'));
    expect(sold?.text).toContain(to.name);
    expect(l.cargo ?? 0).toBe(0);
    expect(sold!.text).toContain(`for ${s.saleValue(50, s.state.home, market)} credits`);
    expect(s.saleValue(50, s.state.home, market)).toBeGreaterThanOrEqual(saleValue(50, trip, market.kind));
    // Heading home for the next load.
    expect(fleet.id in s.state.loadouts && s.state.fleets.find((f) => f.id === fleet.id)!.movement.route.at(-1)).toEqual(s.state.home.hex);
  });

  it('cannot sell goods where they were loaded, or load away from your colonies', () => {
    const { sim: s } = sim((st) => ({ empire: { ...st.empire, materials: { ...st.empire.materials, goods: 100 } } }));
    s.formFleet([{ classId: 'bulk-freighter', count: 1 }], s.state.home);
    const id = s.state.fleets.at(-1)!.id;
    expect(s.loadGoods(id)).toBe(50);
    expect(s.sellGoods(id)).toBe(0);
    expect(s.state.loadouts[id].cargo).toBe(50);
  });

  it('stopping a run keeps the fleet and its cargo; docking returns the cargo to the stockpile', () => {
    const { sim: s } = sim((st) => ({ empire: { ...st.empire, materials: { ...st.empire.materials, goods: 100 } } }));
    const to = s.starById(s.markets().find((m) => m.kind !== 'own')!.starId)!;
    s.tradeRun('dock', to);
    const id = s.state.fleets.find((f) => s.state.loadouts[f.id]?.orders?.trade)!.id;
    s.tradeRun(id, null);
    expect(s.state.loadouts[id].orders?.trade).toBeUndefined();
    s.returnHome(id);
    s.dockFleet(id);
    expect(s.state.empire.materials.goods).toBe(100);
  });
});

describe('saves from before the three raw materials', () => {
  it('fold the old minerals into metals, gases and crystals, and drop trade routes', () => {
    const { store } = sim();
    const save = new SaveGame(galaxy.params.seed, null).snapshot(store.state) as unknown as SavedGame;
    const old = {
      ...save,
      economy: { ...save.economy, routes: [{ partnerId: 'Vossk' }] },
      empire: { ...save.empire, materials: { credits: 100, influence: 5, faith: 0, food: 10, metals: 50, volatiles: 20, ice: 30, crystals: 4, rareEarths: 6, exotics: 2, darkMatter: 1 } },
    } as unknown as SavedGame;
    const up = upgradeSave(old);
    expect(up.empire.materials).toEqual({ credits: 100, influence: 5, faith: 0, food: 10, goods: 0, metals: 50, gases: 50, crystals: 4 + 6 + 4 + 4 });
    expect('routes' in up.economy).toBe(false);
    expect(upgradeSave(up)).toBe(up);
  });
});
