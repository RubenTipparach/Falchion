import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { DEFAULT_DESIGN } from '../../core/ships/ShipDesign';
import { createDefaultShipFactory } from '../ships/defaultRegistries';
import { flipFaces, isSolid, makeOutward, orientation } from './orientation';

describe('face orientation', () => {
  it('reads three.js primitives as outward and a flipped copy as inverted', () => {
    for (const g of [new THREE.BoxGeometry(1, 2, 3), new THREE.SphereGeometry(1, 12, 8), new THREE.CylinderGeometry(1, 0.5, 2, 12)]) {
      expect(orientation(g).outward).toBeGreaterThan(0.9);
      expect(orientation(g).normals).toBeGreaterThan(0.9);
      flipFaces(g);
      expect(orientation(g).outward).toBeLessThan(-0.9);
      expect(makeOutward(g).flipped).toBe(true);
      expect(orientation(g).outward).toBeGreaterThan(0.9);
    }
  });

  it('catches a lathe whose profile runs the "wrong" way', () => {
    const pts = [[0.0001, 1], [0.6, 0.5], [0.8, -0.5], [0.0001, -1]].map(([x, y]) => new THREE.Vector2(x, y));
    const down = new THREE.LatheGeometry(pts, 16);
    const up = new THREE.LatheGeometry([...pts].reverse(), 16);
    expect(Math.sign(orientation(down).outward)).not.toBe(Math.sign(orientation(up).outward));
  });
});

/**
 * Every solid part of every generated ship must face outward. This runs all styles across seeds,
 * sizes and every trait, so a new style, trait or primitive that builds a part inside-out fails here.
 */
describe('procedural ships have no inverted faces', () => {
  const { factory, styles, traits } = createDefaultShipFactory();
  const designs = styles.list().flatMap((s) => [1, 2, 3, 7, 42].flatMap((seed) => [
    { ...DEFAULT_DESIGN, style: s.id, seed, engines: 1 + (seed % 4), weapons: seed % 5 },
    { ...DEFAULT_DESIGN, style: s.id, seed, length: 1.8, bulk: 0.6, traits: traits.list().map((t) => t.id) },
  ]));

  it.each(designs.map((d) => [`${d.style} seed ${d.seed}${d.traits.length ? ' + all traits' : ''}`, d] as const))('%s', (_, design) => {
    const model = factory.create(design);
    const bad: string[] = [];
    model.group.traverse((o) => {
      if (!(o instanceof THREE.Mesh) || !isSolid(o)) return;
      const r = orientation(o.geometry);
      if (r.outward <= 0 || r.normals < 0.5) bad.push(`${o.geometry.type} outward ${r.outward.toFixed(2)} normals ${r.normals.toFixed(2)}`);
    });
    model.dispose();
    expect(bad).toEqual([]);
  });
});

describe('ShipKit primitives', () => {
  it('lathe faces outward whichever way the profile runs', async () => {
    const { ShipKit } = await import('../ships/ShipKit');
    const kit = new ShipKit(DEFAULT_DESIGN);
    const profile = [[0, 1], [0.5, 0.6], [0.6, -0.4], [0, -1]] as const;
    for (const p of [profile, [...profile].reverse()]) {
      const r = orientation(kit.lathe(p, kit.mat.hull).geometry);
      expect(r.outward).toBeGreaterThan(0.5);
      expect(r.normals).toBeGreaterThan(0.5);
    }
  });
});
