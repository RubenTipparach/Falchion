import { describe, expect, it } from 'vitest';
import { planMovement } from '../fleet/Fleet';
import { GalaxyModel, type StarSystem } from '../galaxy/GalaxyModel';
import { hexDistance, hexKey, type Hex } from '../hex/Hex';
import {
  addVisited, alliesOf, COLONY_SIGHT, filterPublicView, filterWorld, hexOfStarId, HOME_SIGHT, lensOf, maskStar, MAX_VISITED, nearVisible,
  SIGHT_RANGE, sightOf, starIdOfPlanet, visibleStars, visionInputOf, visionOf, visionSets, visitedAlong,
} from './Vision';

/** A toy galaxy: a star on every hex whose q is a multiple of 3. */
const everyThird = (h: Hex) => (h.q % 3 === 0 ? { id: hexKey(h) } : null);

describe('vision of an empire', () => {
  it('explores its home, colonies, depots, surveyed systems and visited systems', () => {
    const v = visionOf({ home: { q: 0, r: 0 }, colonyStars: ['30,0'], depots: ['60,1'], surveyedPlanets: ['90,2/1'], visited: ['120,3'] }, everyThird);
    expect(v.explored).toEqual(['0,0', '120,3', '30,0', '60,1', '90,2']);
  });

  it('sights stars within range of what it explored and of its fleets, and all of its territory', () => {
    const v = visionOf({ home: { q: 0, r: 0 }, visited: ['300,0'], fleetHexes: [{ q: 601, r: 0 }] }, everyThird);
    const sighted = v.sighted.map((id) => hexOfStarId(id)!);
    // Everything near home within its territory, near the visited system within sight range.
    expect(sighted.some((h) => hexDistance(h, { q: 0, r: 0 }) === HOME_SIGHT)).toBe(true);
    expect(sighted.filter((h) => h.q >= 290 && h.q < 600).every((h) => hexDistance(h, { q: 300, r: 0 }) <= SIGHT_RANGE)).toBe(true);
    // A fleet between stars sights the stars around it, but explores nothing.
    expect(v.sighted).toContain('600,0');
    expect(v.explored).not.toContain('600,0');
    // Never both explored and sighted.
    expect(v.sighted.filter((id) => v.explored.includes(id))).toEqual([]);
  });

  it('explores a system a fleet is in now', () => {
    expect(visionOf({ fleetHexes: [{ q: 900, r: 5 }] }, everyThird).explored).toEqual(['900,5']);
  });

  it('a colony sights its territory', () => {
    const v = visionOf({ colonyStars: ['3000,0'] }, everyThird);
    expect(v.sighted.map((id) => hexOfStarId(id)!).every((h) => hexDistance(h, { q: 3000, r: 0 }) <= COLONY_SIGHT)).toBe(true);
    expect(v.sighted).toContain('3003,0');
  });

  it('is deterministic and sorted', () => {
    const input = { home: { q: 0, r: 0 }, visited: ['9,9', '3,3'] };
    expect(visionOf(input, everyThird)).toEqual(visionOf(input, everyThird));
    const v = visionOf(input, everyThird);
    expect([...v.sighted].sort()).toEqual(v.sighted);
  });

  it('reads a save: only its own fleets, where they are this year', () => {
    const save = {
      turn: 10, home: { hex: { q: 0, r: 0 } }, economy: { colonies: [{ starId: '0,0' }, { starId: '6,0' }] }, depots: ['9,0'],
      explored: { '12,0/0': {} }, visited: ['15,0'],
      fleets: [
        { id: 'mine', movement: planMovement({ q: 0, r: 0 }, { q: 18, r: 0 }, 0, 1) },
        { id: 'scenery', movement: planMovement({ q: 0, r: 0 }, { q: 30, r: 0 }, 0, 1) },
      ],
      loadouts: { mine: {} },
    };
    const input = visionInputOf(save);
    expect(input.fleetHexes).toEqual([{ q: 10, r: 0 }]);
    expect(input.colonyStars).toEqual(['0,0', '6,0']);
    expect(input.surveyedPlanets).toEqual(['12,0/0']);
  });

  it('planet ids belong to their star', () => {
    expect(starIdOfPlanet('-3,14/2')).toBe('-3,14');
    expect(hexOfStarId('-3,14')).toEqual({ q: -3, r: 14 });
    expect(hexOfStarId('nope')).toBeNull();
  });
});

describe('how a star shows', () => {
  const sets = visionSets([{ explored: ['0,0'], sighted: ['3,0'] }, { explored: ['3,0'], sighted: ['6,0'] }]);

  it('allies add their vision; explored wins over sighted', () => {
    expect([...sets.explored].sort()).toEqual(['0,0', '3,0']);
    expect([...sets.sighted]).toEqual(['6,0']);
    expect([...visibleStars(sets)].sort()).toEqual(['0,0', '3,0', '6,0']);
  });

  it('is explored, sighted, fogged or hidden', () => {
    expect(sightOf('0,0', sets, true)).toBe('explored');
    expect(sightOf('6,0', sets, true)).toBe('sighted');
    expect(sightOf('9,0', sets, false)).toBe('fogged');
    expect(sightOf('9,0', sets, true)).toBe('hidden');
  });

  it('masks a megastructure until its system is explored', () => {
    const galaxy = new GalaxyModel();
    const site = galaxy.megastructures()[0];
    const star = galaxy.starAt(site.hex)!;
    expect(star.megastructure).toBeDefined();
    const unseen = maskStar(star, visionSets([{ explored: [], sighted: [star.id] }]));
    expect(unseen.megastructure).toBeUndefined();
    expect(unseen.planetCount).toBe(0);
    expect(unseen.name).toBe(star.name);
    expect(maskStar(star, visionSets([{ explored: [star.id], sighted: [] }]))).toBe(star);
    // An ordinary star is never changed.
    const plain = { ...star, megastructure: undefined, planetCount: 4 } as StarSystem;
    expect(maskStar(plain, visionSets([]))).toBe(plain);
  });

  it('a lens hides what is hidden and masks what is not explored', () => {
    const galaxy = new GalaxyModel();
    const star = galaxy.starAt(galaxy.megastructures()[0].hex)!;
    const fogged = lensOf(visionSets([]), false);
    expect(fogged.see(star)?.megastructure).toBeUndefined();
    expect(fogged.megastructureSeen(star.id)).toBe(false);
    expect(lensOf(visionSets([]), true).see(star)).toBeNull();
    expect(lensOf(visionSets([{ explored: [star.id], sighted: [] }]), true).see(star)?.megastructure).toBe(star.megastructure);
  });
});

describe('visited systems', () => {
  it('a fleet covers every route hex between two years', () => {
    const m = planMovement({ q: 0, r: 0 }, { q: 10, r: 0 }, 100, 2);
    expect(visitedAlong(m, 100, 101).map(hexKey)).toEqual(['0,0', '1,0', '2,0']);
    expect(visitedAlong(m, 101, 103).map(hexKey)).toEqual(['2,0', '3,0', '4,0', '5,0', '6,0']);
    expect(visitedAlong(m, 104, 200).map(hexKey)).toEqual(['8,0', '9,0', '10,0']);
  });

  it('adds only new systems, keeps the same array when nothing is new, and drops the oldest past the cap', () => {
    const v = addVisited(['a', 'b'], ['b', 'c']);
    expect(v).toEqual(['a', 'b', 'c']);
    expect(addVisited(v, ['a'])).toBe(v);
    expect(addVisited(['a', 'b', 'c'], ['d'], 3)).toEqual(['b', 'c', 'd']);
    expect(MAX_VISITED).toBeGreaterThan(1000);
  });
});

describe('allies', () => {
  it('are the players in an alliance with you', () => {
    const relations = {
      'a|b': { status: 'alliance' as const, since: 0 },
      'a|c': { status: 'war' as const, since: 0 },
      'b|d': { status: 'alliance' as const, since: 0 },
      'a|e': { status: 'alliance' as const, since: 0 },
    };
    expect(alliesOf(relations, 'a')).toEqual(['b', 'e']);
    expect(alliesOf(relations, 'd')).toEqual(['b']);
    expect(alliesOf(undefined, 'a')).toEqual([]);
  });
});

describe('what the server sends while systems are hidden', () => {
  const visible = new Set(['0,0', '30,0']);

  it('another empire shows only its worlds and fleets the player can see', () => {
    const view = {
      color: '#fff', home: { q: 99, r: 0 }, colonies: [{ q: 30, r: 0 }, { q: 60, r: 0 }],
      fleets: [
        { id: 'near', movement: planMovement({ q: 2, r: 0 }, { q: 2, r: 0 }, 0, 1) },
        { id: 'far', movement: planMovement({ q: 50, r: 0 }, { q: 50, r: 0 }, 0, 1) },
        { id: 'broken', movement: { route: [] } },
      ],
    };
    const out = filterPublicView(view, visible, 5);
    expect(out.home).toBeNull();
    expect(out.colonies).toEqual([{ q: 30, r: 0 }]);
    expect(out.fleets.map((f) => (f as { id: string }).id)).toEqual(['near']);
    expect(out.color).toBe('#fff');
    expect(filterPublicView({ ...view, home: { q: 0, r: 0 } }, visible, 5).home).toEqual({ q: 0, r: 0 });
  });

  it('a fleet under way shows once it is near what the player sees', () => {
    const view = { fleets: [{ movement: planMovement({ q: 20, r: 0 }, { q: 0, r: 0 }, 0, 1) }] };
    expect(filterPublicView(view, visible, 5).fleets).toHaveLength(0);
    expect(filterPublicView(view, visible, 17).fleets).toHaveLength(1);
    expect(nearVisible({ q: 3, r: 0 }, visible)).toBe(true);
    expect(nearVisible({ q: 4, r: 0 }, visible)).toBe(false);
  });

  it('only NPC empires the player has met, with their worlds and fleets the player can see', () => {
    const world = {
      tick: 5, asteroids: { f: { left: 1, at: 1 } },
      npcs: {
        met: { knownBy: ['me'], colonies: [{ starId: '30,0' }, { starId: '90,0' }], fleets: [{ from: { q: 1, r: 0 }, to: { q: 1, r: 0 }, depart: 0 }, { from: { q: 80, r: 0 }, to: { q: 80, r: 0 }, depart: 0 }] },
        stranger: { knownBy: ['other'], colonies: [{ starId: '0,0' }], fleets: [] },
      },
    };
    const out = filterWorld(world, 'me', visible, 5);
    expect(Object.keys(out.npcs)).toEqual(['met']);
    expect(out.npcs.met.colonies).toEqual([{ starId: '30,0' }]);
    expect(out.npcs.met.fleets).toHaveLength(1);
    expect(out.asteroids).toBe(world.asteroids);
  });
});
