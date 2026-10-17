import * as THREE from 'three';
import type { ShipKit } from '../ShipKit';
import type { ShipTraitDecorator } from '../ShipStyleGenerator';

/** Role decorators make a ship's job readable at a glance, on top of any style. */
const role = (id: string, name: string, apply: (kit: ShipKit) => void): ShipTraitDecorator => ({ id, name, apply });

export const ROLE_TRAITS: readonly ShipTraitDecorator[] = [
  role('role-mining', 'Mining rig', (kit) => {
    const { size, center } = kit.hullBox();
    const front = center.z + size.z * 0.5;
    // Drill head on an arm, and an ore scoop underneath.
    const drill = new THREE.Mesh(new THREE.ConeGeometry(size.y * 0.22 + 0.05, size.z * 0.18, 10).rotateX(Math.PI / 2), kit.mat.accent);
    kit.add(drill, 'trait', center.x, center.y - size.y * 0.15, front + size.z * 0.08);
    kit.add(kit.cyl(0.03, 0.04, size.z * 0.18, kit.mat.detail, 6), 'trait', center.x, center.y - size.y * 0.15, front - size.z * 0.02);
    const scoop = kit.box(size.x * 0.35, 0.04, size.z * 0.22, kit.mat.detail);
    scoop.rotation.x = 0.3;
    kit.add(scoop, 'trait', center.x, center.y - size.y * 0.55, center.z + size.z * 0.15);
    kit.onAnimate((t) => (drill.rotation.z = t * 6));
  }),
  role('role-long', 'Spinal lance', (kit) => {
    const { size, center } = kit.hullBox();
    kit.add(kit.cyl(0.03, 0.06, size.z * 0.6, kit.mat.detail, 8), 'trait', center.x, center.y + size.y * 0.1, center.z + size.z * 0.42);
    kit.add(kit.sphere(0.06, kit.mat.glow), 'trait', center.x, center.y + size.y * 0.1, center.z + size.z * 0.72);
  }),
  role('role-short', 'Ram prow', (kit) => {
    const { size, center } = kit.hullBox();
    const ram = new THREE.Mesh(new THREE.ConeGeometry(size.y * 0.35 + 0.05, size.z * 0.2, 4).rotateX(Math.PI / 2), kit.mat.detail);
    kit.add(ram, 'trait', center.x, center.y, center.z + size.z * 0.58);
  }),
  role('role-barrage', 'Missile pods', (kit) => {
    const { size, center } = kit.hullBox();
    kit.addMirrored(() => {
      const pod = new THREE.Group();
      pod.add(kit.box(size.x * 0.14 + 0.05, size.y * 0.25 + 0.05, size.z * 0.22, kit.mat.detail));
      for (let i = 0; i < 4; i++) {
        const tube = kit.cyl(0.02, 0.02, 0.02, kit.mat.accent, 6);
        tube.position.set((i % 2 - 0.5) * 0.06, (Math.floor(i / 2) - 0.5) * 0.06, size.z * 0.11);
        pod.add(tube);
      }
      return pod;
    }, 'trait', size.x * 0.3 + 0.05, center.y + size.y * 0.35, center.z);
  }),
  role('role-siege', 'Siege cannon', (kit) => {
    const { size, center } = kit.hullBox();
    kit.add(kit.cyl(size.y * 0.12 + 0.04, size.y * 0.16 + 0.05, size.z * 0.55, kit.mat.hull, 12), 'trait', center.x, center.y - size.y * 0.35, center.z + size.z * 0.25);
    kit.add(kit.box(size.x * 0.3, size.y * 0.2, size.z * 0.2, kit.mat.detail), 'trait', center.x, center.y - size.y * 0.35, center.z - size.z * 0.05);
  }),
  role('role-suppression', 'Jamming dishes', (kit) => {
    const { size, center } = kit.hullBox();
    kit.addMirrored(() => {
      const dish = new THREE.Mesh(new THREE.SphereGeometry(size.y * 0.25 + 0.06, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2.6), kit.mat.detail);
      dish.rotation.z = -0.9;
      return dish;
    }, 'trait', size.x * 0.25 + 0.05, center.y + size.y * 0.5, center.z);
  }),
  role('role-capture', 'Tractor emitter', (kit) => {
    const { size, center } = kit.hullBox();
    const ring = new THREE.Mesh(new THREE.TorusGeometry(size.y * 0.3 + 0.06, 0.02, 6, 24), kit.mat.accent);
    kit.add(ring, 'trait', center.x, center.y, center.z + size.z * 0.55);
    kit.onAnimate((t) => ring.scale.setScalar(1 + 0.12 * Math.sin(t * 3)));
  }),
  role('role-assault', 'Drop pods', (kit) => {
    const { size, center } = kit.hullBox();
    for (let i = 0; i < 3; i++) {
      kit.addMirrored(() => kit.cyl(0.05, 0.07, 0.16, kit.mat.accent, 8), 'trait', size.x * 0.2 + 0.04, center.y - size.y * 0.45, center.z + (i - 1) * size.z * 0.2);
    }
  }),
  role('role-support', 'Support array', (kit) => {
    const { size, center } = kit.hullBox();
    kit.add(kit.cyl(0.015, 0.015, size.y * 0.8, kit.mat.detail, 4).rotateX(Math.PI / 2), 'trait', center.x, center.y + size.y * 0.7, center.z);
    kit.add(kit.sphere(0.05, kit.mat.glow), 'trait', center.x, center.y + size.y * 1.1, center.z);
  }),
  role('role-capital', 'Capital armour', (kit) => {
    const { size, center } = kit.hullBox();
    kit.addMirrored(() => kit.box(0.05, size.y * 0.7, size.z * 0.5, kit.mat.hull), 'trait', size.x * 0.25 + 0.06, center.y, center.z);
  }),
];
