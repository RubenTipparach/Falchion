import type * as THREE from 'three';
import { ball, crystal, cyl, hull, lathe, mat, obox, Prop, prism, ring, ROLES } from '../propKit';

/**
 * Thumbnail art for buildings: one hand-modelled showpiece per building id (and 'capitol'), built
 * with propKit at about unit size on its own ground pad, standing on y = 0 (the `thumbnails` skill). Each
 * keeps the identity of its surface model (BuildingModels.ts) and adds detail: lit windows as emissive
 * strips, roofs, pipes, antennas, small vehicles. The planet surface keeps its own small models.
 */

const GROUND = '#55624a';
const PAVING = '#8d8a82';
const STEEL = '#9aa6b8';

/** A round ground pad, 0.08 tall, its top at y = 0.08. */
function pad(p: Prop, color: string, r = 0.7): void {
  p.add(cyl(r, r * 1.03, 0.08, 28), mat(color, 'matte'), { y: 0.04 });
}

/** A dome (a quarter-circle profile swept round y): radius r at its base, height h at its top. */
function dome(r: number, h: number, steps = 6): THREE.BufferGeometry {
  const profile = Array.from({ length: steps + 1 }, (_, i) => {
    const t = (i / steps) * (Math.PI / 2);
    return [r * Math.cos(t), h * Math.sin(t)] as const;
  });
  return lathe(profile, 14);
}

/** Hydroponic Farm: four grow beds under a lamp rack, a water tank at the front. */
const farm = (): THREE.Group => {
  const p = new Prop();
  pad(p, GROUND);
  const greens = ['#4f8a2c', '#6aa33a', '#3d7a3a', '#86b04a'];
  [-0.3, -0.1, 0.1, 0.3].forEach((z, i) => {
    p.add(obox(0.96, 0.06, 0.15), mat('#cfd6dc', 'matte'), { y: 0.11, z });
    p.add(obox(0.9, 0.1, 0.12, 0.05), mat(greens[i], 'matte'), { y: 0.19, z });
  });
  for (const x of [-0.46, 0.46]) for (const z of [-0.2, 0.2]) p.add(cyl(0.012, 0.012, 0.32, 6), mat(STEEL), { x, y: 0.24, z });
  for (const z of [-0.2, 0.2]) p.add(obox(1.0, 0.03, 0.05), mat('#b9f0b0', 'emissive'), { y: 0.41, z });
  p.add(cyl(0.1, 0.1, 0.2, 14), mat('#dfe6ea'), { x: -0.2, y: 0.18, z: 0.5 });
  p.add(ball(0.02, 0), mat('#b9f0b0', 'emissive'), { x: -0.2, y: 0.3, z: 0.5 });
  return p.group;
};

/** Deep Mine: a headframe over a shaft, a winch house, rails with ore carts and a spoil heap. */
const mine = (): THREE.Group => {
  const p = new Prop();
  pad(p, '#5e5a4c');
  const sx = -0.05, sz = 0.02, steel = mat('#9a8c78');
  // The shaft: a dark pit with a steel lip.
  p.add(cyl(0.12, 0.12, 0.01, 20), mat('#1d2229', 'matte'), { x: sx, y: 0.085, z: sz });
  p.add(ring(0.13, 0.016, 24), mat(STEEL), { x: sx, y: 0.1, z: sz });
  // The headframe: four legs, two bar frames and a platform with a sheave wheel.
  for (const [dx, dz] of [[-0.17, -0.12], [0.17, -0.12], [-0.17, 0.12], [0.17, 0.12]]) {
    p.add(cyl(0.014, 0.02, 0.9, 5), steel, { x: sx + dx, y: 0.53, z: sz + dz });
  }
  for (const dz of [-0.12, 0.12]) p.add(obox(0.36, 0.025, 0.025), steel, { x: sx, y: 0.5, z: sz + dz });
  for (const dx of [-0.17, 0.17]) p.add(obox(0.025, 0.025, 0.26), steel, { x: sx + dx, y: 0.5, z: sz });
  p.add(obox(0.4, 0.05, 0.3), mat(ROLES.trim), { x: sx, y: 0.98, z: sz });
  p.add(ring(0.07, 0.012, 16), mat(STEEL), { x: sx, y: 1.07, z: sz, rz: Math.PI / 2 });
  p.add(cyl(0.004, 0.004, 0.86, 4), mat(ROLES.dark), { x: sx, y: 0.57, z: sz });
  p.add(obox(0.07, 0.06, 0.07, 0.01), mat(ROLES.rust), { x: sx, y: 0.17, z: sz });
  p.add(ball(0.03, 0), mat('#ffb050', 'emissive'), { x: sx + 0.16, y: 1.03, z: sz + 0.1 });
  // The winch house, with a lit window.
  p.add(obox(0.26, 0.2, 0.24, 0.03), mat('#8a6a44'), { x: -0.42, y: 0.18, z: -0.2 });
  p.add(obox(0.3, 0.03, 0.28), mat(ROLES.trim), { x: -0.42, y: 0.295, z: -0.2 });
  p.add(obox(0.01, 0.07, 0.12), mat('#ffb050', 'emissive'), { x: -0.289, y: 0.2, z: -0.2 });
  // Two rails with two ore carts, each heaped.
  for (const z of [0.22, 0.36]) p.add(obox(1.0, 0.02, 0.015), mat('#7f8792'), { y: 0.09, z });
  for (const x of [-0.12, 0.22]) {
    p.add(obox(0.22, 0.08, 0.12), mat('#6f7780'), { x, y: 0.14, z: 0.29 });
    p.add(hull([[-0.1, 0.18, -0.05], [0.1, 0.18, -0.05], [0.1, 0.18, 0.05], [-0.1, 0.18, 0.05], [0, 0.27, 0]]), mat('#b98f5b', 'matte'), { x, z: 0.29 });
  }
  // The spoil heap beside the pit.
  p.add(hull([[-0.17, 0.08, -0.13], [0.17, 0.08, -0.13], [0.17, 0.08, 0.13], [-0.17, 0.08, 0.13], [0, 0.24, 0]]), mat('#8a7a62', 'matte'), { x: 0.28, z: -0.3 });
  return p.group;
};

/** Manufactory: a sawtooth-roofed hall, three smokestacks with beacons, crates of goods at the front. */
const manufactory = (): THREE.Group => {
  const p = new Prop();
  pad(p, PAVING);
  p.add(obox(0.86, 0.3, 0.5), mat('#5d6670'), { y: 0.23 });
  for (const x of [-0.3, -0.1, 0.1, 0.3]) p.add(prism([[-0.1, 0], [-0.1, 0.16], [0.1, 0]], 0.5), mat('#7d8790'), { x, y: 0.38 });
  p.add(obox(0.74, 0.07, 0.01), mat('#ffd28a', 'emissive'), { y: 0.2, z: 0.255 });
  const stacks = [[-0.3, 0.55, '#9a9590'], [0, 0.75, '#8c4a3a'], [0.28, 0.62, '#9a9590']] as const;
  for (const [x, h, c] of stacks) {
    const z = -0.34;
    p.add(cyl(0.05, 0.06, h, 12), mat(c, 'matte'), { x, y: 0.08 + h / 2, z });
    p.add(cyl(0.054, 0.054, 0.03, 12), mat('#e8e3dc'), { x, y: 0.08 + h - 0.015, z });
    p.add(ball(0.018, 0), mat('#ff4030', 'emissive'), { x, y: 0.08 + h + 0.01, z });
  }
  p.add(ball(0.08, 1), mat('#c9ced6', 'glow'), { x: 0, y: 0.93, z: -0.34 });
  p.add(obox(0.14, 0.12, 0.14), mat('#e6b450'), { x: 0.22, y: 0.14, z: 0.45 });
  p.add(obox(0.12, 0.1, 0.12), mat('#c0573a'), { x: 0.36, y: 0.13, z: 0.43 });
  p.add(obox(0.12, 0.1, 0.12), mat('#e6b450'), { x: 0.22, y: 0.25, z: 0.45 });
  return p.group;
};

/** Trade Hub: a glass-domed tower on four landing pads, a shuttle, and a stack of cargo. */
const tradeHub = (): THREE.Group => {
  const p = new Prop();
  pad(p, PAVING);
  for (const [x, z] of [[-0.36, 0.28], [0.36, -0.28], [0.36, 0.28]] as const) {
    p.add(cyl(0.15, 0.15, 0.03, 24), mat('#4e555d'), { x, y: 0.095, z });
    p.add(ring(0.13, 0.012, 20), mat('#7fd3e6', 'emissive'), { x, y: 0.115, z });
  }
  p.add(lathe([[0, 0], [0.26, 0], [0.26, 0.12], [0.2, 0.16], [0.2, 0.2], [0, 0.2]], 12), mat('#8994a0'), { y: 0.08 });
  p.add(cyl(0.27, 0.27, 0.02, 12), mat(ROLES.gold), { y: 0.2 });
  p.add(dome(0.18, 0.16), mat('#7fd3e6', 'glass'), { y: 0.28 });
  p.add(ball(0.05, 1), mat('#7fd3e6', 'emissive'), { y: 0.32 });
  p.add(cyl(0.008, 0.012, 0.2, 6), mat('#9aa4ae'), { y: 0.54 });
  p.add(ball(0.02, 0), mat('#ff4030', 'emissive'), { y: 0.65 });
  // The shuttle on its pad: a wedge hull with swept wings.
  p.add(hull([[-0.05, 0, -0.1], [0.05, 0, -0.1], [0.05, 0.06, -0.1], [-0.05, 0.06, -0.1], [-0.05, 0, 0.1], [0.05, 0, 0.1], [0, 0.03, 0.16]]), mat('#e9edf1', 'matte'), { x: 0.36, y: 0.11, z: 0.28 });
  p.add(obox(0.24, 0.01, 0.06), mat(ROLES.trim), { x: 0.36, y: 0.13, z: 0.28 });
  // Cargo at the free corner.
  p.add(obox(0.16, 0.1, 0.14), mat('#c0573a'), { x: -0.36, y: 0.13, z: -0.3 });
  p.add(obox(0.16, 0.1, 0.14), mat('#3d6fb0'), { x: -0.36, y: 0.13, z: -0.12 });
  p.add(obox(0.16, 0.1, 0.14), mat('#e6b450'), { x: -0.36, y: 0.23, z: -0.3 });
  return p.group;
};

/** Orbital Shipyard: a hull cradled in scaffolding, a construction ring turning around it. */
const shipyard = (): THREE.Group => {
  const p = new Prop();
  pad(p, GROUND, 0.72);
  for (const x of [-0.3, 0.3]) {
    for (const z of [-0.2, 0.2]) p.add(cyl(0.02, 0.025, 0.3, 6), mat('#8a8f96'), { x, y: 0.23, z });
    p.add(obox(0.06, 0.04, 0.46), mat('#9aa3ad'), { x, y: 0.37 });
  }
  // The hull along x: body, nose, engine, bridge.
  p.add(cyl(0.09, 0.1, 0.8, 8), mat('#d8dde2'), { x: -0.04, y: 0.48, rz: Math.PI / 2 });
  p.add(cyl(0, 0.09, 0.2, 8), mat('#d8dde2'), { x: 0.46, y: 0.48, rz: -Math.PI / 2 });
  p.add(cyl(0.075, 0.075, 0.02, 10), mat('#4fd1ff', 'emissive'), { x: -0.45, y: 0.48, rz: Math.PI / 2 });
  p.add(obox(0.2, 0.07, 0.12, 0.02), mat('#9aa3ad'), { x: 0.08, y: 0.605 });
  // The ring around the hull, standing in the yz plane, with lit beads.
  p.add(ring(0.34, 0.045, 36), mat('#dfe5ec'), { y: 0.48, rz: Math.PI / 2 });
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    p.add(ball(0.05, 0), mat(k % 2 ? '#e6b450' : '#7fd3e6', 'emissive'), { y: 0.48 + Math.cos(a) * 0.34, z: Math.sin(a) * 0.34 });
  }
  return p.group;
};

/** Research Lab: a glass dome over a glowing crystal core, with satellite dishes on the pad. */
const lab = (): THREE.Group => {
  const p = new Prop();
  pad(p, PAVING);
  p.add(lathe([[0, 0], [0.42, 0], [0.42, 0.16], [0, 0.16]], 16), mat('#59636e'), { y: 0.08 });
  p.add(cyl(0.425, 0.425, 0.02, 16), mat('#7fd3e6', 'emissive'), { y: 0.2 });
  p.add(dome(0.4, 0.36, 6), mat('#8fd8ee', 'glass'), { y: 0.24 });
  p.add(crystal(0.07, 0.26, 0.08), mat('#8fd8ee', 'emissive'), { y: 0.24 });
  p.add(crystal(0.05, 0.16, 0.06), mat('#c8f2ff', 'emissive'), { x: -0.14, y: 0.24, z: 0.06 });
  p.add(crystal(0.045, 0.12, 0.05), mat('#c8f2ff', 'emissive'), { x: 0.13, y: 0.24, z: -0.1 });
  for (const a of [0.5, 2.6, 4.7]) {
    const x = Math.cos(a) * 0.58, z = Math.sin(a) * 0.58;
    p.add(cyl(0.012, 0.012, 0.2, 6), mat(STEEL), { x, y: 0.18, z });
    p.add(lathe([[0, 0], [0.1, 0], [0.11, 0.05], [0.1, 0.055], [0, 0.02]], 10), mat('#d9e0e6'), { x, y: 0.28, z, rx: 0.5 });
  }
  return p.group;
};

/** Warehouse: two gable sheds with lit doors, a yard of containers and a forklift. */
const warehouse = (): THREE.Group => {
  const p = new Prop();
  pad(p, PAVING);
  for (const [x, roof] of [[-0.22, '#8a4a3a'], [0.22, '#6f7a86']] as const) {
    p.add(obox(0.4, 0.14, 0.7), mat('#a7a196', 'matte'), { x, y: 0.15 });
    p.add(prism([[-0.24, 0], [0.24, 0], [0, 0.14]], 0.74), mat(roof, 'matte'), { x, y: 0.22 });
    p.add(obox(0.12, 0.1, 0.01), mat('#ffd28a', 'emissive'), { x, y: 0.13, z: 0.375 });
  }
  p.add(obox(0.16, 0.1, 0.12), mat('#c0573a'), { x: -0.38, y: 0.13, z: 0.5 });
  p.add(obox(0.16, 0.1, 0.12), mat('#3d6fb0'), { x: -0.2, y: 0.13, z: 0.5 });
  p.add(obox(0.16, 0.1, 0.12), mat('#e6b450'), { x: -0.38, y: 0.23, z: 0.5 });
  p.add(obox(0.16, 0.1, 0.12), mat('#4f8a2c'), { x: 0.02, y: 0.13, z: 0.5 });
  p.add(obox(0.12, 0.06, 0.1, 0.01), mat('#e6b450'), { x: 0.3, y: 0.11, z: 0.48 });
  p.add(obox(0.02, 0.12, 0.02), mat(ROLES.trim), { x: 0.3, y: 0.14, z: 0.54 });
  return p.group;
};

/** Temple: a stepped octagonal shrine with gold rims, a bell dome and a gold spire. */
const temple = (): THREE.Group => {
  const p = new Prop();
  pad(p, PAVING);
  p.add(lathe([[0, 0], [0.44, 0], [0.44, 0.12], [0, 0.12]], 8), mat('#b9ae98', 'matte'), { y: 0.08 });
  p.add(cyl(0.455, 0.455, 0.02, 8), mat(ROLES.gold), { y: 0.21 });
  p.add(lathe([[0, 0], [0.34, 0], [0.34, 0.14], [0, 0.14]], 8), mat('#a99e88', 'matte'), { y: 0.22 });
  p.add(cyl(0.35, 0.35, 0.02, 8), mat(ROLES.gold), { y: 0.37 });
  p.add(lathe([[0, 0], [0.22, 0], [0.22, 0.12], [0, 0.12]], 8), mat('#cfc4ad', 'matte'), { y: 0.38 });
  p.add(cyl(0.23, 0.23, 0.02, 8), mat(ROLES.gold), { y: 0.5 });
  p.add(lathe([[0, 0], [0.2, 0], [0.2, 0.03], [0.14, 0.1], [0.06, 0.17], [0, 0.2]], 12), mat('#e6dcc4', 'matte'), { y: 0.52 });
  p.add(cyl(0.012, 0.04, 0.36, 8), mat(ROLES.gold), { y: 0.9 });
  p.add(ball(0.03, 0), mat('#fff0c0', 'emissive'), { y: 1.1 });
  for (const [x, z] of [[0.4, 0], [-0.4, 0], [0, 0.4], [0, -0.4]] as const) p.add(ball(0.035, 0), mat(ROLES.gold, 'emissive'), { x, y: 0.26, z });
  return p.group;
};

/** Capitol: a stepped tower with lit windows, a gold crown and spire on a gold-ringed plaza. */
const capitol = (): THREE.Group => {
  const p = new Prop();
  pad(p, PAVING);
  p.add(cyl(0.52, 0.52, 0.01, 40), mat('#c9b98a', 'matte'), { y: 0.085 });
  p.add(ring(0.56, 0.015, 40), mat(ROLES.gold), { y: 0.09 });
  for (const [x, z] of [[0.62, 0], [-0.62, 0], [0, 0.62], [0, -0.62]] as const) {
    p.add(cyl(0.01, 0.012, 0.14, 6), mat(ROLES.trim), { x, y: 0.16, z });
    p.add(ball(0.03, 0), mat('#ffe9a8', 'emissive'), { x, y: 0.25, z });
  }
  // Three tiers, narrowing upward.
  p.add(obox(0.4, 0.14, 0.4, 0.01), mat('#5f7d99'), { y: 0.16 });
  p.add(obox(0.28, 0.26, 0.28, 0.01), mat('#6f8aa4'), { y: 0.36 });
  p.add(obox(0.18, 0.3, 0.18, 0.01), mat('#86a0b8'), { y: 0.6 });
  // Lit windows on the two visible faces of the upper tiers.
  p.add(obox(0.006, 0.12, 0.18), mat('#ffe9a8', 'emissive'), { x: 0.143, y: 0.36 });
  p.add(obox(0.18, 0.12, 0.006), mat('#ffe9a8', 'emissive'), { z: 0.143, y: 0.36 });
  p.add(obox(0.006, 0.14, 0.12), mat('#ffe9a8', 'emissive'), { x: 0.093, y: 0.6 });
  p.add(obox(0.12, 0.14, 0.006), mat('#ffe9a8', 'emissive'), { z: 0.093, y: 0.6 });
  // The gold crown: a ring with six spikes, then the mast and its light.
  p.add(cyl(0.12, 0.12, 0.03, 16), mat(ROLES.gold), { y: 0.765 });
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2;
    p.add(cyl(0, 0.024, 0.1, 5), mat(ROLES.gold), { x: Math.cos(a) * 0.09, y: 0.83, z: Math.sin(a) * 0.09 });
  }
  p.add(cyl(0.012, 0.02, 0.3, 8), mat(ROLES.gold), { y: 0.93 });
  p.add(ball(0.03, 0), mat('#ff5040', 'emissive'), { y: 1.1 });
  return p.group;
};

export const BUILDING_ART: Readonly<Record<string, () => THREE.Group>> = {
  farm,
  mine,
  manufactory,
  'trade-hub': tradeHub,
  shipyard,
  lab,
  warehouse,
  temple,
  capitol,
};
