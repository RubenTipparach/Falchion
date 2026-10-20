import { describe, expect, it } from 'vitest';
import { applyEffects, EMPTY_WORLD } from '../world/SharedWorld';
import { actionsFor, allied, applyDiplomacy, atWar, CONTACT_RANGE, firstContacts, haveMet, NEUTRAL, newsOf, pairKey, relationOf, WAR_NOTICE } from './Diplomacy';

const A = 'aa', B = 'bb';
/** A and B have met (first contact): they can deal. */
const MET = applyEffects(EMPTY_WORLD, [{ kind: 'contact', a: A, b: B, at: 0 }]);
const act = (world: typeof EMPTY_WORLD, by: string, other: string, action: Parameters<typeof applyDiplomacy>[2], at: number) =>
  applyEffects(world, [{ kind: 'diplomacy', by, other, action, at }]);

describe('diplomacy between players', () => {
  it('is neutral until someone acts, the same whichever player asks', () => {
    expect(relationOf(EMPTY_WORLD.relations, A, B)).toEqual(NEUTRAL);
    expect(pairKey(A, B)).toBe(pairKey(B, A));
  });

  it('war is declared by one side and starts a year later', () => {
    const w = act(MET, A, B, 'declare-war', 100.5);
    expect(relationOf(w.relations, B, A).status).toBe('war');
    expect(atWar(w.relations, A, B, 100.9)).toBe(false);
    expect(atWar(w.relations, B, A, 100.5 + WAR_NOTICE)).toBe(true);
    expect(newsOf(relationOf(w.relations, A, B), 'Empire A')).toContain('declared war');
  });

  it('peace needs the other side to accept; the proposer cannot accept its own offer', () => {
    let w = act(MET, A, B, 'declare-war', 10);
    w = act(w, A, B, 'propose-peace', 20);
    expect(actionsFor(relationOf(w.relations, A, B), A)).toContain('withdraw');
    expect(actionsFor(relationOf(w.relations, A, B), B)).toEqual(expect.arrayContaining(['accept', 'decline']));
    expect(act(w, A, B, 'accept', 21)).toBe(w); // ignored
    w = act(w, B, A, 'accept', 21);
    expect(relationOf(w.relations, A, B).status).toBe('neutral');
    expect(atWar(w.relations, A, B, 30)).toBe(false);
  });

  it('alliances are proposed from neutral and can be broken by either ally', () => {
    let w = act(MET, B, A, 'propose-alliance', 5);
    w = act(w, A, B, 'accept', 6);
    expect(allied(w.relations, A, B)).toBe(true);
    expect(actionsFor(relationOf(w.relations, A, B), A)).toEqual(expect.arrayContaining(['break-alliance', 'declare-war']));
    w = act(w, B, A, 'break-alliance', 7);
    expect(allied(w.relations, A, B)).toBe(false);
  });

  it('refuses what is not open: peace without war, a second proposal, declining your own', () => {
    expect(applyDiplomacy(NEUTRAL, A, 'propose-peace', 1)).toBeNull();
    const proposed = applyDiplomacy(NEUTRAL, A, 'propose-alliance', 1)!;
    expect(applyDiplomacy(proposed, B, 'propose-alliance', 2)).toBeNull();
    expect(applyDiplomacy(proposed, A, 'decline', 2)).toBeNull();
    expect(act(EMPTY_WORLD, A, A, 'declare-war', 1)).toBe(EMPTY_WORLD);
  });
});

describe('first contact', () => {
  it('nothing can be done with an empire not met yet', () => {
    expect(haveMet(EMPTY_WORLD.contacts, EMPTY_WORLD.relations, A, B)).toBe(false);
    expect(act(EMPTY_WORLD, A, B, 'declare-war', 1)).toBe(EMPTY_WORLD);
    expect(act(EMPTY_WORLD, A, B, 'propose-alliance', 1)).toBe(EMPTY_WORLD);
    expect(haveMet(MET.contacts, MET.relations, B, A)).toBe(true);
    expect(relationOf(act(MET, A, B, 'declare-war', 1).relations, A, B).status).toBe('war');
  });

  it('is recorded once, with when they met', () => {
    expect(MET.contacts?.[pairKey(A, B)]).toBe(0);
    expect(applyEffects(MET, [{ kind: 'contact', a: B, b: A, at: 9 }])).toBe(MET);
    expect(applyEffects(EMPTY_WORLD, [{ kind: 'contact', a: A, b: A, at: 9 }])).toBe(EMPTY_WORLD);
  });

  it('happens when a fleet or world of one comes within range of one of the other', () => {
    const near = firstContacts([
      { player: B, hexes: [{ q: CONTACT_RANGE, r: 0 }] },
      { player: A, hexes: [{ q: 50, r: 50 }, { q: 0, r: 0 }] },
      { player: 'cc', hexes: [{ q: -CONTACT_RANGE - 1, r: 0 }] },
    ], undefined, undefined);
    expect(near).toEqual([{ a: A, b: B, at: { q: 0, r: 0 } }]);
    // Already met: nothing new.
    expect(firstContacts([{ player: A, hexes: [{ q: 0, r: 0 }] }, { player: B, hexes: [{ q: 0, r: 0 }] }], MET.contacts, MET.relations)).toEqual([]);
  });
});
