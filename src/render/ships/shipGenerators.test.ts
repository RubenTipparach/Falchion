import { describe, expect, it } from 'vitest';
import { DEFAULT_DESIGN } from '../../core/ships/ShipDesign';
import { createDefaultShipFactory } from './defaultRegistries';
import type { ShipStyleGenerator } from './ShipStyleGenerator';

describe('ship generators', () => {
  const { factory, styles, traits } = createDefaultShipFactory();

  it('provides the six styles', () => {
    expect(styles.list().map((s) => s.id).sort()).toEqual(['classic', 'geometric', 'industrial', 'organic', 'technological', 'utilitarian']);
  });

  it.each(['organic', 'technological', 'classic', 'geometric', 'utilitarian', 'industrial'])('%s is deterministic per design', (style) => {
    for (const seed of [1, 2, 99]) {
      const d = { ...DEFAULT_DESIGN, style, seed, engines: 3, weapons: 3 };
      const a = factory.create(d), b = factory.create(d);
      expect(a.parts).toEqual(b.parts);
      expect(a.parts.filter((p) => p.type === 'engine').length).toBeGreaterThanOrEqual(3);
      expect(a.parts.filter((p) => p.type === 'weapon').length).toBe(3);
      a.dispose(); b.dispose();
    }
  });

  it('different seeds give different layouts', () => {
    const a = factory.create({ ...DEFAULT_DESIGN, style: 'organic', seed: 1 });
    const b = factory.create({ ...DEFAULT_DESIGN, style: 'organic', seed: 2 });
    expect(a.parts).not.toEqual(b.parts);
  });

  it('every trait adds parts to every style', () => {
    for (const s of styles.list()) {
      const base = factory.create({ ...DEFAULT_DESIGN, style: s.id }).parts.length;
      for (const t of traits.list()) {
        const withTrait = factory.create({ ...DEFAULT_DESIGN, style: s.id, traits: [t.id] }).parts;
        expect(withTrait.length, `${s.id}+${t.id}`).toBeGreaterThan(base);
      }
    }
  });

  it('accepts newly registered styles without other changes', () => {
    const custom: ShipStyleGenerator = { id: 'test-blob', name: 'Blob', description: '', build: (kit) => void kit.add(kit.sphere(1, kit.mat.hull), 'hull') };
    styles.register(custom);
    expect(factory.create({ ...DEFAULT_DESIGN, style: 'test-blob' }).parts).toEqual([{ type: 'hull', x: 0, y: 0, z: 0 }]);
  });

  it('every style can be mixed into every other: its pieces are added, deterministically', () => {
    for (const s of styles.list().filter((x) => x.accent)) {
      for (const o of styles.list().filter((x) => x.accent && x.id !== s.id)) {
        const base = factory.create({ ...DEFAULT_DESIGN, style: s.id }).parts;
        const mixed = factory.create({ ...DEFAULT_DESIGN, style: s.id, blend: [o.id] }).parts;
        expect(mixed.length, `${s.id}+${o.id}`).toBeGreaterThan(base.length);
        expect(factory.create({ ...DEFAULT_DESIGN, style: s.id, blend: [o.id] }).parts).toEqual(mixed);
      }
    }
  });
});
