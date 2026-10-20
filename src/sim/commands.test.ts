import { describe, expect, it } from 'vitest';
import { DEFAULT_LOOT_TABLES } from '../content/lootTables';
import { BUILDINGS, STORAGE } from '../content/buildings';
import { upkeepOf } from '../content/logistics';
import { SHARD_SOURCES } from '../content/shardSources';
import { SHIP_CLASSES } from '../content/shipClasses';
import { GOVERNMENTS, POLICIES, TENETS } from '../content/society';
import { ALIEN_TECH, TECH_NODES } from '../content/techTree';
import { HERALDRY } from '../content/heraldry';
import { suggestIdentity } from '../core/empire/Identity';
import { EncounterResolver } from '../core/encounters/Encounters';
import { GalaxyModel } from '../core/galaxy/GalaxyModel';
import { TechTree } from '../core/research/TechTree';
import type { GameState } from '../app/GameState';
import { SaveGame } from '../app/SaveGame';
import { Store } from '../app/Store';
import { createWorld } from '../app/World';
import { EmpireSim, type SimDeps } from './EmpireSim';
import { COMMANDS, encodeCommand, type CommandName } from './commands';
import { applyCommand } from './headless';
import { newEmpireState } from './newEmpireState';

const ID = '123456789012345678';
const PLAYER = { id: ID, name: 'Ruben' };
const galaxy = new GalaxyModel();
const tree = new TechTree(TECH_NODES, SHARD_SOURCES);
const world = createWorld(galaxy, ID);
const T = 5_000;

const fresh = () => newEmpireState({ galaxy, tree, world, playerName: 'Ruben', t0: T });
const snap = (s: GameState) => { const x = new SaveGame(galaxy.params.seed, null).snapshot(s); delete x.tab; return JSON.parse(JSON.stringify(x)); };

/** The client side: the same state in a Store with an EmpireSim fixed at time T. */
function client(state: GameState) {
  const store = new Store<GameState>(state);
  const deps: SimDeps = { store, galaxy, tree, encounters: new EncounterResolver(DEFAULT_LOOT_TABLES, tree), world, economy: { tree, classes: SHIP_CLASSES, governments: GOVERNMENTS, policies: POLICIES, tenets: TENETS, alienTech: ALIEN_TECH, buildings: BUILDINGS, storage: STORAGE, upkeepOf } };
  return { store, sim: new EmpireSim(deps) };
}

/** Run a command on both sides and expect the same empire. */
function both(name: CommandName, args: unknown[], state = fresh()) {
  const c = client(state);
  (c.sim[name] as (...a: unknown[]) => unknown)(...args);
  const server = applyCommand(snap(state), PLAYER, T, encodeCommand(name, args))!;
  expect(server.ok, server.error).toBe(true);
  expect(JSON.parse(JSON.stringify(server.save))).toEqual(snap(c.store.state));
  return server;
}

describe('player commands run on the server exactly as in the browser', () => {
  it('covers every order a player can give, each a real method (the browser wraps them all at start-up)', () => {
    expect(Object.keys(COMMANDS).length).toBeGreaterThanOrEqual(29);
    const { sim } = client(fresh());
    for (const name of Object.keys(COMMANDS)) expect(typeof (sim as unknown as Record<string, unknown>)[name], name).toBe('function');
  });

  it('founding, moving fleets, orders, research focus, designs and a ship build agree', () => {
    const state = fresh();
    const c = client(state);
    const target = c.sim.groups()[0];
    const star = galaxy.nearestStar({ q: state.home.hex.q + 6, r: state.home.hex.r }, 10)!;
    const id = suggestIdentity(1, 'Ruben', 'Cap', HERALDRY);
    both('setIdentity', [id, true]);
    both('moveFleet', ['survey-1', star, false]);
    both('moveFleetToHex', ['scout-1', { q: state.home.hex.q + 3, r: state.home.hex.r - 2 }, 'deep space', false]);
    both('setOrders', ['survey-1', { autoExplore: true, autoReturn: false }]);
    both('setFocus', ['o-grown-hulls']);
    both('setDesign', [{ ...state.designs.prospector, seed: 99, length: 1.3 }]);
    const painted = both('setDesign', [{ ...state.designs.prospector, livery: 'stripes' }]);
    expect((painted.save.designs as Record<string, { livery?: string }>).prospector.livery).toBe('stripes');
    both('buildShip', ['prospector', undefined]);
    expect(target).toBeTruthy();
  });

  it('a yard queue can be cancelled (refunded) and reordered, the same on the server', () => {
    const c = client(fresh());
    c.store.update((s) => ({ empire: { ...s.empire, materials: { ...s.empire.materials, credits: 5000, metals: 5000, crystals: 5000, gases: 5000 } } }));
    for (let i = 0; i < 3; i++) c.sim.buildShip('prospector');
    const state = c.store.state;
    const queued = state.construction.filter((j) => j.kind === 'ship');
    expect(queued.length).toBe(3);
    const moved = both('moveJob', [queued[2].id, true], state);
    const order = (moved.save.construction as typeof queued).filter((j) => j.kind === 'ship').sort((a, b) => a.startTurn - b.startTurn).map((j) => j.id);
    expect(order).toEqual([queued[0].id, queued[2].id, queued[1].id]);
    const credits = state.empire.materials.credits;
    const cancelled = both('cancelJob', [queued[1].id], state);
    expect((cancelled.save.construction as typeof queued).length).toBe(state.construction.length - 1);
    expect((cancelled.save.empire as typeof state.empire).materials.credits).toBeGreaterThan(credits);
  });

  it('refuses unknown commands, unknown places and malformed arguments', () => {
    const save = snap(fresh());
    for (const bad of [
      { name: 'grantShards', args: ['t-fusion', 'exploration', 99999] },
      { name: 'skipYear', args: [] },
      { name: 'moveFleet', args: ['survey-1', '999999,999999'] },
      { name: 'moveFleet', args: ['survey-1', { q: 1 }] },
      { name: 'explore', args: ['nope/1'] },
      { name: 'formFleet', args: [[{ classId: 'death-star', count: 1 }], '1,1'] },
      { name: 'setDesign', args: [{ colors: { primary: 'red' } }] },
      { name: 'setDesign', args: [{ ...fresh().designs.prospector, livery: 42 }] },
      { name: 'toString', args: [] },
    ]) {
      const r = applyCommand(save, PLAYER, T, bad)!;
      expect(r.ok, JSON.stringify(bad)).toBe(false);
      expect(r.save.turn).toBe(T);
    }
  });

  it("cannot move another empire's fleet, and an empire is founded only once", () => {
    const save = snap(fresh());
    const star = galaxy.nearestStar({ q: world.home.hex.q + 6, r: world.home.hex.r }, 10)!;
    const r = applyCommand(save, PLAYER, T, encodeCommand('moveFleet', ['someone-elses-fleet', star, false]))!;
    expect(r.save.fleets).toEqual(save.fleets);
    const founded = applyCommand(save, PLAYER, T, encodeCommand('setIdentity', [suggestIdentity(1, 'Ruben', 'Cap', HERALDRY), true]))!;
    const again = applyCommand(founded.save, PLAYER, T, encodeCommand('setIdentity', [suggestIdentity(2, 'Ruben', 'Cap', HERALDRY), true]))!;
    const style = (founded.save.identity as { shipStyle?: string }).shipStyle;
    // A second "founding" is only an edit: the ship style it set is not re-applied to every design.
    expect(again.ok).toBe(true);
    expect(Object.values(again.save.designs as GameState['designs']).every((d) => d.style === style)).toBe(true);
  });

  it('catches the empire up to the world year before applying the order', () => {
    const r = applyCommand(snap(fresh()), PLAYER, T + 10.5, encodeCommand('setFocus', [null]))!;
    expect(r.save.turn).toBe(T + 10);
  });

  it('dates a move order when the player gave it, within a few seconds', () => {
    const star = galaxy.nearestStar({ q: world.home.hex.q + 6, r: world.home.hex.r }, 10)!;
    const move = (clientTime?: number) => (applyCommand(snap(fresh()), PLAYER, T + 0.5, encodeCommand('moveFleet', ['survey-1', star, true]), clientTime)!.save.fleets as GameState['fleets']).find((f) => f.id === 'survey-1')!.movement.departTurn;
    expect(move(T + 0.48)).toBeCloseTo(T + 0.48);
    expect(move(T - 50)).toBeCloseTo(T + 0.5 - 5 / 60); // no further back than the slack
    expect(move(T + 9)).toBeCloseTo(T + 0.5); // never in the future
  });
});
