/**
 * How building pictures are drawn (change hand-drawn-art). 'rendered' is the 3D model rendered in
 * the browser by the thumbnail studio; the others are hand-drawn PNGs in public/<dir>/<id>.png,
 * one per building and the capitol, drawn in code (or modelled in Blender) by tools/art (the hand-drawn-art skill).
 */
export interface ArtStyle {
  readonly id: string;
  readonly name: string;
  readonly blurb: string;
  /** Folder under public/ holding <building id>.png; none for the rendered style. */
  readonly dir?: string;
  /** Scale with hard pixel edges (pixel art), not smoothing. */
  readonly pixelated?: boolean;
}

export const BUILDING_ART_STYLES: readonly ArtStyle[] = [
  { id: 'rendered', name: 'Rendered', blurb: 'The 3D models from the planet surface, lit and rendered in your browser.' },
  { id: 'pixel', name: 'Pixel', dir: 'art/buildings/pixel', pixelated: true, blurb: '64 × 64 pixel art: dark outlines, flat colour, dithered shading.' },
  { id: 'ink', name: 'Ink', dir: 'art/buildings/ink', blurb: 'Comic ink: modelled in Blender, cel-shaded in three tones, outlined in Freestyle ink.' },
  { id: 'marker', name: 'Marker', dir: 'art/buildings/marker', blurb: 'Felt-tip marker: wobbly ink, streaky fills and glows.' },
];

/** The owner's pick, 2026-10-18: "Comic ink looks best". */
export const DEFAULT_ART_STYLE = 'ink';
