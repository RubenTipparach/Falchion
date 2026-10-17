import type { CombatBonuses } from '../core/combat/Combat';

/**
 * NPC empire archetypes: how each kind of computer-run empire looks, fights and behaves. Every
 * NPC in the galaxy is one of these, with its own name and home (src/core/npc/NpcCatalog.ts).
 */
export interface NpcArchetype {
  readonly id: string;
  /** Empire names are `${prefix} ${suffix}`: the prefix is the species or house. */
  readonly prefixes: readonly string[];
  readonly suffixes: readonly string[];
  readonly color: string;
  /** Ship style and colours of its hulls. */
  readonly style: string;
  readonly hull: { readonly primary: string; readonly secondary: string; readonly accent: string };
  readonly bonuses: CombatBonuses;
  /** Warships it builds: class, weight, and the tier it needs before it builds them. */
  readonly pool: ReadonlyArray<readonly [classId: string, weight: number, minTier: number]>;
  /** Chance a year that an idle raider fleet at home sets out to raid. */
  readonly aggression: number;
  /** Biome of its worlds (what a captured world is). */
  readonly biome: string;
  /** Technologies spies and conquest can take from it. */
  readonly tech: readonly string[];
  readonly blurb: string;
}

export const NPC_ARCHETYPES: readonly NpcArchetype[] = [
  {
    id: 'vossk', prefixes: ['Vossk', 'Vrask', 'Ossk', 'Khevossk'], suffixes: ['Hegemony', 'Brood', 'Dominion', 'Clutch'],
    color: '#ff5d5d', style: 'organic', hull: { primary: '#5a1f1f', secondary: '#2a0d0d', accent: '#ff3b3b' },
    bonuses: { short: 3, capture: 2, hull: 1 }, aggression: 0.25, biome: 'volcanic',
    pool: [['brawler', 4, 1], ['interceptor', 3, 1], ['boarding-corvette', 2, 2], ['repair-tender', 1, 3], ['leviathan', 1, 5]],
    tech: ['o-ramming-carapace', 'o-brood-pods', 'o-bio-plasma', 'o-ablative-ichor', 'o-parasite-boarders', 'o-void-trawlers'],
    blurb: 'Armoured brawlers and boarders. Keep them at range.',
  },
  {
    id: 'krell', prefixes: ['Krell', 'Kryll', 'Akrel', 'Skreel'], suffixes: ['Swarm', 'Hive', 'Choir', 'Nest'],
    color: '#ff9f43', style: 'organic', hull: { primary: '#6b4a12', secondary: '#2b1d06', accent: '#ffb347' },
    bonuses: { barrage: 3, suppression: 2 }, aggression: 0.2, biome: 'toxic',
    pool: [['missile-barge', 4, 1], ['flak-picket', 2, 1], ['jammer', 2, 2], ['swarm-carrier', 2, 3], ['planet-cracker', 1, 5]],
    tech: ['t-smart-munitions', 'x-hive-mind', 't-swarm-drones', 'g-null-fields', 'u-flak-screens', 't-phase-cloak'],
    blurb: 'Massed missile barrages behind jammers. Bring flak.',
  },
  {
    id: 'ithari', prefixes: ['Ithari', 'Ythra', 'Isskari', 'Thal'], suffixes: ['Concord', 'Lattice', 'Prism', 'Array'],
    color: '#4fd1ff', style: 'geometric', hull: { primary: '#e8f6ff', secondary: '#1b4b6b', accent: '#4fd1ff' },
    bonuses: { long: 3, hull: 1 }, aggression: 0.1, biome: 'desert',
    pool: [['lancer', 4, 1], ['railgun-monitor', 2, 1], ['flak-picket', 1, 2], ['dreadnought', 1, 4], ['monolith', 1, 5]],
    tech: ['g-resonant-drills', 'g-null-fields', 'g-planet-cracker', 't-long-range-sensors'],
    blurb: 'Patient lance fleets that win at range. Close in fast.',
  },
  {
    id: 'morrow', prefixes: ['Morrow', 'Blackwake', 'Redsail', 'Gallow'], suffixes: ['Corsairs', 'Reavers', 'Free Company', 'Raiders'],
    color: '#ffd166', style: 'utilitarian', hull: { primary: '#3a3328', secondary: '#1a1610', accent: '#ffd166' },
    bonuses: { short: 2, capture: 3 }, aggression: 0.35, biome: 'barren',
    pool: [['interceptor', 5, 1], ['boarding-corvette', 3, 1], ['brawler', 2, 2], ['tractor-tender', 1, 3], ['missile-barge', 2, 3]],
    tech: ['u-gas-scoops', 'u-flak-screens', 'o-parasite-boarders'],
    blurb: 'Pirates: fast raiders that take ships rather than sink them.',
  },
  {
    id: 'seraph', prefixes: ['Seraph', 'Auriel', 'Halcyon', 'Luminar'], suffixes: ['Choir', 'Sanctum', 'Covenant', 'Accord'],
    color: '#f2e6c8', style: 'classic', hull: { primary: '#f2f2f2', secondary: '#c9a227', accent: '#7ad7ff' },
    bonuses: { long: 2, suppression: 2, hull: 2 }, aggression: 0.06, biome: 'terran',
    pool: [['railgun-monitor', 3, 1], ['repair-tender', 2, 1], ['lancer', 2, 1], ['flagship', 1, 4], ['dreadnought', 1, 5]],
    tech: ['o-pheromone-diplomacy', 'a-pilgrim-routes'],
    blurb: 'Devout and slow to anger, but their temple worlds are well defended.',
  },
  {
    id: 'grey', prefixes: ['Grey', 'Cinder', 'Ashfall', 'Iron'], suffixes: ['Syndicate', 'Consortium', 'Combine', 'Cartel'],
    color: '#9be29b', style: 'technological', hull: { primary: '#9aa3ad', secondary: '#20262d', accent: '#7cff9b' },
    bonuses: { barrage: 2, long: 1 }, aggression: 0.14, biome: 'ocean',
    pool: [['missile-barge', 3, 1], ['lancer', 3, 1], ['jammer', 1, 2], ['bombard', 1, 3], ['dreadnought', 1, 5]],
    tech: ['t-smart-munitions', 't-automation', 't-regolith-refinery', 't-market-algorithms'],
    blurb: 'Corporate fleets: missiles and lances, paid for by trade.',
  },
];
