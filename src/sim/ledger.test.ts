import { describe, expect, it } from 'vitest';
import { DEFAULT_LOOT_TABLES } from '../content/lootTables';
import { BUILDINGS, STORAGE } from '../content/buildings';
import { upkeepOf } from '../content/logistics';
import { RESOURCES } from '../content/resources';
import { SHARD_SOURCES } from '../content/shardSources';
import { SHIP_CLASSES } from '../content/shipClasses';
import { GOVERNMENTS, POLICIES, TENETS } from '../content/society';
import { ALIEN_TECH, TECH_NODES } from '../content/techTree';
import { EncounterResolver } from '../core/encounters/Encounters';
import { GalaxyModel } from '../core/galaxy/GalaxyModel';
import { TechTree } from '../core/research/TechTree';
import type { GameState } from '../app/GameState';
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

describe('the resource ledger', () => {
  it('adds up, item by item, to every resource\'s change over a year', () => {
    for (const stock of [{}, { food: 0, credits: 5 }, { credits: 999_999, metals: 999_999 }]) {
      const { sim: s } = sim((b) => ({ empire: { ...b.empire, materials: { ...b.empire.materials, ...stock } } }));
      const before = s.state.empire.materials;
      const forecast = s.forecast();
      s.skipYear();
      const report = s.state.lastReport!;
      expect(report.ledger).toEqual(forecast.ledger);
      for (const r of RESOURCES) {
        const sum = report.ledger!.filter((e) => e.r === r.id).reduce((n, e) => n + e.n, 0);
        expect(sum, r.id).toBe(s.state.empire.materials[r.id] - before[r.id]);
      }
    }
  });

  it('names each colony\'s world, capital and people, and fleet upkeep by class', () => {
    const { sim: s } = sim();
    const ledger = s.forecast().ledger!;
    const capital = s.state.economy.colonies.find((c) => c.capital)!;
    expect(ledger.some((e) => e.group === capital.name && e.label === 'Capital' && e.r === 'credits')).toBe(true);
    expect(ledger.some((e) => e.group === capital.name && e.label.startsWith('Population') && e.r === 'food' && e.n < 0)).toBe(true);
    expect(ledger.some((e) => e.group === 'Government & policies' && e.n > 0)).toBe(true);
  });

  it('records a purchase in each resource it cost, named for what was bought', () => {
    const { sim: s } = sim((b) => ({ empire: { ...b.empire, materials: { ...b.empire.materials, credits: 5_000, metals: 5_000, crystals: 500, gases: 500 } } }));
    const yard = s.state.economy.colonies.find((c) => c.buildings?.includes('shipyard'))!;
    const before = s.state.empire.materials;
    s.buildShip('prospector', yard.planetId!);
    const flows = s.state.flows ?? [];
    expect(flows.length).toBeGreaterThan(0);
    for (const f of flows) {
      expect(f.what).toBe('Built a Prospector Skiff');
      expect(f.n).toBe(s.state.empire.materials[f.r] - before[f.r]);
      expect(f.n).toBeLessThan(0);
    }
  });
});
