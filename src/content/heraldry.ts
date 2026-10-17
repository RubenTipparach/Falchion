import type { HeraldryTables } from '../core/empire/Identity';

/* Choices for an empire's identity: colours, flag parts, ruler titles and name parts. */

/** Empire colours: distinct on the dark map and from the alien empires' reds and oranges. */
export const EMPIRE_COLORS: readonly string[] = [
  '#e6b450', '#4fd1ff', '#6ee7a8', '#c792ea', '#ff8fa3', '#7fd3e6',
  '#ffd166', '#a98bff', '#f29bc9', '#9be15d', '#5eead4', '#f8fafc',
];

/** Flag colours: the empire colours plus darks and metals for fields and emblems. */
export const FLAG_COLORS: readonly string[] = [
  ...EMPIRE_COLORS,
  '#0b1220', '#1b2a4a', '#3b0d1a', '#14342b', '#2d1b4e', '#c9a227', '#b8c2d0', '#e05252',
];

export interface FlagPart {
  readonly id: string;
  readonly name: string;
}

/** Field (background) patterns, drawn by src/ui/flag.ts. */
export const FLAG_FIELDS: readonly FlagPart[] = [
  { id: 'solid', name: 'Plain' },
  { id: 'bicolor', name: 'Per pale' },
  { id: 'fess', name: 'Per fess' },
  { id: 'cross', name: 'Cross' },
  { id: 'saltire', name: 'Saltire' },
  { id: 'chevron', name: 'Chevron' },
  { id: 'bend', name: 'Bend' },
  { id: 'border', name: 'Bordure' },
  { id: 'quartered', name: 'Quartered' },
  { id: 'stripes', name: 'Bars' },
  { id: 'canton', name: 'Canton' },
  { id: 'ring', name: 'Orbit' },
];

/** Emblems (charges), drawn by src/ui/flag.ts. */
export const FLAG_EMBLEMS: readonly FlagPart[] = [
  { id: 'none', name: 'None' },
  { id: 'star', name: 'Star' },
  { id: 'sun', name: 'Sun' },
  { id: 'crescent', name: 'Crescent' },
  { id: 'planet', name: 'Ringed world' },
  { id: 'comet', name: 'Comet' },
  { id: 'diamond', name: 'Crystal' },
  { id: 'eye', name: 'Eye' },
  { id: 'crown', name: 'Crown' },
  { id: 'blade', name: 'Falchion' },
  { id: 'atom', name: 'Atom' },
  { id: 'triad', name: 'Triad' },
];

export const RULER_TITLES: readonly string[] = [
  'Emperor', 'Empress', 'Sovereign', 'Chancellor', 'Archon', 'Director', 'High Admiral', 'Prophet', 'First Citizen', 'Overseer',
];

export const EMPIRE_NAME_ADJECTIVES: readonly string[] = [
  'Solar', 'Stellar', 'Celestial', 'Free', 'United', 'Radiant', 'Iron', 'Silver', 'Azure', 'Eternal', 'Sovereign', 'Ascendant',
];

export const EMPIRE_NAME_NOUNS: readonly string[] = [
  'Dominion', 'Republic', 'Concord', 'Imperium', 'Compact', 'Commonwealth', 'Hegemony', 'League', 'Directorate', 'Union', 'Throne', 'Accord',
];

/** Everything the founding screen and identity validation choose from. */
export const HERALDRY: HeraldryTables = {
  colors: EMPIRE_COLORS, flagColors: FLAG_COLORS, fields: FLAG_FIELDS, emblems: FLAG_EMBLEMS,
  titles: RULER_TITLES, adjectives: EMPIRE_NAME_ADJECTIVES, nouns: EMPIRE_NAME_NOUNS,
};
