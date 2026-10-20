import { BASE_PRICE, COMMERCE, COMPANY_KINDS, type CompanyKind } from '../../content/commerce';
import type { Resource } from '../../content/resources';
import type { ShipClassDef } from '../../content/shipClasses';
import { FREIGHTER } from './Trade';
import { Rng, hashSeed } from '../rng/Rng';

/**
 * Companies (change commerce): a civilian ship built under charter founds a company that owns it
 * as its own fleet and runs it. A company's accounts are kept here, purely: what it earned and
 * spent during a year is settled at the start of the next (tax and dividends to its shareholders,
 * the rest kept), and with a profitable record and enough in the bank it buys another ship.
 */
export interface Company {
  readonly id: string;
  readonly name: string;
  readonly kind: CompanyKind;
  /** The fleet it runs (its ships are in that fleet's loadout, not the state's roster). */
  readonly fleetId: string;
  readonly founded: number;
  /** Shares in all, and how many the state holds (the rest are floated or held by other empires). */
  readonly shares: number;
  readonly held: number;
  readonly treasury: number;
  /** Earned and spent so far this year (settled next year). */
  readonly revenue: number;
  readonly costs: number;
  /** Profit of each of the last years, oldest first. */
  readonly profits: readonly number[];
  /** Dividend per share paid last year. */
  readonly dividend: number;
  /** Year it last bought a ship. */
  readonly grown?: number;
}

/** A company as other empires see it (public view): enough to price and buy its shares. */
export interface PublicCompany {
  readonly id: string;
  readonly name: string;
  readonly kind: CompanyKind;
  readonly shares: number;
  readonly held: number;
  readonly price: number;
  readonly dividend: number;
  readonly ships: number;
}

/** What a ship is worth in credits: its credits plus its materials at base prices. */
export function shipValue(cost: Readonly<Partial<Record<Resource, number>>>): number {
  let v = 0;
  for (const [r, n] of Object.entries(cost)) v += (n ?? 0) * (r === 'credits' ? 1 : BASE_PRICE[r as Resource] ?? 3);
  return Math.round(v);
}

const average = (xs: readonly number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/** A share's price: the company's assets plus some years of its average profit, per share. */
export function sharePrice(c: Pick<Company, 'treasury' | 'profits' | 'shares'>, fleetValue: number): number {
  const earnings = Math.max(0, average(c.profits)) * COMMERCE.earningsYears;
  return Math.max(0.01, Math.round(((c.treasury + fleetValue + earnings) / Math.max(1, c.shares)) * 100) / 100);
}

/** Shares nobody holds but the public: what can be bought. */
export const floatOf = (c: Pick<Company, 'shares' | 'held'>, outside: number): number => Math.max(0, c.shares - c.held - outside);

export interface CompanyYear {
  readonly company: Company;
  readonly profit: number;
  readonly tax: number;
  /** Dividends in all, and per share. */
  readonly dividends: number;
  readonly perShare: number;
}

/**
 * Settle a company's year: its ships' upkeep is paid, then tax on any profit; half of what is
 * left is paid out as dividends and the rest kept. A loss comes out of the bank (never below empty).
 */
export function companyYear(c: Company, upkeep: number): CompanyYear {
  const profit = Math.round(c.revenue - c.costs - upkeep);
  const tax = Math.round(Math.max(0, profit) * COMMERCE.tax);
  const after = profit - tax;
  const perShare = after > 0 ? Math.floor((after * COMMERCE.payout * 100) / c.shares) / 100 : 0;
  const dividends = Math.round(perShare * c.shares);
  const company: Company = {
    ...c, revenue: 0, costs: 0, dividend: perShare,
    treasury: Math.max(0, Math.round(c.treasury + after - dividends)),
    profits: [...c.profits, profit].slice(-COMMERCE.history),
  };
  return { company, profit, tax, dividends, perShare };
}

/**
 * Whether a company buys another ship this year: room to grow, the credits, and a profitable record
 * (at least a few years old, and its remembered years add up to a profit: a trade run earns in
 * the year it sells, not every year).
 */
export function wantsShip(c: Company, ships: number, price: number, year: number): boolean {
  return ships < COMMERCE.maxShips && c.treasury >= price && c.profits.length >= COMMERCE.growthRecord && c.profits.reduce((a, b) => a + b, 0) > 0
    && year - (c.grown ?? c.founded) >= COMMERCE.growEvery;
}

/** A new company's name, from where it was founded: "Vega Shipping Line". Unique among `taken`. */
export function companyName(kind: CompanyKind, place: string, seed: number, taken: readonly string[]): string {
  const k = COMPANY_KINDS[kind];
  const rng = new Rng(hashSeed(seed, 'company', kind, place));
  for (let i = 0; i < 12; i++) {
    const name = `${place} ${rng.pick(k.words)} ${rng.pick(k.suffixes)}`;
    if (!taken.includes(name)) return name;
  }
  let n = 2;
  while (taken.includes(`${place} ${k.words[0]} ${k.suffixes[0]} ${n}`)) n++;
  return `${place} ${k.words[0]} ${k.suffixes[0]} ${n}`;
}

/** A freshly chartered company: the state holds most of it, the rest is floated. */
export function charter(id: string, name: string, kind: CompanyKind, fleetId: string, year: number): Company {
  return { id, name, kind, fleetId, founded: year, shares: COMMERCE.shares, held: COMMERCE.stateShares, treasury: 0, revenue: 0, costs: 0, profits: [], dividend: 0 };
}

/** Other empires' published companies, made safe (untrusted input): at most 40, with sane numbers. */
export function cleanCompanies(raw: unknown): PublicCompany[] {
  if (!Array.isArray(raw)) return [];
  const num = (v: unknown, max: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(max, v)) : 0);
  const out: PublicCompany[] = [];
  for (const c of raw.slice(0, 40)) {
    if (!c || typeof c.id !== 'string' || !/^[\w-]{1,40}$/.test(c.id) || !(c.kind in COMPANY_KINDS)) continue;
    const shares = Math.round(num(c.shares, 10_000));
    if (!shares) continue;
    out.push({
      id: c.id, name: typeof c.name === 'string' ? c.name.slice(0, 60) : 'Company', kind: c.kind as CompanyKind,
      shares, held: Math.round(num(c.held, shares)), price: num(c.price, 1e7), dividend: num(c.dividend, 1e6), ships: Math.round(num(c.ships, 100)),
    });
  }
  return out;
}

/** What a fleet's ships are worth (see shipValue), given each class's cost. */
export function fleetValue(ships: ReadonlyArray<{ readonly classId: string; readonly count: number }>, costOf: (classId: string) => Readonly<Partial<Record<Resource, number>>> | undefined): number {
  return ships.reduce((v, x) => v + x.count * shipValue(costOf(x.classId) ?? {}), 0);
}

/** What kind of company a civilian ship class founds: miners, freighters and colony arks. */
export function companyKindOf(c: Pick<ShipClassDef, 'id' | 'mines'> | undefined): CompanyKind | null {
  if (!c) return null;
  if (c.mines) return 'mining';
  if (c.id === FREIGHTER) return 'trade';
  if (c.id === 'colony-ark') return 'colony';
  return null;
}
