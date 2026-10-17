import type { Material } from '../empire/Empire';

export type Rarity = 'common' | 'rare' | 'epic' | 'legendary';

export type Card =
  | { readonly type: 'shards'; readonly rarity: Rarity; readonly nodeId: string; readonly amount: number }
  | { readonly type: 'chassis'; readonly rarity: Rarity; readonly id: string }
  | { readonly type: 'part'; readonly rarity: Rarity; readonly id: string }
  | { readonly type: 'materials'; readonly rarity: Rarity; readonly material: Material; readonly amount: number };

export interface LootCrate {
  readonly tier: Rarity;
  readonly cards: readonly Card[];
}

export interface EncounterKindDef {
  readonly id: string;
  readonly name: string;
  readonly weight: number;
  /** Base chance of success before fleet power. */
  readonly baseSuccess: number;
  /** How much each point of fleet power above difficulty adds to success. */
  readonly powerScaling: number;
  readonly difficulty: number;
  readonly cardsOnSuccess: readonly [min: number, max: number];
  readonly cardWeights: Readonly<Record<Card['type'], number>>;
  readonly failureCost: string;
  readonly flavour: readonly string[];
}

export interface EncounterResult {
  readonly planetId: string;
  readonly kind: string;
  readonly success: boolean;
  readonly successChance: number;
  readonly narrative: string;
  readonly cost: { readonly fleetPower: number; readonly description: string } | null;
  readonly crate: LootCrate | null;
}
