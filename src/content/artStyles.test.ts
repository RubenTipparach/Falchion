import { describe, expect, it } from 'vitest';
import { BUILDING_ART_STYLES, DEFAULT_ART_STYLE } from './artStyles';
import { BUILDINGS } from './buildings';

/** Every drawn building picture, keyed by its path under public/. */
const PICTURES = new Set(Object.keys(import.meta.glob('../../public/art/buildings/*/*.png')).map((p) => p.replace('../../public/', '')));
const ids = [...BUILDINGS.map((b) => b.id), 'capitol'];
const SIZE: Record<string, number> = { pixel: 64, ink: 128, marker: 128 };

/** Node's fs (the project has no @types/node). */
const fs = (globalThis as unknown as { process: { getBuiltinModule(id: 'node:fs'): { readFileSync(path: URL): Uint8Array } } }).process.getBuiltinModule('node:fs');

/** The width and height a PNG under public/ declares in its IHDR chunk. */
const pngSize = (path: string): [number, number] => {
  const b = fs.readFileSync(new URL(`../../public/${path}`, import.meta.url));
  const u32 = (o: number) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
  return [u32(16), u32(20)];
};

describe('building art styles', () => {
  it('has the rendered default and unique ids', () => {
    expect(BUILDING_ART_STYLES.some((s) => s.id === DEFAULT_ART_STYLE && !s.dir)).toBe(true);
    expect(new Set(BUILDING_ART_STYLES.map((s) => s.id)).size).toBe(BUILDING_ART_STYLES.length);
  });

  it('draws every building and the capitol in each hand-drawn style (tools/art)', () => {
    for (const style of BUILDING_ART_STYLES.filter((s) => s.dir)) {
      expect(ids.filter((id) => !PICTURES.has(`${style.dir}/${id}.png`)), `${style.id} is missing`).toEqual([]);
    }
  });

  it('keeps each style at its size (pixel 64 px, ink and marker 128 px)', () => {
    for (const style of BUILDING_ART_STYLES.filter((s) => s.dir)) {
      expect(SIZE[style.id], `${style.id} has no size`).toBeTruthy();
      for (const id of ids) expect(pngSize(`${style.dir}/${id}.png`), `${style.id}/${id}`).toEqual([SIZE[style.id], SIZE[style.id]]);
    }
  });
});
