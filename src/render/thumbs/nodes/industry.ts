import type * as THREE from 'three';
import { ball, crystal, cyl, hull, lathe, mat, obox, Prop, prism, ring, ROLES } from '../propKit';

/**
 * Thumbnail props for the Industry & Mining research nodes: one distinct prop per node id, built with
 * propKit (the `thumbnails` skill). Each stands on y = 0 at about unit size; the studio adds the
 * branch-coloured plinth and frames it.
 */

/** Bio-refineries: a lumpy digester bulb with feed tubes and a heap of digested ore. */
const bioRefineries = (): THREE.Group => {
  const p = new Prop();
  p.add(lathe([[0, 0.05], [0.36, 0.05], [0.44, 0.3], [0.46, 0.55], [0.36, 0.8], [0.14, 0.92], [0, 0.94]], 9), mat('#6fbf8a', 'matte'));
  p.add(cyl(0.07, 0.07, 0.6, 7), mat('#b8f0c0', 'matte'), { x: 0.72, y: 0.6, rz: -1.9 });
  p.add(cyl(0.07, 0.07, 0.6, 7), mat('#b8f0c0', 'matte'), { x: -0.72, y: 0.6, rz: 1.9 });
  p.add(hull([[-0.6, 0, -0.3], [0.6, 0, -0.3], [0.55, 0, 0.35], [-0.5, 0, 0.35], [0, 0.22, 0], [0.2, 0.18, 0.2]]), mat('#a88a6e', 'matte'));
  p.add(ball(0.14, 0), mat('#8a6a50', 'matte'), { x: 0.45, y: 0.1, z: 0.25 });
  p.add(ball(0.12, 0), mat('#8a6a50', 'matte'), { x: -0.42, y: 0.09, z: 0.2 });
  p.add(ring(0.42, 0.03, 16), mat('#b8f0c0', 'matte'), { y: 0.1 });
  p.add(ball(0.09, 1), mat('#b8ff7a', 'emissive'), { y: 1.0 });
  return p.group;
};

/** Living Foundries: a cupped cradle of tissue with a hull growing out of it, tendrils at the rim. */
const livingFoundries = (): THREE.Group => {
  const p = new Prop();
  p.add(lathe([[0, 0], [0.5, 0], [0.6, 0.1], [0.56, 0.2], [0.44, 0.16], [0, 0.12]], 10), mat('#4f9a6a', 'matte'));
  // A hull section lying in the cradle, half grown: a long blade of plating with ribs across it.
  p.add(hull([[-0.42, 0.12, -0.18], [0.42, 0.12, -0.18], [0.46, 0.12, 0.12], [-0.42, 0.12, 0.12], [-0.3, 0.42, -0.08], [0.3, 0.36, 0.02], [0.02, 0.5, 0.04]]), mat('#a3c97a', 'matte'));
  for (const x of [-0.24, 0, 0.24]) p.add(ring(0.16, 0.02, 10), mat('#5c8a3a', 'matte'), { x, y: 0.24, rx: Math.PI / 2, ry: 0 });
  p.add(cyl(0.025, 0.02, 0.4, 5), mat('#5c8a3a', 'matte'), { x: -0.5, y: 0.3, z: 0.1, rz: 0.5 });
  p.add(cyl(0.025, 0.02, 0.4, 5), mat('#5c8a3a', 'matte'), { x: 0.5, y: 0.3, z: -0.1, rz: -0.5 });
  p.add(cyl(0.025, 0.02, 0.4, 5), mat('#5c8a3a', 'matte'), { x: 0.1, y: 0.3, z: 0.45, rx: 0.5 });
  p.add(ball(0.07, 0), mat('#b8ff7a', 'emissive'), { y: 0.66 });
  return p.group;
};

/** Automation: an articulated robot arm on a pedestal, claw closed on a crate. */
const automation = (): THREE.Group => {
  const p = new Prop();
  p.add(obox(0.7, 0.14, 0.7, 0.04), mat(ROLES.trim), { y: 0.07 });
  p.add(cyl(0.2, 0.24, 0.26, 10), mat(ROLES.hull), { y: 0.27 });
  p.add(ball(0.13, 1), mat('#5ec8ff', 'emissive'), { y: 0.5 });
  p.add(obox(0.12, 0.6, 0.12, 0.02), mat(ROLES.hull), { x: 0.144, y: 0.763, rz: -0.5 });
  p.add(ball(0.1, 1), mat(ROLES.trim), { x: 0.287, y: 1.027 });
  p.add(obox(0.1, 0.5, 0.1, 0.02), mat(ROLES.hull), { x: 0.49, y: 0.88, rz: -2.2 });
  p.add(obox(0.16, 0.12, 0.24, 0.03), mat(ROLES.trim), { x: 0.74, y: 0.7, rz: -2.2 });
  for (const z of [-0.07, 0.07]) p.add(obox(0.05, 0.26, 0.05), mat(ROLES.gold), { x: 0.76, y: 0.61, z, rz: -2.6 });
  p.add(obox(0.2, 0.16, 0.2, 0.02), mat(ROLES.gold), { x: 0.82, y: 0.36 });
  return p.group;
};

/** Fusion Forges: a squat furnace barrel with a molten crucible, a flare, and a side pipe. */
const fusionForges = (): THREE.Group => {
  const p = new Prop();
  p.add(cyl(0.44, 0.48, 0.2, 10), mat(ROLES.trim), { y: 0.1 });
  p.add(cyl(0.36, 0.4, 0.6, 10), mat(ROLES.hull), { y: 0.5 });
  p.add(cyl(0.41, 0.41, 0.06, 10), mat(ROLES.gold), { y: 0.5 });
  p.add(ring(0.3, 0.03, 14), mat(ROLES.dark), { y: 0.86 });
  p.add(cyl(0.26, 0.3, 0.1, 12), mat('#ffd27a', 'emissive'), { y: 0.85 });
  p.add(cyl(0.05, 0.05, 0.5, 6), mat(ROLES.hull), { x: 0.62, y: 0.36, rz: Math.PI / 2 });
  p.add(cyl(0.09, 0.09, 0.04, 8), mat(ROLES.gold), { x: 0.82, y: 0.36, rz: Math.PI / 2 });
  p.add(ball(0.12, 1), mat('#ffd27a', 'glow'), { y: 1.0 });
  return p.group;
};

/** Nanofabrication: a cube built from smaller cubes, the last corner still being assembled. */
const nanofabrication = (): THREE.Group => {
  const p = new Prop();
  for (const x of [-0.18, 0.18]) for (const y of [0.18, 0.54]) for (const z of [-0.18, 0.18]) {
    if (x > 0 && y > 0.4 && z > 0) continue;
    p.add(obox(0.3, 0.3, 0.3, 0.03), mat(ROLES.hull), { x, y, z });
  }
  p.add(obox(0.14, 0.14, 0.14, 0.02), mat('#5ec8ff', 'emissive'), { x: 0.44, y: 0.86, z: 0.44 });
  p.add(obox(0.1, 0.1, 0.1, 0.02), mat('#5ec8ff', 'emissive'), { x: 0.42, y: 0.52, z: 0.44 });
  return p.group;
};

/** Deep-core Mining: a drill cone bored into a boulder, a gold collar where it meets the rock. */
const deepCoreMining = (): THREE.Group => {
  const p = new Prop();
  // A low boulder on the left; the drill comes in from the right, long and bright, bit biting the rock.
  p.add(hull([[-0.5, 0, -0.4], [0.1, 0, -0.42], [0.15, 0, 0.36], [-0.44, 0, 0.4], [-0.4, 0.4, -0.28], [-0.1, 0.5, -0.1], [0.1, 0.36, 0.3], [-0.2, 0.44, 0.12]]), mat('#a88a6e', 'matte'));
  p.add(lathe([[0, 0], [0.16, 0], [0.16, 0.1], [0, 0.75]], 8), mat(ROLES.hull), { x: 0.82, y: 0.46, rz: Math.PI / 2 });
  p.add(cyl(0.2, 0.2, 0.2, 10), mat(ROLES.gold), { x: 0.92, y: 0.46, rz: Math.PI / 2 });
  p.add(obox(0.3, 0.3, 0.3, 0.04), mat(ROLES.trim), { x: 1.15, y: 0.46 });
  p.add(ball(0.08, 0), mat('#ffd27a', 'emissive'), { x: 0.2, y: 0.46, z: 0.02 });
  p.add(ball(0.1, 0), mat(ROLES.gold), { x: -0.56, y: 0.1, z: 0.25 });
  return p.group;
};

/** Ore Processing: a hopper feeding a crusher box, a chute, and an output crate of ingots. */
const oreProcessing = (): THREE.Group => {
  const p = new Prop();
  p.add(obox(0.8, 0.45, 0.6, 0.04), mat(ROLES.trim), { y: 0.225 });
  p.add(lathe([[0, 0], [0.12, 0], [0.12, 0.1], [0.4, 0.5], [0.4, 0.56], [0, 0.56]], 12), mat(ROLES.hull), { y: 0.45 });
  p.add(ring(0.41, 0.03, 16), mat(ROLES.gold), { y: 1.01 });
  p.add(obox(0.5, 0.22, 0.02), mat(ROLES.gold), { y: 0.2, z: 0.31 });
  p.add(obox(0.56, 0.07, 0.3), mat(ROLES.rust), { x: 0.65, y: 0.33, rz: -0.45 });
  p.add(obox(0.34, 0.2, 0.34, 0.03), mat(ROLES.hull), { x: 0.9, y: 0.1 });
  p.add(obox(0.16, 0.08, 0.22, 0.02), mat('#d6dde8'), { x: 0.9, y: 0.24 });
  p.add(ball(0.05, 0), mat('#ffb074', 'emissive'), { x: -0.3, y: 0.5, z: 0.3 });
  return p.group;
};

/** Strip Mining: a tracked excavator with a raised boom, stick and toothed bucket. */
const stripMining = (): THREE.Group => {
  const p = new Prop();
  for (const z of [-0.36, 0.36]) p.add(obox(0.9, 0.18, 0.18, 0.06), mat(ROLES.trim), { z, y: 0.09 });
  p.add(obox(0.84, 0.14, 0.7, 0.03), mat(ROLES.gold), { y: 0.25 });
  p.add(obox(0.36, 0.34, 0.4, 0.05), mat(ROLES.hull), { x: -0.2, y: 0.49 });
  p.add(obox(0.3, 0.13, 0.02), mat('#5ec8ff', 'glass'), { x: -0.2, y: 0.55, z: 0.21 });
  p.add(obox(0.8, 0.12, 0.14, 0.03), mat(ROLES.trim), { x: -0.008, y: 1.01, rz: -0.5 });
  p.add(obox(0.5, 0.1, 0.12, 0.02), mat(ROLES.trim), { x: 0.352, y: 1.176, rz: -2.4 });
  p.add(hull([[-0.2, 0, -0.22], [0.2, 0, -0.22], [0.2, 0, 0.22], [-0.2, 0, 0.22], [-0.16, 0.3, -0.24], [0.16, 0.3, -0.24], [0.16, 0.3, 0.1], [-0.16, 0.3, 0.1]]), mat(ROLES.hull), { x: 0.52, y: 0.78 });
  for (const z of [-0.14, 0, 0.14]) p.add(hull([[-0.03, 0, -0.03], [0.03, 0, -0.03], [0, 0, 0.03], [0, -0.12, 0]]), mat(ROLES.dark), { x: 0.56, y: 0.78, z });
  p.add(ball(0.06, 0), mat('#ffb074', 'emissive'), { x: -0.3, y: 0.74 });
  return p.group;
};

/** Sustainable Mining: a small white wind turbine on a rock, a green sprout at its foot. */
const sustainableMining = (): THREE.Group => {
  const p = new Prop();
  const blade = () => prism([[-0.03, 0], [0.03, 0], [0.06, 0.18], [0.035, 0.36], [0, 0.4], [-0.035, 0.36], [-0.06, 0.18]], 0.03);
  p.add(lathe([[0, 0], [0.3, 0], [0.32, 0.06], [0.2, 0.1], [0, 0.1]], 10), mat(ROLES.trim));
  p.add(lathe([[0, 0], [0.12, 0], [0.07, 0.68], [0.05, 0.74], [0, 0.74]], 8), mat('#e8eef5', 'matte'), { y: 0.1 });
  p.add(ball(0.1, 1), mat(ROLES.hull), { y: 0.78, z: 0.06 });
  for (const rz of [0, -2.094, -4.189]) p.add(blade(), mat('#f4f7fb', 'matte'), { y: 0.78, z: 0.06, rz });
  p.add(ball(0.13, 0), mat('#a88a6e', 'matte'), { x: -0.28, y: 0.1, z: 0.1 });
  p.add(ball(0.09, 0), mat('#a88a6e', 'matte'), { x: -0.18, y: 0.07, z: 0.28 });
  p.add(cyl(0.015, 0.015, 0.2, 4), mat('#7bd88f', 'matte'), { x: 0.3, y: 0.2, z: 0.25 });
  p.add(ball(0.06, 0), mat('#b8ff7a', 'emissive'), { x: 0.3, y: 0.34, z: 0.25 });
  return p.group;
};

/** Fractal Lattices: a violet crystal that grows four children, each growing a tip crystal. */
const fractalLattice = (): THREE.Group => {
  const p = new Prop();
  p.add(crystal(0.14, 0.7, 0.3), mat('#a77cf0'));
  for (const [ux, uz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
    // A lean of `a` radians outward: rz tilts it sideways, rx toward the camera's depth.
    const a = 0.5, rx = uz * a, rz = -ux * a, bx = ux * 0.2, bz = uz * 0.2;
    p.add(crystal(0.09, 0.42), mat('#c9a6ff', 'matte'), { x: bx, y: 0.05, z: bz, rx, rz });
    // The child's tip, in the child's own frame rotated by the lean.
    const L = 0.564;
    const tx = bx - L * Math.sin(rz), ty = 0.05 + L * Math.cos(rz) * Math.cos(rx), tz = bz + L * Math.cos(rz) * Math.sin(rx);
    p.add(crystal(0.035, 0.2), mat('#e0c3ff', 'emissive'), { x: tx, y: ty - 0.02, z: tz, rx: rx * 0.6, rz: rz * 0.6 });
  }
  return p.group;
};

/** Crystal Growth Vats: a glass vat of violet crystal, the cluster pushing out past its rim. */
const crystalGrowth = (): THREE.Group => {
  const p = new Prop();
  p.add(lathe([[0, 0], [0.44, 0], [0.44, 0.05], [0.36, 0.12], [0, 0.12]], 10), mat(ROLES.trim));
  p.add(cyl(0.34, 0.34, 0.78, 12), mat('#9fe3ff', 'glass'), { y: 0.5 });
  p.add(cyl(0.38, 0.38, 0.06, 12), mat(ROLES.trim), { y: 0.9 });
  p.add(ball(0.2, 1), mat('#c792ea', 'glow'), { y: 0.45 });
  const cluster: [number, number, number, number][] = [[0, 0, 0.09, 1.0], [-0.14, 0.1, 0.07, 0.6], [0.13, -0.09, 0.08, 0.75], [0.07, 0.17, 0.06, 0.45], [-0.12, -0.12, 0.06, 0.55]];
  for (const [x, z, r, h] of cluster) p.add(crystal(r, h), mat('#a77cf0'), { x, y: 0.12, z });
  return p.group;
};

/** Harmonic Refining: a violet tuning fork ringing over a plate, separated ores on the plate. */
const harmonicRefining = (): THREE.Group => {
  const p = new Prop();
  p.add(obox(0.8, 0.06, 0.4, 0.02), mat(ROLES.trim), { y: 0.03 });
  const fork = prism([[-0.06, 0.06], [0.06, 0.06], [0.06, 0.3], [0.16, 0.3], [0.16, 1.0], [0.08, 1.0], [0.08, 0.4], [-0.08, 0.4], [-0.08, 1.0], [-0.16, 1.0], [-0.16, 0.3], [-0.06, 0.3]], 0.14);
  p.add(fork, mat('#b99cff'));
  p.add(ring(0.32, 0.02, 24), mat('#c792ea', 'glow'), { y: 0.7 });
  p.add(ring(0.26, 0.015, 24), mat('#c792ea', 'glow'), { y: 0.42 });
  p.add(ball(0.08, 0), mat('#c9a25a'), { x: -0.36, y: 0.12 });
  p.add(ball(0.06, 0), mat(ROLES.hull), { x: 0.34, y: 0.1, z: 0.1 });
  return p.group;
};

/** Artisan Guilds: a rose amphora with gold bands, lip and handles, topped with a rose. */
const artisanGuilds = (): THREE.Group => {
  const p = new Prop();
  p.add(cyl(0.22, 0.26, 0.05, 12), mat(ROLES.gold), { y: 0.025 });
  p.add(lathe([[0, 0.05], [0.22, 0.05], [0.3, 0.25], [0.36, 0.5], [0.3, 0.75], [0.16, 0.9], [0.18, 0.98], [0, 0.98]], 12), mat('#e8a0a8', 'matte'));
  p.add(ring(0.37, 0.025, 24), mat(ROLES.gold), { y: 0.5 });
  p.add(ring(0.19, 0.03, 14), mat(ROLES.gold), { y: 0.98 });
  for (const x of [-0.34, 0.34]) p.add(ring(0.14, 0.03, 12), mat(ROLES.gold), { x, y: 0.72, rx: Math.PI / 2 });
  p.add(ball(0.08, 1), mat('#ff9fb8', 'matte'), { y: 1.06 });
  return p.group;
};

/** Luxury Goods: an open wooden casket, gold banding, coins and cut gems spilling from it. */
const luxuryGoods = (): THREE.Group => {
  const p = new Prop();
  const wood = '#a8704a';
  p.add(obox(0.9, 0.42, 0.6, 0.04), mat(wood, 'matte'), { y: 0.21 });
  for (const y of [0.08, 0.34]) p.add(obox(0.94, 0.05, 0.64), mat(ROLES.gold), { y });
  p.add(obox(0.1, 0.12, 0.03), mat(ROLES.gold), { y: 0.27, z: 0.31 });
  // The lid, hinged at the back edge and propped up behind the chest.
  p.add(obox(0.9, 0.1, 0.6, 0.04), mat(wood, 'matte'), { y: 0.704, z: -0.396, rx: -1.9 });
  const coin = () => lathe([[0, 0], [0.15, 0], [0.16, 0.04], [0, 0.04]], 12);
  p.add(coin(), mat(ROLES.gold), { x: -0.2, y: 0.4, z: 0.05 });
  p.add(coin(), mat(ROLES.gold), { x: -0.05, y: 0.42, z: -0.05 });
  p.add(coin(), mat(ROLES.gold), { x: 0.12, y: 0.4, z: 0.1 });
  p.add(ball(0.09, 0), mat('#ff7aa2'), { x: 0.25, y: 0.47, z: -0.05 });
  p.add(ball(0.08, 0), mat('#5ec8ff'), { x: -0.12, y: 0.48, z: 0.12 });
  return p.group;
};

/** Jewel Cutting: a brilliant-cut gem held in gold prongs over a gold stand, on a rose cushion. */
const jewelCutting = (): THREE.Group => {
  const p = new Prop();
  p.add(obox(0.7, 0.05, 0.7, 0.02), mat('#c45a7a', 'matte'), { y: 0.025 });
  p.add(lathe([[0, 0], [0.24, 0], [0.2, 0.08], [0.1, 0.14], [0.08, 0.3], [0, 0.3]], 10), mat(ROLES.gold), { y: 0.05 });
  p.add(lathe([[0, 0], [0.3, 0.26], [0.3, 0.3], [0.2, 0.4], [0.14, 0.44], [0, 0.44]], 8), mat('#bfeeff', 'glass'), { y: 0.36 });
  for (const [x, z] of [[0.26, 0], [-0.26, 0], [0, 0.26], [0, -0.26]] as const) {
    p.add(cyl(0.018, 0.018, 0.3, 5), mat(ROLES.gold), { x, y: 0.5, z, rz: x ? -Math.sign(x) * 0.15 : 0, rx: z ? Math.sign(z) * -0.15 : 0 });
  }
  p.add(ball(0.05, 0), mat('#ffffff', 'emissive'), { x: 0.12, y: 0.84, z: 0.08 });
  return p.group;
};

/** Patronage: a marble column with a gilded capital, a laurel crown of leaves, and a gilded orb; coins at its foot. */
const patronage = (): THREE.Group => {
  const p = new Prop();
  const marble = '#efe6d6';
  p.add(obox(0.8, 0.1, 0.8, 0.02), mat(marble, 'matte'), { y: 0.05 });
  p.add(obox(0.6, 0.1, 0.6, 0.02), mat(marble, 'matte'), { y: 0.15 });
  p.add(cyl(0.16, 0.18, 0.75, 8), mat(marble, 'matte'), { y: 0.575 });
  p.add(lathe([[0, 0], [0.26, 0], [0.26, 0.05], [0.18, 0.1], [0.16, 0.14], [0, 0.14]], 10), mat(ROLES.gold), { y: 0.95 });
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    p.add(hull([[0, 0, 0], [0.04, 0.02, 0], [-0.04, 0.02, 0], [0, 0.12, 0.02], [0, 0.05, -0.03]]), mat(ROLES.gold), { x: Math.cos(a) * 0.3, y: 1.1, z: Math.sin(a) * 0.3, ry: -a });
  }
  p.add(ball(0.1, 1), mat('#ffd27a', 'emissive'), { y: 1.3 });
  p.add(ball(0.2, 1), mat('#ffd27a', 'glow'), { y: 1.3 });
  for (let i = 0; i < 4; i++) {
    const a = 0.6 + i * 0.5;
    p.add(cyl(0.11, 0.11, 0.03, 12), mat(ROLES.gold), { x: 0.22 + Math.cos(a) * 0.02, y: 0.2 + i * 0.03, z: 0.22 });
  }
  return p.group;
};

export const INDUSTRY_NODE_PROPS: Readonly<Record<string, () => THREE.Group>> = {
  /** Bio-refineries: a digester bulb with feed tubes and a heap of digested ore. */
  'o-bio-refineries': bioRefineries,
  /** Living Foundries: a cradle of tissue with a hull growing out of it. */
  'o-living-foundries': livingFoundries,
  /** Automation: a robot arm on a pedestal, claw closed on a crate. */
  't-automation': automation,
  /** Fusion Forges: a squat furnace with a molten crucible and a side pipe. */
  't-fusion-forges': fusionForges,
  /** Nanofabrication: a cube built from smaller cubes, a corner still assembling. */
  't-nanofabrication': nanofabrication,
  /** Deep-core Mining: a drill cone bored into a boulder. */
  'u-mining': deepCoreMining,
  /** Ore Processing: a hopper over a crusher box, a chute and an ingot crate. */
  'u-ore-processing': oreProcessing,
  /** Strip Mining: a tracked excavator with a raised boom and toothed bucket. */
  'u-strip-mining': stripMining,
  /** Sustainable Mining: a small wind turbine with a green sprout at its foot. */
  'u-sustainable-mining': sustainableMining,
  /** Fractal Lattices: a violet crystal with children and grandchildren at smaller scales. */
  'g-fractal-lattice': fractalLattice,
  /** Crystal Growth Vats: a glass vat with a crystal cluster pushing out of it. */
  'g-crystal-growth': crystalGrowth,
  /** Harmonic Refining: a tuning fork ringing over separated ores. */
  'g-harmonic-refining': harmonicRefining,
  /** Artisan Guilds: a rose amphora with gold bands and handles. */
  'a-artisan-guilds': artisanGuilds,
  /** Luxury Goods: an open casket spilling coins and gems. */
  'a-luxury-goods': luxuryGoods,
  /** Jewel Cutting: a brilliant-cut gem in gold prongs on a rose cushion. */
  'a-jewel-cutting': jewelCutting,
  /** Patronage: a marble column with a laurel crown and a gilded orb. */
  'a-patronage': patronage,
};
