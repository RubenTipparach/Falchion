import { describe, expect, it } from 'vitest';
import { GalaxyModel } from '../core/galaxy/GalaxyModel';
import { TechTree } from '../core/research/TechTree';
import { TECH_NODES } from '../content/techTree';
import { SHARD_SOURCES } from '../content/shardSources';
import { createWorld } from '../app/World';
import { Store } from '../app/Store';
import type { GameState } from '../app/GameState';
import { SaveGame } from '../app/SaveGame';
import { applyEffects, EMPTY_WORLD } from '../core/world/SharedWorld';
import { relationOf } from '../core/diplomacy/Diplomacy';
import { advanceSave, applyCommand, findFirstContacts } from './headless';
import { encodeCommand } from './commands';
import { newEmpireState } from './newEmpireState';

const galaxy = new GalaxyModel();
const tree = new TechTree(TECH_NODES, SHARD_SOURCES);
const T = 5_000;
const A = '111111111111111111', B = '222222222222222222';
const player = (id: string) => ({ id, name: `P${id.slice(-2)}` });

function saveOf(id: string) {
  const store = new Store<GameState>(newEmpireState({ galaxy, tree, world: createWorld(galaxy, id), playerName: player(id).name, t0: T }));
  const save: Record<string, any> = new SaveGame(galaxy.params.seed, null).snapshot(store.state);
  delete save.tab;
  return save;
}
/** A and B have met (first contact). */
const MET = applyEffects(EMPTY_WORLD, [{ kind: 'contact', a: A, b: B, at: T - 10 }]);
const asOther = (id: string, save: Record<string, any>) => [{ id, name: player(id).name, empire: { name: `Empire ${id.slice(-2)}` }, home: save.home.hex, colonies: [save.home.hex], fleets: [] }];

describe('diplomacy as orders the server applies', () => {
  it('declaring war is an order with a shared-world effect, and the other side hears of it', () => {
    const a = saveOf(A), b = saveOf(B);
    const r = applyCommand(a, player(A), T + 0.2, encodeCommand('diplomacy', [B, 'declare-war']), undefined, MET, asOther(B, b))!;
    expect(r.ok).toBe(true);
    expect(r.effects).toEqual([expect.objectContaining({ kind: 'diplomacy', by: A, other: B, action: 'declare-war' })]);
    const world = applyEffects(MET, r.effects);
    expect(relationOf(world.relations, A, B).status).toBe('war');
    // B's next year brings the news.
    const next = advanceSave(b, player(B), T + 1, world, [], asOther(A, a))!;
    expect((next.save as Record<string, any>).dispatches.map((d: { text: string }) => d.text).join('\n')).toContain('Empire 11 has declared war on you');
  });

  it('refuses what is not open, and players who are not in the game', () => {
    const a = saveOf(A), b = saveOf(B);
    const r = applyCommand(a, player(A), T, encodeCommand('diplomacy', [B, 'accept']), undefined, MET, asOther(B, b))!;
    expect(r.effects).toEqual([]);
    const ghost = applyCommand(a, player(A), T, encodeCommand('diplomacy', ['999', 'declare-war']), undefined, EMPTY_WORLD, asOther(B, b))!;
    expect(ghost.effects).toEqual([]);
    expect(applyCommand(a, player(A), T, { name: 'diplomacy', args: [B, 'nuke'] })!.ok).toBe(false);
  });

  it("an ally's colony systems are friendly: fleets resupply there", () => {
    const a = saveOf(A), b = saveOf(B);
    const allied = applyEffects(MET, [
      { kind: 'diplomacy', by: A, other: B, action: 'propose-alliance', at: 1 },
      { kind: 'diplomacy', by: B, other: A, action: 'accept', at: 2 },
    ]);
    // A's scout sits at B's home with its supply spent.
    const at = b.home.hex;
    a.fleets = a.fleets.map((f: { id: string; movement: unknown }) => (f.id === 'scout-1' ? { ...f, movement: { route: [at], departTurn: 0, speed: 1 } } : f));
    a.loadouts['scout-1'] = { ...a.loadouts['scout-1'], supply: 0 };
    const friend = advanceSave(a, player(A), T + 1, allied, [], asOther(B, b))!;
    const stranger = advanceSave(a, player(A), T + 1, EMPTY_WORLD, [], asOther(B, b))!;
    expect((friend.save as Record<string, any>).loadouts['scout-1'].supply).toBeGreaterThan((stranger.save as Record<string, any>).loadouts['scout-1'].supply);
  });
});

describe('first contact', () => {
  const dispatches = (save: unknown) => (save as Record<string, any>).dispatches.map((d: { text: string }) => d.text).join('\n');

  it('no dealings with an empire not met yet: the order is refused with the reason', () => {
    const a = saveOf(A), b = saveOf(B);
    const r = applyCommand(a, player(A), T + 0.2, encodeCommand('diplomacy', [B, 'propose-alliance']), undefined, EMPTY_WORLD, asOther(B, b))!;
    expect(r.effects).toEqual([]);
    expect(dispatches(r.save)).toContain('We have not met Empire 22 yet');
  });

  it('empires meet when a fleet of one comes near a world of the other, and both hear of it', () => {
    const a = saveOf(A), b = saveOf(B);
    const home = b.home.hex;
    const players = [
      { id: A, public: { home: a.home.hex, colonies: [], fleets: [{ id: 'scout-1', movement: { route: [{ q: home.q + 1, r: home.r }], departTurn: T, speed: 1 } }] } },
      { id: B, public: { home, colonies: [home], fleets: [] } },
    ];
    const met = findFirstContacts(players as never, T, EMPTY_WORLD);
    expect(met.map((m) => m.effect)).toEqual([{ kind: 'contact', a: A, b: B, at: T }]);
    const world = applyEffects(EMPTY_WORLD, met.map((m) => m.effect));
    expect(findFirstContacts(players as never, T + 1, world)).toEqual([]);
    const next = advanceSave(b, player(B), T + 1, world, [], asOther(A, a))!;
    expect(dispatches(next.save)).toContain('First contact with Empire 11');
  });
});
