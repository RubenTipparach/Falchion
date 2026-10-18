import { describe, expect, it } from 'vitest';
import { COMMERCE } from '../../content/commerce';
import { charter, cleanCompanies, companyName, companyYear, sharePrice, shipValue, wantsShip, type Company } from './Companies';
import { cleanCommerce, tariffFor } from './Commerce';
import { corporationsOf, corpPrice } from './Corporations';
import { cleanTariff, fadePressure, npcTariff, priceOf, trade, unitPrice } from './Exchange';
import { applyEffects, EMPTY_WORLD } from '../world/SharedWorld';

const ex = { id: 'npc:c:1,2', tariff: 10 };

describe('exchanges', () => {
  it('quote the same price for the same exchange, resource and year, and drift over the years', () => {
    expect(priceOf(ex, 'metals', 100)).toBe(priceOf(ex, 'metals', 100));
    expect(priceOf(ex, 'metals', 100)).not.toBe(priceOf(ex, 'metals', 300));
    expect(priceOf(ex, 'metals', 100)).not.toBe(priceOf({ ...ex, id: 'npc:c:5,5' }, 'metals', 100));
  });

  it('charge the spread and the tariff both ways', () => {
    const mid = priceOf(ex, 'crystals', 50);
    expect(unitPrice(ex, 'crystals', 50, 'buy')).toBeCloseTo(mid * 1.1 * 1.1);
    expect(unitPrice(ex, 'crystals', 50, 'sell')).toBeCloseTo(mid * 0.9 * 0.9);
  });

  it('are cheaper for what the exchange\'s worlds make', () => {
    expect(priceOf({ ...ex, makes: ['metals'] }, 'metals', 10)).toBeCloseTo(priceOf(ex, 'metals', 10) * 0.8);
  });

  it('move against a big trade, the same in one go as in pieces, and fade over the years', () => {
    const one = trade(ex, 'crystals', 50, 'buy', 500);
    const a = trade(ex, 'crystals', 50, 'buy', 250);
    const b = trade(ex, 'crystals', 50, 'buy', 250, a.pressure);
    expect(one.pressure).toBeGreaterThan(0);
    expect(Math.abs(a.credits + b.credits - one.credits)).toBeLessThanOrEqual(1);
    expect(trade(ex, 'crystals', 50, 'buy', 100, one.pressure).credits).toBeGreaterThan(trade(ex, 'crystals', 50, 'buy', 100).credits);
    const sold = trade(ex, 'metals', 50, 'sell', 400);
    expect(sold.pressure).toBeLessThan(0);
    const faded = fadePressure({ [ex.id]: { crystals: one.pressure } })!;
    expect(faded[ex.id].crystals!).toBeLessThan(one.pressure);
    expect(fadePressure({ [ex.id]: { crystals: 0.0005 } })).toBeUndefined();
  });

  it('sell at the spec\'s price: amount × price × 0.9 × (1 − tariff)', () => {
    const r = trade(ex, 'metals', 77, 'sell', 100);
    const mid = priceOf(ex, 'metals', 77, r.pressure / 2);
    expect(r.credits).toBe(Math.floor(100 * mid * 0.9 * 0.9));
    expect(r.tariff).toBe(Math.round(100 * mid * 0.9 * 0.1));
  });

  it('NPC tariffs fall as standing rises; player tariffs are whole percents up to 50', () => {
    expect(npcTariff('morrow', 60)).toBeLessThan(npcTariff('morrow', 0));
    expect(npcTariff('grey', 100)).toBe(0);
    expect(cleanTariff(72.4)).toBe(COMMERCE.maxTariff);
    expect(cleanTariff(-3)).toBe(0);
    expect(cleanTariff('x')).toBe(0);
    expect(tariffFor({ tariff: 10, tariffs: { bea: 40 } }, 'bea')).toBe(40);
    expect(tariffFor({ tariff: 10, tariffs: { bea: 40 } }, 'cal')).toBe(10);
  });
});

describe('companies', () => {
  const base: Company = { ...charter('co-1', 'Vega Shipping Line', 'trade', 'company-1', 0), treasury: 100 };

  it('are chartered with the state holding 60 of 100 shares', () => {
    expect(base.shares).toBe(100);
    expect(base.held).toBe(60);
  });

  it('pay tax on profit, half the rest as dividends, and keep the remainder', () => {
    const y = companyYear({ ...base, revenue: 300, costs: 50 }, 50);
    expect(y.profit).toBe(200);
    expect(y.tax).toBe(30);
    expect(y.perShare).toBe(0.85);
    expect(y.dividends).toBe(85);
    expect(y.company.treasury).toBe(100 + 170 - 85);
    expect(y.company.revenue).toBe(0);
    expect(y.company.profits).toEqual([200]);
  });

  it('take a loss out of the bank, never below empty, and pay nothing', () => {
    const y = companyYear({ ...base, revenue: 0 }, 400);
    expect(y.tax).toBe(0);
    expect(y.dividends).toBe(0);
    expect(y.company.treasury).toBe(0);
  });

  it('buy a ship only with a profitable record, room and the credits', () => {
    const rich = { ...base, treasury: 500, profits: [10, 20, 30] };
    expect(wantsShip(rich, 2, 200, 50)).toBe(true);
    // A trade run pays in the year it sells: losing years between are fine if the record adds up.
    expect(wantsShip({ ...rich, profits: [-1, -1, -150, -1, 700] }, 2, 200, 50)).toBe(true);
    expect(wantsShip({ ...rich, profits: [10, -40, 5] }, 2, 200, 50)).toBe(false);
    expect(wantsShip({ ...rich, profits: [10, 20] }, 2, 200, 50)).toBe(false);
    expect(wantsShip(rich, COMMERCE.maxShips, 200, 50)).toBe(false);
    expect(wantsShip({ ...rich, treasury: 100 }, 2, 200, 50)).toBe(false);
    // At most one ship every ten years.
    expect(wantsShip({ ...rich, grown: 45 }, 2, 200, 50)).toBe(false);
    expect(wantsShip(rich, 2, 200, 5)).toBe(false);
  });

  it('price shares on assets and profit', () => {
    expect(sharePrice({ treasury: 0, profits: [], shares: 100 }, 200)).toBe(2);
    expect(sharePrice({ treasury: 0, profits: [10], shares: 100 }, 200)).toBe(4);
    expect(sharePrice({ treasury: 0, profits: [-10, 30], shares: 100 }, 200)).toBe(4);
    expect(shipValue({ credits: 80, metals: 50 })).toBe(155);
  });

  it('get unique names from where they were founded', () => {
    const a = companyName('mining', 'Vega', 1, []);
    expect(a.startsWith('Vega ')).toBe(true);
    expect(companyName('mining', 'Vega', 1, [a])).not.toBe(a);
  });

  it('published by others are cleaned', () => {
    const c = cleanCompanies([{ id: 'co-1', name: 'X'.repeat(200), kind: 'trade', shares: 100, held: 900, price: -5, dividend: 1, ships: 2 }, { id: 'bad id!', kind: 'trade', shares: 100 }, { id: 'co-2', kind: 'pirate', shares: 100 }]);
    expect(c).toHaveLength(1);
    expect(c[0].name).toHaveLength(60);
    expect(c[0].held).toBe(100);
    expect(c[0].price).toBe(0);
    expect(cleanCommerce({ tariff: 99, tariffs: { bea: 20, 'no way!': 5 } })).toEqual({ tariff: 50, tariffs: { bea: 20 }, companies: [] });
  });
});

describe('NPC corporations', () => {
  it('are two per faction, the same every time, with prices that swing over the years', () => {
    const corps = corporationsOf({ id: 'c:3,4', name: 'Vossk Hegemony' });
    expect(corps).toHaveLength(2);
    expect(corps[0].name.startsWith('Vossk ')).toBe(true);
    expect(corporationsOf({ id: 'c:3,4', name: 'Vossk Hegemony' })).toEqual(corps);
    const prices = Array.from({ length: 50 }, (_, i) => corpPrice(corps[0], i * 20));
    expect(Math.max(...prices)).toBeGreaterThan(Math.min(...prices) * 1.2);
    expect(corps[0].dividend).toBeGreaterThan(0);
  });
});

describe('the shared world: stakes and payouts', () => {
  it('records who holds shares of a player\'s company', () => {
    let w = applyEffects(EMPTY_WORLD, [{ kind: 'stake', company: 'a:co-1', player: 'b', delta: 10 }]);
    expect(w.stakes).toEqual({ 'a:co-1': { b: 10 } });
    w = applyEffects(w, [{ kind: 'stake', company: 'a:co-1', player: 'b', delta: -10 }]);
    expect(w.stakes).toEqual({});
  });

  it('collects what a player is owed, and keeps what arrived after the claim was made', () => {
    let w = applyEffects(EMPTY_WORLD, [
      { kind: 'payout', to: 'a', label: 'Tariffs from B', credits: 12.5 },
      { kind: 'payout', to: 'a', label: 'Tariffs from B', credits: 7 },
    ]);
    expect(w.payouts).toEqual({ a: { 'Tariffs from B': 19.5 } });
    w = applyEffects(w, [{ kind: 'payout', to: 'a', label: 'Tariffs from B', credits: 5 }, { kind: 'claim', player: 'a', amounts: { 'Tariffs from B': 19 } }]);
    expect(w.payouts).toEqual({ a: { 'Tariffs from B': 5.5 } });
    w = applyEffects(w, [{ kind: 'claim', player: 'a', amounts: { 'Tariffs from B': 5.5 } }]);
    expect(w.payouts).toEqual({});
  });

  it('ignores payouts that are not positive', () => {
    expect(applyEffects(EMPTY_WORLD, [{ kind: 'payout', to: 'a', label: 'x', credits: -3 }])).toBe(EMPTY_WORLD);
  });
});
