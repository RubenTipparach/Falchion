import { BASE_PRICE, COMMERCE, DEFAULT_NPC_TARIFF, MARKET_DEPTH, NPC_TARIFF } from '../../content/commerce';
import type { Resource } from '../../content/resources';
import { Rng, hashSeed } from '../rng/Rng';

/**
 * Exchanges (change commerce): every empire you have met runs one, where resources are bought and
 * sold for credits at once. Prices are pure functions of the exchange, the resource and the year,
 * so the server and the browser quote the same; only your own trading (its pressure, kept in your
 * save) moves them for you.
 */

/** An exchange: `npc:<id>` or `player:<id>`, its tariff, and what its worlds make (cheap there). */
export interface ExchangeView {
  readonly id: string;
  /** Percent added to what buyers pay and taken from what sellers get. */
  readonly tariff: number;
  readonly makes?: readonly Resource[];
}

/** Your trading's effect on each exchange's prices, by exchange and resource (−0.5 to +0.5). */
export type Pressure = Readonly<Record<string, Readonly<Partial<Record<Resource, number>>>>>;

/** How much an exchange likes a resource: its own taste, cheaper where its worlds make it. */
function taste(ex: ExchangeView, r: Resource): number {
  const rng = new Rng(hashSeed('taste', ex.id, r));
  return rng.range(0.85, 1.2) * (ex.makes?.includes(r) ? 0.8 : 1);
}

/** A slow swing of ±18% over 240–720 years (4–12 hours). */
function drift(ex: ExchangeView, r: Resource, year: number): number {
  const rng = new Rng(hashSeed('drift', ex.id, r));
  const period = rng.range(240, 720), phase = rng.next();
  return 1 + 0.18 * Math.sin(2 * Math.PI * (year / period + phase));
}

const clampPressure = (p: number) => Math.max(-COMMERCE.maxPressure, Math.min(COMMERCE.maxPressure, p));

/** The price of a resource on an exchange in a year, before the spread and tariff. */
export function priceOf(ex: ExchangeView, r: Resource, year: number, pressure = 0): number {
  const base = BASE_PRICE[r];
  if (!base) return 0;
  return base * taste(ex, r) * drift(ex, r, year) * (1 + clampPressure(pressure));
}

/** A commodity's market price at one year. */
export interface PricePoint {
  readonly year: number;
  readonly price: number;
}

/**
 * A commodity's market price on an exchange over the `span` years up to `year`, at `points` evenly
 * spaced years (the last is `year`): the exchange's own price, without anyone's trading pressure,
 * so every client and the server draw the same history (change holds-and-market-history).
 */
export function priceSeries(ex: ExchangeView, r: Resource, year: number, span: number, points: number): PricePoint[] {
  const n = Math.max(2, Math.floor(points));
  const out: PricePoint[] = [];
  for (let i = 0; i < n; i++) {
    const y = year - span + (span * i) / (n - 1);
    out.push({ year: y, price: priceOf(ex, r, y) });
  }
  return out;
}

/** What one unit costs to buy, or pays to sell, at the current price (no pressure of the trade itself). */
export function unitPrice(ex: ExchangeView, r: Resource, year: number, side: 'buy' | 'sell', pressure = 0): number {
  const mid = priceOf(ex, r, year, pressure);
  const t = ex.tariff / 100;
  return side === 'buy' ? mid * (1 + COMMERCE.spread) * (1 + t) : mid * (1 - COMMERCE.spread) * (1 - t);
}

export interface Trade {
  /** Credits paid (buy) or received (sell). */
  readonly credits: number;
  /** The tariff in that, which goes to the exchange's owner. */
  readonly tariff: number;
  /** Your pressure on this resource there after the trade. */
  readonly pressure: number;
}

/**
 * Buy or sell `amount` units: priced at the average of the pressure before and after it, so one
 * big trade costs the same as many small ones. Buying rounds up, selling down.
 */
export function trade(ex: ExchangeView, r: Resource, year: number, side: 'buy' | 'sell', amount: number, pressure = 0): Trade {
  const depth = MARKET_DEPTH[r] ?? 1000;
  const after = clampPressure(pressure + (side === 'buy' ? 1 : -1) * (amount / depth));
  const mid = priceOf(ex, r, year, (clampPressure(pressure) + after) / 2);
  const spread = side === 'buy' ? 1 + COMMERCE.spread : 1 - COMMERCE.spread;
  const t = ex.tariff / 100;
  const gross = mid * spread * amount;
  const credits = side === 'buy' ? Math.ceil(gross * (1 + t)) : Math.floor(gross * (1 - t));
  return { credits, tariff: Math.round(gross * t), pressure: after };
}

/** Pressure a year later: it fades, and what has all but gone is dropped. */
export function fadePressure(p: Pressure | undefined): Pressure | undefined {
  if (!p) return p;
  const out: Record<string, Partial<Record<Resource, number>>> = {};
  for (const [ex, byRes] of Object.entries(p)) {
    const kept: Partial<Record<Resource, number>> = {};
    for (const [r, v] of Object.entries(byRes)) {
      const n = Math.round((v ?? 0) * COMMERCE.pressureKeep * 10_000) / 10_000;
      if (Math.abs(n) >= 0.001) kept[r as Resource] = n;
    }
    if (Object.keys(kept).length) out[ex] = kept;
  }
  return Object.keys(out).length ? out : undefined;
}

/** An NPC faction's tariff, percent: its archetype's, less a point for every 10 of standing. */
export function npcTariff(archetype: string, standing: number): number {
  const base = NPC_TARIFF[archetype] ?? DEFAULT_NPC_TARIFF;
  return Math.max(0, Math.min(30, Math.round(base - standing / 10)));
}

/** A tariff a player set, made safe: a whole percent from 0 to the maximum. */
export const cleanTariff = (n: unknown): number => (typeof n === 'number' && Number.isFinite(n) ? Math.max(0, Math.min(COMMERCE.maxTariff, Math.round(n))) : 0);
