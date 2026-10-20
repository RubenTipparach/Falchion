import * as THREE from 'three';
import { ball, crystal, cyl, hull, lathe, mat, obox, Prop, prism, ring, ROLES } from '../propKit';

/** A round rod from a to b, both in the xy plane. */
function link(p: Prop, a: readonly [number, number], b: readonly [number, number], r: number, m: THREE.Material): void {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  p.add(cyl(r, r, Math.hypot(dx, dy), 7), m, { x: (a[0] + b[0]) / 2, y: (a[1] + b[1]) / 2, rz: -Math.atan2(dx, dy) });
}

/** Chitin Plates: stacked shell plates grown over the hull, a spine on top. */
const chitinPlates = (): THREE.Group => {
  const p = new Prop();
  p.add(cyl(0.56, 0.6, 0.06, 14), mat(ROLES.dark), { y: 0.03 });
  // Tall, faceted plates, each one lapping the plate under it and turned a little, so the seams show.
  const shades = ['#8fbf5a', '#6fa048', '#a5cf6e', '#7bb35a'];
  [0.5, 0.43, 0.36, 0.28].forEach((r, i) => {
    p.add(lathe([[0, 0], [r, 0], [r * 0.97, 0.12], [r * 0.7, 0.22], [0, 0.26]], 7), mat(shades[i], 'matte'), { y: 0.06 + i * 0.13, ry: i * 0.45 });
  });
  p.add(lathe([[0, 0], [0.08, 0], [0.03, 0.3], [0, 0.32]], 8), mat('#d8e8a0'), { y: 0.62 });
  return p.group;
};

/** Ablative Ichor: a torn organic hull that bleeds glowing ichor into a pool. */
const ablativeIchor = (): THREE.Group => {
  const p = new Prop();
  p.add(hull([[-0.45, 0.06, -0.3], [0.45, 0.06, -0.3], [0.32, 0.7, -0.22], [-0.32, 0.7, -0.22], [0, 0.92, -0.05], [-0.1, 0.06, 0.4], [0.2, 0.3, 0.44]]), mat('#7fbf9a', 'matte'));
  p.add(ball(0.13, 1), mat('#5effc0', 'emissive'), { x: 0.08, y: 0.46, z: 0.34 });
  p.add(ball(0.045, 0), mat('#3fd6a8', 'matte'), { x: 0.12, y: 0.3, z: 0.36 });
  p.add(ball(0.035, 0), mat('#3fd6a8', 'matte'), { x: 0.02, y: 0.2, z: 0.4 });
  p.add(ball(0.028, 0), mat('#3fd6a8', 'matte'), { x: 0.14, y: 0.12, z: 0.42 });
  p.add(cyl(0.3, 0.34, 0.03, 12), mat('#3fe0b0', 'glass'), { x: 0.1, y: 0.015, z: 0.42 });
  return p.group;
};

/** Adaptive Immunity: a pod ringed with receptor stalks; the one facing you has adapted and glows. */
const adaptiveImmunity = (): THREE.Group => {
  const p = new Prop();
  p.add(lathe([[0, 0], [0.3, 0], [0.36, 0.22], [0.3, 0.46], [0.14, 0.56], [0, 0.58]], 12), mat('#5fbfa0'), { y: 0.02 });
  const lean = 0.6, s = Math.sin(lean), c = Math.cos(lean);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + Math.PI / 2;
    const bx = Math.cos(a) * 0.22, bz = Math.sin(a) * 0.22, by = 0.3;
    const dx = Math.cos(a) * s, dz = Math.sin(a) * s;
    p.add(cyl(0.025, 0.02, 0.36, 5), mat('#c9e8b0', 'matte'), { x: bx + dx * 0.18, y: by + c * 0.18, z: bz + dz * 0.18, rz: -lean, ry: -a });
    const hit = i === 0;
    p.add(ball(hit ? 0.12 : 0.06, hit ? 1 : 0), mat(hit ? '#b8ff7a' : '#d8ffe6', hit ? 'emissive' : 'matte'), { x: bx + dx * 0.36, y: by + c * 0.36, z: bz + dz * 0.36 });
  }
  return p.group;
};

/** Point Defence Grid: a 2x2 cluster of tubes on a mount, firing up at an incoming missile. */
const pointDefence = (): THREE.Group => {
  const p = new Prop();
  p.add(obox(0.7, 0.12, 0.7, 0.03), mat(ROLES.hull), { y: 0.06 });
  p.add(cyl(0.14, 0.2, 0.42, 10), mat(ROLES.trim), { y: 0.33 });
  p.add(obox(0.62, 0.1, 0.62, 0.02), mat(ROLES.hull), { y: 0.58 });
  for (const x of [-0.16, 0.16]) for (const z of [-0.16, 0.16]) {
    p.add(cyl(0.07, 0.07, 0.3, 8), mat(ROLES.dark), { x, y: 0.79, z });
    p.add(ball(0.06, 0), mat('#5ef0ff', 'emissive'), { x, y: 0.97, z });
  }
  // The incoming missile, nose down and to the left, and the flash where it breaks.
  p.add(lathe([[0, 0.32], [0.05, 0.24], [0.05, 0], [0, 0]], 6), mat('#e8e2d4'), { x: 0.7, y: 1.25, rz: 2.5 });
  p.add(ball(0.1, 0), mat('#ffb074', 'glow'), { x: 0.4, y: 0.9 });
  return p.group;
};

/** Deflector Shields: a round emitter disc on a post, its rim alight. */
const deflectorShields = (): THREE.Group => {
  const p = new Prop();
  p.add(cyl(0.3, 0.34, 0.1, 12), mat(ROLES.trim), { y: 0.05 });
  p.add(cyl(0.06, 0.08, 0.6, 8), mat(ROLES.dark), { y: 0.4, z: -0.02 });
  p.add(cyl(0.5, 0.5, 0.1, 18), mat('#7d8ba0'), { y: 0.85, rx: Math.PI / 2 });
  p.add(ring(0.5, 0.035, 24), mat('#5ef0ff', 'emissive'), { y: 0.85, z: 0.06, rx: Math.PI / 2 });
  p.add(ball(0.12, 1), mat('#5ef0ff', 'emissive'), { y: 0.85, z: 0.07 });
  return p.group;
};

/** Ablative Armour: a bolted plate, scorched at the corner, shedding flakes as it burns. */
const ablativeArmour = (): THREE.Group => {
  const p = new Prop();
  p.add(prism([[-0.45, 0], [0.45, 0], [0.45, 0.78], [0.14, 0.95], [-0.45, 0.8]], 0.24), mat(ROLES.hull), { y: 0.05 });
  for (const x of [-0.32, 0.32]) for (const y of [0.19, 0.67]) p.add(ball(0.035, 0), mat(ROLES.trim), { x, y, z: 0.13 });
  p.add(ball(0.1, 0), mat('#ff8a3a', 'emissive'), { x: 0.34, y: 0.89, z: 0.1 });
  p.add(hull([[0, 0, 0], [0.1, 0.03, 0], [0.05, 0.09, 0.03], [0.02, 0.02, 0.08]]), mat('#c2cad6'), { x: 0.62, y: 0.6, z: 0.05 });
  p.add(hull([[0, 0, 0], [0.12, 0.04, 0.02], [0.06, 0.1, -0.03], [0.03, 0.02, 0.1]]), mat(ROLES.trim), { x: 0.7, y: 0.32, z: 0.0 });
  p.add(hull([[0, 0, 0], [0.08, 0.02, 0.02], [0.03, 0.07, 0.0], [0.02, 0.02, 0.06]]), mat('#c2cad6'), { x: 0.56, y: 0.12, z: 0.2 });
  p.group.rotation.y = -0.4;
  return p.group;
};

/** Flux Screens: a curved fence of thin screens, each capped with a live bar. */
const fluxScreens = (): THREE.Group => {
  const p = new Prop();
  p.add(cyl(0.7, 0.72, 0.06, 16), mat(ROLES.trim), { y: 0.03 });
  for (const a of [-0.8, -0.4, 0, 0.4, 0.8]) {
    const x = Math.sin(a) * 0.6, z = Math.cos(a) * 0.6;
    p.add(prism([[-0.1, 0], [0.1, 0], [0.1, 0.8], [-0.1, 0.8]], 0.04), mat('#8fb8d8', 'matte'), { x, y: 0.06, z, ry: a });
    p.add(obox(0.2, 0.04, 0.06), mat('#5ef0ff', 'emissive'), { x, y: 0.88, z, ry: a });
  }
  return p.group;
};

/** Reactive Plating: a 3x3 tile floor, three tiles blown up off the base, sparks in the gaps. */
const reactivePlating = (): THREE.Group => {
  const p = new Prop();
  p.add(obox(1.0, 0.06, 1.0, 0.01), mat(ROLES.dark), { y: 0.03 });
  // x, z, lift, rx, rz
  const tiles: [number, number, number, number, number][] = [
    [-0.3, -0.3, 0, 0, 0], [0, -0.3, 0.1, 0.25, 0], [0.3, -0.3, 0, 0, 0],
    [-0.3, 0, 0.12, 0, -0.25], [0, 0, 0, 0, 0], [0.3, 0, 0.2, 0.3, 0.1],
    [-0.3, 0.3, 0, 0, 0], [0, 0.3, 0.02, 0, 0.1], [0.3, 0.3, 0, 0, 0],
  ];
  tiles.forEach(([x, z, lift, rx, rz], i) => {
    p.add(obox(0.26, 0.1, 0.26, 0.02), mat(i % 2 ? '#b4bfd0' : '#9aa6b8'), { x, y: 0.11 + lift, z, rx, rz });
  });
  p.add(ball(0.05, 0), mat('#ffb074', 'emissive'), { x: 0.15, y: 0.12, z: 0 });
  p.add(ball(0.05, 0), mat('#ffb074', 'emissive'), { x: -0.15, y: 0.12, z: 0.15 });
  return p.group;
};

/** Phase Cloak: a wedge caught between phases, two ghost copies either side of the solid one. */
const phaseCloak = (): THREE.Group => {
  const p = new Prop();
  const wedge = () => hull([[-0.17, 0, -0.3], [0.17, 0, -0.3], [0.17, 0, 0.32], [-0.17, 0, 0.32], [-0.17, 0.45, -0.3], [0.17, 0.45, -0.3], [0, 0.7, -0.22]]);
  p.add(wedge(), Object.assign(mat('#c792ea', 'glass'), { opacity: 0.4 }), { x: -0.36 });
  p.add(wedge(), Object.assign(mat('#c792ea', 'glass'), { opacity: 0.5 }), { x: 0.36 });
  p.add(wedge(), mat('#9aa6b8', 'matte'));
  p.add(ring(0.62, 0.02, 28), mat('#c792ea', 'glow'), { y: 0.02 });
  return p.group;
};

/** Redundant Bulkheads: a sealed hatch in a heavy frame, wheel-locked, hazard-striped. */
const redundantBulkheads = (): THREE.Group => {
  const p = new Prop();
  p.add(obox(0.9, 0.95, 0.2, 0.05), mat(ROLES.hull), { y: 0.475 });
  p.add(cyl(0.3, 0.3, 0.1, 20), mat(ROLES.trim), { y: 0.5, z: 0.14, rx: Math.PI / 2 });
  p.add(ring(0.2, 0.03, 16), mat(ROLES.gold), { y: 0.5, z: 0.2, rx: Math.PI / 2 });
  p.add(cyl(0.015, 0.015, 0.38, 5), mat(ROLES.dark), { y: 0.5, z: 0.22, rz: Math.PI / 2 });
  p.add(cyl(0.015, 0.015, 0.38, 5), mat(ROLES.dark), { y: 0.5, z: 0.22 });
  for (const x of [-0.28, 0, 0.28]) p.add(obox(0.14, 0.05, 0.03), mat(ROLES.gold), { x, y: 0.1, z: 0.11, rz: 0.6 });
  for (const x of [-0.36, 0.36]) for (const y of [0.1, 0.86]) p.add(ball(0.03, 0), mat(ROLES.dark), { x, y, z: 0.12 });
  return p.group;
};

/** Damage Control: a jointed repair arm welding a patch onto the plate below. */
const damageControl = (): THREE.Group => {
  const p = new Prop();
  p.add(cyl(0.2, 0.24, 0.2, 10), mat(ROLES.trim), { x: -0.25, y: 0.1 });
  const A: [number, number] = [-0.25, 0.2], J1: [number, number] = [-0.25, 0.7], J2: [number, number] = [0.3, 0.86];
  const J3: [number, number] = [0.32, 0.26], E: [number, number] = [0.32, 0.12];
  link(p, A, J1, 0.05, mat(ROLES.hull));
  link(p, J1, J2, 0.04, mat(ROLES.hull));
  link(p, J2, J3, 0.045, mat(ROLES.hull));
  link(p, J3, E, 0.04, mat(ROLES.dark));
  for (const [x, y] of [J1, J2, J3]) p.add(ball(0.07, 1), mat(ROLES.gold), { x, y });
  p.add(ball(0.06, 0), mat('#ffd27a', 'emissive'), { x: E[0], y: E[1] - 0.02 });
  p.add(obox(0.5, 0.06, 0.4, 0.02), mat(ROLES.hull), { x: 0.25, y: 0.03 });
  p.add(obox(0.2, 0.02, 0.2), mat(ROLES.gold), { x: 0.28, y: 0.07 });
  return p.group;
};

/** Lattice Shields: a violet crystal projector ringed by four satellites and two lattice rings. */
const latticeShields = (): THREE.Group => {
  const p = new Prop();
  p.add(cyl(0.5, 0.5, 0.06, 6), mat(ROLES.trim), { y: 0.03 });
  p.add(crystal(0.13, 0.85, 0.2), mat('#c792ea', 'emissive'));
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2 + Math.PI / 4;
    p.add(crystal(0.09, 0.42, 0.12), mat('#9b7bd6', 'matte'), { x: Math.cos(a) * 0.34, z: Math.sin(a) * 0.34 });
  }
  p.add(ring(0.34, 0.018, 24), mat('#c792ea', 'glow'), { y: 0.2 });
  p.add(ring(0.34, 0.018, 24), mat('#c792ea', 'glow'), { y: 0.44 });
  return p.group;
};

/** Refraction Armour: a glass-cut prism splitting one beam into a fan of colours. */
const refractionArmour = (): THREE.Group => {
  const p = new Prop();
  p.add(obox(0.8, 0.05, 0.46, 0.01), mat(ROLES.trim), { y: 0.025 });
  p.add(prism([[-0.32, 0], [0.32, 0], [0, 0.8]], 0.4), mat('#a48cf0', 'matte'), { y: 0.05 });
  link(p, [-0.7, 0.45], [-0.17, 0.45], 0.022, mat('#fff3c4', 'emissive'));
  link(p, [0.17, 0.45], [0.62, 0.6], 0.02, mat('#ff8aa0', 'glow'));
  link(p, [0.17, 0.45], [0.66, 0.45], 0.02, mat('#7bd88f', 'glow'));
  link(p, [0.17, 0.45], [0.6, 0.3], 0.02, mat('#5ec8ff', 'glow'));
  return p.group;
};

/** Null Fields: a dark core under a violet field ring, three missiles stopped at its edge. */
const nullFields = (): THREE.Group => {
  const p = new Prop();
  p.add(cyl(0.38, 0.44, 0.08, 8), mat(ROLES.trim), { y: 0.04 });
  p.add(cyl(0.1, 0.14, 0.36, 8), mat(ROLES.dark), { y: 0.22 });
  p.add(ball(0.24, 0), mat('#7a6fc0', 'matte'), { y: 0.5 });
  p.add(ring(0.42, 0.03, 28), mat('#c792ea', 'emissive'), { y: 0.5, rx: 0.35 });
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.3;
    // Nose pointing in at the core.
    p.add(lathe([[0, 0.32], [0.045, 0.24], [0.045, 0], [0, 0]], 6), mat('#e8e2d4'), { x: Math.cos(a) * 0.58, y: 0.5, z: Math.sin(a) * 0.58, rz: Math.PI / 2, ry: -a });
  }
  return p.group;
};

/** Ceremonial Guard: five spears in a bowed line, gold heads, on an ivory plinth. */
const ceremonialGuard = (): THREE.Group => {
  const p = new Prop();
  p.add(lathe([[0, 0], [0.5, 0], [0.5, 0.04], [0.42, 0.08], [0, 0.08]], 12), mat('#f3e3c8', 'matte'));
  for (const x of [-0.4, -0.2, 0, 0.2, 0.4]) {
    const z = 0.2 - x * x * 0.5, h = 1.05 - Math.abs(x) * 0.4;
    p.add(cyl(0.03, 0.03, h, 6), mat('#d98aa0', 'matte'), { x, y: 0.08 + h / 2, z });
    p.add(prism([[0, 0], [0.055, 0.09], [0, 0.26], [-0.055, 0.09]], 0.03), mat('#e6b450'), { x, y: 0.08 + h, z });
  }
  return p.group;
};

/** Aegis Cathedrals: a cathedral with twin spires and a gold halo ring over its holy city. */
const aegisCathedrals = (): THREE.Group => {
  const p = new Prop();
  p.add(obox(0.72, 0.42, 0.42, 0.03), mat('#e8e2d4', 'matte'), { y: 0.21 });
  p.add(obox(0.2, 0.8, 0.22, 0.02), mat('#f0e6d2', 'matte'), { x: -0.26, y: 0.4 });
  p.add(obox(0.2, 0.8, 0.22, 0.02), mat('#f0e6d2', 'matte'), { x: 0.26, y: 0.4 });
  p.add(obox(0.22, 0.9, 0.24, 0.02), mat('#f0e6d2', 'matte'), { y: 0.45, z: -0.12 });
  for (const [x, y, z, h] of [[-0.26, 0.8, 0, 0.34], [0.26, 0.8, 0, 0.34], [0, 0.9, -0.12, 0.36]] as const) {
    p.add(lathe([[0, 0], [0.13, 0], [0.06, h * 0.85], [0, h]], 6), mat('#d98aa8'), { x, y, z });
  }
  p.add(cyl(0.012, 0.012, 0.14, 5), mat(ROLES.gold), { y: 1.33, z: -0.12 });
  p.add(cyl(0.012, 0.012, 0.08, 5), mat(ROLES.gold), { y: 1.31, z: -0.12, rz: Math.PI / 2 });
  p.add(cyl(0.1, 0.1, 0.03, 12), mat(ROLES.gold), { y: 0.36, z: 0.22, rx: Math.PI / 2 });
  p.add(obox(0.14, 0.2, 0.03), mat(ROLES.trim), { y: 0.1, z: 0.22 });
  p.add(ring(0.56, 0.02, 32), mat('#ffe08a', 'glow'), { y: 0.95, rx: 0.25 });
  return p.group;
};

/** Nanite Reclamation: a wreck chunk taken apart by a swarm, with recovered parts lifting off. */
const naniteReclamation = (): THREE.Group => {
  const p = new Prop();
  p.add(hull([[-0.26, 0, -0.2], [0.24, 0, -0.22], [0.2, 0, 0.2], [-0.22, 0, 0.18], [-0.1, 0.3, -0.04], [0.14, 0.24, 0.02]]), mat(ROLES.hull), { y: 0.02 });
  p.add(prism([[-0.2, 0], [0.2, 0], [0.14, 0.42], [-0.18, 0.36]], 0.05), mat(ROLES.trim), { x: 0.12, y: 0.12, z: -0.1, rz: -0.5, ry: 0.5 });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    p.add(ball(0.05, 0), mat('#7fe0ff', 'emissive'), { x: Math.cos(a) * 0.4, y: 0.6 + (i % 2) * 0.2, z: Math.sin(a) * 0.4 });
  }
  p.add(ring(0.4, 0.015, 24), mat('#7fe0ff', 'glow'), { y: 0.7 });
  p.add(obox(0.12, 0.12, 0.12, 0.02), mat(ROLES.gold), { x: 0.1, y: 0.9, z: 0.05, ry: 0.6 });
  p.add(obox(0.1, 0.1, 0.1, 0.02), mat(ROLES.gold), { x: -0.16, y: 0.42, z: 0.22, ry: -0.3 });
  return p.group;
};

export const DEFENSE_NODE_PROPS: Readonly<Record<string, () => THREE.Group>> = {
  'o-chitin-plates': chitinPlates,
  'o-ablative-ichor': ablativeIchor,
  'o-adaptive-immunity': adaptiveImmunity,
  't-point-defense': pointDefence,
  't-shields': deflectorShields,
  't-armor': ablativeArmour,
  't-flux-screens': fluxScreens,
  't-reactive-plating': reactivePlating,
  't-phase-cloak': phaseCloak,
  'u-bulkheads': redundantBulkheads,
  'u-damage-control': damageControl,
  'g-lattice-shields': latticeShields,
  'g-refraction-armor': refractionArmour,
  'g-null-fields': nullFields,
  'a-ceremonial-guard': ceremonialGuard,
  'a-aegis-cathedrals': aegisCathedrals,
  'x-reclamation': naniteReclamation,
};
