import { describe, expect, it } from 'vitest';
import { DEFAULT_LOOT_TABLES } from '../content/lootTables';
import { BUILDINGS, STORAGE } from '../content/buildings';
import { upkeepOf } from '../content/logistics';
import { SHARD_SOURCES } from '../content/shardSources';
import { SHIP_CLASSES } from '../content/shipClasses';
import { GOVERNMENTS, POLICIES, TENETS } from '../content/society';
import { ALIEN_TECH, TECH_NODES } from '../content/techTree';
import { EncounterResolver } from '../core/encounters/Encounters';
import { fieldsOf, homeBelt } from '../core/galaxy/Asteroids';
import { GalaxyModel, type StarSystem } from '../core/galaxy/GalaxyModel';
import { TechTree } from '../core/research/TechTree';
import { EMPTY_WORLD, applyEffects, type SharedWorld } from '../core/world/SharedWorld';
import type { GameState } from '../app/GameState';
import { Store } from '../app/Store';
import { createWorld } from '../app/World';
import { EmpireSim, snapshotLink, type SharedLink } from './EmpireSim';
import { advanceSave } from './headless';
import { SaveGame } from '../app/SaveGame';
import { newEmpireState } from './newEmpireState';

const galaxy = new GalaxyModel();
const tree = new TechTree(TECH_NODES, SHARD_SOURCES);
const T = 5_000;
const economy = { tree, classes: SHIP_CLASSES, governments: GOVERNMENTS, policies: POLICIES, tenets: TENETS, alienTech: ALIEN_TECH, buildings: BUILDINGS, storage: STORAGE, upkeepOf };

function empire(id: string, shared: SharedLink) {
  const world = createWorld(galaxy, id);
  const store = new Store<GameState>(newEmpireState({ galaxy, tree, world, playerName: `P${id.slice(-2)}`, t0: T }));
  return Object.assign(new EmpireSim({ store, galaxy, tree, encounters: new EncounterResolver(DEFAULT_LOOT_TABLES, tree), world, economy, shared }), { store });
}

/** A star near home with a field of this resource (and none of it at home, for a clean count). */
function starWith(near: StarSystem, resource: string): StarSystem {
  for (let d = 2; d < 200; d += 3) for (const [dq, dr] of [[d, 0], [0, d], [-d, d], [-d, 0], [0, -d], [d, -d]]) {
    const s = galaxy.nearestStar({ q: near.hex.q + dq, r: near.hex.r + dr }, 2);
    if (s && s.id !== near.id && fieldsOf(s, galaxy.params.seed).some((f) => f.resource === resource)) return s;
  }
  throw new Error('no field found');
}

describe('mining ships mine asteroid fields', () => {
  it('docked miners work the home belt, faster than before, and draw it down', () => {
    const link = snapshotLink(EMPTY_WORLD);
    const sim = empire('111111111111111111', link);
    sim.skipYear();
    const income = sim.state.lastReport!.income;
    expect(income.metals).toBeGreaterThanOrEqual(3 * 3 * 3); // three Prospectors at three times the planet rate
    expect(income.gases).toBeGreaterThan(0); // the Ice Grazer
    const belt = homeBelt(sim.state.home)[0];
    expect(link.world().asteroids[belt.id]?.left).toBeLessThan(belt.capacity);
    expect(link.effects.some((e) => e.kind === 'mined' && e.field.id === belt.id)).toBe(true);
  });

  it('miners go idle where there is no field of their kind, and when the fields are mined out', () => {
    const sim = empire('222222222222222222', snapshotLink(EMPTY_WORLD));
    const empty: SharedWorld = applyEffects(EMPTY_WORLD, sim.asteroidsAt(sim.state.home).map((field) => ({ kind: 'mined' as const, field, amount: field.capacity, year: T })));
    const dry = empire('222222222222222222', snapshotLink(empty));
    dry.skipYear();
    expect(dry.state.lastReport!.lines.some((l) => l.includes('mined out'))).toBe(true);
    // A year later each field has refilled a little: they mine just that.
    const metals = dry.fieldReport(dry.state.home).filter((f) => f.field.resource === 'metals').reduce((n, f) => n + f.left, 0);
    expect(metals).toBeLessThan(10);
  });

  it('two empires mining one field share it', () => {
    const link = snapshotLink(EMPTY_WORLD);
    const a = empire('333333333333333333', link);
    const field = starWith(a.state.home, 'crystals');
    const crystal = fieldsOf(field, galaxy.params.seed).filter((f) => f.resource === 'crystals');
    const send = (sim: ReturnType<typeof empire>) => {
      sim.store.update((s) => ({ economy: { ...s.economy, roster: { ...s.economy.roster, 'crystal-driller': 4 } } }));
      sim.formFleet([{ classId: 'crystal-driller', count: 4 }], field);
      const id = sim.state.fleets.at(-1)!.id;
      sim.store.update((s) => ({ fleets: s.fleets.map((f) => (f.id === id ? { ...f, movement: { ...f.movement, route: [field.hex], departTurn: s.turn, from: undefined } } : f)) }));
    };
    const b = empire('444444444444444444', link);
    send(a);
    send(b);
    const total = () => crystal.reduce((n, f) => n + (link.world().asteroids[f.id]?.left ?? f.capacity), 0);
    const full = total();
    a.skipYear();
    const afterA = total();
    b.skipYear();
    const afterB = total();
    expect(afterA).toBeLessThan(full);
    expect(afterB).toBeLessThan(afterA);
    expect(a.state.lastReport!.income.crystals).toBeGreaterThan(0);
    expect(b.state.lastReport!.income.crystals).toBeGreaterThan(0);
  });

  it('the server plays an empire on the shared world and hands back what it mined', () => {
    const world = createWorld(galaxy, '555555555555555555');
    const state = newEmpireState({ galaxy, tree, world, playerName: 'P55', t0: T });
    const save = JSON.parse(JSON.stringify(new SaveGame(galaxy.params.seed, null).snapshot(state)));
    const r = advanceSave(save, { id: '555555555555555555', name: 'P55' }, T + 3, EMPTY_WORLD)!;
    expect(r.effects.filter((e) => e.kind === 'mined').length).toBeGreaterThan(0);
    const after = applyEffects(EMPTY_WORLD, r.effects);
    expect(Object.keys(after.asteroids).some((id) => id.startsWith(state.home.id))).toBe(true);
  });
});

describe('assigning miners to one field (change asteroid-assign)', () => {
  /** A star near home with two or more fields of a resource. */
  function starWithTwo(near: StarSystem, resource: string): StarSystem {
    for (let d = 2; d < 300; d += 3) for (const [dq, dr] of [[d, 0], [0, d], [-d, d], [-d, 0], [0, -d], [d, -d]]) {
      const s = galaxy.nearestStar({ q: near.hex.q + dq, r: near.hex.r + dr }, 2);
      if (s && s.id !== near.id && fieldsOf(s, galaxy.params.seed).filter((f) => f.resource === resource).length >= 2) return s;
    }
    throw new Error('no such star');
  }

  it('miners sent to a field mine that field and leave the system\'s others alone', () => {
    const link = snapshotLink(EMPTY_WORLD);
    const sim = empire('555555555555555555', link);
    const star = starWithTwo(sim.state.home, 'metals');
    const [, target] = fieldsOf(star, galaxy.params.seed).filter((f) => f.resource === 'metals');
    sim.store.update((s) => ({ economy: { ...s.economy, roster: { ...s.economy.roster, prospector: 6 } } }));
    sim.mineField('dock', target.id);
    const fleet = sim.state.fleets.at(-1)!;
    expect(sim.state.loadouts[fleet.id].orders?.mineField).toBe(target.id);
    expect(fleet.movement.route.at(-1)).toEqual(star.hex);
    // Arrive at once, then mine a year.
    sim.store.update((s) => ({ fleets: s.fleets.map((f) => (f.id === fleet.id ? { ...f, movement: { ...f.movement, route: [star.hex], departTurn: s.turn, from: undefined } } : f)) }));
    sim.skipYear();
    const mined = link.effects.filter((e) => e.kind === 'mined' && e.field.starId === star.id);
    expect(mined.length).toBeGreaterThan(0);
    expect(mined.every((e) => e.kind === 'mined' && e.field.id === target.id)).toBe(true);
    // Its orders survive other order changes.
    sim.setOrders(fleet.id, { autoMine: true });
    expect(sim.state.loadouts[fleet.id].orders?.mineField).toBe(target.id);
  });

  it('only miners of the field\'s resource can be sent, and unknown fields are ignored', () => {
    const sim = empire('666666666666666666', snapshotLink(EMPTY_WORLD));
    const star = starWithTwo(sim.state.home, 'crystals');
    const crystals = fieldsOf(star, galaxy.params.seed).find((f) => f.resource === 'crystals')!;
    const before = sim.state.fleets.length;
    sim.mineField('dock', crystals.id); // the dock has no crystal drillers
    sim.mineField('dock', `${star.id}#99`);
    expect(sim.state.fleets.length).toBe(before);
  });
});
