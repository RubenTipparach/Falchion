import { describe, expect, it } from 'vitest';
import { applyEffects, EMPTY_WORLD } from '../world/SharedWorld';
import { actionsFor, allied, applyDiplomacy, atWar, NEUTRAL, newsOf, pairKey, relationOf, WAR_NOTICE } from './Diplomacy';

const A = 'aa', B = 'bb';
const act = (world: typeof EMPTY_WORLD, by: string, other: string, action: Parameters<typeof applyDiplomacy>[2], at: number) =>
  applyEffects(world, [{ kind: 'diplomacy', by, other, action, at }]);

describe('diplomacy between players', () => {
  it('is neutral until someone acts, the same whichever player asks', () => {
    expect(relationOf(EMPTY_WORLD.relations, A, B)).toEqual(NEUTRAL);
    expect(pairKey(A, B)).toBe(pairKey(B, A));
  });

  it('war is declared by one side and starts a year later', () => {
    const w = act(EMPTY_WORLD, A, B, 'declare-war', 100.5);
    expect(relationOf(w.relations, B, A).status).toBe('war');
    expect(atWar(w.relations, A, B, 100.9)).toBe(false);
    expect(atWar(w.relations, B, A, 100.5 + WAR_NOTICE)).toBe(true);
    expect(newsOf(relationOf(w.relations, A, B), 'Empire A')).toContain('declared war');
  });

  it('peace needs the other side to accept; the proposer cannot accept its own offer', () => {
    let w = act(EMPTY_WORLD, A, B, 'declare-war', 10);
    w = act(w, A, B, 'propose-peace', 20);
    expect(actionsFor(relationOf(w.relations, A, B), A)).toContain('withdraw');
    expect(actionsFor(relationOf(w.relations, A, B), B)).toEqual(expect.arrayContaining(['accept', 'decline']));
    expect(act(w, A, B, 'accept', 21)).toBe(w); // ignored
    w = act(w, B, A, 'accept', 21);
    expect(relationOf(w.relations, A, B).status).toBe('neutral');
    expect(atWar(w.relations, A, B, 30)).toBe(false);
  });

  it('alliances are proposed from neutral and can be broken by either ally', () => {
    let w = act(EMPTY_WORLD, B, A, 'propose-alliance', 5);
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
