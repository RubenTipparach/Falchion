import type { SpectralClass, StarKind } from '../core/galaxy/GalaxyModel';
import type { Resource } from './resources';

/**
 * Megastructures (change megastructures): a few hundred works of vanished builders across the
 * galaxy. A megastructure system holds its star and the structure and nothing else: the builders
 * spent every last atom of its planets, moons, asteroids and comets on it. Each one is the
 * system's only "world": it can be surveyed (a great one-time cache) but never settled.
 */
export type MegaType =
  | 'ringworld' | 'dyson-swarm' | 'dyson-sphere' | 'stellar-engine' | 'matrioshka-brain' | 'alderson-disk'
  | 'star-lifter' | 'nicoll-dyson-beam' | 'penrose-sphere' | 'neutron-forge' | 'topopolis';

export interface MegaDef {
  readonly id: MegaType;
  readonly name: string;
  /** Map beacon and chip colour. */
  readonly color: string;
  readonly blurb: string;
  /** How many the galaxy holds (about: a draw that finds no fitting star is lost). */
  readonly weight: number;
  /** Star kinds it is built round; for main-sequence stars, the classes too (none: any). */
  readonly hosts: readonly StarKind[];
  readonly classes?: readonly SpectralClass[];
  /** What a survey of it turns up (scaled like a planet's cache) and the science it shows. */
  readonly yields: Partial<Record<Resource, number>>;
  readonly science: number;
}

export const MEGASTRUCTURES: readonly MegaDef[] = [
  { id: 'ringworld', name: 'Ringworld', color: '#7fd17a', weight: 26, hosts: ['main'], classes: ['F', 'G', 'K'], yields: { credits: 30, food: 12, goods: 10, influence: 3 }, science: 8,
    blurb: 'A band millions of kilometres wide circling its star, its inner face a single continent under shadow squares that make the night.' },
  { id: 'dyson-swarm', name: 'Dyson Swarm', color: '#ffc861', weight: 30, hosts: ['main', 'giant'], yields: { credits: 24, metals: 14, crystals: 6 }, science: 6,
    blurb: 'Billions of collectors in crossing orbits, drinking most of their star\'s light.' },
  { id: 'dyson-sphere', name: 'Dyson Sphere', color: '#ff9a3c', weight: 24, hosts: ['main'], classes: ['F', 'G', 'K', 'M'], yields: { credits: 30, metals: 16, crystals: 10 }, science: 10,
    blurb: 'A shell of plates closed round the star. From outside it glows only in the infrared.' },
  { id: 'stellar-engine', name: 'Stellar Engine', color: '#9fd8ff', weight: 20, hosts: ['main', 'giant'], yields: { credits: 20, gases: 18, crystals: 8 }, science: 9,
    blurb: 'A Shkadov thruster: a vast mirror bends the starlight one way, and the star and all it holds are pushed slowly the other.' },
  { id: 'matrioshka-brain', name: 'Matrioshka Brain', color: '#d47bff', weight: 20, hosts: ['main', 'white-dwarf'], yields: { crystals: 18, credits: 16 }, science: 16,
    blurb: 'Nested shells of computers, each running on the waste heat of the one inside. Something still thinks in there.' },
  { id: 'alderson-disk', name: 'Alderson Disk', color: '#c9b27a', weight: 14, hosts: ['main'], classes: ['G', 'K'], yields: { credits: 34, food: 14, goods: 12, metals: 8 }, science: 8,
    blurb: 'A disc thousands of kilometres thick reaching from the star past where its planets were, the star bobbing in a hole at its centre.' },
  { id: 'star-lifter', name: 'Star Lifter', color: '#ff6a4a', weight: 16, hosts: ['giant', 'main'], classes: ['O', 'B', 'A', 'F'], yields: { gases: 26, metals: 12, crystals: 6 }, science: 6,
    blurb: 'Rings of magnetic accelerators at the poles drawing streams of plasma off the star, mining it for its metals.' },
  { id: 'nicoll-dyson-beam', name: 'Nicoll-Dyson Beam', color: '#ffffff', weight: 12, hosts: ['main'], classes: ['O', 'B', 'A', 'F'], yields: { crystals: 14, credits: 20, influence: 4 }, science: 12,
    blurb: 'A swarm turned into one emitter: the whole star\'s output in a single beam, able to scour a world light years away.' },
  { id: 'penrose-sphere', name: 'Penrose Sphere', color: '#ffb36b', weight: 8, hosts: ['black-hole'], yields: { crystals: 22, credits: 24 }, science: 18,
    blurb: 'A lattice round a spinning black hole, throwing matter into its ergosphere and catching more energy back than went in.' },
  { id: 'neutron-forge', name: 'Neutron Forge', color: '#9fe8ff', weight: 14, hosts: ['neutron', 'pulsar'], yields: { metals: 24, crystals: 16 }, science: 12,
    blurb: 'A cage of tethers round a neutron star, cutting degenerate matter off its crust: the densest metal there is.' },
  { id: 'topopolis', name: 'Topopolis', color: '#5ad1c0', weight: 12, hosts: ['main'], classes: ['F', 'G', 'K'], yields: { credits: 32, food: 12, goods: 12, influence: 4 }, science: 8,
    blurb: 'A spinning habitat tube so long it loops round its star again and again, knotted on itself like a garland.' },
];

export const MEGA_BY_ID: Readonly<Record<MegaType, MegaDef>> = Object.fromEntries(MEGASTRUCTURES.map((m) => [m.id, m])) as Record<MegaType, MegaDef>;

export const isMegastructure = (biome: string): biome is MegaType => Object.hasOwn(MEGA_BY_ID, biome);

/** Whether a type can be built round a star. */
export function hostsStar(def: MegaDef, kind: StarKind, spectral: SpectralClass): boolean {
  if (!def.hosts.includes(kind)) return false;
  return kind !== 'main' || !def.classes || def.classes.includes(spectral);
}
