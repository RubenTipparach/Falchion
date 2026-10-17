import { describe, expect, it } from 'vitest';
import { BUILDINGS } from '../../content/buildings';
import { PLANET_LOOKS } from '../../content/planetLooks';
import { Rng, hashSeed } from '../rng/Rng';
import { fbmN, snoise } from './Noise';
import { SettlementInput, foreignSeat, modelledBuildings, surfaceLayout, townCount } from './SurfaceLayout';
import { isLand, rawHeight, surfaceLookOf } from './Terrain';

const lookOf = (id: string, biome: string) => surfaceLookOf(PLANET_LOOKS[biome], hashSeed(id, 'surface'));
const colony = (over: Partial<SettlementInput> = {}): SettlementInput => ({ owner: 'own', name: 'Ricasso', capital: true, size: 3, buildings: ['shipyard', 'farm', 'trade-hub'], ...over });

describe('surface noise', () => {
  it('noise is deterministic and bounded', () => {
    expect(snoise(1.3, -2.7, 0.4)).toBe(snoise(1.3, -2.7, 0.4));
    const rng = new Rng(7);
    for (let i = 0; i < 2000; i++) {
      const v = snoise(rng.range(-80, 80), rng.range(-80, 80), rng.range(-80, 80));
      expect(Math.abs(v)).toBeLessThanOrEqual(1.05);
    }
    // Golden values: a change to the hashing (which must match the GLSL) moves these.
    expect(snoise(12.5, -3.25, 7.75)).toBeCloseTo(-0.216847, 5);
    expect(fbmN(0.3, 0.6, -0.2, 7)).toBeCloseTo(0.209166, 5);
  });
});

describe('surface look', () => {
  it('the surface look is the planet-view look', () => {
    // Same seed, same roll order as the planet-view shader: same planet.
    const a = lookOf('12,4/0', 'terran'), b = lookOf('12,4/0', 'terran');
    expect(a).toEqual(b);
    expect(a.sea).toBeGreaterThan(PLANET_LOOKS.terran.sea - 0.081);
    expect(a.sea).toBeLessThan(PLANET_LOOKS.terran.sea + 0.081);
    expect(lookOf('12,4/0', 'desert').dry).toBe(true);
    expect(lookOf('12,4/0', 'barren').craters).toBe(true);
    expect(lookOf('12,4/1', 'terran').seed).not.toEqual(a.seed);
  });
});

describe('surface layout', () => {
  it('same planet id gives the same layout', () => {
    const look = lookOf('40,-7/2', 'terran');
    expect(surfaceLayout('40,-7/2', look, colony())).toEqual(surfaceLayout('40,-7/2', look, colony()));
    const other = surfaceLayout('40,-7/3', lookOf('40,-7/3', 'terran'), colony());
    expect(other.settlements[0].dir).not.toEqual(surfaceLayout('40,-7/2', look, colony()).settlements[0].dir);
  });

  it('towns stand on land', () => {
    for (const [id, biome] of [['1,1/0', 'terran'], ['5,9/1', 'ocean'], ['8,2/0', 'jungle'], ['3,3/2', 'ice'], ['9,9/1', 'toxic']] as const) {
      const look = lookOf(id, biome);
      const layout = surfaceLayout(id, look, colony({ size: 5, buildings: ['farm', 'mine', 'lab', 'temple'] }));
      for (const t of layout.settlements.filter((s) => s.kind === 'town')) {
        expect(isLand(look, rawHeight(look, ...t.dir))).toBe(true);
        expect(rawHeight(look, ...t.dir)).toBeGreaterThan(look.sea);
      }
    }
  });

  it('towns grow with the colony', () => {
    const look = lookOf('22,0/1', 'terran');
    const small = surfaceLayout('22,0/1', look, colony({ capital: false, size: 1, buildings: [] }));
    const big = surfaceLayout('22,0/1', look, colony({ capital: false, size: 4, buildings: ['farm', 'mine', 'lab', 'warehouse'] }));
    const towns = (l: typeof small) => l.settlements.filter((s) => s.kind === 'town');
    expect(townCount(colony({ capital: false, size: 1, buildings: [] }))).toBeLessThan(townCount(colony({ capital: false, size: 4, buildings: ['farm', 'mine', 'lab', 'warehouse'] })));
    expect(towns(big).length).toBeGreaterThan(towns(small).length);
    expect(big.settlements[0].pop).toBeGreaterThan(small.settlements[0].pop);
    expect(towns(big)[0].pop).toBeGreaterThan(towns(small)[0]?.pop ?? 0);
    expect(small.settlements[0].kind).toBe('city');
  });

  it('one site per building', () => {
    const look = lookOf('7,7/0', 'desert');
    const all = BUILDINGS.map((b) => b.id);
    const layout = surfaceLayout('7,7/0', look, colony({ buildings: [...all, 'farm', 'not-a-building'] }));
    expect(layout.buildings.map((b) => b.id).sort()).toEqual([...all, 'farm'].sort());
    expect(layout.buildings.filter((b) => b.orbital).map((b) => b.id)).toEqual(['shipyard']);
    expect(modelledBuildings(colony({ buildings: ['lab', 'farm'] }))).toEqual(['lab', 'farm']);
    const none = surfaceLayout('7,7/0', look, colony({ buildings: ['lab'] }));
    expect(none.buildings.map((b) => b.id)).toEqual(['lab']);
    // Ground buildings sit on the city's flattened plateau.
    const main = layout.settlements[0];
    for (const b of layout.buildings.filter((x) => !x.orbital)) {
      const d = Math.hypot(b.dir[0] - main.dir[0], b.dir[1] - main.dir[1], b.dir[2] - main.dir[2]);
      expect(d).toBeGreaterThan(main.radius);
      expect(d).toBeLessThan(main.flatIn);
    }
  });

  it('foreign worlds get one generic city', () => {
    const look = lookOf('2,5/0', 'jungle');
    const layout = surfaceLayout('2,5/0', look, { owner: 'foreign', name: 'Krell world', capital: true, size: 4, buildings: ['lab'] });
    expect(layout.settlements).toHaveLength(1);
    expect(layout.settlements[0].kind).toBe('city');
    expect(layout.buildings).toHaveLength(0);
    expect(foreignSeat([{ index: 1, biome: 'barren' }, { index: 0, biome: 'gas' }, { index: 2, biome: 'terran' }])?.index).toBe(1);
    expect(foreignSeat([{ index: 0, biome: 'gas' }])).toBeNull();
  });

  it('unsettled worlds have no settlements', () => {
    const look = lookOf('4,4/3', 'barren');
    const layout = surfaceLayout('4,4/3', look, null);
    expect(layout.settlements).toHaveLength(0);
    expect(layout.buildings).toHaveLength(0);
    expect(Math.hypot(...layout.landing)).toBeCloseTo(1, 6);
  });
});
