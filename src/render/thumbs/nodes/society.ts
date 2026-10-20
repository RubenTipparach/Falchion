import * as THREE from 'three';
import { ball, crystal, cyl, hull, lathe, mat, obox, Prop, prism, ring, ROLES } from '../propKit';

/**
 * Thumbnail props for the Society research nodes: one distinct prop per node id, built with
 * propKit (the `thumbnails` skill). Each stands on y = 0 at about unit size; the studio adds the
 * branch-coloured plinth and frames it.
 */

type V3 = readonly [number, number, number];

/** A tapered strut from `a` to `b`, built along its own line so its tilt is exact. */
function strut(a: V3, b: V3, rA: number, rB = rA, n = 6): THREE.BufferGeometry {
  const from = new THREE.Vector3(...a), to = new THREE.Vector3(...b), d = to.clone().sub(from);
  const g = new THREE.CylinderGeometry(rB, rA, d.length(), n);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
  return g.translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
}

/** Pheromone Diplomacy: a scent gland on two bent antennae, tipped with glowing knobs. */
const pheromoneDiplomacy = (): THREE.Group => {
  const p = new Prop();
  p.add(lathe([[0, 0], [0.26, 0], [0.34, 0.2], [0.26, 0.4], [0.12, 0.46], [0, 0.46]], 10), mat('#8fbf6a', 'matte'));
  for (const s of [-1, 1]) {
    p.add(strut([s * 0.12, 0.4, 0], [s * 0.34, 1.1, 0], 0.03, 0.02), mat('#5c8a3a', 'matte'));
    p.add(ball(0.09, 0), mat('#e8ff9a', 'emissive'), { x: s * 0.34, y: 1.14 });
  }
  return p.group;
};

/** Communal Mind: a honeycomb of hex cells, one bright cell on top. */
const communalMind = (): THREE.Group => {
  const p = new Prop();
  const honey = '#d6b25a';
  // Hex cylinders (6 sides) packed flat-to-flat: 0.38 apart is one cell's width.
  const cell = (x: number, z: number, y: number, h: number) =>
    p.add(cyl(0.22, 0.22, h, 6), mat(honey, 'matte'), { x: x - 0.19, y: y + h / 2, z: z - 0.17 });
  cell(0, 0, 0, 0.7);
  cell(0.38, 0, 0, 0.5);
  cell(0.19, 0.33, 0, 0.6);
  cell(0.19, 0.11, 0.7, 0.35);
  p.add(ball(0.09, 0), mat('#b8ff7a', 'emissive'), { x: 0, y: 1.1, z: -0.06 });
  return p.group;
};

/** Spore Missions: a dandelion seed head on a stalk, spores ready to be cast on the wind. */
const sporeMissions = (): THREE.Group => {
  const p = new Prop();
  p.add(strut([0, 0, 0], [0, 0.9, 0], 0.045, 0.03, 6), mat('#6a8a52', 'matte'));
  p.add(ball(0.2, 1), mat('#f4ffd6', 'emissive'), { y: 1.0 });
  for (let i = 0; i < 6; i++) {
    const phi = (i / 6) * Math.PI * 2 + 0.3, t = 0.8 + (i % 2) * 0.3;
    const d: V3 = [Math.sin(t) * Math.cos(phi), Math.cos(t), Math.sin(t) * Math.sin(phi)];
    const at = (k: number): V3 => [d[0] * k, 1.0 + d[1] * k, d[2] * k];
    p.add(strut(at(0.16), at(0.56), 0.04, 0.02, 5), mat('#eef7d8', 'matte'));
  }
  return p.group;
};

/** Gestalt Council: one tall pod ringed by five lesser pods, all bound by one membrane. */
const gestaltCouncil = (): THREE.Group => {
  const p = new Prop();
  p.add(lathe([[0, 0], [0.3, 0], [0.36, 0.3], [0.3, 0.6], [0.16, 0.8], [0, 0.84]], 10), mat('#a3c97a', 'matte'));
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    p.add(lathe([[0, 0], [0.13, 0], [0.16, 0.14], [0.1, 0.3], [0, 0.32]], 8), mat('#7bd88f', 'matte'), { x: Math.cos(a) * 0.5, z: Math.sin(a) * 0.5 });
  }
  p.add(ring(0.5, 0.025, 28), mat('#5c8a3a', 'matte'), { y: 0.3 });
  p.add(ball(0.09, 0), mat('#b8ff7a', 'emissive'), { y: 0.9 });
  return p.group;
};

/** Market Algorithms: a trading console, a rising bar chart and a trend line on its face. */
const marketAlgorithms = (): THREE.Group => {
  const p = new Prop();
  p.add(obox(1.0, 0.24, 0.5, 0.05), mat(ROLES.hull), { y: 0.12 });
  p.add(obox(0.92, 0.04, 0.42), mat(ROLES.dark), { y: 0.26 });
  const bar = (x: number, h: number, finish: 'matte' | 'emissive') =>
    p.add(obox(0.16, h, 0.16, 0.02), mat('#8fdcff', finish), { x, y: 0.28 + h / 2, z: 0.02 });
  bar(-0.28, 0.2, 'matte');
  bar(0, 0.36, 'matte');
  bar(0.28, 0.56, 'emissive');
  p.add(strut([-0.28, 0.53, 0.02], [0.28, 0.96, 0.02], 0.025), mat('#ffd27a', 'emissive'));
  p.add(ball(0.05, 0), mat(ROLES.gold), { x: 0.28, y: 0.96, z: 0.02 });
  return p.group;
};

/** Technocracy: a slim control column with three lit screens and a gold crown. */
const technocracy = (): THREE.Group => {
  const p = new Prop();
  p.add(lathe([[0, 0], [0.3, 0], [0.3, 0.06], [0.2, 0.12], [0, 0.12]], 8), mat(ROLES.trim));
  p.add(lathe([[0, 0.1], [0.2, 0.12], [0.14, 0.5], [0.13, 0.9], [0.07, 1.0], [0, 1.0]], 8), mat(ROLES.hull));
  for (const [y, w] of [[0.3, 0.3], [0.52, 0.22], [0.74, 0.16]] as const) {
    p.add(obox(w, 0.13, 0.04), mat('#5ec8ff', 'emissive'), { y, z: 0.15 });
  }
  p.add(ball(0.07, 1), mat(ROLES.gold), { y: 1.07 });
  return p.group;
};

/** Media Networks: a broadcast mast on a tripod, with signal rings rippling from its top. */
const mediaNetworks = (): THREE.Group => {
  const p = new Prop();
  p.add(cyl(0.16, 0.22, 0.12, 8), mat(ROLES.trim), { y: 0.06 });
  p.add(strut([0, 0.12, 0], [0, 1.0, 0], 0.09, 0.03, 6), mat(ROLES.hull));
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    p.add(strut([Math.cos(a) * 0.22, 0.12, Math.sin(a) * 0.22], [0, 0.7, 0], 0.035, 0.03, 5), mat(ROLES.trim));
  }
  for (const r of [0.22, 0.36, 0.5]) p.add(ring(r, 0.02, 24), mat('#5ec8ff', 'glow'), { y: 0.98, rx: 0.3 });
  p.add(ball(0.07, 0), mat(ROLES.gold), { y: 1.07 });
  return p.group;
};

/** AI Governors: a machine administrator's head, a cyan visor and an antenna. */
const aiGovernors = (): THREE.Group => {
  const p = new Prop();
  p.add(lathe([[0, 0], [0.36, 0], [0.42, 0.08], [0.3, 0.16], [0, 0.16]], 10), mat(ROLES.trim));
  p.add(obox(0.56, 0.5, 0.5, 0.12), mat(ROLES.hull), { y: 0.41 });
  p.add(obox(0.44, 0.1, 0.03), mat('#5ec8ff', 'emissive'), { y: 0.46, z: 0.265 });
  for (const s of [-1, 1]) p.add(cyl(0.07, 0.07, 0.08, 10), mat(ROLES.trim), { x: s * 0.31, y: 0.44, rz: Math.PI / 2 });
  p.add(strut([0.12, 0.66, 0], [0.18, 0.92, 0], 0.03), mat(ROLES.trim));
  p.add(ball(0.07, 0), mat(ROLES.gold), { x: 0.18, y: 0.95 });
  return p.group;
};

/** Free Ports: a quay with containers under a yellow gantry crane lifting one. */
const freePorts = (): THREE.Group => {
  const p = new Prop();
  p.add(obox(1.1, 0.06, 0.7), mat(ROLES.trim), { y: 0.03 });
  p.add(obox(0.42, 0.26, 0.36, 0.02), mat('#e0883a', 'matte'), { x: -0.36, y: 0.19 });
  p.add(obox(0.42, 0.26, 0.36, 0.02), mat('#5c86b8', 'matte'), { x: -0.36, y: 0.45 });
  p.add(obox(0.36, 0.26, 0.36, 0.02), mat('#8ea4bd', 'matte'), { x: 0.0, y: 0.19, ry: 0.2 });
  for (const z of [-0.22, 0.22]) p.add(obox(0.09, 0.86, 0.09), mat('#e8b43a', 'matte'), { x: 0.3, y: 0.49, z });
  p.add(obox(0.09, 0.09, 0.5), mat('#e8b43a', 'matte'), { x: 0.3, y: 0.86 });
  p.add(obox(0.95, 0.07, 0.1), mat('#e8b43a', 'matte'), { x: -0.15, y: 0.885 });
  p.add(strut([-0.5, 0.85, 0], [-0.5, 0.6, 0], 0.025), mat(ROLES.dark));
  p.add(ball(0.05, 0), mat(ROLES.dark), { x: -0.5, y: 0.56 });
  return p.group;
};

/** Corporate Charters: a briefcase with a gold band, a clasp and a carrying handle. */
const corporateCharters = (): THREE.Group => {
  const p = new Prop();
  p.add(obox(0.9, 0.5, 0.42, 0.03), mat('#a9744f', 'matte'), { y: 0.25 });
  p.add(obox(0.92, 0.06, 0.44), mat(ROLES.gold), { y: 0.3 });
  p.add(ring(0.17, 0.035, 14), mat(ROLES.trim), { y: 0.5, rx: Math.PI / 2 });
  p.add(obox(0.14, 0.12, 0.05), mat(ROLES.gold), { y: 0.42, z: 0.23 });
  return p.group;
};

/** Trade Federation: three cargo drums bound together by one gold strap, on a pallet. */
const tradeFederation = (): THREE.Group => {
  const p = new Prop();
  p.add(obox(1.0, 0.06, 0.8), mat('#8a6a50', 'matte'), { y: 0.03 });
  for (const [x, z] of [[-0.2, -0.12], [0.2, -0.12], [0, 0.23]] as const) {
    p.add(cyl(0.2, 0.2, 0.56, 12), mat('#6f8fb0', 'matte'), { x, y: 0.34, z });
    p.add(ring(0.205, 0.028, 14), mat(ROLES.gold), { x, y: 0.5, z });
  }
  p.add(ring(0.47, 0.03, 24), mat(ROLES.gold), { y: 0.55 });
  p.add(ball(0.1, 0), mat(ROLES.gold), { y: 0.66 });
  return p.group;
};

/** Axiomatic Law: a stone law-tablet with a gold triangle proof and a violet seal. */
const axiomaticLaw = (): THREE.Group => {
  const p = new Prop();
  p.add(obox(0.8, 0.12, 0.5, 0.03), mat('#8c8f99', 'matte'), { y: 0.06 });
  p.add(prism([[-0.32, 0], [0.32, 0], [0.32, 0.7], [0.2, 0.86], [0, 0.92], [-0.2, 0.86], [-0.32, 0.7]], 0.14), mat('#d8d2c4', 'matte'), { y: 0.12 });
  p.add(prism([[0, 0.66], [-0.2, 0.3], [0.2, 0.3]], 0.04), mat(ROLES.gold), { y: 0.12, z: 0.09 });
  p.add(ball(0.08, 0), mat('#c792ea', 'emissive'), { y: 1.08 });
  return p.group;
};

/** Harmony of the Spheres: an armillary sphere, three rings round a violet core. */
const harmonyOfSpheres = (): THREE.Group => {
  const p = new Prop();
  const c = 0.7;
  p.add(lathe([[0, 0], [0.3, 0], [0.3, 0.05], [0.14, 0.1], [0, 0.1]], 10), mat(ROLES.trim));
  p.add(cyl(0.04, 0.05, 0.18, 8), mat(ROLES.gold), { y: 0.19 });
  p.add(ring(0.42, 0.03, 28), mat(ROLES.gold), { y: c });
  p.add(ring(0.42, 0.03, 28), mat(ROLES.gold), { y: c, rx: Math.PI / 2 });
  p.add(ring(0.42, 0.03, 28), mat('#c792ea', 'emissive'), { y: c, rz: Math.PI / 2 });
  p.add(ball(0.12, 1), mat('#c792ea', 'emissive'), { y: c });
  return p.group;
};

/** Meritocracy: a winners' podium, the first place highest, with a crystal crowning it. */
const meritocracy = (): THREE.Group => {
  const p = new Prop();
  p.add(obox(1.0, 0.04, 0.5), mat(ROLES.trim), { y: 0.02 });
  p.add(obox(0.3, 0.36, 0.34, 0.03), mat('#c0c8d6'), { x: -0.32, y: 0.22 });
  p.add(obox(0.32, 0.56, 0.36, 0.03), mat(ROLES.gold), { y: 0.32 });
  p.add(obox(0.3, 0.24, 0.34, 0.03), mat('#b07a4a'), { x: 0.32, y: 0.16 });
  p.add(crystal(0.1, 0.22), mat('#c792ea', 'emissive'), { y: 0.6 });
  return p.group;
};

/** The Perfect State: a dodecahedron floating over its pedestal, with four gold policy slots on a ring. */
const perfectState = (): THREE.Group => {
  const p = new Prop();
  const f = (1 + Math.sqrt(5)) / 2, g = 1 / f, k = 0.26;
  const v: [number, number, number][] = [];
  for (const a of [-1, 1]) for (const b of [-1, 1]) for (const c of [-1, 1]) v.push([a, b, c]);
  for (const a of [-1, 1]) for (const b of [-1, 1]) v.push([0, a * g, b * f], [a * g, b * f, 0], [b * f, 0, a * g]);
  p.add(lathe([[0, 0], [0.3, 0], [0.3, 0.06], [0.18, 0.12], [0, 0.12]], 10), mat(ROLES.trim));
  p.add(cyl(0.05, 0.05, 0.08, 8), mat(ROLES.gold), { y: 0.16 });
  p.add(hull(v.map(([x, y, z]) => [x * k, y * k, z * k] as const)), mat('#b9a4ff'), { y: 0.62 });
  p.add(ring(0.58, 0.02, 28), mat(ROLES.gold), { y: 0.62 });
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    p.add(obox(0.1, 0.1, 0.1, 0.02), mat(ROLES.gold), { x: Math.cos(a) * 0.58, y: 0.62, z: Math.sin(a) * 0.58, ry: -a });
  }
  return p.group;
};

/** Diplomatic Corps: a white dove with gold beak on a rose pedestal: envoys in peace. */
const diplomaticCorps = (): THREE.Group => {
  const p = new Prop();
  p.add(lathe([[0, 0], [0.32, 0], [0.32, 0.04], [0.22, 0.1], [0.2, 0.22], [0.14, 0.26], [0, 0.26]], 10), mat('#e8a0b4', 'matte'));
  p.add(ball(0.2, 1).scale(1.3, 0.9, 1), mat('#f4f0e6', 'matte'), { y: 0.46 });
  p.add(ball(0.11, 1), mat('#f4f0e6', 'matte'), { x: 0.24, y: 0.6 });
  p.add(cyl(0, 0.035, 0.1, 4), mat(ROLES.gold), { x: 0.36, y: 0.6, rz: -Math.PI / 2 });
  const wing = [[0.14, 0], [0.02, 0.18], [-0.2, 0.34], [-0.38, 0.4], [-0.26, 0.22], [-0.14, 0.1], [-0.06, -0.04]] as [number, number][];
  p.add(prism(wing, 0.07), mat('#f4f0e6', 'matte'), { y: 0.44, z: 0.09 });
  p.add(prism(wing, 0.07), mat('#d8d2c4', 'matte'), { y: 0.44, z: -0.09 });
  return p.group;
};

/** Stellar Republic: a terracotta ballot amphora with a voting slip dropping in. */
const stellarRepublic = (): THREE.Group => {
  const p = new Prop();
  const clay = '#c77d55';
  p.add(lathe([[0, 0], [0.14, 0], [0.2, 0.12], [0.33, 0.5], [0.26, 0.8], [0.12, 0.92], [0.14, 1.0], [0, 1.0]], 12), mat(clay, 'matte'));
  for (const s of [-1, 1]) p.add(ring(0.16, 0.03, 14), mat(clay, 'matte'), { x: s * 0.31, y: 0.72, rx: Math.PI / 2 });
  p.add(ring(0.245, 0.025, 20), mat(ROLES.gold), { y: 0.22 });
  p.add(ring(0.14, 0.025, 14), mat(ROLES.gold), { y: 1.0 });
  p.add(obox(0.14, 0.22, 0.015), mat('#f4f1e8', 'matte'), { x: 0.08, y: 1.12, rz: -0.3 });
  return p.group;
};

/** Cathedral Ships: a nave with twin spires, a tall central spire and a lit rose window. */
const cathedralShips = (): THREE.Group => {
  const p = new Prop();
  const ivory = '#e8e2d4', rose = '#e8a0b4';
  p.add(obox(0.96, 0.5, 0.5, 0.02), mat(ivory, 'matte'), { y: 0.25 });
  for (const x of [-0.36, 0.36]) {
    p.add(obox(0.22, 0.72, 0.26, 0.02), mat(ivory, 'matte'), { x, y: 0.36 });
    p.add(cyl(0, 0.13, 0.5, 6), mat(rose, 'matte'), { x, y: 0.97 });
  }
  p.add(obox(0.3, 0.8, 0.3, 0.02), mat(ivory, 'matte'), { y: 0.4 });
  p.add(cyl(0, 0.18, 0.5, 6), mat(rose, 'matte'), { y: 1.05 });
  p.add(ball(0.05, 0), mat(ROLES.gold), { y: 1.33 });
  p.add(cyl(0.11, 0.11, 0.04, 12), mat('#ffb0c8', 'emissive'), { y: 0.36, z: 0.26, rx: Math.PI / 2 });
  p.add(obox(0.16, 0.24, 0.04), mat(ROLES.dark), { y: 0.12, z: 0.26 });
  return p.group;
};

/** Missionary Orders: a pilgrim's staff with a gold sunburst, its rays spreading outward. */
const missionaryOrders = (): THREE.Group => {
  const p = new Prop();
  const c: V3 = [0, 0.88, 0];
  p.add(lathe([[0, 0], [0.2, 0], [0.16, 0.08], [0.12, 0.12], [0, 0.12]], 8), mat('#b8b2a4'));
  p.add(cyl(0.035, 0.045, 0.72, 6), mat('#c9a77a', 'matte'), { y: 0.48 });
  p.add(lathe([[0, 0], [0.15, 0], [0.15, 0.04], [0, 0.04]], 12), mat(ROLES.gold), { y: c[1], z: -0.02, rx: Math.PI / 2 });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2, r = i % 2 ? 0.36 : 0.26;
    p.add(strut([c[0] + Math.cos(a) * 0.18, c[1] + Math.sin(a) * 0.18, 0], [c[0] + Math.cos(a) * r, c[1] + Math.sin(a) * r, 0], 0.03, 0.02, 5), mat('#e6b450'));
  }
  return p.group;
};

/** Pilgrim Routes: stepping stones leading to a rose shrine, with lanterns along the way. */
const pilgrimRoutes = (): THREE.Group => {
  const p = new Prop();
  const stone = '#a89f8c';
  for (const [x, z] of [[-0.52, 0.42], [-0.36, 0.28], [-0.2, 0.14], [-0.04, 0.0], [0.12, -0.14]] as const) {
    p.add(cyl(0.13, 0.14, 0.07, 8), mat(stone, 'matte'), { x, y: 0.035, z });
  }
  p.add(obox(0.3, 0.3, 0.3, 0.02), mat('#e8e2d4', 'matte'), { x: 0.36, y: 0.15, z: -0.3 });
  p.add(hull([[-0.2, 0, -0.2], [0.2, 0, -0.2], [0.2, 0, 0.2], [-0.2, 0, 0.2], [0, 0.26, 0]]), mat('#e8a0b4', 'matte'), { x: 0.36, y: 0.3, z: -0.3 });
  for (const [x, z] of [[-0.36, 0.28], [0.12, -0.14]] as const) {
    p.add(strut([x, 0.05, z], [x, 0.56, z], 0.025, 0.02, 5), mat(ROLES.trim));
    p.add(ball(0.1, 0), mat('#ffd27a', 'emissive'), { x, y: 0.62, z });
  }
  return p.group;
};

/** Galactic Bazaar: a rose canopy over a merchant's counter, with a glowing globe at its peak. */
const galacticBazaar = (): THREE.Group => {
  const p = new Prop();
  p.add(obox(0.9, 0.22, 0.4, 0.03), mat('#a9744f', 'matte'), { y: 0.11 });
  p.add(lathe([[0, 0], [0.1, 0], [0.11, 0.12], [0.06, 0.22], [0, 0.24]], 8), mat('#ff8a5c', 'matte'), { x: -0.26, y: 0.22 });
  p.add(ball(0.1, 0), mat('#7bd88f', 'matte'), { y: 0.32 });
  p.add(lathe([[0, 0], [0.08, 0], [0.1, 0.1], [0.04, 0.2], [0, 0.2]], 8), mat(ROLES.gold), { x: 0.26, y: 0.22 });
  for (const [x, z] of [[-0.42, -0.18], [0.42, -0.18], [-0.42, 0.18], [0.42, 0.18]] as const) {
    p.add(strut([x, 0.22, z], [x, 0.84, z], 0.03, 0.03, 5), mat(ROLES.trim));
  }
  p.add(hull([[-0.5, 0.84, -0.28], [0.5, 0.84, -0.28], [0.5, 0.84, 0.28], [-0.5, 0.84, 0.28], [0, 1.0, 0]]), mat('#e8a0b4', 'matte'));
  for (const x of [-0.36, 0, 0.36]) p.add(ball(0.05, 0), mat(ROLES.gold), { x, y: 0.8, z: 0.3 });
  p.add(ball(0.08, 1), mat('#ffe08a', 'emissive'), { y: 1.08 });
  return p.group;
};

/** Symbiotic Trade: two grown pods joined by an arching tendril, exchanging glowing spores. */
const symbioticTrade = (): THREE.Group => {
  const p = new Prop();
  p.add(lathe([[0, 0], [0.22, 0], [0.28, 0.2], [0.2, 0.4], [0, 0.44]], 10), mat('#5fb8a0', 'matte'), { x: -0.26 });
  p.add(lathe([[0, 0], [0.18, 0], [0.22, 0.16], [0.14, 0.32], [0, 0.34]], 10), mat('#a3c97a', 'matte'), { x: 0.28, z: 0.04 });
  p.add(strut([-0.26, 0.42, 0], [0.01, 0.72, 0.06], 0.055, 0.05, 5), mat('#5c8a3a', 'matte'));
  p.add(strut([0.01, 0.72, 0.06], [0.28, 0.34, 0.04], 0.05, 0.055, 5), mat('#5c8a3a', 'matte'));
  p.add(ball(0.08, 0), mat('#b8ff7a', 'emissive'), { x: -0.12, y: 0.62, z: 0.03 });
  p.add(ball(0.08, 0), mat('#b8ff7a', 'emissive'), { x: 0.14, y: 0.62, z: 0.05 });
  return p.group;
};

export const SOCIETY_NODE_PROPS: Readonly<Record<string, () => THREE.Group>> = {
  'o-pheromone-diplomacy': pheromoneDiplomacy,
  'o-communal-mind': communalMind,
  'o-spore-missions': sporeMissions,
  'o-gestalt-council': gestaltCouncil,
  't-market-algorithms': marketAlgorithms,
  't-technocracy': technocracy,
  't-media-networks': mediaNetworks,
  't-ai-governors': aiGovernors,
  'u-free-ports': freePorts,
  'u-corporate-charters': corporateCharters,
  'u-trade-federation': tradeFederation,
  'g-axiomatic-law': axiomaticLaw,
  'g-harmony-of-spheres': harmonyOfSpheres,
  'g-meritocracy': meritocracy,
  'g-perfect-state': perfectState,
  'a-diplomacy': diplomaticCorps,
  'a-republic': stellarRepublic,
  'a-cathedral': cathedralShips,
  'a-missionaries': missionaryOrders,
  'a-pilgrim-routes': pilgrimRoutes,
  'x-galactic-bazaar': galacticBazaar,
  'x-symbiotic-trade': symbioticTrade,
};
