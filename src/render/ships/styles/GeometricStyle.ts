import * as THREE from 'three';
import type { ShipKit } from '../ShipKit';
import type { ShipStyleGenerator } from '../ShipStyleGenerator';
import { geometricAccent } from './accents';

const SOLIDS = [
  (r: number) => new THREE.OctahedronGeometry(r),
  (r: number) => new THREE.IcosahedronGeometry(r),
  (r: number) => new THREE.DodecahedronGeometry(r),
  (r: number) => new THREE.TetrahedronGeometry(r),
  (r: number) => new THREE.BoxGeometry(r * 1.3, r * 1.3, r * 1.3),
];

/** Pure forms: stacked polyhedra, rings and orbiting satellites, flat shaded. */
export const GeometricStyle: ShipStyleGenerator = {
  id: 'geometric',
  name: 'Simple Geometry',
  description: 'Polyhedra, rings and satellites in strict symmetry.',
  accent: geometricAccent,
  flatShading: true,
  build(kit: ShipKit) {
    const { L, B, rng, mat } = kit;
    const stack = rng.int(1, 3);
    const solid = rng.int(0, SOLIDS.length - 1);
    for (let i = 0; i < stack; i++) {
      const r = B * (0.6 - i * 0.15);
      const m = new THREE.Mesh(SOLIDS[(solid + i) % SOLIDS.length](r), i === 0 ? mat.hull : mat.detail);
      m.scale.z = (L / 4) * (1.4 - i * 0.2);
      m.rotation.z = rng.pick([0, Math.PI / 4]);
      kit.add(m, 'hull', 0, 0, L * (0.1 - i * 0.28));
    }
    kit.add(new THREE.Mesh(new THREE.OctahedronGeometry(B * 0.15), mat.accent), 'detail', 0, 0, L * 0.45);

    const rings = rng.int(0, 2);
    for (let i = 0; i < rings; i++) {
      const t = new THREE.Mesh(new THREE.TorusGeometry(B * (0.8 + i * 0.25), B * 0.03, 4, rng.pick([6, 8, 32])), mat.detail);
      t.rotation.x = i === 0 ? 0 : Math.PI / 2;
      kit.add(t, 'wing', 0, 0, L * 0.05);
    }

    // Satellite blocks on spokes
    const spokes = rng.pick([2, 3, 4]);
    const radius = B * rng.range(0.9, 1.3);
    for (let i = 0; i < spokes; i++) {
      const a = (i / spokes) * Math.PI * 2 + Math.PI / 2;
      const x = Math.cos(a) * radius, y = Math.sin(a) * radius;
      kit.add(new THREE.Mesh(new THREE.BoxGeometry(B * 0.22, B * 0.22, L * 0.25), mat.hull), 'wing', x, y, -L * 0.15);
      const rod = kit.box(B * 0.03, B * 0.03, radius, mat.detail);
      rod.rotation.x = Math.PI / 2;
      rod.rotation.y = -a + Math.PI / 2;
      kit.add(rod, 'detail', x / 2, y / 2, -L * 0.15);
    }

    for (const [x, y] of kit.ringSlots(kit.design.engines, B * 0.3)) {
      const cube = new THREE.Mesh(new THREE.BoxGeometry(B * 0.12, B * 0.12, B * 0.12), mat.glow);
      kit.add(cube, 'engine', x, y, -L * 0.45);
      const ph = rng.next() * 6;
      kit.onAnimate((t) => cube.rotation.set(t + ph, t * 0.7, 0));
    }
    for (let i = 0; i < kit.design.weapons; i++) {
      const a = (i / Math.max(1, kit.design.weapons)) * Math.PI * 2;
      const tet = new THREE.Mesh(new THREE.TetrahedronGeometry(B * 0.1), mat.accent);
      kit.add(tet, 'weapon', Math.cos(a) * B * 0.55, Math.sin(a) * B * 0.55, L * 0.25);
    }
  },
};
