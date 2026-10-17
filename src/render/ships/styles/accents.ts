import * as THREE from 'three';
import type { ShipKit } from '../ShipKit';

/**
 * Style accents: each style's signature pieces, sized off another style's finished hull, so
 * an empire can mix a style it has researched into its own ships. They are 'detail' parts
 * and use the kit's materials, so they take the design's colours. They hug the hull's core
 * (its height), not its full width, which fins and wings can stretch far out.
 */

/** The hull's core radius: half its height, or half its width if that is smaller. */
const coreRadius = (size: THREE.Vector3): number => Math.max(0.08, Math.min(size.x, size.y) / 2);

/** Fins down the flanks, trailing tendrils and a pulsing glow sac on the back. */
export function organicAccent(kit: ShipKit): void {
  const rng = kit.rng.fork('accent-organic');
  const { size, center } = kit.hullBox();
  const w = coreRadius(size), top = center.y + w, back = center.z - size.z / 2;
  kit.addMirrored(() => {
    const f = kit.sphere(w * 1.1 + 0.08, kit.mat.detail, 0.12, 1, 0.7);
    f.rotation.z = -0.5;
    return f;
  }, 'detail', w * 1.05, center.y, center.z + size.z * rng.range(-0.15, 0.1));
  for (const side of [1, -1]) {
    const x0 = side * w * 0.4, len = size.z * rng.range(0.3, 0.5);
    const pts = Array.from({ length: 6 }, (_, j) => {
      const t = j / 5;
      return new THREE.Vector3(x0 + side * t * t * w * 0.6, center.y + Math.sin(t * 4) * size.y * 0.15 * t, back - len * t);
    });
    kit.add(kit.tube(pts, 0.02 + w * 0.08, kit.mat.detail), 'detail');
  }
  const sac = kit.add(kit.sphere(0.05 + w * 0.25, kit.mat.glow, 1, 0.8, 1.5), 'detail', center.x, top, center.z - size.z * 0.1);
  const ph = rng.next() * 6;
  kit.onAnimate((t) => sac.scale.setScalar(1 + 0.18 * Math.sin(t * 2.5 + ph)));
}

/** A sensor mast with a dish, and radiator panels out to the sides. */
export function technologicalAccent(kit: ShipKit): void {
  const { size, center } = kit.hullBox();
  const w = coreRadius(size), top = center.y + w;
  const mast = w * 1.6 + 0.2;
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.025, mast, 6), kit.mat.detail);
  kit.add(pole, 'detail', center.x, top + mast / 2, center.z + size.z * 0.1);
  const dish = kit.cyl(0.02, mast * 0.3, mast * 0.08, kit.mat.hull, 14);
  dish.rotation.x = -0.6;
  kit.add(dish, 'detail', center.x, top + mast, center.z + size.z * 0.1);
  kit.add(kit.sphere(0.03, kit.mat.accent), 'detail', center.x, top + mast * 1.05, center.z + size.z * 0.1);
  kit.addMirrored(() => {
    const panel = kit.box(w * 1.4 + 0.1, 0.02, size.z * 0.22, kit.mat.detail);
    panel.rotation.z = 0.2;
    return panel;
  }, 'detail', w * 0.8 + (w * 1.4 + 0.1) / 2, center.y, center.z - size.z * 0.15);
  kit.addMirrored(() => kit.box(0.025, 0.03, size.z * 0.2, kit.mat.accent), 'detail', w * 0.8 + w * 1.4 + 0.08, center.y + (w * 1.4) * 0.2, center.z - size.z * 0.15);
}

/** A gilded prow spire, swept golden fins and a band around the hull. */
export function classicAccent(kit: ShipKit): void {
  const { size, center } = kit.hullBox();
  const front = center.z + size.z / 2, w = coreRadius(size);
  const spire = new THREE.Mesh(new THREE.ConeGeometry(0.04 + w * 0.12, size.z * 0.18 + 0.2, 8).rotateX(Math.PI / 2), kit.mat.gold);
  kit.add(spire, 'detail', center.x, center.y, front + size.z * 0.06);
  kit.addMirrored(() => {
    const fin = kit.box(0.025, w * 1.4 + 0.15, size.z * 0.28, kit.mat.gold);
    fin.rotation.x = 0.55;
    fin.rotation.z = 0.35;
    return fin;
  }, 'detail', w * 0.75, center.y + w * 0.6, center.z - size.z * 0.3);
  const band = new THREE.Mesh(new THREE.TorusGeometry(w * 1.08, 0.02 + w * 0.05, 8, 32), kit.mat.gold);
  kit.add(band, 'detail', center.x, center.y, center.z + size.z * 0.2);
}

/** Polyhedra orbiting the hull, and prism pylons on the flanks. */
export function geometricAccent(kit: ShipKit): void {
  const rng = kit.rng.fork('accent-geometric');
  const { size, center } = kit.hullBox();
  const w = coreRadius(size);
  kit.addMirrored(() => new THREE.Mesh(new THREE.ConeGeometry(0.05 + w * 0.18, size.z * 0.3 + 0.1, 3).rotateX(Math.PI / 2), kit.mat.hull), 'detail', w * 0.95, center.y, center.z);
  const orbit = new THREE.Group();
  kit.add(orbit, 'detail', center.x, center.y, center.z);
  const n = rng.int(3, 4);
  const radius = w * 1.9 + 0.12;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const s = new THREE.Mesh(i % 2 ? new THREE.TetrahedronGeometry(0.05 + w * 0.1) : new THREE.OctahedronGeometry(0.05 + w * 0.1), kit.mat.accent);
    s.position.set(Math.cos(a) * radius, Math.sin(a) * radius, 0);
    orbit.add(s);
  }
  const speed = rng.range(0.3, 0.6);
  kit.onAnimate((t) => (orbit.rotation.z = t * speed));
}

/** Cargo containers strapped along the flanks on a truss, and a dorsal crane arm. */
export function utilitarianAccent(kit: ShipKit): void {
  const rng = kit.rng.fork('accent-utilitarian');
  const { size, center } = kit.hullBox();
  const w = coreRadius(size), top = center.y + w;
  const pods = rng.int(2, 3);
  const pod = Math.min(w * 0.75, size.z / (pods * 1.8)) + 0.04;
  kit.addMirrored(() => kit.box(0.03, 0.03, size.z * 0.6, kit.mat.detail), 'detail', w * 0.9, center.y, center.z);
  for (let i = 0; i < pods; i++) {
    const z = center.z + size.z * 0.3 - (i / Math.max(1, pods - 1)) * size.z * 0.6;
    kit.addMirrored(() => kit.box(pod, pod, pod * 1.4, i % 2 ? kit.mat.detail : kit.mat.hull), 'detail', w * 0.9 + pod / 2, center.y, z);
  }
  const arm = kit.box(0.04, 0.04, size.z * 0.35, kit.mat.detail);
  arm.rotation.x = -0.35;
  kit.add(arm, 'detail', center.x, top + size.z * 0.06, center.z - size.z * 0.05);
  kit.add(kit.box(0.08, 0.06, 0.06, kit.mat.accent), 'detail', center.x, top + size.z * 0.12, center.z + size.z * 0.12);
}
