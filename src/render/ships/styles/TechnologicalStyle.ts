import type { ShipKit } from '../ShipKit';
import type { ShipStyleGenerator } from '../ShipStyleGenerator';
import { technologicalAccent } from './accents';

/** Hard-edged, engineered hulls with nacelles, panels and light strips. */
export const TechnologicalStyle: ShipStyleGenerator = {
  id: 'technological',
  name: 'Technological',
  description: 'Angular engineered hulls, nacelles, greebles and light strips.',
  accent: technologicalAccent,
  build(kit: ShipKit) {
    const { L, B, rng, mat } = kit;
    const hull = kit.cyl(B * 0.28, B * 0.55, L * 0.8, mat.hull, 6);
    hull.scale.y = 0.55;
    kit.add(hull, 'hull', 0, 0, -L * 0.05);
    const nose = kit.cyl(0.001, B * 0.28, L * 0.25, mat.hull, 6);
    nose.scale.y = 0.55;
    kit.add(nose, 'hull', 0, 0, L * 0.47);
    kit.add(kit.box(B * 0.35, B * 0.18, L * 0.18, mat.detail), 'detail', 0, B * 0.25, L * 0.18);
    kit.add(kit.box(B * 0.3, B * 0.04, L * 0.04, mat.accent), 'detail', 0, B * 0.3, L * 0.27);

    const variant = rng.pick(['nacelles', 'wings', 'ring'] as const);
    if (variant === 'nacelles') {
      const nx = B * rng.range(0.7, 1.0), ny = B * rng.range(-0.1, 0.25);
      kit.addMirrored(() => kit.cyl(B * 0.12, B * 0.16, L * 0.55, mat.hull, 8), 'wing', nx, ny, -L * 0.1);
      kit.addMirrored(() => kit.box(nx * 0.9, B * 0.05, L * 0.12, mat.detail), 'detail', nx / 2, ny / 2, -L * 0.1);
      kit.addMirrored(() => kit.box(B * 0.02, B * 0.02, L * 0.5, mat.accent), 'detail', nx, ny + B * 0.15, -L * 0.1);
    } else if (variant === 'wings') {
      const sweep = rng.range(0.3, 0.7);
      kit.addMirrored(() => {
        const w = kit.box(B * 1.3, B * 0.06, L * 0.3, mat.hull);
        w.rotation.y = sweep;
        return w;
      }, 'wing', B * 0.7, 0, -L * 0.15);
      kit.addMirrored(() => kit.box(B * 0.05, B * 0.3, L * 0.15, mat.detail), 'wing', B * 1.2, B * 0.12, -L * 0.32);
    } else {
      const ring = kit.add(kit.lathe([[B * 0.95, -0.1 * L], [B * 1.05, 0], [B * 0.95, 0.1 * L]], mat.detail, 6), 'wing', 0, 0, -L * 0.15);
      ring.rotation.z = Math.PI / 6;
      kit.addMirrored(() => kit.box(B * 0.7, B * 0.05, B * 0.1, mat.hull), 'detail', B * 0.6, 0, -L * 0.15);
    }

    // Greebles
    const greebles = rng.int(6, 14);
    for (let i = 0; i < greebles; i++) {
      const z = rng.range(-0.4, 0.3) * L;
      const x = rng.range(0.05, 0.3) * B;
      const s = rng.range(0.05, 0.12) * B;
      kit.addMirrored(() => kit.box(s, s * 0.6, s * rng.range(1, 3), mat.detail), 'detail', x, B * 0.17, z);
    }
    kit.addMirrored(() => kit.box(B * 0.02, B * 0.02, L * 0.6, mat.accent), 'detail', B * 0.42, 0, -L * 0.05);

    // Engines: tight grid at the rear
    const slots = kit.symmetricSlots(kit.design.engines, B * 0.3);
    for (const x of slots) kit.engine(x, 0, -L * 0.47, B * 0.12, 'square');

    for (let i = 0; i < kit.design.weapons; i++) {
      const row = Math.floor(i / 2);
      const x = (i % 2 === 0 ? 1 : -1) * B * 0.2;
      kit.turret(i === kit.design.weapons - 1 && i % 2 === 0 ? 0 : x, B * 0.16 * (row % 2 ? -1 : 1), L * (0.25 - row * 0.15), B * 0.09, row % 2 ? -1 : 1);
    }
  },
};
