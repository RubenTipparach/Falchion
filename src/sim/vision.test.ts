import { describe, expect, it } from 'vitest';
import { SHARD_SOURCES } from '../content/shardSources';
import { TECH_NODES } from '../content/techTree';
import { HERALDRY } from '../content/heraldry';
import { hexAt } from '../core/fleet/Fleet';
import { GalaxyModel } from '../core/galaxy/GalaxyModel';
import { hexKey } from '../core/hex/Hex';
import { TechTree } from '../core/research/TechTree';
import { suggestIdentity } from '../core/empire/Identity';
import type { GameState } from '../app/GameState';
import { SaveGame } from '../app/SaveGame';
import { createWorld } from '../app/World';
import { encodeCommand } from './commands';
import { advanceSave, applyCommand, foundingOf, refoundSave, visionOfSave } from './headless';
import { newEmpireState } from './newEmpireState';

const ID = '123456789012345678';
const galaxy = new GalaxyModel();
const tree = new TechTree(TECH_NODES, SHARD_SOURCES);
const world = createWorld(galaxy, ID);

function freshSave(t0: number, patch: Partial<GameState> = {}) {
  const state = { ...newEmpireState({ galaxy, tree, world, playerName: 'Ruben', t0 }), ...patch };
  const save = new SaveGame(galaxy.params.seed, null).snapshot(state) as Record<string, unknown>;
  delete save.tab;
  return save;
}

describe('an empire records the systems its ships have been in', () => {
  it('a new empire has visited its home', () => {
    expect(freshSave(1_000).visited).toEqual([world.home.id]);
  });

  it('every star on a fleet’s route becomes visited as it flies through, and is explored', () => {
    const save = freshSave(1_000);
    const scout = (save.fleets as GameState['fleets']).find((f) => f.id === 'scout-1')!;
    const r = advanceSave(save, { id: ID, name: 'Ruben' }, 1_060)!;
    const visited = r.save.visited as string[];
    const stars = scout.movement.route.filter((h, i) => i > 0 && galaxy.starAt(h)).map(hexKey);
    expect(stars.length).toBeGreaterThan(0);
    for (const id of stars) expect(visited).toContain(id);
    const vision = visionOfSave(r.save);
    for (const id of stars) expect(vision.explored).toContain(id);
    // The stars it flew past within sight are sighted.
    expect(vision.sighted.length).toBeGreaterThan(0);
  });

  it('server and client agree: visiting is part of the year, the same on both', () => {
    const save = freshSave(2_000);
    const a = advanceSave(save, { id: ID, name: 'Ruben' }, 2_020)!;
    const b = advanceSave(save, { id: ID, name: 'Ruben' }, 2_020)!;
    expect(a.save.visited).toEqual(b.save.visited);
  });

  it('a fleet sent into deep space reveals the star it stops on', () => {
    const save = freshSave(3_000);
    const home = world.home.hex;
    const target = galaxy.nearestStar({ q: home.q + 12, r: home.r - 4 }, 10)!;
    const ordered = applyCommand(save, { id: ID, name: 'Ruben' }, 3_000, encodeCommand('moveFleetToHex', ['strike-1', target.hex, 'there']))!;
    expect(ordered.ok).toBe(true);
    const later = advanceSave(ordered.save, { id: ID, name: 'Ruben' }, 3_040)!;
    const strike = (later.save.fleets as GameState['fleets']).find((f) => f.id === 'strike-1')!;
    expect(hexAt(strike.movement, 3_040)).toEqual(target.hex);
    expect(later.save.visited).toContain(target.id);
  });
});

describe('the server reset rebuilds an empire from its founding', () => {
  const identity = { ...suggestIdentity(galaxy.params.seed, 'Ruben', 'Karon', HERALDRY), shipStyle: 'organic' };

  it('reads the founding choices from a save', () => {
    const save = freshSave(1_000, { identity });
    const f = foundingOf(save, { id: ID, name: 'Ruben' })!;
    expect(f.identity?.name).toBe(identity.name);
    expect(f.home).toEqual(world.home.hex);
    expect(f.playerName).toBe('Ruben');
    expect(foundingOf({ turn: 1 }, { id: ID, name: 'Ruben' })).toBeNull();
  });

  it('a played empire goes back to its start at the current year, keeping its identity and home', () => {
    const played = advanceSave(freshSave(1_000, { identity }), { id: ID, name: 'Ruben' }, 1_200)!.save;
    const f = foundingOf(played, { id: ID, name: 'Ruben' })!;
    const r = refoundSave(f, { id: ID, name: 'Ruben' }, 5_000);
    const s = r.save as unknown as GameState;
    expect(s.turn).toBe(5_000);
    expect(s.identity?.name).toBe(identity.name);
    expect(s.identity?.flag).toEqual(identity.flag);
    expect(s.home.hex).toEqual(world.home.hex);
    expect(s.economy.colonies).toHaveLength(3);
    expect(s.economy.colonies.find((c) => c.capital)?.name).toBe(identity.capital);
    expect(Object.keys(s.explored)).toEqual([]);
    expect(s.visited).toEqual([world.home.id]);
    // Founded as the founding screen does: the race's ship style on every design, the empire's colour on its fleets.
    expect(Object.values(s.designs).every((d) => d.style === 'organic')).toBe(true);
    expect(s.fleets.every((f) => f.color === identity.color)).toBe(true);
    expect(s.dispatches[0].text).toMatch(/reset/);
    expect(r.public.home).toEqual(world.home.hex);
    expect(r.public.empire?.name).toBe(identity.name);
    // It plays on from there like any empire.
    const next = advanceSave(r.save, { id: ID, name: 'Ruben' }, 5_001)!;
    expect(next.save.turn).toBe(5_001);
  });

  it('the same founding gives the same start (deterministic)', () => {
    const f = foundingOf(freshSave(1_000, { identity }), { id: ID, name: 'Ruben' })!;
    const a = refoundSave(f, { id: ID, name: 'Ruben' }, 7_000).save;
    const b = refoundSave(f, { id: ID, name: 'Ruben' }, 7_000).save;
    expect(a).toEqual(b);
  });

  it('fleets start where a new empire’s do', () => {
    const f = foundingOf(freshSave(1_000, { identity }), { id: ID, name: 'Ruben' })!;
    const s = refoundSave(f, { id: ID, name: 'Ruben' }, 9_000).save as unknown as GameState;
    const fresh = newEmpireState({ galaxy, tree, world, playerName: 'Ruben', t0: 9_000 });
    expect(s.fleets.map((x) => x.movement)).toEqual(fresh.fleets.map((x) => x.movement));
  });
});
