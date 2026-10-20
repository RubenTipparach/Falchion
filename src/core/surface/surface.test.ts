import { describe, expect, it } from 'vitest';
import { BUILDINGS } from '../../content/buildings';
import { PLANET_LOOKS } from '../../content/planetLooks';
import { Rng, hashSeed } from '../rng/Rng';
import { fbmN, gradientOf, snoise } from './Noise';
import { MAX_MAJORS, MAX_SETTLEMENTS, SettlementInput, foreignSeat, majorCount, modelledBuildings, surfaceLayout, townCount } from './SurfaceLayout';
import { isLand, rawHeight, surfaceLookOf } from './Terrain';

const lookOf = (id: string, biome: string) => surfaceLookOf(PLANET_LOOKS[biome], hashSeed(id, 'surface'));
/** Golden values for planet 12,4/0 (terran) with the default colony. */
const GOLDEN_MAIN_X = 0.887153021502;
const GOLDEN_ROADS = 5;
const colony = (over: Partial<SettlementInput> = {}): SettlementInput => ({ owner: 'own', name: 'Ricasso', capital: true, size: 3, buildings: ['shipyard', 'farm', 'trade-hub'], pop: 4, ...over });

describe('surface noise', () => {
  it('noise is deterministic and bounded', () => {
    expect(snoise(1.3, -2.7, 0.4)).toBe(snoise(1.3, -2.7, 0.4));
    const rng = new Rng(7);
    for (let i = 0; i < 2000; i++) {
      const v = snoise(rng.range(-80, 80), rng.range(-80, 80), rng.range(-80, 80));
      expect(Math.abs(v)).toBeLessThanOrEqual(1.05);
    }
    // Float32 (the GPU) picks the same gradient for every hash: on the gz = 0 boundary the CPU
    // and the GPU used to round to opposite sides and flip different gradients.
    for (let j = 0; j < 49; j++) {
      const a = gradientOf(j), b = gradientOf(j, Math.fround);
      for (let k = 0; k < 3; k++) expect(Math.abs(a[k] - b[k])).toBeLessThan(1e-6);
    }
    // Golden values: a change to the hashing (which must match the GLSL) moves these.
    expect(snoise(12.5, -3.25, 7.75)).toBeCloseTo(-0.216599, 5);
    expect(fbmN(0.3, 0.6, -0.2, 7)).toBeCloseTo(0.20911, 5);
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
      for (const t of layout.settlements.slice(1)) {
        expect(isLand(look, rawHeight(look, ...t.dir))).toBe(true);
        expect(rawHeight(look, ...t.dir)).toBeGreaterThan(look.sea);
      }
    }
  });

  it('one major city per point of population', () => {
    const look = lookOf('22,0/1', 'terran');
    for (const pop of [1, 2, 5, 9, 14]) {
      const c = colony({ pop });
      const l = surfaceLayout('22,0/1', look, c);
      const majors = l.settlements.filter((s) => s.major);
      // Exactly that many major cities, the capital first, then the cities; towns after them.
      expect(majors).toHaveLength(pop);
      expect(majorCount(c)).toBe(pop);
      expect(l.settlements[0]).toMatchObject({ kind: 'capital', major: true, name: 'Ricasso' });
      expect(majors.slice(1).every((s) => s.kind === 'city')).toBe(true);
      expect(l.settlements.slice(0, pop).every((s) => s.major)).toBe(true);
      expect(l.settlements.slice(pop).every((s) => s.kind === 'town' && !s.major)).toBe(true);
      expect(l.settlements.length - pop).toBe(townCount(c));
      // Deterministic: the same colony always gives the same cities in the same places.
      expect(surfaceLayout('22,0/1', look, c).settlements).toEqual(l.settlements);
    }
    // A colony that is not the capital: its main city is a city.
    expect(surfaceLayout('22,0/1', look, colony({ capital: false, pop: 3 })).settlements[0].kind).toBe('city');
    // Growth adds cities without moving the ones already there.
    const four = surfaceLayout('22,0/1', look, colony({ pop: 4 })).settlements.filter((s) => s.major);
    const six = surfaceLayout('22,0/1', look, colony({ pop: 6 })).settlements.filter((s) => s.major);
    expect(six[0].dir).toEqual(four[0].dir);
    // Caps: never more cities than drawn, nor more settlements than the shader takes.
    expect(majorCount(colony({ pop: 500 }))).toBe(MAX_MAJORS);
    expect(majorCount(colony({ pop: 500 })) + townCount(colony({ pop: 500 }))).toBeLessThanOrEqual(MAX_SETTLEMENTS);
    // Settlements stand apart: their plateaus do not overlap.
    const l = surfaceLayout('22,0/1', look, colony({ pop: 12 }));
    for (let i = 0; i < l.settlements.length; i++) for (let j = i + 1; j < l.settlements.length; j++) {
      const a = l.settlements[i], b = l.settlements[j];
      expect(Math.hypot(a.dir[0] - b.dir[0], a.dir[1] - b.dir[1], a.dir[2] - b.dir[2])).toBeGreaterThan(Math.max(a.flatOut, b.flatOut));
    }
  });

  it('golden layout', () => {
    // A change to placement moves these: every player's colonies would rearrange.
    const look = lookOf('12,4/0', 'terran');
    const l = surfaceLayout('12,4/0', look, colony());
    expect(l.settlements.filter((s) => s.major)).toHaveLength(4);
    expect(l.settlements[0].dir[0]).toBeCloseTo(GOLDEN_MAIN_X, 6);
    expect(l.roads.length).toBe(GOLDEN_ROADS);
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
    const layout = surfaceLayout('2,5/0', look, { owner: 'foreign', name: 'Krell world', capital: true, size: 4, buildings: ['lab'], pop: 7 });
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
