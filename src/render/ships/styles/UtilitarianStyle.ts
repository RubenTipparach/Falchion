import type { ShipKit } from '../ShipKit';
import type { ShipStyleGenerator } from '../ShipStyleGenerator';
import { utilitarianAccent } from './accents';

/** Function over form: a truss spine with containers, radiators and a big engine block. */
export const UtilitarianStyle: ShipStyleGenerator = {
  id: 'utilitarian',
  name: 'Utilitarian',
  description: 'Truss spines, cargo containers, radiators and cranes.',
  accent: utilitarianAccent,
  build(kit: ShipKit) {
    const { L, B, rng, mat } = kit;
    kit.add(kit.box(B * 0.12, B * 0.12, L * 0.9, mat.detail), 'hull');
    const rungs = Math.round(L * 2);
    for (let i = 0; i < rungs; i++) kit.add(kit.box(B * 0.3, B * 0.03, B * 0.03, mat.detail), 'detail', 0, 0, -L * 0.42 + (i / rungs) * L * 0.84);

    // Cockpit
    kit.add(kit.box(B * 0.45, B * 0.35, L * 0.14, mat.hull), 'hull', 0, 0, L * 0.42);
    kit.add(kit.box(B * 0.4, B * 0.06, B * 0.02, mat.accent), 'detail', 0, B * 0.08, L * 0.49);

    // Containers in rows around the spine
    const rows = Math.max(2, Math.round(L * 1.2));
    const tints = [mat.hull, mat.detail, mat.hull];
    for (let i = 0; i < rows; i++) {
      const z = L * 0.28 - (i / rows) * L * 0.6;
      const cl = L * 0.6 / rows * 0.85;
      const ring = rng.int(2, 4);
      for (let j = 0; j < ring; j++) {
        if (rng.chance(0.15)) continue;
        const a = (j / ring) * Math.PI * 2;
        kit.add(kit.box(B * 0.3, B * 0.3, cl, rng.pick(tints)), 'hull', Math.cos(a) * B * 0.25, Math.sin(a) * B * 0.25, z);
      }
    }
    // Radiators
    kit.addMirrored(() => kit.box(B * 0.9, B * 0.015, L * 0.18, mat.detail), 'wing', B * 0.7, 0, -L * 0.28);
    // Crane
    if (rng.chance(0.6)) {
      const arm = kit.box(B * 0.05, B * 0.05, L * 0.3, mat.accent);
      arm.rotation.x = -0.5;
      kit.add(arm, 'detail', B * 0.2, B * 0.35, L * 0.2);
    }
    // Engine block
    kit.add(kit.box(B * 0.7, B * 0.5, L * 0.14, mat.hull), 'hull', 0, 0, -L * 0.43);
    const slots = kit.symmetricSlots(kit.design.engines, B * 0.22);
    for (const x of slots) kit.engine(x, 0, -L * 0.52, B * 0.1);
    for (let i = 0; i < kit.design.weapons; i++) {
      const side = i % 2 === 0 ? 1 : -1;
      kit.turret(side * B * 0.2, B * 0.18, L * (0.36 - Math.floor(i / 2) * 0.1), B * 0.06);
    }
  },
};
