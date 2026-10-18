import * as THREE from 'three';
import { ball, cyl, hull, lathe, mat, obox, Prop, prism, ring, crystal } from '../propKit';
import type { ShipArt } from './types';

/**
 * Thumbnail art for the line combat (long range, short range, barrage, siege) ship classes: one hand-modelled hull per class id, painted in the
 * empire's design colours (the `thumbnails` skill). Nose along +z, centred on the origin.
 */

type P2 = readonly [number, number];
type P3 = readonly [number, number, number];

/** A side-view outline in (z, y), nose at +z, extruded `t` across the hull. */
const side = (outline: ReadonlyArray<P2>, t: number): THREE.BufferGeometry =>
  prism(outline.map(([z, y]) => [-z, y] as const), t).rotateY(Math.PI / 2);

/** A plan-view outline in (x, z), extruded `t` in y: a flat wing, fin or plate. */
const plan = (outline: ReadonlyArray<P2>, t: number): THREE.BufferGeometry => prism(outline, t).rotateX(Math.PI / 2);

/** The same outline on the other side of the hull. */
const flipX = (outline: ReadonlyArray<P2>): P2[] => outline.map(([x, z]) => [-x, z] as const);
const flipP3 = (pts: ReadonlyArray<P3>): P3[] => pts.map(([x, y, z]) => [-x, y, z] as const);

/** A lathe laid along +z (the profile's y runs nose to tail), `w` wide and `h` tall. */
const tube = (profile: ReadonlyArray<P2>, n: number, w: number, h: number): THREE.BufferGeometry =>
  lathe(profile, n).scale(w, 1, h).rotateX(Math.PI / 2);

/** Lancer: a needle hull, a spinal lance reaching past the nose, and two engines. */
const lancer: ShipArt = (c) => {
  const p = new Prop();
  p.add(hull([[0, 0.05, 0.85], [-0.12, 0, 0.15], [0.12, 0, 0.15], [0, 0.11, 0.15], [0, -0.08, 0.15], [-0.14, 0.01, -0.7], [0.14, 0.01, -0.7], [0, 0.1, -0.7], [0, -0.07, -0.7]]), mat(c.primary));
  p.add(cyl(0.045, 0.045, 1.7, 6), mat(c.secondary), { y: 0.13, z: 0.45, rx: Math.PI / 2 });
  p.add(lathe([[0, 0], [0.04, 0], [0, 0.26]], 6), mat(c.accent, 'emissive'), { y: 0.13, z: 1.3, rx: Math.PI / 2 });
  p.add(obox(0.12, 0.08, 0.32, 0.02), mat(c.secondary), { y: 0.08 });
  const wing: P2[] = [[0.1, -0.2], [0.42, -0.62], [0.42, -0.68], [0.1, -0.6]];
  p.add(plan(wing, 0.025), mat(c.secondary));
  p.add(plan(flipX(wing), 0.025), mat(c.secondary));
  for (const x of [-0.1, 0.1]) {
    p.add(cyl(0.085, 0.1, 0.22, 8), mat(c.secondary), { x, z: -0.78, rx: Math.PI / 2 });
    p.add(cyl(0.06, 0.07, 0.06, 8), mat(c.accent, 'emissive'), { x, z: -0.92, rx: Math.PI / 2 });
  }
  return p.group;
};

/** Railgun Monitor: a slab-sided gun boat with one mass driver along its spine, bolted to the engine block. */
const railgunMonitor: ShipArt = (c) => {
  const p = new Prop();
  p.add(obox(0.72, 0.34, 1.5, 0.06), mat(c.primary), { y: 0.12 });
  p.add(hull([[-0.36, 0.12, 0.75], [0.36, 0.12, 0.75], [-0.36, 0.46, 0.75], [0.36, 0.46, 0.75], [0, 0.42, 1.0], [0, 0.14, 1.0]]), mat(c.primary));
  p.add(obox(0.8, 0.3, 0.4, 0.04), mat(c.secondary), { y: 0.15, z: -0.85 });
  for (const x of [-0.2, 0.2]) {
    p.add(cyl(0.12, 0.14, 0.26, 10), mat(c.secondary), { x, y: 0.12, z: -1.0, rx: Math.PI / 2 });
    p.add(cyl(0.1, 0.1, 0.05, 10), mat(c.accent, 'emissive'), { x, y: 0.12, z: -1.15, rx: Math.PI / 2 });
  }
  // The rail: a long mass driver on mounts, with coils and a glowing muzzle.
  p.add(cyl(0.045, 0.045, 1.95, 6), mat(c.secondary), { y: 0.5, rx: Math.PI / 2 });
  for (const z of [-0.45, 0.35]) p.add(obox(0.22, 0.12, 0.26, 0.02), mat(c.primary), { y: 0.42, z });
  for (const z of [-0.7, -0.25, 0.2, 0.65]) p.add(ring(0.085, 0.022, 10), mat(c.primary), { y: 0.5, z, rx: Math.PI / 2 });
  p.add(ring(0.1, 0.03, 10), mat(c.accent, 'emissive'), { y: 0.5, z: 0.98, rx: Math.PI / 2 });
  p.add(ball(0.07, 1), mat(c.accent, 'glow'), { y: 0.5, z: 1.0 });
  for (const x of [-0.38, 0.38]) p.add(obox(0.04, 0.22, 1.2, 0.03), mat(c.secondary), { x, y: 0.26, z: -0.1 });
  return p.group;
};

/** Duelist Interceptor: a slim fighter with swept wings and a canopy, built to close fast and fight knife-close. */
const interceptor: ShipArt = (c) => {
  const p = new Prop();
  p.add(hull([[0, 0.03, 0.62], [-0.04, 0, 0.2], [0.04, 0, 0.2], [0, 0.07, 0.2], [0, -0.03, 0.2], [-0.07, 0.01, -0.45], [0.07, 0.01, -0.45], [0, 0.08, -0.5], [0, -0.03, -0.5]]), mat(c.primary));
  const wing: P2[] = [[0.05, 0.3], [0.52, -0.32], [0.5, -0.42], [0.05, -0.18]];
  p.add(plan(wing, 0.025), mat(c.secondary), { y: -0.01 });
  p.add(plan(flipX(wing), 0.025), mat(c.secondary), { y: -0.01 });
  for (const x of [-0.51, 0.51]) p.add(ball(0.035, 0), mat(c.accent, 'emissive'), { x, z: -0.37 });
  for (const x of [-0.08, 0.08]) {
    p.add(cyl(0.05, 0.065, 0.2, 8), mat(c.secondary), { x, z: -0.5, rx: Math.PI / 2 });
    p.add(cyl(0.04, 0.045, 0.04, 8), mat(c.accent, 'emissive'), { x, z: -0.62, rx: Math.PI / 2 });
  }
  p.add(lathe([[0, 0], [0.06, 0], [0.04, 0.05], [0, 0.08]], 8), mat(c.accent, 'glass'), { y: 0.05, z: 0.2 });
  p.add(obox(0.025, 0.16, 0.3, 0.05), mat(c.secondary), { y: 0.1, z: -0.36 });
  return p.group;
};

/** Carapace Brawler: an armoured organic ram, banded plating, claws that tear ships apart up close. */
const brawler: ShipArt = (c) => {
  const p = new Prop();
  p.add(tube([[0, -0.95], [0.6, -0.92], [0.92, -0.55], [1.0, -0.1], [0.95, 0.35], [0.75, 0.75], [0.4, 0.93], [0, 0.97]], 10, 0.62, 0.42), mat(c.primary));
  for (const z of [-0.6, -0.1, 0.4]) p.add(tube([[0.9, -0.09], [1.14, 0], [0.9, 0.09]], 10, 0.62, 0.42), mat(c.secondary), { z });
  p.add(lathe([[0, 0], [0.2, 0], [0.14, 0.12], [0, 0.34]], 8), mat(c.secondary), { z: 0.85, rx: Math.PI / 2 });
  // Pincer claws: an upper and a lower blade on each side, curling forward and out.
  const claw: P3[] = [[0.4, -0.14, 0.35], [0.56, -0.12, 0.45], [0.5, 0.14, 0.42], [0.62, 0, 0.62], [1.02, 0.02, 1.22]];
  const lower: P3[] = [[0.4, -0.2, 0.4], [0.52, -0.12, 0.5], [0.5, -0.1, 0.5], [0.6, -0.1, 0.6], [0.9, -0.12, 1.1]];
  for (const pts of [claw, lower]) {
    p.add(hull(pts), mat(c.secondary));
    p.add(hull(flipP3(pts)), mat(c.secondary));
  }
  for (const [x, y] of [[-0.3, -0.05], [0.3, -0.05], [0, 0.2]] as const) {
    p.add(cyl(0.2, 0.16, 0.3, 10), mat(c.secondary), { x, y, z: -1.1, rx: Math.PI / 2 });
    p.add(cyl(0.13, 0.13, 0.06, 10), mat(c.accent, 'emissive'), { x, y, z: -1.27, rx: Math.PI / 2 });
  }
  for (const z of [0.3, -0.25, -0.7]) p.add(lathe([[0, 0], [0.09, 0], [0, 0.42]], 5), mat(c.secondary), { y: 0.34, z, rx: -0.5 });
  for (const x of [-1, 1]) {
    for (const z of [0.15, -0.5]) {
      p.add(cyl(0.09, 0.11, 0.4, 6), mat(c.secondary), { x: x * 0.74, y: -0.05, z, rz: (-x * Math.PI) / 2 });
      p.add(ball(0.06, 0), mat(c.accent, 'emissive'), { x: x * 0.97, y: -0.05, z });
    }
  }
  return p.group;
};

/** Missile Barge: a boxy hull with a deck of hex launch cells, two blunt engines and a sensor mast. */
const missileBarge: ShipArt = (c) => {
  const p = new Prop();
  p.add(obox(0.7, 0.36, 1.5, 0.05), mat(c.primary), { y: 0.18 });
  p.add(hull([[-0.35, 0.04, 0.75], [0.35, 0.04, 0.75], [-0.35, 0.36, 0.75], [0.35, 0.36, 0.75], [0, 0.3, 0.98], [0, 0.1, 0.98]]), mat(c.primary));
  for (const x of [-0.4, 0.4]) p.add(obox(0.06, 0.28, 1.4, 0.03), mat(c.secondary), { x, y: 0.18, z: -0.02 });
  p.add(obox(0.66, 0.05, 1.5), mat(c.secondary), { y: 0.38 });
  for (const x of [-0.17, 0.17]) {
    for (const z of [-0.5, -0.05, 0.4]) {
      p.add(cyl(0.1, 0.1, 0.2, 6), mat(c.secondary), { x, y: 0.5, z });
      p.add(cyl(0.075, 0.075, 0.03, 6), mat(c.accent, 'emissive'), { x, y: 0.615, z });
    }
  }
  for (const x of [-0.2, 0.2]) {
    p.add(obox(0.24, 0.26, 0.32, 0.03), mat(c.secondary), { x, y: 0.16, z: -0.85 });
    p.add(cyl(0.08, 0.1, 0.08, 8), mat(c.accent, 'emissive'), { x, y: 0.16, z: -1.03, rx: Math.PI / 2 });
  }
  p.add(cyl(0.012, 0.012, 0.36, 4), mat(c.secondary), { y: 0.56, z: -0.5 });
  p.add(ball(0.04, 0), mat(c.accent, 'emissive'), { y: 0.76, z: -0.5 });
  return p.group;
};

/** Brood Carrier: a grown capital hull, swollen and ribbed, with hive pods that launch its drones. */
const swarmCarrier: ShipArt = (c) => {
  const p = new Prop();
  p.add(tube([[0, -1.5], [0.45, -1.42], [0.7, -1.0], [0.8, -0.4], [0.82, 0.2], [0.74, 0.75], [0.5, 1.2], [0.22, 1.45], [0, 1.5]], 10, 1.0, 0.6), mat(c.primary));
  // Hive pods: bulbs on the flanks, underneath and along the spine, each with a glowing spore.
  const pod = () => lathe([[0, 0], [0.26, 0.02], [0.3, 0.26], [0.2, 0.48], [0, 0.56]], 6);
  // [x, y, z, rx, rz]: a pod's base in the hull, pointing out (sideways, down or up).
  const pods: [number, number, number, number, number][] = [
    [0.6, -0.05, 0.62, 0, -Math.PI / 2],
    [0.62, 0.08, -0.46, 0, -Math.PI / 2],
    [0.3, -0.4, -0.3, Math.PI, 0],
    [0, -0.45, 0.95, Math.PI, 0],
    [0.22, 0.42, 0.3, 0, -0.25],
    [-0.22, 0.42, -0.6, 0, 0.25],
  ];
  for (const [x, y, z, rx, rz] of pods) {
    p.add(pod(), mat(c.secondary), { x, y, z, rx, rz });
    if (x) p.add(pod(), mat(c.secondary), { x: -x, y, z, rx, rz: -rz });
  }
  // Glowing spores on the flank pods' tips.
  for (const [x, z] of [[1.19, 0.62], [1.21, -0.46]] as const) {
    p.add(ball(0.07, 0), mat(c.accent, 'emissive'), { x, y: -0.05 + (z > 0 ? 0 : 0.08), z });
    p.add(ball(0.07, 0), mat(c.accent, 'emissive'), { x: -x, y: -0.05 + (z > 0 ? 0 : 0.08), z });
  }
  // Engine bells at the stern.
  for (const [x, y] of [[-0.42, -0.08], [0.42, -0.08], [0, 0.26]] as const) {
    p.add(cyl(0.2, 0.26, 0.36, 6), mat(c.secondary), { x, y, z: -1.4, rx: Math.PI / 2 });
    p.add(cyl(0.16, 0.16, 0.06, 6), mat(c.accent, 'emissive'), { x, y, z: -1.62, rx: Math.PI / 2 });
  }
  return p.group;
};

/** Kinetic Bombard: a faceted hex-section gun hull with a rack of tungsten rods slung underneath. */
const bombard: ShipArt = (c) => {
  const p = new Prop();
  p.add(tube([[0, -0.95], [0.42, -0.9], [0.45, -0.4], [0.42, 0.4], [0.3, 0.85], [0, 1.0]], 6, 0.8, 0.8), mat(c.primary));
  p.add(obox(0.5, 0.05, 1.3), mat(c.secondary), { y: -0.62 });
  for (const x of [-0.2, 0.2]) for (const z of [-0.4, 0.4]) p.add(obox(0.05, 0.3, 0.05), mat(c.secondary), { x, y: -0.47, z });
  for (const x of [-0.2, -0.07, 0.07, 0.2]) p.add(cyl(0.05, 0.05, 1.3, 6), mat(c.primary), { x, y: -0.7, rx: Math.PI / 2 });
  p.add(cyl(0.1, 0.14, 0.5, 6), mat(c.secondary), { z: 1.1, rx: Math.PI / 2 });
  p.add(ball(0.08, 0), mat(c.accent, 'emissive'), { z: 1.36 });
  p.add(side([[-0.55, 0.3], [-0.95, 0.62], [-0.95, 0.3]], 0.04), mat(c.secondary));
  p.add(plan([[0.3, -0.55], [0.62, -0.95], [0.3, -0.95]], 0.04), mat(c.secondary));
  p.add(plan(flipX([[0.3, -0.55], [0.62, -0.95], [0.3, -0.95]]), 0.04), mat(c.secondary));
  for (const x of [-0.2, 0.2]) p.add(cyl(0.12, 0.14, 0.22, 6), mat(c.accent, 'emissive'), { x, z: -1.02, rx: Math.PI / 2 });
  return p.group;
};

/** Planet Cracker: a heavy geometric siege hull, a faceted core-breaker drill at the nose and four engines. */
const planetCracker: ShipArt = (c) => {
  const p = new Prop();
  p.add(hull([[-0.85, -0.45, -1.3], [0.85, -0.45, -1.3], [0.85, 0.4, -1.3], [-0.85, 0.4, -1.3], [-0.6, 0.55, 0.2], [0.6, 0.55, 0.2], [-0.7, -0.35, 0.3], [0.7, -0.35, 0.3]]), mat(c.primary));
  // The core-breaker: a faceted drill cone, hex rings round it, a glowing core at the point.
  p.add(lathe([[0, 0], [0.78, 0], [0.62, 0.7], [0.28, 1.3], [0, 1.7]], 6), mat(c.primary), { z: -0.1, rx: Math.PI / 2 });
  p.add(ring(0.8, 0.05, 6), mat(c.secondary), { z: 0.4, rx: Math.PI / 2 });
  p.add(ring(0.47, 0.05, 6), mat(c.secondary), { z: 1.0, rx: Math.PI / 2 });
  p.add(ball(0.13, 0), mat(c.accent, 'emissive'), { z: 1.65 });
  p.add(crystal(0.14, 0.3), mat(c.accent, 'glow'), { y: 0.4, z: -0.6 });
  for (const x of [-0.35, 0.35]) p.add(crystal(0.08, 0.18), mat(c.secondary), { x, y: 0.45, z: -0.1 });
  for (const x of [-0.9, 0.9]) p.add(obox(0.08, 0.6, 1.2, 0.12), mat(c.secondary), { x, z: -0.5 });
  for (const [x, y] of [[-0.5, -0.18], [0.5, -0.18], [-0.5, 0.2], [0.5, 0.2]] as const) {
    p.add(cyl(0.24, 0.3, 0.46, 6), mat(c.secondary), { x, y, z: -1.45, rx: Math.PI / 2 });
    p.add(cyl(0.2, 0.2, 0.06, 6), mat(c.accent, 'emissive'), { x, y, z: -1.7, rx: Math.PI / 2 });
  }
  return p.group;
};

export const LINE_A_SHIP_ART: Readonly<Record<string, ShipArt>> = {
  lancer,
  'railgun-monitor': railgunMonitor,
  interceptor,
  brawler,
  'missile-barge': missileBarge,
  'swarm-carrier': swarmCarrier,
  bombard,
  'planet-cracker': planetCracker,
};
