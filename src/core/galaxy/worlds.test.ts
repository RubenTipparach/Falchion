import { describe, expect, it } from 'vitest';
import { BASE_BIOMES, BIOMES, CHOIR_BROADCASTS, REFINEMENTS } from '../../content/biomes';
import { BIOME_YIELDS } from '../../content/resources';
import { PLANET_LOOKS } from '../../content/planetLooks';
import { allGridNpcs } from '../npc/NpcCatalog';
import { CITY_WORLD_TIER, cityWorldIn, seatOf } from '../npc/CityWorlds';
import fixture from './fixtures/worlds-v1.json';
import { GalaxyModel, kindOf, type StarSystem } from './GalaxyModel';
import { broadcastOf, planetsOf } from './Planets';

const g = new GalaxyModel();

/** Stars along a spiral through the disc (the same walk as the fixture's). */
function sample(n: number): StarSystem[] {
  const out = new Map<string, StarSystem>();
  for (let i = 0; out.size < n && i < n * 12; i++) {
    const a = i * 0.37, r = 200 + i * (30_000 / (n * 12));
    const s = g.nearestStar({ q: Math.round(Math.cos(a) * r), r: Math.round(Math.sin(a) * r) }, 30);
    if (s) out.set(s.id, s);
  }
  return [...out.values()];
}

describe('worlds: existing planets keep their type', () => {
  it('keeps every planet count, size and first roll; a changed type is a refinement of the old one', () => {
    const rows = fixture as Array<[string, string, number, string[]]>;
    let refined = 0;
    for (const [id, , count, planets] of rows) {
      const [q, r] = id.split(',').map(Number);
      const star = g.starAt({ q, r })!;
      expect(star.planetCount, id).toBe(count);
      planetsOf(star, g.params.seed).forEach((p, i) => {
        const [base, size] = planets[i].split(':');
        expect(p.size).toBe(Number(size));
        if (p.biome !== base) {
          refined++;
          expect(REFINEMENTS.some((x) => x.to === p.biome && x.from.includes(base)), `${p.id}: ${base} -> ${p.biome}`).toBe(true);
        }
      });
    }
    // Most worlds stay what they were.
    const total = rows.reduce((s, r) => s + r[2], 0);
    expect(refined).toBeGreaterThan(0);
    expect(refined / total).toBeLessThan(0.45);
  });

  it('has 23 types, each with a look and yields; only the original nine are rolled first', () => {
    expect(BIOMES.length).toBe(23);
    expect(BASE_BIOMES.map((b) => b.id)).toEqual(['terran', 'ocean', 'jungle', 'desert', 'ice', 'volcanic', 'toxic', 'barren', 'gas']);
    for (const b of BIOMES) {
      expect(PLANET_LOOKS[b.id], b.id).toBeDefined();
      expect(BIOME_YIELDS[b.id], b.id).toBeDefined();
    }
  });

  it('makes every new natural type somewhere, and eyeball worlds only round dim stars', () => {
    const seen = new Set<string>();
    for (const star of sample(6000)) {
      for (const p of planetsOf(star, g.params.seed)) {
        seen.add(p.biome);
        if (p.biome === 'eyeball') expect(kindOf(star) === 'brown-dwarf' || (kindOf(star) === 'main' && 'MK'.includes(star.spectral)), star.id).toBe(true);
      }
    }
    for (const b of BIOMES.filter((x) => x.id !== 'ecumenopolis')) expect(seen.has(b.id), b.id).toBe(true);
    expect(seen.has('ecumenopolis')).toBe(false);
  });

  it('gives a choir world the same broadcast for everyone', () => {
    const p = { id: '12,34/2' };
    expect(broadcastOf(p, CHOIR_BROADCASTS)).toBe(broadcastOf(p, CHOIR_BROADCASTS));
    expect(CHOIR_BROADCASTS).toContain(broadcastOf(p, CHOIR_BROADCASTS));
  });
});

describe('stars: the Milky Way makeup', () => {
  const stars = sample(20_000);
  const main = stars.filter((s) => kindOf(s) === 'main');
  const share = (xs: StarSystem[], f: (s: StarSystem) => boolean) => xs.filter(f).length / xs.length;

  it('is mostly red dwarfs, with classes in solar-neighbourhood order', () => {
    expect(share(main, (s) => s.spectral === 'M')).toBeGreaterThan(0.68);
    expect(share(main, (s) => s.spectral === 'M')).toBeLessThan(0.82);
    expect(share(main, (s) => s.spectral === 'K')).toBeGreaterThan(share(main, (s) => s.spectral === 'G'));
    expect(share(main, (s) => s.spectral === 'G')).toBeGreaterThan(share(main, (s) => s.spectral === 'F'));
  });

  it('pairs about half of Sun-like stars and a quarter of red dwarfs with companions', () => {
    const g2 = main.filter((s) => s.spectral === 'G'), m = main.filter((s) => s.spectral === 'M');
    expect(share(g2, (s) => !!s.companions?.length)).toBeGreaterThan(0.38);
    expect(share(g2, (s) => !!s.companions?.length)).toBeLessThan(0.62);
    expect(share(m, (s) => !!s.companions?.length)).toBeGreaterThan(0.18);
    expect(share(m, (s) => !!s.companions?.length)).toBeLessThan(0.34);
  });

  it('holds dwarfs, giants and remnants, and remnants never hold planets', () => {
    const kinds = new Set(stars.map(kindOf));
    for (const k of ['main', 'giant', 'white-dwarf', 'brown-dwarf', 'neutron', 'pulsar', 'black-hole'] as const) expect(kinds.has(k), k).toBe(true);
    expect(share(stars, (s) => kindOf(s) === 'white-dwarf')).toBeGreaterThan(0.05);
    for (const s of stars) if (['neutron', 'pulsar', 'black-hole'].includes(kindOf(s))) expect(s.planetCount).toBe(0);
  });

  it('has a supermassive black hole at the centre', () => {
    const c = g.starAt({ q: 0, r: 0 })!;
    expect(kindOf(c)).toBe('smbh');
    expect(c.planetCount).toBe(0);
  });

  it('is the same every time (golden seed)', () => {
    const a = g.starAt({ q: 202, r: 0 }), b = new GalaxyModel().starAt({ q: 202, r: 0 });
    expect(a).toEqual(b);
  });
});

describe('city worlds', () => {
  it('seats every advanced civilisation on a city world, and no one else', () => {
    const npcs = allGridNpcs(g).slice(0, 400);
    const advanced = npcs.find((d) => d.tier >= CITY_WORLD_TIER && d.home.planetCount > 0);
    const plain = npcs.find((d) => d.tier < CITY_WORLD_TIER && d.home.planetCount > 0);
    expect(advanced).toBeDefined();
    const planets = planetsOf(advanced!.home, g.params.seed);
    expect(cityWorldIn(g, advanced!.home, planets)).toBe(seatOf(planets)?.id ?? null);
    if (plain) expect(cityWorldIn(g, plain.home, planetsOf(plain.home, g.params.seed))).toBeNull();
  });
});
