import { describe, expect, it } from 'vitest';
import { DEFAULT_LOOT_TABLES } from '../content/lootTables';
import { BUILDINGS, STORAGE } from '../content/buildings';
import { upkeepOf } from '../content/logistics';
import { SHARD_SOURCES } from '../content/shardSources';
import { SHIP_CLASSES } from '../content/shipClasses';
import { GOVERNMENTS, POLICIES, TENETS } from '../content/society';
import { ALIEN_TECH, TECH_NODES } from '../content/techTree';
import { EncounterResolver } from '../core/encounters/Encounters';
import { GalaxyModel } from '../core/galaxy/GalaxyModel';
import { TechTree } from '../core/research/TechTree';
import type { GameState } from '../app/GameState';
import { SaveGame } from '../app/SaveGame';
import { Store } from '../app/Store';
import { createWorld, tradePartners } from '../app/World';
import { EmpireSim } from './EmpireSim';
import { advanceSave } from './headless';
import { newEmpireState } from './newEmpireState';

const ID = '123456789012345678';
const galaxy = new GalaxyModel();
const tree = new TechTree(TECH_NODES, SHARD_SOURCES);
const world = createWorld(galaxy, ID);
const partners = tradePartners(world, world.home);

function freshSave(t0: number, patch: Partial<GameState> = {}) {
  const state = { ...newEmpireState({ galaxy, tree, world, partners, playerName: 'Ruben', t0 }), ...patch };
  const save = new SaveGame(galaxy.params.seed, null).snapshot(state);
  delete save.tab;
  return { state, save };
}

describe('the server plays empires forward while their owners are away', () => {
  it('advances the economy, research and fleets to the world year', () => {
    const { save } = freshSave(1_000);
    const r = advanceSave(save, { id: ID, name: 'Ruben' }, 1_030)!;
    expect(r.years).toBe(30);
    expect(r.save.turn).toBe(1_030);
    const before = (save.empire as GameState['empire']).materials, after = (r.save.empire as GameState['empire']).materials;
    expect(after.credits).not.toBe(before.credits);
    expect((r.save.dispatches as GameState['dispatches']).length).toBeGreaterThan(1);
    // What other players see: the home system and the empire's fleets.
    expect(r.public.home).toEqual(world.home.hex);
    expect(r.public.fleets.length).toBeGreaterThan(0);
  });

  it('keeps auto-exploring: the surveyor surveys and moves on with nobody online', () => {
    const { save } = freshSave(2_000);
    const loadouts = save.loadouts as GameState['loadouts'];
    save.loadouts = { ...loadouts, 'survey-1': { ...loadouts['survey-1'], orders: { autoExplore: true, autoReturn: true } } };
    const r = advanceSave(save, { id: ID, name: 'Ruben' }, 2_040)!;
    expect(Object.keys(r.save.explored as object).length).toBeGreaterThan(3);
  });

  it('plays exactly as the client does (same rules, same result) and is deterministic', () => {
    const { state, save } = freshSave(3_000);
    const server = advanceSave(save, { id: ID, name: 'Ruben' }, 3_025)!;
    expect(advanceSave(save, { id: ID, name: 'Ruben' }, 3_025)!.save).toEqual(server.save);
    // The client: the same state in a Store, advanced by EmpireSim directly.
    const store = new Store<GameState>(state);
    const economy = { tree, classes: SHIP_CLASSES, governments: GOVERNMENTS, policies: POLICIES, tenets: TENETS, partners, alienTech: ALIEN_TECH, buildings: BUILDINGS, storage: STORAGE, upkeepOf };
    new EmpireSim({ store, galaxy, tree, encounters: new EncounterResolver(DEFAULT_LOOT_TABLES, tree), world, economy }).advanceTo(3_025);
    const client = new SaveGame(galaxy.params.seed, null).snapshot(store.state);
    delete client.tab;
    expect(JSON.parse(JSON.stringify(server.save))).toEqual(JSON.parse(JSON.stringify(client)));
  });

  it('leaves up-to-date and invalid saves alone', () => {
    const { save } = freshSave(4_000);
    expect(advanceSave(save, { id: ID, name: 'Ruben' }, 4_000)).toBeNull();
    expect(advanceSave({ ...save, seed: 1 }, { id: ID, name: 'Ruben' }, 4_010)).toBeNull();
    expect(advanceSave(null, { id: ID, name: 'Ruben' }, 4_010)).toBeNull();
  });
});
