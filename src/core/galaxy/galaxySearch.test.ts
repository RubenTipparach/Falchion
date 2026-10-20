import { describe, expect, it } from 'vitest';
import { GalaxyModel, kindOf } from './GalaxyModel';
import { GalaxyScan, type ScanContext, type SearchHit, type SearchQuery } from './GalaxySearch';
import { planetsOf, type Planet } from './Planets';
import { lensOf, visionSets } from '../visibility/Vision';

const galaxy = new GalaxyModel();
const origin = galaxy.nearestStar({ q: 8000, r: 3000 }, 200)!.hex;
const surveyed = new Set<string>();
const ctx: ScanContext = {
  planetsOf: (s) => planetsOf(s, galaxy.params.seed),
  statusOf: (p: Planet) => (surveyed.has(p.id) ? 'surveyed' : 'unsurveyed'),
};
const run = (q: SearchQuery, limit = 20, radius = 400): SearchHit[] => {
  const scan = new GalaxyScan(galaxy, origin, q, ctx, limit, radius);
  const out: SearchHit[] = [];
  while (!scan.done) out.push(...scan.step(5_000));
  return out;
};

describe('galaxy search (change galaxy-search)', () => {
  it('finds planets of a type, nearest first', () => {
    const hits = run({ what: 'planets', biomes: ['ocean'] });
    expect(hits.length).toBe(20);
    expect(hits.every((h) => h.planet?.biome === 'ocean')).toBe(true);
    for (let i = 1; i < hits.length; i++) expect(hits[i].distance).toBeGreaterThanOrEqual(hits[i - 1].distance);
  });

  it('finds stars by kind, and main-sequence stars by class', () => {
    expect(run({ what: 'stars', kinds: ['white-dwarf'] }, 5).every((h) => kindOf(h.star) === 'white-dwarf')).toBe(true);
    const g = run({ what: 'stars', spectral: ['G'] }, 5);
    expect(g.every((h) => kindOf(h.star) === 'main' && h.star.spectral === 'G')).toBe(true);
    expect(run({ what: 'stars', kinds: ['black-hole'] }, 1, 1_000)).toHaveLength(1);
  });

  it('matches names in any case', () => {
    const star = run({ what: 'stars' }, 1)[0].star;
    const part = star.name.slice(1, 4).toUpperCase();
    expect(run({ what: 'stars', text: part }, 30).some((h) => h.star.id === star.id)).toBe(true);
    expect(run({ what: 'planets', text: star.name }, 30).every((h) => h.planet!.name.includes(star.name))).toBe(true);
  });

  it('filters by survey status', () => {
    const first = run({ what: 'planets' }, 3);
    first.forEach((h) => surveyed.add(h.planet!.id));
    const unsurveyed = run({ what: 'planets', status: 'unsurveyed' }, 10);
    expect(unsurveyed.some((h) => surveyed.has(h.planet!.id))).toBe(false);
    expect(run({ what: 'planets', status: 'surveyed' }, 3).map((h) => h.planet!.id).sort()).toEqual(first.map((h) => h.planet!.id).sort());
    surveyed.clear();
  });

  it('is the same in slices or in one go, and searching further carries on without repeats', () => {
    const q: SearchQuery = { what: 'planets', biomes: ['volcanic', 'magma'] };
    const whole = run(q, 30);
    const scan = new GalaxyScan(galaxy, origin, q, ctx, 10, 400);
    const sliced: SearchHit[] = [];
    while (!scan.done) sliced.push(...scan.step(777));
    scan.extend(20);
    while (!scan.done) sliced.push(...scan.step(1_234));
    expect(sliced.map((h) => h.planet!.id)).toEqual(whole.map((h) => h.planet!.id));
  });

  it('stops at its radius', () => {
    const scan = new GalaxyScan(galaxy, origin, { what: 'stars', text: 'no star is called this' }, ctx, 10, 50);
    while (!scan.done) scan.step();
    expect(scan.radius).toBe(50);
    expect(scan.hexes).toBe(1 + 3 * 50 * 51);
  });

  it('finds megastructures anywhere in the galaxy, nearest first, from the galaxy\'s list', () => {
    const scan = new GalaxyScan(galaxy, origin, { what: 'planets', biomes: ['ringworld', 'penrose-sphere'] }, ctx, 5);
    const hits: SearchHit[] = [];
    while (!scan.done) hits.push(...scan.step());
    expect(hits).toHaveLength(5);
    expect(hits.every((h) => h.planet && ['ringworld', 'penrose-sphere'].includes(h.planet.biome))).toBe(true);
    for (let i = 1; i < hits.length; i++) expect(hits[i].distance).toBeGreaterThanOrEqual(hits[i - 1].distance);
    // Further away than any ring walk would reach in one go, and searching further carries on.
    scan.extend(500);
    while (!scan.done) hits.push(...scan.step());
    const all = galaxy.megastructures().filter((m) => m.type === 'ringworld' || m.type === 'penrose-sphere');
    expect(hits.length).toBe(all.length);
  });

  it('lists only the megastructures the player has found, and skips stars hidden from them (change admin-snapshots-and-fog)', () => {
    const query: SearchQuery = { what: 'planets', biomes: ['ringworld', 'penrose-sphere'] };
    const sites = galaxy.megastructures().filter((m) => m.type === 'ringworld' || m.type === 'penrose-sphere');
    const found = galaxy.starAt(sites[3].hex)!;
    const lens = lensOf(visionSets([{ explored: [found.id], sighted: [] }]), false);
    const scan = new GalaxyScan(galaxy, origin, query, { ...ctx, see: lens.see }, 50);
    const hits: SearchHit[] = [];
    while (!scan.done) hits.push(...scan.step());
    expect(hits.map((h) => h.star.id)).toEqual([found.id]);
    // With systems hidden, a star search meets only what the player sees.
    const near = run({ what: 'stars' }, 3);
    const hidden = lensOf(visionSets([{ explored: [near[1].star.id], sighted: [] }]), true);
    const only = new GalaxyScan(galaxy, origin, { what: 'stars' }, { ...ctx, see: hidden.see }, 10, 100);
    const out: SearchHit[] = [];
    while (!only.done) out.push(...only.step());
    expect(out.map((h) => h.star.id)).toEqual([near[1].star.id]);
  });
});
