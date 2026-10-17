import type { LootTables } from '../core/encounters/Encounters';
import { ALIEN_SPECIES, ENCOUNTER_KINDS, LOOT_CHASSIS, LOOT_PARTS, RARITY_MULTIPLIER, RARITY_WEIGHTS } from './encounters';

export const DEFAULT_LOOT_TABLES: LootTables = {
  kinds: ENCOUNTER_KINDS,
  species: ALIEN_SPECIES,
  rarityWeights: RARITY_WEIGHTS,
  rarityMultiplier: RARITY_MULTIPLIER,
  chassis: LOOT_CHASSIS,
  parts: LOOT_PARTS,
};
