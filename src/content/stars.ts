import type { SpectralClass, StarKind } from '../core/galaxy/GalaxyModel';

/** How each kind of star system is named, described and drawn (change worlds-and-stars). */
export interface StarKindDef {
  readonly name: string;
  readonly blurb: string;
  /** Map dot and light colour; null: the spectral class's colour (main-sequence stars). */
  readonly color: string | null;
  /** Size relative to a main-sequence star of its class on the map and in the system view. */
  readonly scale: number;
}

export const STAR_KINDS: Readonly<Record<StarKind, StarKindDef>> = {
  main: { name: 'Main-sequence star', blurb: 'A star burning hydrogen in its core, like the Sun.', color: null, scale: 1 },
  giant: { name: 'Red giant', blurb: 'An old star swollen to hundreds of times its size.', color: '#ff7a3a', scale: 2.6 },
  'white-dwarf': { name: 'White dwarf', blurb: 'The hot, Earth-sized core left when a Sun-like star dies.', color: '#e8f0ff', scale: 0.35 },
  'brown-dwarf': { name: 'Brown dwarf', blurb: 'Too small to burn hydrogen: a dim, magenta failed star.', color: '#a3486b', scale: 0.5 },
  neutron: { name: 'Neutron star', blurb: 'A city-sized remnant of a supernova, denser than an atomic nucleus.', color: '#bfe0ff', scale: 0.22 },
  pulsar: { name: 'Pulsar', blurb: 'A spinning neutron star sweeping beams of radiation across the sky.', color: '#9fd8ff', scale: 0.22 },
  'black-hole': { name: 'Black hole', blurb: 'A collapsed star: an accretion disc glows round a shadow that light cannot leave.', color: '#ffb36b', scale: 0.8 },
  smbh: { name: 'Supermassive black hole', blurb: 'The galaxy\'s heart: about four million suns in one shadow, feeding a vast disc and twin jets.', color: '#ffd9a0', scale: 3 },
};

/** "Class G main-sequence star, binary with a K star" and similar, for cards and labels. */
export function describeStar(s: { readonly kind?: StarKind; readonly spectral: SpectralClass; readonly companions?: readonly SpectralClass[] }): string {
  const kind = s.kind ?? 'main';
  const base = kind === 'main' ? `Class ${s.spectral} star` : STAR_KINDS[kind].name;
  const c = s.companions ?? [];
  if (!c.length) return base;
  return `${base}, ${c.length === 1 ? 'binary' : 'triple'} with ${c.map((x) => `a class ${x}`).join(' and ')} star`;
}
