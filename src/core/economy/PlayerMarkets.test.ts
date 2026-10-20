import { describe, expect, it } from 'vitest';
import type { Hex } from '../hex/Hex';
import { allPlayerMarkets, marketsFor, playerMarkets, tradingName, type StarLookup } from './PlayerMarkets';

// A tiny galaxy: a star at every hex with q >= 0, named after its coordinates.
const galaxy: StarLookup = { starAt: (h: Hex) => (h.q >= 0 ? { id: `${h.q},${h.r}`, name: `Star ${h.q}.${h.r}` } : null) };
const A = '111111111111111111', B = '222222222222222222', C = '333333333333333333';

describe("other players' worlds as markets", () => {
  it('lists every other empire\'s home and colony systems as player markets, named after star and empire', () => {
    const m = playerMarkets(galaxy, [
      { id: B, name: 'bea', empire: { name: 'Iron Dominion' }, home: { q: 1, r: 1 }, colonies: [{ q: 1, r: 1 }, { q: 2, r: 0 }] },
      { id: A, name: 'me', home: { q: 5, r: 5 }, colonies: [] },
    ], A);
    expect(m).toEqual([
      { starId: '1,1', name: 'Star 1.1 (Iron Dominion)', kind: 'player', player: B },
      { starId: '2,0', name: 'Star 2.0 (Iron Dominion)', kind: 'player', player: B },
    ]);
  });

  it('treats other players\' views as untrusted: bad hexes, empty space and markup are dropped', () => {
    const m = playerMarkets(galaxy, [
      { id: B, name: 'bea', empire: { name: '<img src=x onerror=alert(1)>Evil\nEmpire' }, home: { q: 1.5, r: 0 }, colonies: [null, 'x', { q: -3, r: 0 }, { q: 4, r: 1 }] },
      { id: C, name: 'cat', home: null, colonies: 'nope' },
    ], A);
    expect(m).toHaveLength(1);
    expect(m[0].name).not.toMatch(/[<>\n]/);
    expect(m[0].name).toBe('Star 4.1 (img src=x onerror=alert(1) Evil Empire)');
  });

  it('names an unfounded empire after its account, else "another empire"', () => {
    expect(tradingName({ id: B, name: 'bea' })).toBe('bea');
    expect(tradingName({ id: B, empire: { name: '   ' } })).toBe('another empire');
    expect(tradingName({ id: B, name: 'x'.repeat(500) }).length).toBeLessThanOrEqual(40);
  });

  it('gives every caller the same list: a shared star goes to the lowest other id, whatever the order', () => {
    const players = [
      { id: C, name: 'cat', home: { q: 1, r: 1 } },
      { id: B, name: 'bea', home: { q: 1, r: 1 } },
      { id: A, name: 'me', home: { q: 1, r: 1 } },
    ];
    expect(playerMarkets(galaxy, players, A)).toEqual([{ starId: '1,1', name: 'Star 1.1 (bea)', kind: 'player', player: B }]);
    expect(playerMarkets(galaxy, [...players].reverse(), A)).toEqual(playerMarkets(galaxy, players, A));
    // Built once for everyone, then picked per player: the same answer as building per player.
    const all = allPlayerMarkets(galaxy, players);
    for (const id of [A, B, C]) expect(marketsFor(all, id)).toEqual(playerMarkets(galaxy, players, id));
    expect(marketsFor(all, B)[0].player).toBe(A);
  });

  it('reads at most the 200 colonies (and home) the server keeps of an empire', () => {
    const colonies = Array.from({ length: 500 }, (_, i) => ({ q: i, r: 0 }));
    expect(playerMarkets(galaxy, [{ id: B, home: { q: 0, r: 9 }, colonies }], A)).toHaveLength(201);
  });
});
