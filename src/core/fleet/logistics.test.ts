import { describe, expect, it } from 'vitest';
import { capacity, clampStores, rescaleStores, exploreCost, fullStores, resupply, spendSupply, type LogisticsSpec } from './Logistics';

const SPECS: Record<string, LogisticsSpec> = {
  cutter: { supply: 12 },
  frigate: { supply: 2 },
};
const specOf = (id: string) => SPECS[id];
const survey = [{ classId: 'cutter', count: 2 }];
const strike = [{ classId: 'frigate', count: 3 }];

describe('fleet logistics', () => {
  it('sums capacity over squadrons', () => {
    expect(capacity([...survey, ...strike], specOf)).toEqual({ supply: 30 });
    expect(fullStores(survey, specOf)).toEqual({ supply: 24 });
  });

  it('survey ships explore far more than warships', () => {
    const cost = exploreCost({ size: 2 });
    expect(Math.floor(fullStores(survey, specOf).supply / cost)).toBeGreaterThan(Math.floor(fullStores(strike, specOf).supply / cost) * 2);
  });

  it('cannot explore without supply', () => {
    expect(spendSupply({ supply: 1 }, 2)).toBeNull();
    expect(spendSupply({ supply: 3 }, 2)).toEqual({ supply: 1 });
  });

  it('refills fully at a friendly system, and not elsewhere', () => {
    expect(resupply({ supply: 0 }, strike, specOf, true)).toEqual({ supply: 6 });
    expect(resupply({ supply: 1 }, strike, specOf, false)).toEqual({ supply: 1 });
  });

  it('loses a share of stores with lost ships and stocks new ones', () => {
    const three = [{ classId: 'frigate', count: 3 }];
    const one = [{ classId: 'frigate', count: 1 }];
    expect(rescaleStores({ supply: 6 }, three, one, specOf)).toEqual({ supply: 2 });
    expect(rescaleStores({ supply: 2 }, one, three, specOf)).toEqual({ supply: 6 });
  });

  it('clamps stores after losses', () => {
    expect(clampStores({ supply: 6 }, [{ classId: 'frigate', count: 1 }], specOf)).toEqual({ supply: 2 });
  });
});
