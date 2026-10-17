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
import { spawnNpcs } from '../core/npc/NpcCatalog';
import { TechTree } from '../core/research/TechTree';
import { EMPTY_WORLD } from '../core/world/SharedWorld';
import type { GameState } from '../app/GameState';
import { Store } from '../app/Store';
import { createWorld } from '../app/World';
import { EmpireSim, snapshotLink, type SharedLink } from './EmpireSim';
import { newEmpireState } from './newEmpireState';

const galaxy = new GalaxyModel();
const tree = new TechTree(TECH_NODES, SHARD_SOURCES);
const T = 5_000;
const economy = { tree, classes: SHIP_CLASSES, governments: GOVERNMENTS, policies: POLICIES, tenets: TENETS, alienTech: ALIEN_TECH, buildings: BUILDINGS, storage: STORAGE, upkeepOf };

function empire(id: string, shared: SharedLink, local = false) {
  const world = createWorld(galaxy, id);
  const store = new Store<GameState>(newEmpireState({ galaxy, tree, world, playerName: `P${id.slice(-2)}`, t0: T }));
  const sim = new EmpireSim({ store, galaxy, tree, encounters: new EncounterResolver(DEFAULT_LOOT_TABLES, tree), world, economy, shared, playerId: id, ...(local ? { npcs: 'local' as const } : {}) });
  return Object.assign(sim, { store });
}

describe('NPC empires in an empire’s game', () => {
  const ID = '777777777777777777';

  it('the neighbours of your home are met in the first year, and wake for everyone', () => {
    const link = snapshotLink(EMPTY_WORLD);
    const sim = empire(ID, link);
    const near = spawnNpcs(galaxy, sim.state.home.hex);
    sim.skipYear();
    expect(sim.knownNpcs().map((n) => n.def.id)).toEqual(near.map((d) => d.id).sort());
    expect(sim.state.dispatches.filter((d) => d.text.startsWith('First contact')).length).toBe(near.length);
    for (const d of near) expect(link.world().npcs[d.id].knownBy).toEqual([ID]);
    // Their worlds are War Room targets and markets for trade goods.
    expect(sim.warTargets().length).toBeGreaterThanOrEqual(near.length);
    expect(sim.markets().filter((m) => m.kind === 'npc').length).toBeGreaterThanOrEqual(near.length);
    sim.skipYear();
    expect(sim.state.dispatches.filter((d) => d.text.startsWith('First contact')).length).toBe(near.length);
  });

  it('raiders strike: a defended home fights, an undefended one is plundered', () => {
    const link = snapshotLink(EMPTY_WORLD);
    const sim = empire(ID, link);
    sim.skipYear();
    const npc = sim.knownNpcs()[0];
    const raid = { kind: 'raid' as const, npc: npc.def.id, fleet: npc.state.fleets[0].id, player: ID, at: sim.state.home.hex, ships: [{ classId: 'interceptor', count: 1 }], year: sim.state.turn };
    // The dock's two Interceptors meet one raider.
    const before = sim.state.economy.roster.interceptor;
    sim.resolveRaids([raid]);
    expect(sim.state.dispatches[0].text).toMatch(/plundered|beat off|defeated|standstill/);
    expect(sim.state.economy.roster.interceptor).toBeLessThanOrEqual(before);
    const fleetNow = link.world().npcs[npc.def.id].fleets.find((f) => f.id === raid.fleet);
    expect(fleetNow === undefined || fleetNow.ships.reduce((n, s) => n + s.count, 0) <= 1).toBe(true);

    // No warships at home: the colony is plundered.
    const bare = empire(ID, snapshotLink(EMPTY_WORLD));
    bare.store.update((s) => ({ economy: { ...s.economy, roster: { ...s.economy.roster, interceptor: 0 } } }));
    bare.skipYear();
    const credits = bare.state.empire.materials.credits;
    bare.resolveRaids([{ ...raid, ships: [{ classId: 'brawler', count: 3 }] }]);
    expect(bare.state.dispatches[0].text).toContain('plundered');
    expect(bare.state.empire.materials.credits).toBe(credits - Math.min(300, Math.floor(credits * 0.08)));
    // Raids meant for someone else are not ours.
    const other = bare.state.empire.materials.credits;
    bare.resolveRaids([{ ...raid, player: 'someone-else' }]);
    expect(bare.state.empire.materials.credits).toBe(other);
  });

  it('a guest’s browser runs its NPCs: raiders come for the home sooner or later', () => {
    const sim = empire(ID, snapshotLink(EMPTY_WORLD), true);
    const struck = () => sim.state.dispatches.some((d) => /plundered|beat off|defeated|standstill|struck at/.test(d.text));
    for (let i = 0; i < 300 && !struck(); i++) sim.skipYear();
    expect(struck()).toBe(true);
  });

  it('a War Room assault that wins takes the world: it becomes your colony, for everyone', () => {
    const link = snapshotLink(EMPTY_WORLD);
    const sim = empire(ID, link);
    sim.skipYear();
    const target = sim.warTargets().find((t) => !t.docked.length) ?? sim.warTargets()[0];
    // An overwhelming strike group on station at the target.
    const ships = [{ classId: 'dreadnought', count: 12 }, { classId: 'bombard', count: 10 }, { classId: 'assault-carrier', count: 10 }];
    sim.store.update((s) => ({ economy: { ...s.economy, roster: { ...s.economy.roster, dreadnought: 12, bombard: 10, 'assault-carrier': 10 } } }));
    sim.formFleet(ships, target.star);
    const id = sim.state.fleets.at(-1)!.id;
    sim.store.update((s) => ({ fleets: s.fleets.map((f) => (f.id === id ? { ...f, movement: { route: [target.star.hex], departTurn: s.turn, speed: 1 } } : f)) }));
    const colonies = sim.state.economy.colonies.length;
    const outcome = sim.engage(target.id, ships, id)!;
    expect(outcome.summary).toContain('captured');
    expect(sim.state.economy.colonies.length).toBe(colonies + 1);
    expect(sim.state.economy.colonies.at(-1)!.starId).toBe(target.star.id);
    const held = link.world().npcs[target.npc].colonies.find((c) => c.starId === target.star.id)!;
    expect(held.capturedBy).toBe(ID);
    expect(sim.warTargets().some((t) => t.id === target.id)).toBe(false);
    // Engaged once a year.
    expect(sim.engage(target.id, ships, id)).toBeNull();
  });
});
