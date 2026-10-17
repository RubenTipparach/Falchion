import type { Mineral, Resource } from './resources';

export interface BuildingDef {
  readonly id: string;
  readonly name: string;
  readonly cost: Partial<Record<Resource, number>>;
  /** Flat yield per turn. */
  readonly yields?: Partial<Record<Resource, number>>;
  /** Extra copies of the planet's own mineral yields (mines). */
  readonly mineralBoost?: number;
  readonly science?: number;
  /** Ships can be built at a planet with this building. */
  readonly shipyard?: boolean;
  /** At most one per planet. */
  readonly unique?: boolean;
  readonly blurb: string;
}

export const BUILDINGS: readonly BuildingDef[] = [
  { id: 'farm', name: 'Hydroponic Farm', cost: { credits: 60, metals: 20 }, yields: { food: 4 }, blurb: '+4 food. Every colony eats 2 a turn.' },
  { id: 'mine', name: 'Deep Mine', cost: { credits: 80, metals: 40 }, mineralBoost: 1, yields: { metals: 2 }, blurb: 'Doubles the planet’s mineral output, +2 metals.' },
  { id: 'trade-hub', name: 'Trade Hub', cost: { credits: 100, metals: 30 }, yields: { credits: 15 }, blurb: '+15 credits from markets and tariffs.' },
  { id: 'shipyard', name: 'Orbital Shipyard', cost: { credits: 150, metals: 120 }, shipyard: true, unique: true, blurb: 'Builds ships here. New ships start in this system.' },
  { id: 'lab', name: 'Research Lab', cost: { credits: 120, crystals: 20 }, science: 4, blurb: '+4 science shards a turn.' },
  { id: 'temple', name: 'Temple', cost: { credits: 80, metals: 10 }, yields: { faith: 3, influence: 1 }, blurb: '+3 faith, +1 influence.' },
];

/** Building slots: bigger worlds hold more; the capital gets two extra. */
export const slotsOf = (size: number, capital = false): number => size + 1 + (capital ? 2 : 0);

/** Every system has an asteroid belt; planets add their own minerals. */
export const BELT_MINERALS: readonly Mineral[] = ['metals'];
