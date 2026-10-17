import * as THREE from 'three';
import type { ShipKit } from '../ShipKit';
import type { ShipStyleGenerator } from '../ShipStyleGenerator';
import { organicAccent } from './accents';

/** Grown, asymmetric-feeling bodies: bulbous lathe hulls, trailing tendrils, fins and sacs. */
export const OrganicStyle: ShipStyleGenerator = {
  id: 'organic',
  name: 'Organic',
  description: 'Living hulls with tendrils, fins and glowing sacs.',
  accent: organicAccent,
  build(kit: ShipKit) {
    const { L, B, rng, mat } = kit;
    const freq = rng.range(2, 5), phase = rng.range(0, 6), bulge = rng.range(0.15, 0.35);
    const headSize = rng.range(0.25, 0.45);
    const profile: Array<[number, number]> = [];
    const N = 18;
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const r = B * 0.55 * Math.pow(Math.sin(Math.PI * t), 0.7) * (1 + bulge * Math.sin(t * freq * Math.PI + phase));
      profile.push([r, -L / 2 + t * L]);
    }
    const body = kit.lathe(profile, mat.hull, 22);
    // Organic wobble: displace vertices radially with low-frequency waves.
    const pos = body.geometry.attributes.position as THREE.BufferAttribute;
    const wobble = rng.range(0.04, 0.1);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const a = Math.atan2(y, x);
      const k = 1 + wobble * Math.sin(a * 3 + z * 2 + phase) + wobble * 0.5 * Math.sin(a * 5 - z * 3);
      pos.setXYZ(i, x * k, y * k * 0.8, z);
    }
    body.geometry.computeVertexNormals();
    kit.add(body, 'hull');

    // Head bulb
    kit.add(kit.sphere(B * headSize, mat.hull, 1, 0.85, 1.3), 'hull', 0, B * 0.05, L * 0.42);
    kit.add(kit.sphere(B * headSize * 0.35, mat.accent, 1.4, 0.5, 1), 'detail', 0, B * headSize * 0.5, L * 0.47);

    // Fins
    const fins = rng.int(1, 3);
    for (let i = 0; i < fins; i++) {
      const z = L * rng.range(-0.25, 0.2);
      const make = () => {
        const f = kit.sphere(B * rng.range(0.5, 0.9), mat.detail, 1, 0.1, 0.55);
        f.rotation.z = rng.range(-0.4, 0.2);
        f.rotation.y = 0.5;
        return f;
      };
      kit.addMirrored(make, 'wing', B * 0.6, 0, z);
    }

    // Tendrils trailing behind
    const tendrils = rng.int(2, 4);
    for (let i = 0; i < tendrils; i++) {
      const x0 = B * rng.range(0.1, 0.35), y0 = B * rng.range(-0.3, 0.2);
      const len = L * rng.range(0.4, 0.8), sway = rng.range(0.2, 0.6);
      const make = () => {
        const pts: THREE.Vector3[] = [];
        for (let j = 0; j <= 6; j++) {
          const t = j / 6;
          pts.push(new THREE.Vector3(x0 + sway * t * t, y0 + Math.sin(t * 5 + i) * 0.15 * t, -L * 0.4 - len * t));
        }
        return kit.tube(pts, B * 0.05 * (1 - i * 0.12), mat.detail);
      };
      kit.addMirrored(make, 'detail', 0.001, 0, 0);
    }

    // Glowing engine sacs
    for (const [x, y] of kit.ringSlots(kit.design.engines, B * 0.22)) {
      const sac = kit.sphere(B * 0.14, mat.glow, 1, 1, 1.4);
      kit.add(sac, 'engine', x, y, -L * 0.47);
      const ph = rng.next() * 6;
      kit.onAnimate((t) => sac.scale.setScalar(1 + 0.15 * Math.sin(t * 3 + ph)));
    }

    // Weapons: bone spines along the back
    for (let i = 0; i < kit.design.weapons; i++) {
      const z = L * (0.3 - (i / Math.max(1, kit.design.weapons)) * 0.6);
      const side = i % 2 === 0 ? 1 : -1;
      const spine = new THREE.Mesh(new THREE.ConeGeometry(B * 0.06, B * 0.45, 6).rotateX(Math.PI / 2.6), mat.accent);
      kit.add(spine, 'weapon', side * B * 0.18, B * 0.42, z);
    }
  },
};
