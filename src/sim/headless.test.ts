import { describe, expect, it } from 'vitest';
import { DEFAULT_LOOT_TABLES } from '../content/lootTables';
import { BUILDINGS, STORAGE } from '../content/buildings';
import { upkeepOf } from '../content/logistics';
import { SHARD_SOURCES } from '../content/shardSources';
import { SHIP_CLASSES } from '../content/shipClasses';
import { GOVERNMENTS, POLICIES, TENETS } from '../content/society';
import { ALIEN_TECH, TECH_NODES } from '../content/techTree';
import { EncounterResolver } from '../core/encounters/Encounters';
import { goodsPrice, saleValue } from '../core/economy/Trade';
import { GalaxyModel, type StarSystem } from '../core/galaxy/GalaxyModel';
import { hexDistance } from '../core/hex/Hex';
import { TechTree } from '../core/research/TechTree';
import type { GameState } from '../app/GameState';
import { SaveGame } from '../app/SaveGame';
import { Store } from '../app/Store';
import { createWorld } from '../app/World';
import { EmpireSim } from './EmpireSim';
import { encodeCommand } from './commands';
import { advanceSave, applyCommand, EMPTY_WORLD } from './headless';
import type { SharedEffect } from '../core/world/SharedWorld';
import { newEmpireState } from './newEmpireState';

const ID = '123456789012345678';
const galaxy = new GalaxyModel();
const tree = new TechTree(TECH_NODES, SHARD_SOURCES);
const world = createWorld(galaxy, ID);

function freshSave(t0: number, patch: Partial<GameState> = {}) {
  const state = { ...newEmpireState({ galaxy, tree, world, playerName: 'Ruben', t0 }), ...patch };
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
    const economy = { tree, classes: SHIP_CLASSES, governments: GOVERNMENTS, policies: POLICIES, tenets: TENETS, alienTech: ALIEN_TECH, buildings: BUILDINGS, storage: STORAGE, upkeepOf };
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

describe("other players' worlds are markets", () => {
  const OTHER = '987654321098765432';
  const me = { id: ID, name: 'Ruben' };
  /** The nearest star at least `min` ly from home (a world the other player has settled). */
  function starNear(home: StarSystem, min: number): StarSystem {
    const out: StarSystem[] = [];
    for (let q = -min * 3; q <= min * 3; q++) for (let r = -min * 3; r <= min * 3; r++) {
      const star = galaxy.starAt({ q: home.hex.q + q, r: home.hex.r + r });
      if (star && hexDistance(star.hex, home.hex) >= min) out.push(star);
    }
    return out.sort((a, b) => hexDistance(a.hex, home.hex) - hexDistance(b.hex, home.hex) || (a.id < b.id ? -1 : 1))[0];
  }
  const loadouts = (save: Record<string, unknown>) => save.loadouts as GameState['loadouts'];
  const dispatches = (save: Record<string, unknown>) => save.dispatches as GameState['dispatches'];

  it("a freighter trade run to another player's colony sells there at the 'player' price", () => {
    const t0 = 6_000;
    const { state, save } = freshSave(t0);
    save.empire = { ...state.empire, materials: { ...state.empire.materials, goods: 400 } };
    const target = starNear(world.home, 6);
    const others = [{ id: OTHER, name: 'bea', empire: { name: 'Iron Dominion' }, home: { q: 9_999, r: 9_999 }, colonies: [target.hex] }];

    // Without the other player the star is no market: the server refuses the run.
    const refused = applyCommand(save, me, t0, encodeCommand('tradeRun', ['dock', target]))!;
    expect(Object.values(loadouts(refused.save)).some((l) => l.orders?.trade)).toBe(false);
    expect(dispatches(refused.save)[0].text).toContain('has no market');

    const started = applyCommand(save, me, t0, encodeCommand('tradeRun', ['dock', target]), undefined, EMPTY_WORLD, others)!;
    expect(started.ok).toBe(true);
    const fleetId = Object.keys(loadouts(started.save)).find((id) => loadouts(started.save)[id].orders?.trade)!;
    expect(loadouts(started.save)[fleetId].orders!.trade!.to).toBe(target.id);
    expect(loadouts(started.save)[fleetId].cargo).toBe(50);

    // The server plays it year by year, as the ticker does, until the goods are sold.
    const trip = hexDistance(world.home.hex, target.hex);
    let now = started.save;
    const effects: SharedEffect[] = [];
    for (let t = t0 + 1; t <= t0 + trip + 3 && !dispatches(now).some((d) => d.text.includes('sold')); t++) {
      const r = advanceSave(now, me, t, EMPTY_WORLD, [], others)!;
      now = r.save;
      effects.push(...r.effects);
    }
    // The other player has published no tariff: the default 10% goes to them (change commerce).
    const gross = saleValue(50, trip, 'player');
    const tariff = Math.round(gross * 0.1);
    const sold = dispatches(now).find((d) => d.text.includes('sold 50 trade goods'));
    const fleet = (now.fleets as GameState['fleets']).find((f) => f.id === fleetId)!;
    expect(sold?.text).toBe(`${fleet.name} sold 50 trade goods at ${target.name} (Iron Dominion) for ${gross - tariff} credits`);
    expect(effects).toContainEqual({ kind: 'payout', to: OTHER, label: 'Tariffs from Ruben', credits: tariff });
    expect(gross).toBeGreaterThan(saleValue(50, trip, 'npc'));
    expect(goodsPrice(trip, 'player')).toBe(goodsPrice(trip, 'own') * 1.5);
    expect(loadouts(now)[fleetId].cargo ?? 0).toBe(0);
  });

  it("never treats your own worlds as another player's market", () => {
    const t0 = 7_000;
    const { save } = freshSave(t0);
    const target = starNear(world.home, 6);
    const self = [{ id: ID, name: 'Ruben', empire: { name: 'Mine' }, home: world.home.hex, colonies: [target.hex] }];
    const r = applyCommand(save, me, t0, encodeCommand('tradeRun', ['dock', target]), undefined, EMPTY_WORLD, self)!;
    expect(Object.values(loadouts(r.save)).some((l) => l.orders?.trade)).toBe(false);
  });
});
