import { describe, expect, it } from 'vitest';
import { capacity, clampStores, rescaleStores, exploreCost, firepower, fullStores, resupply, spendSupply, type LogisticsSpec } from './Logistics';

const SPECS: Record<string, LogisticsSpec> = {
  cutter: { supply: 12, ammo: 0, ammoUse: 0, ammoRegen: 0 },
  frigate: { supply: 2, ammo: 6, ammoUse: 2, ammoRegen: 1 },
};
const specOf = (id: string) => SPECS[id];
const survey = [{ classId: 'cutter', count: 2 }];
const strike = [{ classId: 'frigate', count: 3 }];

describe('fleet logistics', () => {
  it('sums capacity over squadrons', () => {
    expect(capacity([...survey, ...strike], specOf)).toEqual({ supply: 30, ammo: 18, ammoUse: 6, ammoRegen: 3 });
    expect(fullStores(survey, specOf)).toEqual({ supply: 24, ammo: 0 });
  });

  it('survey ships explore far more than warships', () => {
    const cost = exploreCost({ size: 2 });
    expect(Math.floor(fullStores(survey, specOf).supply / cost)).toBeGreaterThan(Math.floor(fullStores(strike, specOf).supply / cost) * 2);
  });

  it('cannot explore without supply', () => {
    expect(spendSupply({ supply: 1, ammo: 0 }, 2)).toBeNull();
    expect(spendSupply({ supply: 3, ammo: 0 }, 2)).toEqual({ supply: 1, ammo: 0 });
  });

  it('refills fully at a friendly system', () => {
    expect(resupply({ supply: 0, ammo: 0 }, strike, specOf, true)).toEqual({ supply: 6, ammo: 18 });
  });

  it('only regenerates ammunition slowly away from home', () => {
    expect(resupply({ supply: 1, ammo: 4 }, strike, specOf, false)).toEqual({ supply: 1, ammo: 7 });
    expect(resupply({ supply: 1, ammo: 17 }, strike, specOf, false).ammo).toBe(18);
  });

  it('scales firepower by ammunition on hand', () => {
    expect(firepower(18, strike, specOf)).toEqual({ factor: 1, spent: 6 });
    expect(firepower(3, strike, specOf)).toEqual({ factor: 0.5, spent: 3 });
    expect(firepower(0, strike, specOf).factor).toBe(0.15);
    expect(firepower(0, survey, specOf)).toEqual({ factor: 1, spent: 0 });
  });

  it('loses a share of stores with lost ships and stocks new ones', () => {
    const three = [{ classId: 'frigate', count: 3 }];
    const one = [{ classId: 'frigate', count: 1 }];
    expect(rescaleStores({ supply: 6, ammo: 12 }, three, one, specOf)).toEqual({ supply: 2, ammo: 4 });
    expect(rescaleStores({ supply: 2, ammo: 0 }, one, three, specOf)).toEqual({ supply: 6, ammo: 12 });
  });

  it('clamps stores after losses', () => {
    expect(clampStores({ supply: 6, ammo: 18 }, [{ classId: 'frigate', count: 1 }], specOf)).toEqual({ supply: 2, ammo: 6 });
  });
});
