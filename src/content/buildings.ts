import type { Resource } from './resources';

export interface BuildingDef {
  readonly id: string;
  readonly name: string;
  readonly cost: Partial<Record<Resource, number>>;
  /** Flat yield per year. */
  readonly yields?: Partial<Record<Resource, number>>;
  /** Extra copies of the planet's own mineral yields (mines). */
  readonly mineralBoost?: number;
  readonly science?: number;
  /** Ships can be built at a planet with this building. */
  readonly shipyard?: boolean;
  /** At most one per planet. */
  readonly unique?: boolean;
  /** Extra storage for every mineral and food. */
  readonly storage?: number;
  /** Years (minutes) to build. */
  readonly years: number;
  /** Research node that unlocks it (none: available from the start). */
  readonly unlock?: string;
  readonly blurb: string;
}

export const BUILDINGS: readonly BuildingDef[] = [
  { id: 'farm', years: 2, name: 'Hydroponic Farm', cost: { credits: 60, metals: 20 }, yields: { food: 4 }, blurb: '+4 food. Each point of population eats 2 a year; a world grows only on its own surplus.' },
  { id: 'mine', years: 3, name: 'Deep Mine', cost: { credits: 80, metals: 40 }, mineralBoost: 1, yields: { metals: 2 }, blurb: 'Doubles the planet’s mineral output, +2 metals.' },
  { id: 'manufactory', years: 3, name: 'Manufactory', cost: { credits: 90, metals: 50 }, yields: { goods: 4 }, blurb: '+4 trade goods a year, for freighters to sell.' },
  { id: 'trade-hub', years: 3, name: 'Trade Hub', cost: { credits: 100, metals: 30 }, yields: { credits: 15 }, blurb: '+15 credits from markets and tariffs.' },
  { id: 'shipyard', years: 6, unlock: 'u-modular', name: 'Orbital Shipyard', cost: { credits: 150, metals: 120 }, shipyard: true, unique: true, blurb: 'Builds ships here. New ships start in this system.' },
  { id: 'lab', years: 4, unlock: 't-automation', name: 'Research Lab', cost: { credits: 120, crystals: 20 }, science: 4, blurb: '+4 science shards a year.' },
  { id: 'warehouse', years: 2, name: 'Warehouse', cost: { credits: 70, metals: 50 }, storage: 1000, blurb: '+1,000 storage for every mineral and food.' },
  { id: 'temple', years: 3, unlock: 'o-pheromone-diplomacy', name: 'Temple', cost: { credits: 80, metals: 10 }, yields: { faith: 3, influence: 1 }, blurb: '+3 faith, +1 influence.' },
];

/**
 * Storage caps. Income stops at the cap (the world runs every minute, so
 * stockpiles would otherwise grow without limit while you are away).
 */
export const STORAGE = {
  base: { credits: 4000, influence: 600, faith: 600, food: 500, goods: 600, metals: 1500, gases: 1200, crystals: 800 },
  /** Added per colony to minerals, food and goods. */
  perColony: 150,
  /** Added per colony to credits. */
  creditsPerColony: 500,
} as const;

/** Building slots: bigger worlds hold more; the capital gets two extra. */
export const slotsOf = (size: number, capital = false): number => size + 1 + (capital ? 2 : 0);

