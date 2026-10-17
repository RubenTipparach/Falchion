import type { EncounterKindDef, Rarity } from '../core/encounters/types';

export const ENCOUNTER_KINDS: readonly EncounterKindDef[] = [
  { id: 'trade', name: 'Trade', weight: 3, baseSuccess: 0.85, powerScaling: 0, difficulty: 0, cardsOnSuccess: [2, 3],
    cardWeights: { shards: 2, chassis: 0.3, part: 1, materials: 4 }, failureCost: 'Swindled by local merchants',
    flavour: ['A caravan of {alien} traders hails your ships.', 'A floating bazaar orbits {planet}.'] },
  { id: 'battle', name: 'Battle', weight: 2, baseSuccess: 0.35, powerScaling: 0.03, difficulty: 12, cardsOnSuccess: [3, 5],
    cardWeights: { shards: 3, chassis: 1, part: 2, materials: 2 }, failureCost: 'Ships lost to {alien} raiders',
    flavour: ['{alien} warships decloak over {planet}!', 'An automated {alien} defence grid powers up.'] },
  { id: 'relations', name: 'Relations', weight: 2, baseSuccess: 0.6, powerScaling: 0.01, difficulty: 5, cardsOnSuccess: [1, 3],
    cardWeights: { shards: 4, chassis: 0.5, part: 0.5, materials: 1 }, failureCost: 'A diplomatic incident costs an escort',
    flavour: ['The {alien} of {planet} request an envoy.', 'A {alien} priesthood offers a pilgrimage.'] },
  { id: 'anomaly', name: 'Anomaly', weight: 2, baseSuccess: 0.5, powerScaling: 0.005, difficulty: 8, cardsOnSuccess: [2, 4],
    cardWeights: { shards: 5, chassis: 0.2, part: 1, materials: 2 }, failureCost: 'A probe ship vanishes into the anomaly',
    flavour: ['Gravitational lensing ripples around {planet}.', 'A signal repeats from beneath the ice of {planet}.'] },
  { id: 'derelict', name: 'Derelict', weight: 1.5, baseSuccess: 0.55, powerScaling: 0.02, difficulty: 10, cardsOnSuccess: [3, 4],
    cardWeights: { shards: 3, chassis: 2, part: 3, materials: 1 }, failureCost: 'Boarding party lost to dormant defences',
    flavour: ['A {alien} hulk drifts in high orbit of {planet}.', 'Wreckage of an ancient battle rings {planet}.'] },
];

export const ALIEN_SPECIES = ['Vossk', 'Thal’ari', 'Myrr', 'Quelon', 'Ix', 'Seraphae', 'Krell', 'Oorun'];

export const RARITY_WEIGHTS: ReadonlyArray<readonly [Rarity, number]> = [
  ['common', 60], ['rare', 28], ['epic', 10], ['legendary', 2],
];

export const RARITY_MULTIPLIER: Readonly<Record<Rarity, number>> = { common: 1, rare: 3, epic: 8, legendary: 25 };

export const LOOT_CHASSIS = ['bio-frigate', 'tech-frigate', 'util-hauler', 'geo-prism', 'classic-cruiser', 'alien-corvette'];
export const LOOT_PARTS = ['spore-drive', 'fusion-torch', 'phased-laser', 'acid-spitter', 'fabricator', 'tractor-beam', 'cloak-field'];
