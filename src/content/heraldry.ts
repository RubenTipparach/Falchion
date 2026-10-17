import type { HeraldryTables } from '../core/empire/Identity';

/* Choices for an empire's identity: colours, flag parts, ruler titles and name parts. */

/*
 * Colours come from the Lospec 500 palette (https://lospec.com/palette-list/lospec500),
 * so every empire and flag shares one coherent look.
 */

/** Empire colours: the palette's brightest, most distinct hues, readable on the dark map. */
export const EMPIRE_COLORS: readonly string[] = [
  '#f3a833', '#ec273f', '#e98537', '#9de64e', '#5ab552', '#6dead6',
  '#36c5f4', '#3388de', '#cc99ff', '#c878af', '#fa6e79', '#f7f3b7',
];

/** Flag colours: the empire colours plus the palette's deep darks, earths and metals. */
export const FLAG_COLORS: readonly string[] = [
  ...EMPIRE_COLORS,
  '#10121c', '#2c1e31', '#6b2643', '#1e4044', '#006554', '#3e3b65',
  '#3859b3', '#4d3533', '#94493a', '#a26d3f', '#b0a7b8', '#ffffff',
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
