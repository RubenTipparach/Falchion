/**
 * Paint schemes for ship hulls (change ship-liveries). A livery paints part of the hull in the
 * design's secondary colour, some with a trim in its accent. The pattern itself is in the hull
 * shader (src/render/ships/hullTextures.ts), picked by the livery's place in this table, so a new
 * livery is a row here and a case there.
 */
export interface Livery {
  readonly id: string;
  readonly name: string;
  readonly blurb: string;
}

export const LIVERIES: readonly Livery[] = [
  { id: 'plain', name: 'Plain', blurb: 'The hull in its primary colour.' },
  { id: 'two-tone', name: 'Two-tone', blurb: 'A secondary belly under a primary back, a trim line between.' },
  { id: 'stripes', name: 'Racing stripes', blurb: 'Twin stripes nose to tail along the spine.' },
  { id: 'nose', name: 'Nose cap', blurb: 'A painted nose and tail, trimmed where they meet the hull.' },
  { id: 'bands', name: 'Bands', blurb: 'Bands round the hull, each edged in trim.' },
  { id: 'chevrons', name: 'Chevrons', blurb: 'Arrowheads pointing forward down the length.' },
  { id: 'harlequin', name: 'Harlequin', blurb: 'Port and starboard in different colours.' },
  { id: 'hazard', name: 'Hazard', blurb: 'Diagonal warning stripes on the stern.' },
  { id: 'tiger', name: 'Tiger', blurb: 'Ragged stripes across the back.' },
];

export const DEFAULT_LIVERY = 'plain';

/** The livery's index in the table (the shader's case), 0 (Plain) for an unknown id. */
export const liveryIndex = (id: string | undefined): number => Math.max(0, LIVERIES.findIndex((l) => l.id === id));

/** Colour schemes the Shipyard offers in one click: [primary, secondary, accent]. */
export const SHIP_PALETTES: ReadonlyArray<readonly [string, string, string]> = [
  ['#b8c4d6', '#3a4a63', '#4fd1ff'], ['#e8e2d0', '#7a2e2e', '#ffb347'], ['#2b2f3a', '#11131a', '#ff3b6b'],
  ['#9fd8b0', '#2f5d48', '#d6ff6b'], ['#f2f2f2', '#c9a227', '#7ad7ff'], ['#7b5ea7', '#2a1e3d', '#ff9bf0'],
  ['#f4f1ea', '#c8102e', '#1d3557'], ['#1b263b', '#e0a526', '#fefae0'], ['#d9d4c7', '#2f6f4f', '#f2c14e'],
  ['#ff8c42', '#2d2a32', '#fff3b0'], ['#5e6b73', '#a3c4bc', '#ff5964'], ['#0b0b0f', '#6a00f4', '#00f5d4'],
];
