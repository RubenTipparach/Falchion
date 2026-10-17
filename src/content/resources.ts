/** Raw materials ships can mine, and the currencies an empire earns. */
export type Mineral = 'metals' | 'volatiles' | 'ice' | 'crystals' | 'rareEarths' | 'exotics' | 'darkMatter';
export type Currency = 'credits' | 'influence' | 'faith' | 'food';
export type Resource = Mineral | Currency;

export interface ResourceDef {
  readonly id: Resource;
  readonly name: string;
  readonly short: string;
  readonly color: string;
  readonly source: string;
}

export const RESOURCES: readonly ResourceDef[] = [
  { id: 'credits', name: 'Credits', short: 'CR', color: '#e6b450', source: 'Trade, colonies and taxes' },
  { id: 'influence', name: 'Influence', short: 'INF', color: '#a98bff', source: 'Government, diplomacy and policies' },
  { id: 'faith', name: 'Faith', short: 'FTH', color: '#f29bc9', source: 'Temples and converted worlds' },
  { id: 'food', name: 'Food', short: 'FD', color: '#9ccc65', source: 'Farms and living worlds; every colony eats' },
  { id: 'metals', name: 'Metals', short: 'MET', color: '#b8c4d6', source: 'Asteroid belts and barren worlds' },
  { id: 'volatiles', name: 'Volatiles', short: 'VOL', color: '#ce93d8', source: 'Gas giants' },
  { id: 'ice', name: 'Ice', short: 'ICE', color: '#9fe3ff', source: 'Comets, ice moons and rings' },
  { id: 'crystals', name: 'Crystals', short: 'CRY', color: '#7fd3e6', source: 'Volcanic and desert crusts' },
  { id: 'rareEarths', name: 'Rare earths', short: 'REE', color: '#d7a648', source: 'Planetary regolith' },
  { id: 'exotics', name: 'Exotic matter', short: 'EXO', color: '#ff8fa3', source: 'Neutron stars and anomalies' },
  { id: 'darkMatter', name: 'Dark matter', short: 'DM', color: '#8a7dff', source: 'Deep nebulae' },
];

export const START_RESOURCES: Readonly<Record<Resource, number>> = {
  credits: 600, influence: 20, faith: 0, food: 40, metals: 300, volatiles: 60, ice: 80, crystals: 40, rareEarths: 20, exotics: 0, darkMatter: 0,
};

/** Per-turn yield of a colony by biome (before bonuses). */
export const BIOME_YIELDS: Readonly<Record<string, Partial<Record<Resource, number>>>> = {
  terran: { credits: 12, influence: 1, food: 4 },
  ocean: { credits: 8, ice: 4, food: 3 },
  jungle: { credits: 6, volatiles: 2, faith: 1, food: 3 },
  desert: { crystals: 3, rareEarths: 2 },
  ice: { ice: 6 },
  volcanic: { metals: 4, crystals: 3 },
  toxic: { volatiles: 4, exotics: 1 },
  barren: { metals: 6, rareEarths: 1 },
  gas: { volatiles: 6 },
};
