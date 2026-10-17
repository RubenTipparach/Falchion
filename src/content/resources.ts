/** Raw materials ships mine from asteroid fields, and what an empire earns and makes. */
export type Mineral = 'metals' | 'gases' | 'crystals';
export type Currency = 'credits' | 'influence' | 'faith' | 'food' | 'goods';
export type Resource = Mineral | Currency;

export interface ResourceDef {
  readonly id: Resource;
  readonly name: string;
  readonly short: string;
  readonly color: string;
  readonly source: string;
}

export const RESOURCES: readonly ResourceDef[] = [
  { id: 'credits', name: 'Credits', short: 'CR', color: '#e6b450', source: 'Colonies, taxes, and trade goods sold by freighters' },
  { id: 'influence', name: 'Influence', short: 'INF', color: '#a98bff', source: 'Government, diplomacy and policies' },
  { id: 'faith', name: 'Faith', short: 'FTH', color: '#f29bc9', source: 'Temples and converted worlds' },
  { id: 'food', name: 'Food', short: 'FD', color: '#9ccc65', source: 'Farms and living worlds; every colony eats' },
  { id: 'goods', name: 'Trade goods', short: 'GDS', color: '#ffb074', source: 'Made by colonies; freighters sell them on other worlds' },
  { id: 'metals', name: 'Metals', short: 'MET', color: '#b8c4d6', source: 'Asteroid fields and rocky worlds: hulls and buildings' },
  { id: 'gases', name: 'Gases', short: 'GAS', color: '#9fe3ff', source: 'Gas clouds, comets and giants: fuel and life support' },
  { id: 'crystals', name: 'Crystals', short: 'CRY', color: '#c79bff', source: 'Rare crystal fields: advanced ships and technology' },
];

export const START_RESOURCES: Readonly<Record<Resource, number>> = {
  credits: 600, influence: 20, faith: 0, food: 40, goods: 0, metals: 300, gases: 140, crystals: 60,
};

/**
 * Old materials folded into the new ones, with how many of the new each is worth: saves and
 * stored hauls from before the three raw materials are converted with this.
 */
export const LEGACY_MATERIALS: Readonly<Record<string, readonly [Mineral, number]>> = {
  volatiles: ['gases', 1], ice: ['gases', 1], rareEarths: ['crystals', 1], exotics: ['crystals', 2], darkMatter: ['crystals', 4],
};

/** Per-turn yield of a colony by biome (before bonuses). Living worlds make trade goods. */
export const BIOME_YIELDS: Readonly<Record<string, Partial<Record<Resource, number>>>> = {
  terran: { credits: 12, influence: 1, food: 4, goods: 3 },
  ocean: { credits: 8, gases: 2, food: 3, goods: 2 },
  jungle: { credits: 6, gases: 2, faith: 1, food: 3, goods: 2 },
  desert: { crystals: 2, metals: 2, goods: 1 },
  ice: { gases: 5 },
  volcanic: { metals: 4, crystals: 2 },
  toxic: { gases: 4, crystals: 1 },
  barren: { metals: 6, crystals: 1 },
  gas: { gases: 6 },
};
