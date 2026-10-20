import { describe, expect, it } from 'vitest';
import doc from '../../docs/snapshots.md?raw';
import { SHARD_SOURCES } from '../content/shardSources';
import { TECH_NODES } from '../content/techTree';
import { RESOURCES } from '../content/resources';
import { HERALDRY } from '../content/heraldry';
import { GalaxyModel } from '../core/galaxy/GalaxyModel';
import { TechTree } from '../core/research/TechTree';
import { suggestIdentity } from '../core/empire/Identity';
import type { GameState } from '../app/GameState';
import { SaveGame, type SavedGame } from '../app/SaveGame';
import { createWorld } from '../app/World';
import { advanceSave, summarize } from './headless';
import { newEmpireState } from './newEmpireState';
import { summarizeSave, SUMMARY_VERSION } from './snapshot';
import { EMPTY_WORLD } from '../core/world/SharedWorld';

const ID = '123456789012345678';
const galaxy = new GalaxyModel();
const tree = new TechTree(TECH_NODES, SHARD_SOURCES);
const world = createWorld(galaxy, ID);
const identity = suggestIdentity(galaxy.params.seed, 'Ruben', 'Karon', HERALDRY);

function freshSave(t0: number): SavedGame {
  const state: GameState = { ...newEmpireState({ galaxy, tree, world, playerName: 'Ruben', t0 }), identity };
  const save = new SaveGame(galaxy.params.seed, null).snapshot(state);
  delete save.tab;
  return save as unknown as SavedGame;
}

type Summary = ReturnType<typeof summarizeSave> & Record<string, any>;

describe('snapshot summary', () => {
  it('describes a new empire: three worlds in one system, its starting ships and stock', () => {
    const s = summarizeSave(freshSave(1_000), { id: ID, name: 'Ruben' }, { galaxy }) as Summary;
    expect(s.v).toBe(SUMMARY_VERSION);
    expect(s.year).toBe(1_000);
    expect(s.founded).toBe(true);
    expect(s.identity.name).toBe(identity.name);
    expect(s.population.worlds).toBe(3);
    expect(s.population.systems).toBe(1);
    expect(s.worlds.filter((w: { capital: boolean }) => w.capital)).toHaveLength(1);
    expect(s.buildings.shipyard).toBe(1);
    expect(s.ships.byClass.lancer).toBe(6);
    expect(s.ships.total).toBeGreaterThan(20);
    expect(s.ships.deployed.pathfinder).toBe(2);
    expect(s.ships.docked.prospector).toBe(3);
    expect(s.fleets.count).toBe(3);
    expect(s.military.warships).toBeGreaterThan(0);
    expect(s.military.attack).toBeGreaterThan(0);
    for (const r of RESOURCES) expect(s.resources[r.id]).toEqual(expect.objectContaining({ stock: expect.any(Number), net: 0 }));
    expect(s.research.researched).toBeGreaterThanOrEqual(6);
    expect(s.research.of).toBe(TECH_NODES.length);
    expect(s.exploration.systemsVisited).toBe(1);
    expect(s.missions.active).toEqual(['know-your-home']);
    expect(s.diplomacy).toEqual({ npcs: [], players: [], contacts: 0 });
  });

  it('after some years: income, costs and net from the ledger, explored systems, news', () => {
    const played = advanceSave(freshSave(2_000), { id: ID, name: 'Ruben' }, 2_030)!.save;
    const s = summarize(played, { id: ID, name: 'Ruben' }, EMPTY_WORLD) as Summary;
    expect(s.year).toBe(2_030);
    expect(s.resources.credits.income).toBeGreaterThan(0);
    expect(s.resources.credits.costs).toBeGreaterThan(0);
    expect(s.science).toBeGreaterThan(0);
    expect(s.exploration.systemsVisited).toBeGreaterThan(1);
    expect(s.exploration.systemsExplored).toBeGreaterThanOrEqual(s.exploration.systemsVisited);
    expect(s.news.length).toBeGreaterThan(0);
  });

  it('reads relations and NPC standings from the shared world', () => {
    const other = '222222222222222222';
    const w = {
      ...EMPTY_WORLD,
      relations: { [`${ID}|${other}`]: { status: 'alliance' as const, since: 5 } },
      contacts: { [`${ID}|${other}`]: 3 },
      npcs: { 'c:1,1': { id: 'c:1,1', discoveredAt: 1, knownBy: [ID], fleets: [], colonies: [{ starId: '1,1', garrison: [] }], standing: { [ID]: 12 }, lastBuilt: 0, built: 0 } },
    };
    const s = summarizeSave(freshSave(1_000), { id: ID }, { galaxy, world: w }) as Summary;
    expect(s.diplomacy.players).toEqual([{ id: other, status: 'alliance', since: 5, atWar: false, proposal: null }]);
    expect(s.diplomacy.contacts).toBe(1);
    expect(s.diplomacy.npcs).toEqual([expect.objectContaining({ id: 'c:1,1', standing: 12, worlds: 1 })]);
  });

  it('is deterministic, plain JSON, and refuses what is not a save', () => {
    const save = freshSave(3_000);
    const a = summarize(save, { id: ID, name: 'Ruben' });
    expect(JSON.parse(JSON.stringify(a))).toEqual(summarize(save, { id: ID, name: 'Ruben' }));
    expect(summarize({ turn: 1 }, { id: ID, name: 'Ruben' })).toBeNull();
  });

  it('every top-level field is documented in docs/snapshots.md', () => {
    const s = summarizeSave(freshSave(1_000), { id: ID, name: 'Ruben' }, { galaxy }) as Summary;
    for (const key of Object.keys(s)) expect(doc, `docs/snapshots.md documents ${key}`).toContain(`\`${key}\``);
    for (const key of Object.keys(s.exploration)) expect(doc).toContain(`\`exploration.${key}\``);
    for (const key of Object.keys(s.ships)) expect(doc).toContain(`\`ships.${key}\``);
  });
});
