import * as THREE from 'three';
import { ball, crystal, cyl, hull, lathe, mat, obox, Prop, prism, ring, ROLES } from '../propKit';

/**
 * Thumbnail props for the Weapons research nodes: one distinct prop per node id, built with
 * propKit (the `thumbnails` skill). Each stands on y = 0 at about unit size; the studio adds the
 * branch-coloured plinth and frames it.
 */

type V3 = readonly [number, number, number];

const UP = new THREE.Vector3(0, 1, 0);
const vec = (a: V3) => new THREE.Vector3(a[0], a[1], a[2]);
/** The point `t` along direction `d` from `a`. */
const along3 = (a: V3, d: V3, t: number): V3 => [a[0] + d[0] * t, a[1] + d[1] * t, a[2] + d[2] * t];
/** A direction scaled to length 1. */
const unit = (d: V3): V3 => {
  const l = Math.hypot(d[0], d[1], d[2]);
  return [d[0] / l, d[1] / l, d[2] / l];
};

/** A geometry built along +y from its origin: placed with its origin at `a`, turned to point at `b`. */
function along(p: Prop, geo: THREE.BufferGeometry, a: V3, b: V3, m: THREE.Material): THREE.Mesh {
  const mesh = p.add(geo, m, { x: a[0], y: a[1], z: a[2] });
  mesh.quaternion.setFromUnitVectors(UP, vec(b).sub(vec(a)).normalize());
  return mesh;
}

/** A rod from `a` (radius r0) to `b` (radius r1). */
function rod(p: Prop, a: V3, b: V3, r0: number, m: THREE.Material, r1 = r0, sides = 6): THREE.Mesh {
  const mid = vec(a).add(vec(b)).multiplyScalar(0.5);
  const mesh = p.add(cyl(r1, r0, vec(a).distanceTo(vec(b)), sides), m, { x: mid.x, y: mid.y, z: mid.z });
  mesh.quaternion.setFromUnitVectors(UP, vec(b).sub(vec(a)).normalize());
  return mesh;
}

/** Acid Spitters: three corrosive glands on a flesh pad, each with a spout dripping acid. */
const acidSpitters = (): THREE.Group => {
  const p = new Prop();
  p.add(lathe([[0, 0], [0.5, 0], [0.52, 0.08], [0.4, 0.14], [0, 0.14]], 10), mat('#4f6a3d', 'matte'));
  for (const [x, z] of [[-0.26, -0.1], [0.26, -0.12], [0, 0.24]] as const) {
    p.add(lathe([[0, 0], [0.19, 0], [0.24, 0.18], [0.15, 0.36], [0.07, 0.42], [0, 0.42]], 9), mat('#8fb86a', 'matte'), { x, y: 0.14, z });
    const top: V3 = [x, 0.56, z];
    const tip = along3(top, unit([x * 2, 1, z * 2]), 0.36);
    rod(p, top, tip, 0.05, mat(ROLES.trim), 0.03);
    p.add(ball(0.06, 0), mat('#c6ff3a', 'emissive'), { x: tip[0], y: tip[1], z: tip[2] });
  }
  return p.group;
};

/** Symbiotic Crews: a crew pod and a hull joined by a glowing vein of one shared metabolism. */
const symbioticCrews = (): THREE.Group => {
  const p = new Prop();
  p.add(lathe([[0, 0], [0.19, 0], [0.22, 0.12], [0.2, 0.48], [0.13, 0.7], [0, 0.74]], 10), mat('#7bd88f', 'matte'), { x: -0.3 });
  p.add(hull([[-0.26, 0, -0.2], [0.26, 0, -0.2], [0.26, 0, 0.2], [-0.26, 0, 0.2], [0.02, 0.26, 0], [-0.26, 0.2, 0]]), mat(ROLES.hull), { x: 0.3 });
  rod(p, [-0.1, 0.42, 0], [0.04, 0.42, 0], 0.04, mat('#b8ff7a', 'emissive'));
  p.add(ball(0.05, 0), mat('#b8ff7a', 'emissive'), { x: -0.3, y: 0.76 });
  return p.group;
};

/** Predator Instinct: three curved talons closing round a glowing red eye. */
const predatorInstinct = (): THREE.Group => {
  const p = new Prop();
  p.add(lathe([[0, 0], [0.2, 0], [0.22, 0.12], [0.12, 0.2], [0, 0.2]], 8), mat(ROLES.trim));
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    p.add(prism([[-0.12, 0], [0.12, 0], [0.16, 0.3], [0.24, 0.6], [0.3, 0.84], [0.06, 0.5], [-0.04, 0.28]], 0.14), mat('#e8e2d4', 'matte'), {
      x: Math.cos(a) * 0.1, y: 0.16, z: Math.sin(a) * 0.1, ry: -a,
    });
  }
  p.add(ball(0.08, 1), mat('#ff5d5d', 'emissive'), { y: 0.3 });
  return p.group;
};

/** Parasitic Crews: a flat leech body on six hooked legs, a single eye on its back. */
const parasiticCrews = (): THREE.Group => {
  const p = new Prop();
  p.add(lathe([[0, 0], [0.38, 0], [0.42, 0.08], [0.33, 0.2], [0.13, 0.26], [0, 0.26]], 12), mat('#5fb3a1', 'matte'), { y: 0.2 });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.3;
    const rim: V3 = [Math.cos(a) * 0.36, 0.22, Math.sin(a) * 0.36];
    const foot: V3 = [Math.cos(a) * 0.58, 0, Math.sin(a) * 0.58];
    rod(p, rim, foot, 0.04, mat('#3f7d70', 'matte'), 0.025);
    p.add(ball(0.05, 0), mat(ROLES.trim), { x: foot[0], y: foot[1] + 0.02, z: foot[2] });
  }
  p.add(ball(0.08, 1), mat('#b8ff7a', 'emissive'), { y: 0.46, z: 0.08 });
  return p.group;
};

/** Scavenger Instinct: three hooked arms lifting a block of salvaged scrap. */
const scavengerInstinct = (): THREE.Group => {
  const p = new Prop();
  p.add(lathe([[0, 0], [0.3, 0], [0.32, 0.06], [0.24, 0.1], [0, 0.1]], 10), mat(ROLES.trim));
  p.add(obox(0.36, 0.34, 0.36, 0.05), mat('#c08a5c', 'matte'), { y: 0.3, ry: 0.3 });
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.5;
    const base: V3 = [Math.cos(a) * 0.26, 0.08, Math.sin(a) * 0.26];
    const mid: V3 = [Math.cos(a) * 0.38, 0.22, Math.sin(a) * 0.38];
    const grip: V3 = [Math.cos(a) * 0.22, 0.3, Math.sin(a) * 0.22];
    rod(p, base, mid, 0.035, mat(ROLES.hull));
    rod(p, mid, grip, 0.03, mat(ROLES.hull));
    p.add(ball(0.045, 0), mat(ROLES.gold), { x: grip[0], y: grip[1], z: grip[2] });
  }
  return p.group;
};

/** Brood Pods: living munitions in a nest, ovoid pods with a hunting eye on the lead one. */
const broodPods = (): THREE.Group => {
  const p = new Prop();
  const egg = () => lathe([[0, 0], [0.14, 0], [0.2, 0.14], [0.2, 0.3], [0.13, 0.44], [0, 0.46]], 10);
  p.add(lathe([[0, 0], [0.5, 0], [0.54, 0.05], [0.42, 0.1], [0, 0.1]], 10), mat('#6b4f3a', 'matte'));
  const pods: { x: number; z: number; s: number }[] = [
    { x: 0, z: 0, s: 1.25 },
    { x: -0.3, z: 0.12, s: 0.95 },
    { x: 0.3, z: 0.1, s: 1 },
    { x: -0.06, z: -0.32, s: 0.9 },
    { x: 0.22, z: -0.3, s: 0.8 },
  ];
  for (const { x, z, s } of pods) p.add(egg(), mat('#eadcb8', 'matte'), { x, y: 0.1, z, s });
  p.add(ball(0.06, 0), mat('#ff8a5c', 'emissive'), { x: 0, y: 0.48, z: 0.24 });
  return p.group;
};

/** Bio-plasma Lances: a flared organic maw, its throat lit with a burst of plasma. */
const bioPlasma = (): THREE.Group => {
  const p = new Prop();
  p.add(lathe([[0, 0], [0.1, 0], [0.2, 0.3], [0.34, 0.66], [0.38, 0.76], [0.3, 0.8], [0, 0.8]], 10), mat('#6a8a52', 'matte'));
  for (const [r, y] of [[0.23, 0.36], [0.32, 0.6]] as const) p.add(ring(r, 0.022, 14), mat('#a3c97a', 'matte'), { y });
  p.add(ball(0.12, 1), mat('#ff7ad9', 'emissive'), { y: 0.92 });
  p.add(ball(0.22, 1), mat('#ff7ad9', 'glow'), { y: 0.92 });
  return p.group;
};

/** Particle Spears: three tall lances on a mount, each tipped with a cyan particle beam. */
const particleSpears = (): THREE.Group => {
  const p = new Prop();
  p.add(obox(0.7, 0.08, 0.3, 0.02), mat(ROLES.trim), { y: 0.04 });
  for (const [x, h] of [[-0.22, 0.9], [0, 1.05], [0.22, 0.8]] as const) {
    rod(p, [x, 0.08, 0], [x, h, 0], 0.04, mat(ROLES.hull), 0.03);
    rod(p, [x, h - 0.02, 0], [x, h + 0.26, 0], 0.035, mat('#9fe3ff', 'emissive'), 0);
  }
  return p.group;
};

/** Swarm Drones: a ring of arrowhead drones round a glowing core, guarding a hull plate. */
const swarmDrones = (): THREE.Group => {
  const p = new Prop();
  p.add(hull([[-0.32, 0, -0.2], [0.32, 0, -0.2], [0.3, 0, 0.2], [-0.3, 0, 0.2], [0, 0.14, 0]]), mat(ROLES.trim));
  for (let i = 0; i < 8; i++) {
    const t = (i / 8) * Math.PI * 2;
    const r = i % 2 ? 0.42 : 0.3;
    const y = 0.5 + Math.sin(i * 1.9) * 0.18;
    p.add(hull([[0, 0, 0.13], [-0.09, 0, -0.08], [0.09, 0, -0.08], [0, 0.07, -0.02]]), mat('#c4ccd8'), {
      x: Math.cos(t) * r, y, z: Math.sin(t) * r, ry: -t, s: 1.5,
    });
  }
  p.add(ball(0.12, 1), mat('#5ec8ff', 'emissive'), { y: 0.5 });
  return p.group;
};

/** Salvo Racks: a rotary launcher drum, six tubes loaded, each rocket nosed in orange. */
const salvoRacks = (): THREE.Group => {
  const p = new Prop();
  const cy = 0.5;
  p.add(obox(0.9, 0.1, 0.56, 0.03), mat(ROLES.trim), { y: 0.05 });
  for (const x of [-0.36, 0.36]) p.add(obox(0.1, 0.5, 0.5, 0.02), mat(ROLES.hull), { x, y: 0.35 });
  p.add(cyl(0.04, 0.04, 0.8, 8), mat(ROLES.gold), { y: cy, rz: Math.PI / 2 });
  p.add(cyl(0.3, 0.3, 0.5, 12), mat(ROLES.hull), { y: cy, rx: Math.PI / 2 });
  p.add(ring(0.305, 0.03, 16), mat(ROLES.gold), { y: cy, z: 0.26, rx: Math.PI / 2 });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const x = Math.cos(a) * 0.17;
    const y = cy + Math.sin(a) * 0.17;
    p.add(cyl(0.07, 0.07, 0.3, 8), mat(ROLES.trim), { x, y, z: 0.38, rx: Math.PI / 2 });
    p.add(ball(0.05, 0), mat('#ff8a3a'), { x, y, z: 0.55 });
  }
  return p.group;
};

/** Siege Batteries: a squat hazard-banded bunker with two mortars raised for planetary targets. */
const siegeBatteries = (): THREE.Group => {
  const p = new Prop();
  p.add(obox(1.0, 0.36, 0.6, 0.04), mat(ROLES.hull), { y: 0.18 });
  p.add(obox(1.04, 0.07, 0.64), mat(ROLES.gold), { y: 0.3 });
  const dir = unit([0, 1, 0.6]);
  for (const x of [-0.25, 0.25]) {
    const base: V3 = [x, 0.36, -0.05];
    p.add(cyl(0.16, 0.16, 0.08, 10), mat(ROLES.trim), { x, y: 0.4, z: -0.05 });
    const tip = along3(base, dir, 0.7);
    rod(p, base, tip, 0.11, mat(ROLES.dark), 0.11, 8);
    rod(p, along3(base, dir, 0.6), tip, 0.135, mat(ROLES.trim), 0.135, 8);
    const glow = along3(tip, dir, 0.04);
    p.add(ball(0.09, 0), mat('#ff8a5c', 'glow'), { x: glow[0], y: glow[1], z: glow[2] });
  }
  return p.group;
};

/** Overcharged Capacitors: three tall hazard-banded cans, their caps glowing with excess charge. */
const overchargedCapacitors = (): THREE.Group => {
  const p = new Prop();
  p.add(obox(1.0, 0.08, 0.42, 0.02), mat(ROLES.trim), { y: 0.04 });
  for (const [x, h] of [[-0.3, 0.8], [0, 1.05], [0.3, 0.7]] as const) {
    p.add(cyl(0.15, 0.15, h, 12), mat('#9aa6b8'), { x, y: 0.08 + h / 2 });
    for (const f of [0.3, 0.7]) p.add(cyl(0.158, 0.158, 0.07, 12), mat(ROLES.gold), { x, y: 0.08 + h * f });
    p.add(cyl(0.16, 0.16, 0.04, 12), mat(ROLES.trim), { x, y: 0.08 + h + 0.02 });
    p.add(cyl(0.1, 0.1, 0.03, 12), mat('#ff9a3a', 'emissive'), { x, y: 0.08 + h + 0.055 });
  }
  return p.group;
};

/** Focusing Prisms: a violet crystal prism bending a white beam into a tight spectrum. */
const focusingPrisms = (): THREE.Group => {
  const p = new Prop();
  p.add(obox(0.84, 0.08, 0.5, 0.02), mat(ROLES.trim), { y: 0.04 });
  p.add(prism([[-0.32, 0], [0.32, 0], [0, 0.56]], 0.4), mat('#a77bdc', 'matte'), { y: 0.08 });
  rod(p, [-0.6, 0.3, 0], [-0.19, 0.3, 0], 0.025, mat('#f4f8ff', 'emissive'));
  for (const [y, c] of [[0.22, '#ff5d5d'], [0.3, '#ffd27a'], [0.38, '#5ec8ff']] as const) {
    rod(p, [0.19, 0.3, 0], [0.6, y, 0], 0.02, mat(c, 'emissive'), 0.02, 5);
  }
  return p.group;
};

/** Shatter Lances: a violet crystal lance driven through a hex shield, the shield cracking. */
const shatterLances = (): THREE.Group => {
  const p = new Prop();
  const hex: [number, number][] = Array.from({ length: 6 }, (_, i) => {
    const a = (i / 6) * Math.PI * 2;
    return [Math.cos(a) * 0.42, Math.sin(a) * 0.42] as [number, number];
  });
  p.add(prism(hex, 0.1), mat('#b3a6e6', 'matte'), { y: 0.6 });
  rod(p, [0, 0, 0], [0, 0.26, 0], 0.05, mat(ROLES.trim));
  p.add(crystal(0.07, 0.9, 0.25), mat('#c792ea', 'emissive'), { y: 0.6, z: -0.45, rx: Math.PI / 2 });
  for (const [x, y] of [[0.22, 0.14], [-0.2, 0.12], [-0.08, -0.22], [0.12, -0.2]] as const) {
    rod(p, [0, 0.6, 0.06], [x, 0.6 + y, 0.06], 0.015, mat(ROLES.dark), 0.015, 4);
  }
  p.add(hull([[0, 0, 0], [0.08, 0, 0.02], [0.03, 0.12, 0.02], [0.02, 0, 0.08]]), mat('#c792ea', 'matte'), { x: 0.36, z: 0.2, ry: 0.5 });
  p.add(hull([[0, 0, 0], [0.07, 0, 0.02], [0.02, 0.1, 0.02], [0.02, 0, 0.07]]), mat('#c792ea', 'matte'), { x: -0.38, z: 0.1, ry: 1.2 });
  return p.group;
};

/** Honor Guard: crossed ceremonial halberds over a rose plinth, gold and ornate. */
const honorGuard = (): THREE.Group => {
  const p = new Prop();
  p.add(lathe([[0, 0], [0.36, 0], [0.38, 0.06], [0.26, 0.14], [0.18, 0.2], [0, 0.2]], 10), mat('#d98aa0', 'matte'));
  const pikes: [V3, V3][] = [
    [[-0.26, 0.22, 0], [0.26, 1.14, 0]],
    [[0.26, 0.22, 0], [-0.26, 1.14, 0]],
  ];
  for (const [a, b] of pikes) {
    rod(p, a, b, 0.03, mat('#d9c08a'), 0.025);
    const u = unit([b[0] - a[0], b[1] - a[1], b[2] - a[2]]);
    along(p, prism([[0, 0], [0.06, 0.08], [0, 0.32], [-0.06, 0.08]], 0.03), b, along3(b, u, 0.32), mat(ROLES.gold));
  }
  p.add(ball(0.07, 1), mat('#ff8fa3', 'matte'), { y: 0.68, z: 0.02 });
  return p.group;
};

/** War Hymns: a gilded fanfare horn on a stand, its rose sound rings rolling out in front. */
const warHymns = (): THREE.Group => {
  const p = new Prop();
  // The horn lies across the picture on a stand, its bell turned up and out, so the flare reads from the side.
  const axis = unit([0.9, 0.4, 0]);
  const O: V3 = [-0.4, 0.42, 0];
  along(p, lathe([[0, 0], [0.05, 0], [0.08, 0.3], [0.2, 0.62], [0.34, 0.88], [0.36, 0.92], [0.3, 0.92], [0.24, 0.86], [0, 0.86]], 12), O, along3(O, axis, 1), mat(ROLES.gold));
  rod(p, [-0.4, 0, 0], O, 0.07, mat(ROLES.trim), 0.1, 10);
  p.add(lathe([[0, 0], [0.26, 0], [0.28, 0.06], [0, 0.06]], 12), mat(ROLES.trim));
  const mouth = along3(O, axis, 0.9);
  for (const [r, t] of [[0.4, 0.06], [0.46, 0.18], [0.52, 0.3]] as const) {
    const c = along3(mouth, axis, t);
    along(p, ring(r, 0.016, 24), c, along3(c, axis, 1), mat('#ff8fa3', 'glow'));
  }
  return p.group;
};

/** Grand Battery: a gilded cannon on spoked wheels, rose gems on the barrel, for show and for war. */
const grandBattery = (): THREE.Group => {
  const p = new Prop();
  p.add(obox(0.7, 0.1, 0.46, 0.02), mat(ROLES.trim), { y: 0.38 });
  for (const z of [-0.26, 0.26]) {
    p.add(ring(0.26, 0.045, 16), mat(ROLES.trim), { y: 0.3, z, rx: Math.PI / 2 });
    for (const rz of [0, Math.PI / 2, Math.PI / 4, -Math.PI / 4]) p.add(cyl(0.02, 0.02, 0.5, 5), mat(ROLES.hull), { y: 0.3, z, rz });
    p.add(cyl(0.07, 0.07, 0.1, 8), mat(ROLES.gold), { y: 0.3, z, rx: Math.PI / 2 });
  }
  const u = unit([0.92, 0.1, 0]);
  const rear: V3 = [-0.36, 0.5, 0];
  const at = (t: number): V3 => along3(rear, u, t);
  rod(p, rear, at(1), 0.11, mat(ROLES.gold), 0.09, 10);
  for (const t of [0.25, 0.55]) along(p, ring(0.12, 0.02, 14), at(t), along3(at(t), u, 1), mat(ROLES.gold));
  rod(p, at(0.86), at(0.94), 0.1, mat(ROLES.trim), 0.1, 10);
  for (const t of [0.1, 0.6]) {
    const g = at(t);
    p.add(ball(0.05, 0), mat('#ff8fa3', 'emissive'), { x: g[0], y: g[1] + 0.11, z: g[2] });
  }
  return p.group;
};

/** Gravitic Artillery: a dense core on a tripod mast, two tilted rings of bent light round it. */
const graviticArtillery = (): THREE.Group => {
  const p = new Prop();
  const C: V3 = [0, 0.82, 0];
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2 + 0.5;
    rod(p, [Math.cos(a) * 0.5, 0, Math.sin(a) * 0.5], [Math.cos(a) * 0.14, 0.7, Math.sin(a) * 0.14], 0.035, mat(ROLES.trim), 0.03);
  }
  p.add(ball(0.24, 1), mat('#9aa6b8'), { x: C[0], y: C[1], z: C[2] });
  for (const [n, r] of [[[0.5, 1, 0.3], 0.4], [[-0.7, 0.5, 0.6], 0.34]] as const) {
    along(p, ring(r, 0.022, 32), C, along3(C, unit(n), 1), mat('#5ec8ff', 'emissive'));
  }
  return p.group;
};

export const WEAPONS_NODE_PROPS: Readonly<Record<string, () => THREE.Group>> = {
  'o-acid-spitters': acidSpitters,
  'o-symbiosis': symbioticCrews,
  'o-predator': predatorInstinct,
  'o-parasitic': parasiticCrews,
  'o-scavenger': scavengerInstinct,
  'o-brood-pods': broodPods,
  'o-bio-plasma': bioPlasma,
  't-particle-spears': particleSpears,
  't-swarm-drones': swarmDrones,
  'u-salvo-racks': salvoRacks,
  'u-siege-batteries': siegeBatteries,
  'u-overcharged-capacitors': overchargedCapacitors,
  'g-focusing-prisms': focusingPrisms,
  'g-shatter-lances': shatterLances,
  'a-honor-guard': honorGuard,
  'a-war-hymns': warHymns,
  'a-grand-battery': grandBattery,
  'x-gravitic-artillery': graviticArtillery,
};
