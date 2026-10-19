import { describe, expect, it } from 'vitest';
import { BIOMES } from '../../../content/biomes';
import { FLORA, floraOf } from '../../../content/flora';
import { propGeometry } from './FloraModels';

describe('surface flora (change surface-flora)', () => {
  it('gives every planet type with a surface something on its ground, and gas giants and megastructures nothing', () => {
    for (const b of BIOMES) {
      const layers = floraOf(b.id);
      if (b.id === 'gas' || b.megastructure) expect(layers, b.id).toHaveLength(0);
      else expect(layers.length, b.id).toBeGreaterThan(0);
    }
  });

  it('builds every prop kind, with the attributes its shader reads', () => {
    const kinds = new Set(Object.values(FLORA).flat().flatMap((l) => l.entries.map((e) => e.kind)));
    for (const kind of kinds) {
      const g = propGeometry(kind);
      const n = g.getAttribute('position').count;
      expect(n, kind).toBeGreaterThan(0);
      for (const a of ['normal', 'color', 'aTint', 'aEmit']) expect(g.getAttribute(a)?.count, `${kind} ${a}`).toBe(n);
      g.computeBoundingBox();
      // About a unit tall or long, standing on (or lying at) y = 0.
      expect(g.boundingBox!.min.y, kind).toBeGreaterThan(-0.15);
      expect(Math.max(g.boundingBox!.max.y, g.boundingBox!.max.x - g.boundingBox!.min.x), kind).toBeLessThan(1.6);
      g.dispose();
    }
  });

  it('keeps props smaller than the cell they stand in, and living worlds green', () => {
    for (const [biome, layers] of Object.entries(FLORA)) for (const l of layers) {
      expect(l.fill, biome).toBeGreaterThan(0);
      expect(l.fill, biome).toBeLessThanOrEqual(1);
      for (const e of l.entries) {
        expect(e.size[0], `${biome} ${e.kind}`).toBeLessThanOrEqual(e.size[1]);
        // Heights; the far layer's megatowers are tall and slim (about a fifth as wide), on cells 0.004 across.
        expect(e.size[1], `${biome} ${e.kind}`).toBeLessThan({ large: 0.003, small: 0.0003, far: 0.013 }[l.layer]);
      }
    }
    expect(floraOf('jungle').flatMap((l) => l.entries).some((e) => e.living)).toBe(true);
    expect(floraOf('ecumenopolis').flatMap((l) => l.entries).some((e) => e.kind === 'block')).toBe(true);
    expect(floraOf('bones').flatMap((l) => l.entries).some((e) => e.kind === 'bones' || e.kind === 'ribcage')).toBe(true);
  });
});
