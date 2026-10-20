import * as THREE from 'three';
import { ball, cyl, crystal, hull, lathe, mat, obox, Prop, prism, ring, ROLES } from '../propKit';

/**
 * Thumbnail props for the Intelligence and Colonies & Ground War research nodes: one distinct prop per node id, built with
 * propKit (the `thumbnails` skill). Each stands on y = 0 at about unit size; the studio adds the
 * branch-coloured plinth and frames it.
 */

type V3 = readonly [number, number, number];
const UP = new THREE.Vector3(0, 1, 0);

/** Turn an object whose axis is +y so that axis points along `dir`. */
const pointAt = (o: THREE.Object3D, dir: THREE.Vector3): void => {
  o.quaternion.setFromUnitVectors(UP, dir.clone().normalize());
};

/** A straight member from a to b. `make(len)` builds it along y, then it is turned to span the two points. */
function member(p: Prop, a: V3, b: V3, make: (len: number) => THREE.BufferGeometry, m: THREE.Material): void {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), d = B.clone().sub(A);
  const mesh = p.add(make(d.length()), m, { x: (A.x + B.x) / 2, y: (A.y + B.y) / 2, z: (A.z + B.z) / 2 });
  pointAt(mesh, d);
}
const rod = (r: number) => (len: number) => cyl(r, r, len, 6);
const beam = (w: number) => (len: number) => obox(w, len, w);

/** A disc standing on its face toward +z (a wheel, a lens), centred on (x, y, z). */
function disc(p: Prop, r: number, t: number, n: number, m: THREE.Material, at: { x?: number; y?: number; z?: number } = {}): THREE.Mesh {
  return p.add(cyl(r, r, t, n), m, { ...at, rx: Math.PI / 2 });
}

/** Mimic Pheromones: a scent bulb ringed with petals, puffing glowing droplets that smell like the locals. */
const mimicPheromones = (): THREE.Group => {
  const p = new Prop();
  member(p, [0, 0, 0], [0, 0.6, 0], rod(0.035), mat('#4f8a3a', 'matte'));
  p.add(lathe([[0, 0], [0.12, 0], [0.16, 0.1], [0.12, 0.22], [0.06, 0.3], [0, 0.32]], 10), mat('#6fc08a', 'matte'), { y: 0.56 });
  for (let i = 0; i < 5; i++) {
    p.add(hull([[-0.12, 0, 0], [0.12, 0, 0], [0, 0.04, 0.38], [0, 0.2, 0.2]]), mat('#e4f7a0', 'matte'), { y: 0.7, ry: (i / 5) * Math.PI * 2 });
  }
  p.add(ball(0.05, 0), mat('#b8ff7a', 'emissive'), { x: 0.2, y: 1.12, z: 0.1 });
  p.add(ball(0.05, 0), mat('#b8ff7a', 'emissive'), { x: -0.16, y: 1.2, z: -0.08 });
  p.add(ball(0.05, 0), mat('#b8ff7a', 'emissive'), { x: 0.06, y: 1.3, z: 0.18 });
  return p.group;
};

/** Hive Infiltrators: a honeycomb of four cells with a green eye and antennae. */
const hiveInfiltrators = (): THREE.Group => {
  const p = new Prop();
  const amber = mat('#e0b04a', 'matte');
  const cells: [number, number, number][] = [[0, 0, 0.55], [0.346, 0, 0.7], [0.173, 0.3, 0.45], [-0.173, 0.3, 0.6]];
  for (const [x, z, h] of cells) p.add(cyl(0.2, 0.2, h, 6), amber, { x, y: h / 2, z });
  p.add(ball(0.08, 0), mat('#c6ff3a', 'emissive'), { x: 0.173, y: 0.5, z: 0.3 });
  member(p, [0, 0.55, 0], [0.14, 0.98, -0.08], rod(0.022), mat(ROLES.trim));
  member(p, [0, 0.55, 0], [-0.12, 0.92, 0.06], rod(0.022), mat(ROLES.trim));
  return p.group;
};

/** Deep-space Telescopes: a tripod-mounted telescope with its tube tilted to the sky. */
const telescope = (): THREE.Group => {
  const p = new Prop();
  const apex: V3 = [0, 0.8, 0];
  const dir = new THREE.Vector3(0.55, 0.85, 0).normalize();
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.3;
    member(p, [Math.cos(a) * 0.42, 0, Math.sin(a) * 0.42], apex, rod(0.028), mat(ROLES.trim));
  }
  p.add(ball(0.07, 0), mat(ROLES.gold), { x: apex[0], y: apex[1], z: apex[2] });
  const c = new THREE.Vector3(...apex).addScaledVector(dir, 0.3);
  const tube = p.add(cyl(0.11, 0.1, 0.6, 14), mat(ROLES.hull), { x: c.x, y: c.y, z: c.z });
  pointAt(tube, dir);
  const lensC = c.clone().addScaledVector(dir, 0.31);
  const lens = p.add(cyl(0.1, 0.1, 0.02, 14), mat('#9fe3ff', 'glass'), { x: lensC.x, y: lensC.y, z: lensC.z });
  pointAt(lens, dir);
  const eyeC = new THREE.Vector3(...apex).addScaledVector(dir, -0.04);
  const eye = p.add(cyl(0.05, 0.04, 0.12, 10), mat(ROLES.dark), { x: eyeC.x, y: eyeC.y, z: eyeC.z });
  pointAt(eye, dir);
  return p.group;
};

/** Quantum Decryption: a padlock with a glowing keyhole inside an orbit that no secret escapes. */
const quantumDecryption = (): THREE.Group => {
  const p = new Prop();
  p.add(obox(0.5, 0.4, 0.3, 0.04), mat(ROLES.hull), { y: 0.2 });
  p.add(new THREE.TorusGeometry(0.16, 0.045, 6, 14), mat(ROLES.gold), { y: 0.4 });
  p.add(ball(0.06, 0), mat('#5ec8ff', 'emissive'), { y: 0.26, z: 0.16 });
  p.add(obox(0.04, 0.1, 0.03), mat(ROLES.dark), { y: 0.16, z: 0.16 });
  p.add(ring(0.42, 0.018, 28), mat('#5ec8ff', 'emissive'), { y: 0.3, rx: 0.9, rz: 0.2 });
  return p.group;
};

/** Distributed AI: a core linked to five nodes across a mesh of struts. */
const distributedAi = (): THREE.Group => {
  const p = new Prop();
  const core: V3 = [0, 0.8, 0];
  const nodes: V3[] = [[0.38, 0.8, 0], [-0.36, 0.84, 0.1], [0.12, 1.12, 0.22], [-0.14, 1.1, -0.25], [0.1, 0.5, -0.3]];
  const link = mat(ROLES.trim);
  for (const n of nodes) member(p, core, n, rod(0.025), link);
  for (const [i, j] of [[0, 2], [2, 3], [3, 1]] as const) member(p, nodes[i], nodes[j], rod(0.02), link);
  for (const n of nodes) p.add(ball(0.08, 0), mat(ROLES.hull), { x: n[0], y: n[1], z: n[2] });
  p.add(ball(0.16, 1), mat('#5ec8ff', 'emissive'), { y: 0.8 });
  return p.group;
};

/** Salvage Rigs: a yellow crane with a claw hanging over a wreck. */
const salvage = (): THREE.Group => {
  const p = new Prop();
  const hazard = mat('#e8b03a', 'matte'), trim = mat(ROLES.trim);
  p.add(obox(0.5, 0.14, 0.5, 0.03), trim, { y: 0.07 });
  p.add(obox(0.16, 0.9, 0.16, 0.02), hazard, { y: 0.59 });
  p.add(obox(0.22, 0.18, 0.24, 0.02), mat(ROLES.hull), { x: -0.12, y: 0.45 });
  member(p, [0, 1.0, 0], [0.5, 0.42, 0], beam(0.08), hazard);
  member(p, [0.5, 0.42, 0], [0.5, 0.22, 0], rod(0.012), trim);
  p.add(obox(0.1, 0.06, 0.1), trim, { x: 0.5, y: 0.2 });
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    member(p, [0.5, 0.18, 0], [0.5 + Math.cos(a) * 0.1, 0.02, Math.sin(a) * 0.1], beam(0.035), mat(ROLES.hull));
  }
  p.add(hull([[-0.14, 0, -0.1], [0.14, 0, -0.1], [0.16, 0, 0.12], [-0.1, 0, 0.14], [0.02, 0.2, 0]]), mat(ROLES.rust), { x: 0.42, z: 0.02 });
  return p.group;
};

/** Reverse Engineering: a hull block broken into shards, a lens held over the seam. */
const reverseEngineering = (): THREE.Group => {
  const p = new Prop();
  p.add(obox(0.7, 0.14, 0.44, 0.03), mat(ROLES.hull), { x: -0.08, y: 0.07 });
  p.add(hull([[0, 0, 0], [0.18, 0, 0.02], [0.1, 0.16, -0.05], [0.02, 0.08, 0.12]]), mat(ROLES.rust), { x: 0.3, y: 0.14, z: 0.22, rz: 0.4 });
  p.add(hull([[0, 0, 0], [0.14, 0.02, 0.02], [0.06, 0.12, -0.03], [0.03, 0.02, 0.1]]), mat(ROLES.dark, 'matte'), { x: 0.34, y: 0.1, z: -0.16, rz: -0.5 });
  p.add(ball(0.04, 0), mat('#5ec8ff', 'emissive'), { x: -0.08, y: 0.16, z: 0.12 });
  p.add(new THREE.TorusGeometry(0.22, 0.03, 6, 16), mat(ROLES.gold), { x: 0.05, y: 0.62, z: 0.1 });
  disc(p, 0.2, 0.02, 16, mat('#9fe3ff', 'glass'), { x: 0.05, y: 0.62, z: 0.1 });
  member(p, [0.205, 0.465, 0.1], [0.42, 0.04, 0.14], rod(0.03), mat(ROLES.gold));
  member(p, [0.31, 0.2, 0.12], [0.37, 0.12, 0.13], rod(0.05), mat(ROLES.dark));
  return p.group;
};

/** Interferometry: three dishes on posts, linked by beams of light across a long baseline. */
const interferometry = (): THREE.Group => {
  const p = new Prop();
  const dish = () => Object.assign(mat('#c9b8e8', 'matte'), { side: THREE.DoubleSide });
  const xs = [-0.32, 0, 0.32];
  for (const x of xs) {
    p.add(cyl(0.03, 0.04, 0.4, 6), mat(ROLES.trim), { x, y: 0.2 });
    p.add(lathe([[0.02, 0], [0.14, 0.05], [0.2, 0.12], [0.2, 0.14], [0.14, 0.09], [0.02, 0.04]], 12), dish(), { x, y: 0.4, rx: 0.6 });
    p.add(ball(0.04, 0), mat('#e0c8ff', 'emissive'), { x, y: 0.48, z: 0.06 });
  }
  member(p, [-0.32, 0.48, 0.06], [0, 0.48, 0.06], rod(0.014), mat('#c792ea', 'emissive'));
  member(p, [0, 0.48, 0.06], [0.32, 0.48, 0.06], rod(0.014), mat('#c792ea', 'emissive'));
  return p.group;
};

/** Cipher Lattices: a cipher wheel on a stand, its rim tabs and a glowing pointer. */
const cipherLattice = (): THREE.Group => {
  const p = new Prop();
  const wheelY = 0.62;
  p.add(obox(0.5, 0.08, 0.3, 0.02), mat(ROLES.trim), { y: 0.04 });
  p.add(obox(0.08, 0.54, 0.08), mat(ROLES.trim), { y: 0.35 });
  disc(p, 0.42, 0.08, 24, mat('#9b7bd6'), { y: wheelY });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    p.add(obox(0.08, 0.08, 0.1), mat('#e8e2d4', 'matte'), { x: Math.cos(a) * 0.44, y: wheelY + Math.sin(a) * 0.44 });
  }
  disc(p, 0.26, 0.12, 20, mat(ROLES.gold), { y: wheelY, z: 0.04 });
  disc(p, 0.05, 0.3, 8, mat(ROLES.trim), { y: wheelY, z: 0.12 });
  p.add(ball(0.05, 0), mat('#e0c8ff', 'emissive'), { y: wheelY + 0.3, z: 0.1 });
  return p.group;
};

/** Court Intrigue: a masquerade mask on a rose stand, gold rim, dark eye holes and a plume. */
const courtIntrigue = (): THREE.Group => {
  const p = new Prop();
  p.add(lathe([[0, 0], [0.26, 0], [0.26, 0.05], [0.12, 0.14], [0.06, 0.22], [0, 0.24]], 10), mat('#b98c6a', 'matte'));
  p.add(cyl(0.035, 0.035, 0.5, 8), mat('#d98aa0', 'matte'), { y: 0.49 });
  p.add(ball(0.3, 1).scale(1, 0.68, 0.3), mat('#f6f1e4', 'matte'), { y: 0.92, z: 0.06 });
  p.add(new THREE.TorusGeometry(0.3, 0.022, 6, 20).scale(1, 0.68, 1), mat(ROLES.gold), { y: 0.92, z: 0.06 });
  for (const x of [-0.12, 0.12]) p.add(ball(0.07, 0), mat(ROLES.dark), { x, y: 0.94, z: 0.14 });
  p.add(prism([[0, 0], [0.05, 0.08], [0.07, 0.2], [0.01, 0.3], [-0.03, 0.18], [-0.04, 0.07]], 0.03), mat('#e0a1b5', 'matte'), { y: 1.1, rz: -0.2 });
  return p.group;
};

/** Cultural Attachés: an ear trumpet on a pedestal, listening under a pointed arch. */
const culturalAttaches = (): THREE.Group => {
  const p = new Prop();
  p.add(prism([[-0.3, 0], [-0.22, 0], [-0.22, 0.5], [0, 0.76], [0.22, 0.5], [0.22, 0], [0.3, 0], [0.3, 0.5], [0, 0.9], [-0.3, 0.5]], 0.08), mat('#e0a1b5', 'matte'), { z: -0.2 });
  p.add(ball(0.05, 0), mat(ROLES.gold), { y: 0.92, z: -0.2 });
  p.add(lathe([[0, 0], [0.2, 0], [0.2, 0.05], [0.09, 0.12], [0.06, 0.3], [0, 0.3]], 10), mat('#d8d2c4', 'matte'));
  const horn = Object.assign(mat(ROLES.gold), { side: THREE.DoubleSide });
  p.add(lathe([[0.03, 0], [0.05, 0.12], [0.12, 0.34], [0.22, 0.56], [0.3, 0.7]], 12), horn, { y: 0.3, rx: 0.9 });
  p.add(ball(0.04, 0), mat('#ffd27a', 'emissive'), { x: 0, y: 0.84, z: -0.14 });
  return p.group;
};

/** Grand Spymaster: a gilded spire with two rose spires beside it, a glowing crown. */
const grandSpymaster = (): THREE.Group => {
  const p = new Prop();
  const rose = mat('#e0a1b5', 'matte');
  p.add(obox(0.7, 0.08, 0.5, 0.02), mat('#d8d2c4', 'matte'), { y: 0.04 });
  p.add(lathe([[0, 0], [0.2, 0], [0.2, 0.08], [0.12, 0.2], [0.1, 0.7], [0.14, 0.76], [0.08, 0.8], [0.04, 1.1], [0, 1.2]], 10), mat(ROLES.gold), { y: 0.08 });
  p.add(ring(0.18, 0.02, 20), mat(ROLES.gold), { y: 0.7 });
  for (const x of [-0.26, 0.26]) {
    p.add(lathe([[0, 0], [0.13, 0], [0.11, 0.1], [0.07, 0.5], [0, 0.82]], 10), rose, { x, y: 0.08 });
    p.add(ball(0.04, 0), rose, { x, y: 0.92 });
  }
  p.add(ball(0.05, 0), mat('#ff8fa3', 'emissive'), { y: 1.3 });
  return p.group;
};

/** Shadow Network: a smugglers' crate under a jamming mast with a zigzag of signal. */
const shadowNetwork = (): THREE.Group => {
  const p = new Prop();
  p.add(obox(0.62, 0.36, 0.5, 0.03), mat(ROLES.trim), { x: -0.02, y: 0.18 });
  p.add(obox(0.64, 0.06, 0.02), mat('#f0a030', 'matte'), { x: -0.02, y: 0.12, z: 0.26 });
  p.add(obox(0.36, 0.3, 0.36, 0.03), mat('#9aa6b8'), { x: 0.12, y: 0.51 });
  member(p, [-0.22, 0.36, -0.05], [-0.22, 1.2, -0.05], rod(0.025), mat('#e8b03a', 'matte'));
  p.add(ball(0.035, 0), mat(ROLES.trim), { x: -0.22, y: 1.22, z: -0.05 });
  const bolt: [number, number][] = [[-0.1, 0], [0, 0.14], [-0.1, 0.28], [0, 0.42], [-0.1, 0.56], [-0.06, 0.56], [0.04, 0.42], [-0.06, 0.28], [0.04, 0.14], [-0.06, 0]];
  p.add(prism(bolt, 0.03), mat('#ffd27a', 'emissive'), { x: -0.33, y: 0.7 });
  return p.group;
};

/** Ground Mechs: a bipedal walker with a cyan visor, a cannon on each arm. */
const groundMechs = (): THREE.Group => {
  const p = new Prop();
  const hullM = mat('#c8d2e0', 'matte'), trim = mat('#8a95a8', 'matte');
  p.add(obox(0.4, 0.14, 0.3, 0.03), hullM, { y: 0.6 });
  p.add(obox(0.4, 0.3, 0.34, 0.05), hullM, { y: 0.82 });
  p.add(obox(0.26, 0.12, 0.22, 0.04), trim, { y: 1.03, z: 0.02 });
  p.add(obox(0.22, 0.04, 0.02), mat('#5ec8ff', 'emissive'), { y: 1.03, z: 0.13 });
  for (const s of [-1, 1]) {
    member(p, [s * 0.13, 0.6, 0], [s * 0.15, 0.32, 0.08], beam(0.1), hullM);
    member(p, [s * 0.15, 0.32, 0.08], [s * 0.13, 0.08, 0], beam(0.09), hullM);
    p.add(obox(0.2, 0.06, 0.28, 0.02), trim, { x: s * 0.13, y: 0.03, z: 0.05 });
    member(p, [s * 0.26, 0.9, 0], [s * 0.36, 0.6, 0.1], beam(0.08), trim);
    member(p, [s * 0.36, 0.6, 0.1], [s * 0.36, 0.5, 0.42], rod(0.035), mat(ROLES.dark));
  }
  return p.group;
};

/** Arcologies: a stepped hex tower of terraces with a crystal spire and violet window rings. */
const arcology = (): THREE.Group => {
  const p = new Prop();
  const tiers: [number, number, number, number][] = [[0.42, 0.5, 0.22, 0.11], [0.32, 0.4, 0.22, 0.33], [0.22, 0.3, 0.22, 0.55], [0.12, 0.2, 0.2, 0.76]];
  tiers.forEach(([rt, rb, h, y], i) => p.add(cyl(rt, rb, h, 6), mat(i % 2 ? '#9b8ad6' : '#b9a6e8', 'matte'), { y }));
  p.add(ring(0.37, 0.018, 6), mat('#c792ea', 'emissive'), { y: 0.44 });
  p.add(ring(0.27, 0.018, 6), mat('#c792ea', 'emissive'), { y: 0.66 });
  p.add(crystal(0.05, 0.2, 0.09), mat('#e6d8ff', 'matte'), { y: 0.86 });
  return p.group;
};

/** Geodesic Shields: a faceted shield dome over the ground, a glowing node at its crown. */
const geodesicShields = (): THREE.Group => {
  const p = new Prop();
  const ico = new THREE.IcosahedronGeometry(0.5, 1);
  const pos = ico.getAttribute('position');
  const seen = new Set<string>();
  const pts: [number, number, number][] = [];
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    if (y < -1e-6) continue;
    const key = [x, y, z].map((v) => v.toFixed(3)).join(',');
    if (seen.has(key)) continue;
    seen.add(key);
    pts.push([x, y, z]);
  }
  ico.dispose();
  const low = Math.min(...pts.map((q) => q[1]));
  p.add(cyl(0.55, 0.55, 0.04, 20), mat(ROLES.trim), { y: 0.02 });
  p.add(hull(pts.map(([x, y, z]) => [x, y - low + 0.04, z] as const)), mat('#9fd3e8', 'matte'));
  p.add(ball(0.05, 0), mat('#5ec8ff', 'emissive'), { y: 0.56 });
  return p.group;
};

/** Colonial Charters: a sealed charter unrolled between gold rods, a rose seal and ribbons. */
const colonialCharters = (): THREE.Group => {
  const p = new Prop();
  p.add(new THREE.PlaneGeometry(0.7, 0.8), Object.assign(mat('#efe3c8', 'matte'), { side: THREE.DoubleSide }), { y: 0.55 });
  for (const y of [0.13, 0.97]) p.add(cyl(0.04, 0.04, 0.8, 8), mat(ROLES.gold), { y, rz: Math.PI / 2 });
  for (const y of [0.8, 0.7, 0.62]) p.add(obox(0.42, 0.04, 0.01), mat(ROLES.trim), { x: -0.08, y, z: 0.01 });
  disc(p, 0.12, 0.05, 16, mat('#c95d7e', 'matte'), { x: 0.12, y: 0.42, z: 0.03 });
  p.add(obox(0.05, 0.22, 0.01), mat('#c95d7e', 'matte'), { x: 0.1, y: 0.25, z: 0.03, rz: 0.15 });
  p.add(obox(0.05, 0.22, 0.01), mat('#c95d7e', 'matte'), { x: 0.15, y: 0.25, z: 0.03, rz: -0.15 });
  return p.group;
};

/** Combined Arms Doctrine: a drop pod landed on three legs, with bombardment shells falling in from above. */
const combinedArms = (): THREE.Group => {
  const p = new Prop();
  p.add(lathe([[0, 0], [0.3, 0], [0.34, 0.1], [0.32, 0.42], [0.22, 0.6], [0.1, 0.68], [0, 0.7]], 12), mat('#e0a1b5', 'matte'), { y: 0.22 });
  p.add(ring(0.33, 0.03, 16), mat(ROLES.gold), { y: 0.34 });
  p.add(obox(0.12, 0.14, 0.03), mat('#ffd27a', 'emissive'), { y: 0.72, z: 0.3 });
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.5;
    member(p, [Math.cos(a) * 0.2, 0.26, Math.sin(a) * 0.2], [Math.cos(a) * 0.46, 0, Math.sin(a) * 0.46], rod(0.03), mat(ROLES.trim));
    p.add(cyl(0.07, 0.07, 0.03, 8), mat(ROLES.trim), { x: Math.cos(a) * 0.46, y: 0.015, z: Math.sin(a) * 0.46 });
  }
  for (const [x, y, z] of [[0.4, 0.92, -0.15], [-0.36, 1.02, 0.05]] as const) {
    p.add(lathe([[0, 0], [0.09, 0.06], [0.09, 0.3], [0, 0.4]], 8), mat(ROLES.hull), { x, y, z, rx: Math.PI });
    p.add(ball(0.11, 0), mat('#ffb074', 'glow'), { x, y: y + 0.36, z });
  }
  return p.group;
};

export const INTEL_COLONIES_NODE_PROPS: Readonly<Record<string, () => THREE.Group>> = {
  'o-mimic-pheromones': mimicPheromones,
  'o-hive-infiltrators': hiveInfiltrators,
  't-deep-space-telescopes': telescope,
  't-quantum-decryption': quantumDecryption,
  't-distributed-ai': distributedAi,
  'u-salvage': salvage,
  'u-reverse-engineering': reverseEngineering,
  'g-interferometry': interferometry,
  'g-cipher-lattices': cipherLattice,
  'a-court-intrigue': courtIntrigue,
  'a-cultural-attaches': culturalAttaches,
  'a-grand-spymaster': grandSpymaster,
  'x-shadow-network': shadowNetwork,
  't-ground-mechs': groundMechs,
  'g-arcology': arcology,
  'g-geodesic-shields': geodesicShields,
  'a-colonial-charters': colonialCharters,
  'x-combined-arms': combinedArms,
};
