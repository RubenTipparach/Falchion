import type { Resource } from './resources';

/**
 * Commerce (change commerce): what the exchanges trade and at what base price, the rates that
 * shape trading, tariffs and companies, and the names companies and NPC corporations get.
 */

/** Resources the exchanges trade, for credits. */
export const EXCHANGE_RESOURCES: readonly Resource[] = ['food', 'goods', 'metals', 'gases', 'crystals'];

/** Credits per unit before an exchange's taste, the drift and pressure. */
export const BASE_PRICE: Readonly<Partial<Record<Resource, number>>> = { food: 1.5, goods: 4, metals: 1.5, gases: 2, crystals: 5 };

/** Units of a resource that move an exchange's price for you by 100% (more liquid = deeper). */
export const MARKET_DEPTH: Readonly<Partial<Record<Resource, number>>> = { food: 3000, goods: 2000, metals: 4000, gases: 3000, crystals: 1200 };

export const COMMERCE = {
  /** Buying costs this much above the price, selling pays this much below it. */
  spread: 0.1,
  /** How far your own trading can push an exchange's price either way. */
  maxPressure: 0.5,
  /** Pressure kept each year (the rest fades). */
  pressureKeep: 0.97,
  /** Most units in one trade. */
  maxTrade: 5000,
  /** Tariffs players may set, percent. */
  maxTariff: 50,
  /** Fee on share trades. */
  shareFee: 0.02,
  /** Shares in a company, and how many the state keeps when it charters one. */
  shares: 100,
  stateShares: 60,
  /** Corporate tax on profit, and the share of after-tax profit paid out as dividends. */
  tax: 0.15,
  payout: 0.5,
  /** Ships a company may grow to, and years of record it needs before it buys one. */
  maxShips: 8,
  growthRecord: 3,
  /** Fewest years between two ships a company buys. */
  growEvery: 10,
  /** Years of profits a share is priced on (beyond the company's assets). */
  earningsYears: 20,
  /** Years of profit a company remembers. */
  history: 10,
  /** Contract price the state pays a mining company: this share of the base price. */
  contractShare: 0.5,
  /** Price the state sells trade goods to its trading companies at: this share of the base price. */
  goodsShare: 0.75,
  /** What the state pays a colony company for each world it settles. */
  settleFee: 150,
  /** How far (light years) a colony company looks for worlds to settle. */
  colonyReach: 30,
  /** Most shares of one NPC corporation an empire may hold. */
  maxCorpShares: 1000,
} as const;

/** NPC factions' tariffs by archetype, percent, at neutral standing (allies pay less). */
export const NPC_TARIFF: Readonly<Record<string, number>> = { vossk: 14, krell: 10, ithari: 8, morrow: 18, seraph: 9, grey: 6 };
export const DEFAULT_NPC_TARIFF = 10;

/** What kind of company a ship class founds, if any. */
export type CompanyKind = 'trade' | 'mining' | 'colony';

export const COMPANY_KINDS: Readonly<Record<CompanyKind, { readonly name: string; readonly blurb: string; readonly words: readonly string[]; readonly suffixes: readonly string[] }>> = {
  trade: { name: 'Trading company', blurb: 'Buys trade goods from the state and sells them on the best route it knows.', words: ['Shipping', 'Freight', 'Haulage', 'Trading', 'Mercantile'], suffixes: ['Company', 'Line', 'Guild', 'Co.'] },
  mining: { name: 'Mining company', blurb: 'Mines the nearest fields with rock left and sells its ore to the state.', words: ['Mining', 'Ore', 'Prospecting', 'Extraction', 'Minerals'], suffixes: ['Corporation', 'Consortium', 'Combine', 'Works'] },
  colony: { name: 'Colony company', blurb: 'Carries colonists to the best worlds in reach and settles them for a fee.', words: ['Colonial', 'Frontier', 'Settlers', 'Pioneer', 'Homestead'], suffixes: ['Trust', 'Company', 'Society', 'Charter'] },
};

/** NPC corporations: what they do, their names and the share prices they trade around. */
export const CORPORATION_SECTORS: ReadonlyArray<{ readonly word: string; readonly blurb: string }> = [
  { word: 'Mining Combine', blurb: 'Strip-mines the asteroid belts of its home systems.' },
  { word: 'Shipping Guild', blurb: 'Runs the freighter lines between its worlds.' },
  { word: 'Foundries', blurb: 'Forges hull plate and drive cores for its navy.' },
  { word: 'Holdings', blurb: 'Owns a little of everything, and lends to the rest.' },
  { word: 'Agricultural Trust', blurb: 'Feeds its worlds from orbital farms.' },
  { word: 'Arms Works', blurb: 'Builds the guns its raiders carry.' },
  { word: 'Exchange', blurb: 'Clears every trade made on its markets.' },
  { word: 'Biotech', blurb: 'Grows medicines, crops and stranger things.' },
];
