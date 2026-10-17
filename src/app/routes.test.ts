import { describe, expect, it } from 'vitest';
import { nameSlug, parseRoute, routePath, slugName, type Route } from './Routes';

describe('routes', () => {
  it('round-trips every kind of link', () => {
    const routes: Route[] = [
      { kind: 'home' },
      { kind: 'system', hex: { q: -14697, r: 20078 }, name: 'Norka II' },
      { kind: 'system', hex: { q: -14697, r: 20078 }, name: 'Norka II', planet: 3 },
      { kind: 'system', hex: { q: 5, r: -7 } },
      { kind: 'hex', hex: { q: -14700, r: 20080 } },
      { kind: 'player', id: '123456789012345678' },
    ];
    for (const r of routes) expect(parseRoute(routePath(r))).toEqual(r);
  });

  it('writes readable paths', () => {
    expect(routePath({ kind: 'system', hex: { q: -14697, r: 20078 }, name: 'Norka II', planet: 2 })).toBe('/system/-14697,20078/Norka_II/planet/2');
    expect(nameSlug('Norul-Prime')).toBe('Norul-Prime');
    expect(slugName('Norka_II')).toBe('Norka II');
  });

  it('reads a planet link without a name, and ignores the name otherwise', () => {
    expect(parseRoute('/system/1,2/planet/4')).toEqual({ kind: 'system', hex: { q: 1, r: 2 }, planet: 4 });
    expect(parseRoute('/system/1,2/Anything_At_All/')).toEqual({ kind: 'system', hex: { q: 1, r: 2 }, name: 'Anything At All' });
  });

  it('treats malformed or hostile paths as home', () => {
    for (const p of ['/', '', '/system', '/system/abc', '/system/1.5,2', '/system/99999999,1', '/hex/1', '/player/x', '/player/12', '/admin', '/system/1,2/%E0%A4%A']) {
      const r = parseRoute(p);
      if (p === '/system/1,2/%E0%A4%A') expect(r).toEqual({ kind: 'system', hex: { q: 1, r: 2 } });
      else expect(r).toEqual({ kind: 'home' });
    }
  });
});
