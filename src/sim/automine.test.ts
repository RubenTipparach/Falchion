import { describe, expect, it } from 'vitest';
import { DEFAULT_LOOT_TABLES } from '../content/lootTables';
import { BUILDINGS, STORAGE } from '../content/buildings';
import { upkeepOf } from '../content/logistics';
import { SHARD_SOURCES } from '../content/shardSources';
import { SHIP_CLASSES } from '../content/shipClasses';
import { GOVERNMENTS, POLICIES, TENETS } from '../content/society';
import { ALIEN_TECH, TECH_NODES } from '../content/techTree';
import { EncounterResolver } from '../core/encounters/Encounters';
import { DRY_FIELD, MINE_REACH } from '../core/fleet/AutoMine';
import { GalaxyModel, type StarSystem } from '../core/galaxy/GalaxyModel';
import { hexDistance, hexRing } from '../core/hex/Hex';
import { TechTree } from '../core/research/TechTree';
import { EMPTY_WORLD, applyEffects, type SharedWorld } from '../core/world/SharedWorld';
import type { GameState } from '../app/GameState';
import { SaveGame } from '../app/SaveGame';
import { Store } from '../app/Store';
import { createWorld } from '../app/World';
import { encodeCommand } from './commands';
import { EmpireSim, snapshotLink } from './EmpireSim';
import { advanceSave, applyCommand } from './headless';
import { newEmpireState } from './newEmpireState';

const galaxy = new GalaxyModel();
const tree = new TechTree(TECH_NODES, SHARD_SOURCES);
const T = 5_000;
const ID = '777777777777777777';
const economy = { tree, classes: SHIP_CLASSES, governments: GOVERNMENTS, policies: POLICIES, tenets: TENETS, alienTech: ALIEN_TECH, buildings: BUILDINGS, storage: STORAGE, upkeepOf };
const world = createWorld(galaxy, ID);
const fresh = () => newEmpireState({ galaxy, tree, world, playerName: 'P77', t0: T });

function empire(shared: SharedWorld, state = fresh()) {
  const store = new Store<GameState>(state);
  return Object.assign(new EmpireSim({ store, galaxy, tree, encounters: new EncounterResolver(DEFAULT_LOOT_TABLES, tree), world, economy, shared: snapshotLink(shared) }), { store });
}

/** Every field of these systems mined empty at year T. */
function minedOut(sim: EmpireSim, stars: readonly StarSystem[], base = EMPTY_WORLD): SharedWorld {
  return applyEffects(base, stars.flatMap((st) => sim.asteroidsAt(st).map((field) => ({ kind: 'mined' as const, field, amount: field.capacity, year: T }))));
}

/** A fleet of the home dock's Prospectors on station at home, with auto-mine on. */
function minersAtHome(sim: ReturnType<typeof empire>, autoMine = true): string {
  sim.formFleet([{ classId: 'prospector', count: 3 }], sim.state.home, 'Rock Crew', true);
  const id = sim.state.fleets.at(-1)!.id;
  expect(sim.state.fleets.at(-1)!.name).toBe('Rock Crew');
  sim.setOrders(id, { autoMine });
  return id;
}

const destOf = (sim: EmpireSim, id: string) => {
  const f = sim.state.fleets.find((x) => x.id === id)!;
  return galaxy.starAt(f.movement.route[f.movement.route.length - 1]);
};

/** Metals left in a system's fields that are not mined out. */
const metalsAt = (sim: EmpireSim, star: StarSystem) =>
  sim.fieldReport(star).filter((f) => f.field.resource === 'metals' && f.left >= DRY_FIELD).reduce((n, f) => n + f.left, 0);

describe('auto-mine standing order', () => {
  it('a fleet whose home field is mined dry heads to the nearest system with metals left', () => {
    const probe = empire(EMPTY_WORLD);
    const sim = empire(minedOut(probe, [probe.state.home]));
    const id = minersAtHome(sim);
    sim.skipYear();
    const to = destOf(sim, id)!;
    expect(to.id).not.toBe(sim.state.home.id);
    expect(metalsAt(sim, to)).toBeGreaterThan(0);
    const d = hexDistance(sim.state.home.hex, to.hex);
    expect(d).toBeLessThanOrEqual(MINE_REACH);
    // Nothing nearer has metals to mine.
    for (let k = 1; k < d; k++) for (const h of hexRing(sim.state.home.hex, k)) {
      const st = galaxy.starAt(h);
      if (st) expect(metalsAt(sim, st), st.name).toBe(0);
    }
    expect(sim.state.dispatches.some((x) => x.text === `Rock Crew heads to ${to.name} to mine metals`)).toBe(true);
  });

  it('stays while its field still has rocks', () => {
    const sim = empire(EMPTY_WORLD);
    const id = minersAtHome(sim);
    sim.skipYear();
    expect(destOf(sim, id)!.id).toBe(sim.state.home.id);
  });

  it('only with the order on, and only for fleets that have mining ships', () => {
    const probe = empire(EMPTY_WORLD);
    const dry = minedOut(probe, [probe.state.home]);
    const off = empire(dry);
    const id = minersAtHome(off, false);
    off.skipYear();
    expect(destOf(off, id)!.id).toBe(off.state.home.id);
    const scouts = empire(dry);
    scouts.formFleet([{ classId: 'interceptor', count: 2 }], scouts.state.home, 'Guard', true);
    const sid = scouts.state.fleets.at(-1)!.id;
    expect(scouts.state.fleets.at(-1)!.name).toBe('Guard');
    scouts.setOrders(sid, { autoMine: true });
    scouts.skipYear();
    expect(destOf(scouts, sid)!.id).toBe(scouts.state.home.id);
  });

  it('counts fields others have mined dry, and picks the same system every time', () => {
    const probe = empire(EMPTY_WORLD);
    const dry = minedOut(probe, [probe.state.home]);
    const a = empire(dry), b = empire(dry);
    const ia = minersAtHome(a), ib = minersAtHome(b);
    a.skipYear();
    b.skipYear();
    const first = destOf(a, ia)!;
    expect(destOf(b, ib)!.id).toBe(first.id);
    // Someone has emptied that system too: the fleet goes elsewhere.
    const c = empire(minedOut(probe, [first], dry));
    const ic = minersAtHome(c);
    c.skipYear();
    const second = destOf(c, ic)!;
    expect(second.id).not.toBe(first.id);
    expect(second.id).not.toBe(c.state.home.id);
    expect(hexDistance(c.state.home.hex, second.hex)).toBeGreaterThanOrEqual(hexDistance(c.state.home.hex, first.hex));
  });

  it('leaves fleets in transit alone', () => {
    const probe = empire(EMPTY_WORLD);
    const sim = empire(minedOut(probe, [probe.state.home]));
    const far = galaxy.nearestStar({ q: sim.state.home.hex.q + 20, r: sim.state.home.hex.r }, 10)!;
    sim.formFleet([{ classId: 'prospector', count: 3 }], far, 'Rock Crew', true);
    const id = sim.state.fleets.at(-1)!.id;
    sim.setOrders(id, { autoMine: true });
    const route = sim.state.fleets.find((f) => f.id === id)!.movement;
    sim.skipYear();
    expect(sim.state.fleets.find((f) => f.id === id)!.movement).toEqual(route);
  });

  it('keeps a trade run and the other orders when auto-mine is set', () => {
    const sim = empire(EMPTY_WORLD);
    const id = minersAtHome(sim, false);
    sim.store.update((s) => ({ loadouts: { ...s.loadouts, [id]: { ...s.loadouts[id], orders: { trade: { from: 'a', to: 'b' } } } } }));
    sim.setOrders(id, { autoReturn: true, autoMine: true });
    expect(sim.state.loadouts[id].orders).toEqual({ autoExplore: false, autoReturn: true, autoMine: true, trade: { from: 'a', to: 'b' } });
  });

  it('the server applies the order as the browser does, and plays it forward', () => {
    const probe = empire(EMPTY_WORLD);
    const dry = minedOut(probe, [probe.state.home]);
    const browser = empire(dry);
    const id = minersAtHome(browser, false);
    const save = () => JSON.parse(JSON.stringify(new SaveGame(galaxy.params.seed, null).snapshot(browser.state)));
    const before = save();
    browser.setOrders(id, { autoMine: true });
    const r = applyCommand(before, { id: ID, name: 'P77' }, T, encodeCommand('setOrders', [id, { autoMine: true }]))!;
    expect(r.ok, r.error).toBe(true);
    expect((r.save.loadouts as GameState['loadouts'])[id].orders).toEqual(save().loadouts[id].orders);
    // An order from an older browser (no auto-mine flag) is read as off.
    const old = applyCommand(before, { id: ID, name: 'P77' }, T, { name: 'setOrders', args: [id, { autoExplore: false, autoReturn: true }] })!;
    expect((old.save.loadouts as GameState['loadouts'])[id].orders?.autoMine).toBeUndefined();
    // The server's year moves the fleet on, on the shared world it is given.
    const played = advanceSave(r.save, { id: ID, name: 'P77' }, T + 1, dry)!;
    const fleet = (played.save.fleets as GameState['fleets']).find((f) => f.id === id)!;
    const to = galaxy.starAt(fleet.movement.route[fleet.movement.route.length - 1])!;
    browser.skipYear();
    expect(to.id).toBe(destOf(browser, id)!.id);
    expect(to.id).not.toBe(browser.state.home.id);
  });
});
