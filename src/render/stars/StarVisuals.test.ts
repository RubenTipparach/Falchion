import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { SpectralClass, StarKind, StarSystem } from '../../core/galaxy/GalaxyModel';
import { isSolid, orientation } from '../geometry/orientation';
import { createStarVisual, starColor, starRadius } from './StarVisuals';

const KINDS: StarKind[] = ['main', 'giant', 'white-dwarf', 'brown-dwarf', 'neutron', 'pulsar', 'black-hole', 'smbh'];

function star(kind: StarKind, spectral: SpectralClass = 'G', companions: SpectralClass[] = []): StarSystem {
  return { id: `${kind}-${spectral}-${companions.join('')}`, hex: { q: 3, r: 4 }, name: 'Test', spectral, planetCount: 3, kind, companions, position: { x: 0, y: 0, z: 0 } };
}

describe('star visuals', () => {
  it('builds every kind, animates, and keeps solid parts facing outward', () => {
    for (const kind of KINDS) {
      const v = createStarVisual(star(kind));
      expect(v.object3d.children.length).toBeGreaterThan(0);
      v.update(12.5);
      v.object3d.traverse((o) => {
        if (o instanceof THREE.Mesh && isSolid(o)) expect(orientation(o.geometry).outward, kind).toBeGreaterThan(0);
      });
      v.dispose();
    }
  });

  it('sizes and colours stars by kind, main-sequence stars by class', () => {
    expect(starRadius(star('main', 'O'))).toBeGreaterThan(starRadius(star('main', 'M')));
    expect(starRadius(star('giant', 'K'))).toBeGreaterThan(starRadius(star('main', 'O')));
    expect(starRadius(star('neutron'))).toBeLessThan(starRadius(star('white-dwarf')));
    expect(starRadius(star('smbh'))).toBeGreaterThan(starRadius(star('black-hole')));
    expect(starColor(star('main', 'M'))).not.toBe(starColor(star('brown-dwarf', 'M')));
  });

  it('keeps companions and discs inside what they report as their reach', () => {
    for (const companions of [['K'], ['M', 'M'], ['G', 'K']] as SpectralClass[][]) {
      const v = createStarVisual(star('main', 'O', companions));
      let reach = 0;
      for (const t of [0, 7, 31]) {
        v.update(t);
        v.object3d.updateMatrixWorld(true);
        v.object3d.traverse((o) => {
          if (!(o instanceof THREE.Mesh && o.geometry instanceof THREE.SphereGeometry)) return;
          const c = o.getWorldPosition(new THREE.Vector3());
          reach = Math.max(reach, c.length() + o.geometry.parameters.radius);
        });
      }
      expect(reach).toBeLessThanOrEqual(v.clearance + 1e-6);
      expect(v.clearance).toBeGreaterThan(v.radius);
    }
    // A plain main-sequence star leaves the usual first planet orbit (0.06 ly) clear.
    expect(createStarVisual(star('main', 'O')).clearance).toBeLessThan(0.06);
  });

  it('dims and warms the light black holes and brown dwarfs cast', () => {
    const lum = (c: THREE.Color) => c.r + c.g + c.b;
    expect(lum(createStarVisual(star('black-hole')).light)).toBeLessThan(lum(createStarVisual(star('main', 'G')).light));
    expect(lum(createStarVisual(star('brown-dwarf')).light)).toBeLessThan(lum(createStarVisual(star('main', 'M')).light));
  });
});
