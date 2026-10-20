import { BUILDING_ART_STYLES, DEFAULT_ART_STYLE, type ArtStyle } from '../../content/artStyles';

/**
 * The viewer's building art style (Rendered, Pixel, Marker): a per-browser preference, kept in
 * localStorage. Building thumbnails already on screen switch when it changes.
 */
const KEY = 'falchion.buildingArt';
const listeners = new Set<(style: ArtStyle) => void>();

const storage = (): Storage | null => {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
};

const styleOf = (id: string | null | undefined): ArtStyle =>
  BUILDING_ART_STYLES.find((s) => s.id === id) ?? BUILDING_ART_STYLES.find((s) => s.id === DEFAULT_ART_STYLE)!;

let current: ArtStyle | null = null;

export function buildingArtStyle(): ArtStyle {
  if (!current) {
    let saved: string | null = null;
    try { saved = storage()?.getItem(KEY) ?? null; } catch { /* private window */ }
    current = styleOf(saved);
  }
  return current;
}

export function setBuildingArtStyle(id: string): void {
  current = styleOf(id);
  try { storage()?.setItem(KEY, current.id); } catch { /* not kept */ }
  for (const fn of listeners) fn(current);
}

export function onBuildingArtStyle(fn: (style: ArtStyle) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** The drawn picture of a building in a style (null for the rendered style). */
export function drawnBuildingUrl(style: ArtStyle, id: string): string | null {
  if (!style.dir) return null;
  const base = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
  return `${base}${style.dir}/${id}.png`;
}
