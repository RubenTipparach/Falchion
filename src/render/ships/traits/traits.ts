import * as THREE from 'three';
import type { ShipKit } from '../ShipKit';
import type { ShipTraitDecorator } from '../ShipStyleGenerator';

const hullBox = (kit: ShipKit) => kit.hullBox();

export const HiveMindTrait: ShipTraitDecorator = {
  id: 'hive-mind',
  name: 'Hive Mind',
  apply(kit) {
    const rng = kit.rng.fork('hive-mind');
    const { size, center } = hullBox(kit);
    const glow = kit.own(new THREE.MeshStandardMaterial({ color: '#d36bff', emissive: '#b04dff', emissiveIntensity: 1.4 }));
    const top = center.y + size.y * 0.5;
    const core = new THREE.Vector3(center.x, top + size.y * 0.35 + 0.1, center.z);
    kit.add(kit.sphere(0.06 + size.y * 0.06, glow), 'trait', core.x, core.y, core.z);
    const n = rng.int(4, 7);
    for (let i = 0; i < n; i++) {
      const p = new THREE.Vector3(rng.range(-0.25, 0.25) * size.x, top - size.y * 0.05, center.z + rng.range(-0.4, 0.4) * size.z);
      const node = kit.add(kit.sphere(0.03 + size.y * 0.03, glow), 'trait', p.x, p.y, p.z);
      const mid = p.clone().lerp(core, 0.5).add(new THREE.Vector3(0, size.y * 0.1, 0));
      kit.add(kit.tube([p, mid, core], 0.008 + size.y * 0.004, glow), 'trait');
      const ph = rng.next() * 6;
      kit.onAnimate((t) => node.scale.setScalar(1 + 0.3 * Math.sin(t * 4 + ph)));
    }
  },
};

export const ShieldsTrait: ShipTraitDecorator = {
  id: 'shields',
  name: 'Shields',
  apply(kit) {
    const { size, center } = hullBox(kit);
    const mat = kit.own(new THREE.MeshPhongMaterial({
      color: kit.design.colors.accent, emissive: kit.design.colors.accent, emissiveIntensity: 0.4,
      transparent: true, opacity: 0.08, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    }));
    const bubble = kit.sphere(0.5, mat, size.x * 1.25, size.y * 1.5 + 0.3, size.z * 1.15, 32);
    kit.add(bubble, 'trait', center.x, center.y, center.z);
    kit.onAnimate((t) => (mat.opacity = 0.06 + 0.03 * Math.sin(t * 2)));
  },
};

export const DronesTrait: ShipTraitDecorator = {
  id: 'drones',
  name: 'Swarm Drones',
  apply(kit) {
    const rng = kit.rng.fork('drones');
    const { size, center } = hullBox(kit);
    const swarm = new THREE.Group();
    kit.add(swarm, 'trait', center.x, center.y, center.z);
    const n = rng.int(6, 10);
    const radius = Math.max(size.x, size.z) * 0.6;
    const drones = Array.from({ length: n }, (_, i) => {
      const d = new THREE.Mesh(new THREE.OctahedronGeometry(0.08 + radius * 0.02), kit.mat.accent);
      swarm.add(d);
      return { d, a: (i / n) * Math.PI * 2, tilt: rng.range(-0.6, 0.6), speed: rng.range(0.6, 1.2) };
    });
    kit.onAnimate((t) => {
      for (const { d, a, tilt, speed } of drones) {
        const ang = a + t * speed;
        d.position.set(Math.cos(ang) * radius, Math.sin(ang) * radius * tilt, Math.sin(ang) * radius);
        d.rotation.y = t * 3;
      }
    });
  },
};

export const OrnateTrait: ShipTraitDecorator = {
  id: 'ornate',
  name: 'Ornate',
  apply(kit) {
    const { size, center } = hullBox(kit);
    // Gold bands hug the fuselage (sized by hull height, not wingspan).
    const r = size.y * 0.55 + 0.04;
    for (const f of [-0.2, 0.15]) {
      const band = new THREE.Mesh(new THREE.TorusGeometry(r, 0.02, 6, 40), kit.mat.gold);
      band.scale.set(1.1, 1, 1);
      kit.add(band, 'trait', center.x, center.y, center.z + f * size.z);
    }
    // Dorsal crest and a prow ornament.
    const crest = kit.box(0.02, size.y * 0.35, size.z * 0.25, kit.mat.gold);
    crest.rotation.x = -0.25;
    kit.add(crest, 'trait', center.x, center.y + size.y * 0.55, center.z - size.z * 0.15);
    kit.add(new THREE.Mesh(new THREE.OctahedronGeometry(0.05 + size.y * 0.06), kit.mat.gold), 'trait', center.x, center.y + size.y * 0.15, center.z + size.z * 0.52);
  },
};

export const FractalTrait: ShipTraitDecorator = {
  id: 'fractal',
  name: 'Fractal Crystals',
  apply(kit) {
    const rng = kit.rng.fork('fractal');
    const { size, center } = hullBox(kit);
    const crystal = kit.own(new THREE.MeshStandardMaterial({ color: '#9ff3ff', emissive: '#3fb6ff', emissiveIntensity: 0.6, flatShading: true, transparent: true, opacity: 0.85 }));
    const clusters = rng.int(3, 5);
    for (let c = 0; c < clusters; c++) {
      const z = center.z + rng.range(-0.4, 0.3) * size.z;
      const x = rng.range(0.2, 0.45) * size.x;
      const make = () => {
        const g = new THREE.Group();
        for (let i = 0; i < 3; i++) {
          const s = (0.25 - i * 0.06) * Math.max(0.6, size.y);
          const m = new THREE.Mesh(new THREE.OctahedronGeometry(s * 0.35), crystal);
          m.scale.y = 2.4;
          m.position.set(i * s * 0.25, s * 0.4 + i * s * 0.2, 0);
          m.rotation.z = -0.4 - i * 0.3;
          g.add(m);
        }
        return g;
      };
      kit.addMirrored(make, 'trait', x, center.y + size.y * 0.2, z);
    }
  },
};

export const ArmorTrait: ShipTraitDecorator = {
  id: 'armor',
  name: 'Armor Plating',
  apply(kit) {
    const { size, center } = hullBox(kit);
    const plates = 4;
    for (let i = 0; i < plates; i++) {
      const z = center.z + (-0.3 + (i / (plates - 1)) * 0.5) * size.z;
      kit.addMirrored(() => {
        const p = kit.box(0.05, size.y * 0.5 + 0.1, size.z * 0.12, kit.mat.detail);
        p.rotation.z = 0.25;
        return p;
      }, 'trait', size.x * 0.22 + 0.08, center.y, z);
    }
  },
};

export const SalvageTrait: ShipTraitDecorator = {
  id: 'salvage',
  name: 'Salvage Claws',
  apply(kit) {
    const { size, center } = hullBox(kit);
    const front = center.z + size.z * 0.5;
    kit.addMirrored(() => {
      const g = new THREE.Group();
      const upper = kit.box(0.06, 0.06, size.z * 0.18, kit.mat.detail);
      upper.position.z = size.z * 0.09;
      const claw = kit.box(0.05, 0.05, size.z * 0.1, kit.mat.accent);
      claw.position.set(-0.05, 0, size.z * 0.2);
      claw.rotation.y = 0.6;
      g.add(upper, claw);
      return g;
    }, 'trait', size.x * 0.18 + 0.05, center.y - size.y * 0.2, front - size.z * 0.08);
  },
};

export const RegenerationTrait: ShipTraitDecorator = {
  id: 'regeneration',
  name: 'Regenerative Tissue',
  apply(kit) {
    const rng = kit.rng.fork('regen');
    const { size, center } = hullBox(kit);
    const mat = kit.own(new THREE.MeshStandardMaterial({ color: '#6dff9e', emissive: '#2dbf5a', emissiveIntensity: 0.8, roughness: 0.3 }));
    for (let i = 0; i < 4; i++) {
      const z = center.z + rng.range(-0.35, 0.35) * size.z;
      const pod = kit.sphere(0.08 + size.x * 0.03, mat, 1, 0.7, 1.4);
      kit.add(pod, 'trait', (i % 2 ? 1 : -1) * size.x * 0.25, center.y + size.y * 0.3, z);
      const ph = rng.next() * 6;
      kit.onAnimate((t) => pod.scale.set(1 + 0.12 * Math.sin(t * 2 + ph), 0.7, 1.4));
    }
  },
};

export const NeuralTrait: ShipTraitDecorator = {
  id: 'neural',
  name: 'Neural Lattice',
  apply(kit) {
    const { size, center } = hullBox(kit);
    const mat = kit.own(new THREE.MeshBasicMaterial({ color: '#ff9bf0', transparent: true, opacity: 0.8 }));
    for (const side of [-1, 1]) {
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= 8; i++) {
        const t = i / 8;
        pts.push(new THREE.Vector3(side * size.x * 0.22 * Math.sin(Math.PI * t), center.y + size.y * 0.3 + Math.sin(t * 12) * 0.05, center.z + (t - 0.5) * size.z * 0.8));
      }
      kit.add(kit.tube(pts, 0.012, mat), 'trait');
    }
  },
};

export const ALL_TRAITS: readonly ShipTraitDecorator[] = [
  HiveMindTrait, ShieldsTrait, DronesTrait, OrnateTrait, FractalTrait, ArmorTrait, SalvageTrait, RegenerationTrait, NeuralTrait,
];
