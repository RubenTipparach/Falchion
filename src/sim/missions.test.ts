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
import { EMPTY_WORLD } from '../core/world/SharedWorld';
import { activeSources } from '../core/economy/Economy';
import type { GameState } from '../app/GameState';
import { Store } from '../app/Store';
import { createWorld } from '../app/World';
import { EmpireSim, snapshotLink } from './EmpireSim';
import { newEmpireState } from './newEmpireState';
import { decodeArgs, encodeCommand } from './commands';

const galaxy = new GalaxyModel();
const tree = new TechTree(TECH_NODES, SHARD_SOURCES);
const T = 5_000;
const economy = { tree, classes: SHIP_CLASSES, governments: GOVERNMENTS, policies: POLICIES, tenets: TENETS, alienTech: ALIEN_TECH, buildings: BUILDINGS, storage: STORAGE, upkeepOf };

function empire(id = '666666666666666666') {
  const world = createWorld(galaxy, id);
  const store = new Store<GameState>(newEmpireState({ galaxy, tree, world, playerName: 'P66', t0: T }));
  return new EmpireSim({ store, galaxy, tree, encounters: new EncounterResolver(DEFAULT_LOOT_TABLES, tree), world, economy, shared: snapshotLink(EMPTY_WORLD), playerId: id });
}

describe('missions and the court in an empire (change missions-and-court)', () => {
  it('a new empire starts on the first mission with two candidates for its court', () => {
    const sim = empire();
    expect(sim.missions.active.map((a) => a.id)).toEqual(['know-your-home']);
    expect(sim.court.candidates.map((c) => c.seat)).toEqual(['steward', 'science']);
    expect(sim.missionProgress('know-your-home')!.complete).toBe(false);
  });

  it('the year claims what is done, opens the next chapter steps and pays the ruler', () => {
    const sim = empire();
    const store = (sim as unknown as { deps: { store: Store<GameState> } }).deps.store;
    const homePlanets = sim.planets(sim.state.home);
    store.update({ explored: Object.fromEntries(homePlanets.slice(0, 3).map((p) => [p.id, { planetId: p.id } as never])) });
    expect(sim.missionProgress('know-your-home')!.complete).toBe(true);
    sim.skipYear();
    expect(sim.missions.done).toContain('know-your-home');
    expect(sim.court.leader.level > 1 || sim.court.leader.xp > 0).toBe(true);
    expect(sim.missions.active.map((a) => a.id)).toEqual(expect.arrayContaining(['ore-and-ice', 'lights-in-the-dark']));
    expect(sim.missions.record[0].title).toBe('Know Your Home');
  });

  it('appointed advisors add their bonus to the economy, and the ruler always does', () => {
    const sim = empire();
    sim.appointAdvisor(sim.court.candidates[0].id);
    expect(sim.court.seats.steward).toBeDefined();
    const names = activeSources({ ...sim.state.economy, stock: sim.state.empire.materials }, economy).map((s) => s.name);
    expect(names.some((n) => n.startsWith('Steward '))).toBe(true);
    expect(names.some((n) => n.includes('(level 1)'))).toBe(true);
    sim.dismissAdvisor('steward');
    expect(sim.court.seats.steward).toBeUndefined();
    expect(sim.court.candidates.some((c) => c.seat === 'steward')).toBe(true);
  });

  it('a delegated Science Minister keeps a research focus', () => {
    const sim = empire();
    sim.appointAdvisor(sim.court.candidates.find((c) => c.seat === 'science')!.id);
    sim.delegate('science', true);
    sim.setFocus(null);
    sim.skipYear();
    expect(sim.state.economy.focus).toBeTruthy();
    expect(sim.state.dispatches.some((d) => d.text.startsWith('Science Minister'))).toBe(true);
  });

  it('seeking a candidate costs influence', () => {
    const sim = empire();
    const store = (sim as unknown as { deps: { store: Store<GameState> } }).deps.store;
    store.update((s) => ({ empire: { ...s.empire, materials: { ...s.empire.materials, influence: 100 } } }));
    sim.seekAdvisor('prelate');
    expect(sim.state.empire.materials.influence).toBe(60);
    expect(sim.court.candidates.at(-1)!.seat).toBe('prelate');
  });

  it('known factions offer quests over the years, and an accepted one can be taken up', () => {
    const sim = empire();
    for (let i = 0; i < 400 && !sim.missions.offers.length; i++) sim.skipYear();
    expect(sim.missions.offers.length).toBeGreaterThan(0);
    const offer = sim.missions.offers[0];
    sim.acceptQuest(offer.id);
    expect(sim.missions.active.find((a) => a.id === offer.id)?.quest?.npc).toBe(offer.npc);
    expect(sim.missionDef(offer.id)?.title).toBe(offer.title);
  });

  it('the court commands travel and validate their seat', () => {
    const sim = empire();
    expect(decodeArgs(encodeCommand('delegate', ['admiral', true]), sim).args).toEqual(['admiral', true]);
    expect(() => decodeArgs({ name: 'seekAdvisor', args: ['emperor'] }, sim)).toThrow();
  });
});
