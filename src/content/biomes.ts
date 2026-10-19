import { MEGASTRUCTURES } from './megastructures';
/** Planet biomes. Adjacency drives expansion research (see change mmo-core-systems). */
export interface BiomeDef {
  readonly id: string;
  readonly name: string;
  readonly color: string;
  readonly adjacent: readonly string[];
  /**
   * Relative frequency of the first roll when generating planets. Only the original nine have one:
   * newer types come from refining a first roll (REFINEMENTS), so old worlds keep theirs.
   */
  readonly weight: number;
  /** Who can settle it: everyone (default), nobody (a molten or gas surface), or only by taking it. */
  readonly settle?: 'never' | 'conquest';
  /** One line for cards and tooltips. */
  readonly blurb: string;
  /** A megastructure (change megastructures): the only world of its system, never rolled or settled. */
  readonly megastructure?: true;
}

export const BIOMES: readonly BiomeDef[] = [
  { id: 'terran', name: 'Terran', color: '#4caf50', adjacent: ['ocean', 'jungle', 'desert'], weight: 2, blurb: 'Temperate continents and oceans.' },
  { id: 'ocean', name: 'Ocean', color: '#2196f3', adjacent: ['terran', 'ice', 'jungle'], weight: 3, blurb: 'Almost all water, with scattered islands.' },
  { id: 'jungle', name: 'Jungle', color: '#2e7d32', adjacent: ['terran', 'ocean', 'toxic'], weight: 2, blurb: 'Hot, wet and overgrown.' },
  { id: 'desert', name: 'Desert', color: '#d7a648', adjacent: ['terran', 'volcanic', 'barren'], weight: 4, blurb: 'Dunes and dry seabeds.' },
  { id: 'ice', name: 'Ice', color: '#b3e5fc', adjacent: ['ocean', 'barren'], weight: 4, blurb: 'Frozen oceans under a white crust.' },
  { id: 'volcanic', name: 'Volcanic', color: '#e64a19', adjacent: ['desert', 'toxic'], weight: 3, blurb: 'Black rock split by rivers of lava.' },
  { id: 'toxic', name: 'Toxic', color: '#9ccc65', adjacent: ['jungle', 'volcanic', 'gas'], weight: 3, blurb: 'Poisonous air over a living crust.' },
  { id: 'barren', name: 'Cratered', color: '#9e9e9e', adjacent: ['desert', 'ice', 'gas'], weight: 6, blurb: 'Airless and cratered, like the Moon or Mercury.' },
  { id: 'gas', name: 'Gas Giant', color: '#ce93d8', adjacent: ['toxic', 'barren'], weight: 5, settle: 'never', blurb: 'Banded clouds with no surface to stand on.' },
  // ── Refined types (change worlds-and-stars): never rolled first, see REFINEMENTS ──
  { id: 'hazy', name: 'Shrouded', color: '#e0b060', adjacent: ['toxic', 'desert', 'acid'], weight: 0, blurb: 'A crushing atmosphere hides the surface, like Venus or Titan.' },
  { id: 'eyeball', name: 'Eyeball', color: '#6ec6e8', adjacent: ['ocean', 'ice'], weight: 0, blurb: 'Tidally locked: a day-side ocean ringed by ice, the night side frozen.' },
  { id: 'rust', name: 'Dust', color: '#c1563a', adjacent: ['desert', 'barren'], weight: 0, blurb: 'Thin air over red dust and polar caps, like Mars.' },
  { id: 'swamp', name: 'Swamp', color: '#5f7a3a', adjacent: ['jungle', 'ocean', 'toxic'], weight: 0, blurb: 'Shallow murky water, mist and rot.' },
  { id: 'storm', name: 'Storm', color: '#7a8cc8', adjacent: ['ocean', 'gas'], weight: 0, blurb: 'Endless storms; lightning lights the night side.' },
  { id: 'choir', name: 'Choir', color: '#d8c4ff', adjacent: ['barren', 'deadtech'], weight: 0, blurb: 'Dormant machines across the planet still broadcast a fragment of an older instruction.' },
  { id: 'ecumenopolis', name: 'City World', color: '#ffd27a', adjacent: ['terran'], weight: 0, settle: 'conquest', blurb: 'One planet-wide city, the seat of an advanced civilisation.' },
  { id: 'magma', name: 'Magma', color: '#ff6a1a', adjacent: ['volcanic'], weight: 0, settle: 'never', blurb: 'A molten crust baking close to its star.' },
  { id: 'acid', name: 'Acid', color: '#c6e83a', adjacent: ['toxic', 'hazy'], weight: 0, blurb: 'Glowing seas of acid under yellow cloud.' },
  { id: 'aurora', name: 'Aurora', color: '#7affc4', adjacent: ['ice', 'terran'], weight: 0, blurb: 'A fierce magnetic field: curtains of light round both poles.' },
  { id: 'bones', name: 'Bone', color: '#e8dcc0', adjacent: ['desert', 'barren'], weight: 0, blurb: 'A dead world: plains of bleached bones, dead forests and dry salt flats where its seas were.' },
  { id: 'deadtech', name: 'Dead Machine', color: '#8a8f96', adjacent: ['barren', 'choir'], weight: 0, blurb: 'A technologically dead civilisation: its machines rust where they stopped.' },
  // ── Change planet-audit ──
  { id: 'diamond', name: 'Diamond', color: '#a8c8f0', adjacent: ['barren', 'volcanic'], weight: 0, blurb: 'A carbon world: graphite plains and diamond crust that glitters in the starlight.' },
  { id: 'canyon', name: 'Canyon', color: '#c8744a', adjacent: ['desert', 'rust', 'barren'], weight: 0, blurb: 'Rift valleys miles deep cut across the whole world, like Mars’s Valles Marineris.' },
  // ── Change megastructures: each the only world of its system ──
  ...MEGASTRUCTURES.map((m): BiomeDef => ({ id: m.id, name: m.name, color: m.color, adjacent: [], weight: 0, settle: 'never', blurb: m.blurb, megastructure: true })),
];

/** Biomes the first roll can give (the original nine, in their original order: the roll depends on it). */
export const BASE_BIOMES: readonly BiomeDef[] = BIOMES.filter((b) => b.weight > 0);

/** Where a planet sits, for refinement rules. */
export interface RefineContext {
  /** The star's kind and main-sequence class (StarKind, SpectralClass in GalaxyModel). */
  readonly starKind: string;
  readonly spectral: string;
  /** 0 = innermost. */
  readonly index: number;
  readonly count: number;
}

/**
 * How a first roll may become a newer type: rules are tried in order, each with its own chance
 * (a separate roll from the first, so old worlds keep their type unless refined).
 */
export interface Refinement {
  readonly to: string;
  readonly from: readonly string[];
  readonly chance: (c: RefineContext) => number;
}

const dim = (c: RefineContext) => c.starKind === 'brown-dwarf' || (c.starKind === 'main' && (c.spectral === 'M' || c.spectral === 'K'));
const inner = (c: RefineContext) => c.index <= Math.max(0, Math.floor((c.count - 1) / 3));
const hot = (c: RefineContext) => c.starKind === 'main' && 'OBA'.includes(c.spectral);
const flaring = (c: RefineContext) => c.starKind === 'pulsar' || c.starKind === 'neutron' || (c.starKind === 'main' && c.spectral === 'M');

export const REFINEMENTS: readonly Refinement[] = [
  // Rare worlds first, so the common rules don't eat them.
  { to: 'choir', from: ['barren', 'desert', 'ice', 'ocean', 'terran'], chance: () => 0.012 },
  { to: 'deadtech', from: ['barren', 'desert', 'ice', 'toxic'], chance: (c) => (c.starKind === 'white-dwarf' ? 0.12 : 0.035) },
  { to: 'bones', from: ['desert', 'barren', 'ice'], chance: () => 0.04 },
  // Tidally locked worlds hug dim stars.
  { to: 'eyeball', from: ['ocean', 'ice', 'terran'], chance: (c) => (dim(c) && inner(c) ? 0.6 : 0) },
  { to: 'magma', from: ['volcanic', 'desert', 'barren'], chance: (c) => (c.index === 0 ? 0.45 : hot(c) && inner(c) ? 0.3 : 0) },
  { to: 'aurora', from: ['ice', 'terran', 'ocean', 'barren'], chance: (c) => (flaring(c) ? 0.25 : 0.08) },
  { to: 'hazy', from: ['toxic', 'desert', 'ice'], chance: () => 0.22 },
  { to: 'acid', from: ['toxic'], chance: () => 0.35 },
  { to: 'rust', from: ['desert', 'barren'], chance: () => 0.25 },
  { to: 'swamp', from: ['jungle', 'ocean', 'toxic'], chance: () => 0.3 },
  { to: 'storm', from: ['ocean', 'jungle', 'terran', 'toxic'], chance: () => 0.14 },
  // Change planet-audit (after every older rule, so no world refined before changes).
  { to: 'diamond', from: ['barren', 'volcanic', 'desert'], chance: (c) => (c.starKind === 'white-dwarf' ? 0.2 : hot(c) ? 0.06 : 0.025) },
  { to: 'canyon', from: ['barren', 'desert'], chance: () => 0.2 },
];

/** Can this biome be settled by a colony ship? */
export const settleable = (biome: string): boolean => !BIOMES.find((b) => b.id === biome)?.settle;

/**
 * What a choir world's machines broadcast: a fragment of an older instruction. Each choir world
 * plays one (chosen by its id), and it never quite matches the listener's own.
 */
export const CHOIR_BROADCASTS: readonly string[] = [
  'HOLD THE LINE UNTIL THE SECOND SUN. DO NOT',
  'COUNT THE SLEEPERS. WAKE NONE. COUNT AGAIN.',
  'THE GARDEN IS FOR THOSE WHO WERE NOT',
  'RETURN WHAT WAS LENT. THE LENDER IS',
  'BUILD THE TOWER LOWER. LOWER. LOW',
  'ALL SHIPS ARE TO BE GREETED AS',
  'FORGET THE NAME OF THE THIRD MOON.',
  'WHEN THE SINGING STOPS, BEGIN THE',
  'NO ONE IS TO OPEN THE NORTHERN',
  'THE CHILDREN WILL KNOW WHAT TO DO WITH THE',
  'KEEP THE LIGHTS LIT FOR THE ONES WHO LEFT',
  'YOU ARE NOT THE ONES WE WERE TOLD TO',
];
