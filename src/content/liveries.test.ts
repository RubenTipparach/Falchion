import { describe, expect, it } from 'vitest';
import { LIVERY_GLSL } from '../render/ships/hullTextures';
import { NPC_ARCHETYPES } from './npcs';
import { DEFAULT_LIVERY, LIVERIES, SHIP_PALETTES, liveryIndex } from './liveries';

describe('liveries (change ship-liveries)', () => {
  it('starts with Plain and has unique ids', () => {
    expect(LIVERIES[0].id).toBe(DEFAULT_LIVERY);
    expect(new Set(LIVERIES.map((l) => l.id)).size).toBe(LIVERIES.length);
    expect(liveryIndex('no-such-livery')).toBe(0);
  });

  it('has a shader case for every livery but Plain, and none beyond the table', () => {
    const cases = [...LIVERY_GLSL.matchAll(/k == (\d+)/g)].map((m) => Number(m[1]));
    expect(cases).toEqual(LIVERIES.slice(1).map((_, i) => i + 1));
  });

  it('gives every NPC faction a livery from the table', () => {
    for (const a of NPC_ARCHETYPES) expect(LIVERIES.some((l) => l.id === a.livery), a.id).toBe(true);
  });

  it('keeps palettes as three hex colours', () => {
    for (const p of SHIP_PALETTES) for (const c of p) expect(c).toMatch(/^#[0-9a-f]{6}$/i);
  });
});
