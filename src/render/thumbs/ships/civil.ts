import * as THREE from 'three';
import type { ShipColors } from '../../../core/ships/ShipDesign';
import { ball, crystal, cyl, hull, lathe, mat, obox, Prop, ring, ROLES } from '../propKit';
import type { ShipArt } from './types';

/**
 * Thumbnail art for the mining and logistics ship classes: one hand-modelled hull per class id, painted in the
 * empire's design colours (the `thumbnails` skill). Nose along +z, centred on the origin.
 */

type V3 = readonly [number, number, number];

/** A glowing nozzle at the stern: flared toward the nose, with its lit throat just behind. */
function nozzle(p: Prop, c: ShipColors, x: number, y: number, z: number, r: number): void {
  p.add(cyl(r * 1.2, r, 0.2, 10), mat(c.secondary, 'matte'), { x, y, z, rx: Math.PI / 2 });
  p.add(cyl(r * 0.8, r * 0.8, 0.03, 10), mat(c.accent, 'emissive'), { x, y, z: z - 0.11, rx: Math.PI / 2 });
}

/** A straight strut, pipe or cable from `a` to `b`. */
function strut(p: Prop, r: number, m: THREE.Material, a: V3, b: V3): void {
  const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize());
  const e = new THREE.Euler().setFromQuaternion(q);
  p.add(cyl(r, r, d.length(), 6), m, { x: (a[0] + b[0]) / 2, y: (a[1] + b[1]) / 2, z: (a[2] + b[2]) / 2, rx: e.x, ry: e.y, rz: e.z });
}

/** Mining: Prospector Skiff. A boxy utilitarian cracker with a gold drill bit on the nose. */
const prospector: ShipArt = (c) => {
  const p = new Prop();
  p.add(obox(0.5, 0.32, 1.1, 0.05), mat(c.primary), { y: 0.22, z: -0.12 });
  for (const x of [-0.27, 0.27]) p.add(obox(0.06, 0.06, 1.1), mat(c.secondary), { x, y: 0.06, z: -0.12 });
  p.add(obox(0.36, 0.16, 0.34, 0.05), mat(c.secondary), { y: 0.46, z: 0.1 });
  p.add(obox(0.3, 0.05, 0.03), mat(c.accent, 'emissive'), { y: 0.46, z: 0.28 });
  p.add(obox(0.4, 0.14, 0.36, 0.03), mat(c.secondary), { y: 0.45, z: -0.42 });
  p.add(cyl(0.13, 0.13, 0.18, 10), mat(ROLES.trim), { y: 0.22, z: 0.5, rx: Math.PI / 2 });
  p.add(lathe([[0, 0], [0.13, 0], [0.1, 0.05], [0, 0.3]], 8), mat(ROLES.gold), { y: 0.22, z: 0.6, rx: Math.PI / 2 });
  p.add(ball(0.04, 0), mat(c.accent, 'emissive'), { x: 0.1, y: 0.4, z: -0.3 });
  for (const x of [-0.16, 0.16]) nozzle(p, c, x, 0.22, -0.78, 0.1);
  return p.group;
};

/** Mining: Gas Harvester. A wide utilitarian hauler with two big intake scoops and a gas tank pair. */
const gasHarvester: ShipArt = (c) => {
  const p = new Prop();
  p.add(obox(0.9, 0.5, 1.2, 0.06), mat(c.primary), { y: 0.32, z: -0.1 });
  for (const x of [-0.42, 0.42]) {
    // Scoops flare toward the nose, each with a dark mouth.
    p.add(cyl(0.3, 0.18, 0.7, 12), mat(c.secondary), { x, y: 0.3, z: 0.42, rx: Math.PI / 2 });
    p.add(cyl(0.27, 0.27, 0.03, 12), mat(ROLES.dark, 'matte'), { x, y: 0.3, z: 0.77, rx: Math.PI / 2 });
  }
  for (const x of [-0.22, 0.22]) p.add(cyl(0.12, 0.12, 0.8, 10), mat(c.secondary), { x, y: 0.72, z: -0.2, rx: Math.PI / 2 });
  p.add(obox(0.5, 0.04, 0.02), mat(c.accent, 'emissive'), { y: 0.46, z: 0.51 });
  for (const x of [-0.28, 0, 0.28]) nozzle(p, c, x, 0.3, -0.72, 0.12);
  return p.group;
};

/** Mining: Ice Grazer. A living, lumpy hull grown on a lathe, with grazing arms that reach ahead. */
const iceCutter: ShipArt = (c) => {
  const p = new Prop();
  p.add(lathe([[0, -0.9], [0.34, -0.9], [0.4, -0.6], [0.44, 0], [0.38, 0.5], [0.24, 0.85], [0, 1.0]], 10), mat(c.primary, 'matte'), { rx: Math.PI / 2 });
  for (const x of [-0.36, 0.36]) p.add(ball(0.2, 1), mat(c.secondary, 'matte'), { x, y: 0.1, z: 0.1 });
  for (const z of [-0.35, 0.2]) p.add(ball(0.14, 1), mat(c.secondary, 'matte'), { y: 0.42, z });
  for (const s of [-1, 1]) {
    strut(p, 0.05, mat(c.secondary, 'matte'), [s * 0.25, 0, 0.7], [s * 0.5, 0.05, 1.15]);
    p.add(ball(0.07, 1), mat(c.primary, 'matte'), { x: s * 0.5, y: 0.05, z: 1.15 });
  }
  p.add(ball(0.12, 1), mat(c.accent, 'emissive'), { y: 0, z: 0.95 });
  for (const x of [-0.16, 0.16]) nozzle(p, c, x, 0, -0.9, 0.12);
  return p.group;
};

/** Mining: Resonant Driller. A faceted gem hull with a crystal laser at the nose and crystal shards aboard. */
const crystalDriller: ShipArt = (c) => {
  const p = new Prop();
  p.add(hull([[0, 0, 0.85], [0.42, 0, 0.1], [-0.42, 0, 0.1], [0, 0.38, 0.1], [0, -0.38, 0.1], [0.28, 0, -0.7], [-0.28, 0, -0.7], [0, 0.26, -0.7], [0, -0.26, -0.7], [0, 0, -0.9]]), mat(c.primary));
  p.add(crystal(0.13, 0.45), mat(c.secondary), { x: 0, y: 0.28, z: 0.2 });
  for (const s of [-1, 1]) p.add(crystal(0.09, 0.36), mat(c.secondary), { x: s * 0.3, y: 0.1, z: -0.3, rz: -s * 0.6 });
  p.add(crystal(0.12, 0.16, 0.14), mat(c.accent, 'emissive'), { y: 0, z: 0.85, rx: Math.PI / 2 });
  p.add(cyl(0.03, 0.03, 0.4, 6), mat(c.accent, 'glow'), { y: 0, z: 1.3, rx: Math.PI / 2 });
  for (const x of [-0.18, 0.18]) nozzle(p, c, x, 0, -0.78, 0.1);
  return p.group;
};

/** Mining: Regolith Dredge. A sleek technological wedge with crusher jaws, a sieve deck and glowing flank strips. */
const regolithDredge: ShipArt = (c) => {
  const p = new Prop();
  p.add(hull([[-0.5, 0, -1.1], [0.5, 0, -1.1], [0.5, 0.36, -1.1], [-0.5, 0.36, -1.1], [-0.32, 0, 0.6], [0.32, 0, 0.6], [0.32, 0.3, 0.6], [-0.32, 0.3, 0.6], [0, 0.14, 0.95]]), mat(c.primary));
  for (const s of [-1, 1]) {
    // Crusher jaws: two wedges closing on the nose.
    p.add(hull([[s * 0.36, 0, 0.45], [s * 0.1, 0, 0.45], [s * 0.1, 0.32, 0.45], [s * 0.36, 0.32, 0.45], [s * 0.03, 0.16, 1.2]]), mat(c.secondary));
    p.add(obox(0.03, 0.05, 1.4), mat(c.accent, 'emissive'), { x: s * 0.46, y: 0.18, z: -0.4 });
  }
  p.add(obox(0.6, 0.03, 0.9), mat(c.secondary), { y: 0.38, z: -0.3 });
  for (const z of [-0.05, -0.3, -0.55]) p.add(obox(0.5, 0.035, 0.04), mat(ROLES.dark, 'matte'), { y: 0.39, z });
  for (const x of [-0.22, 0.22]) nozzle(p, c, x, 0.14, -1.2, 0.13);
  return p.group;
};

/** Mining: Singularity Siphon. A hex-faceted barrel with a gravity focus gem, a hex ring and crystal spikes. */
const exoticSiphon: ShipArt = (c) => {
  const p = new Prop();
  p.add(lathe([[0, -1.3], [0.42, -1.3], [0.5, -0.7], [0.5, 0.9], [0.3, 1.3], [0, 1.3]], 6), mat(c.primary), { rx: Math.PI / 2 });
  p.add(ring(0.82, 0.07, 6), mat(c.secondary), { z: 0.9, rx: Math.PI / 2 });
  p.add(ball(0.3, 0), mat(c.accent, 'emissive'), { z: 1.45 });
  p.add(ball(0.44, 0), mat(c.accent, 'glow'), { z: 1.45 });
  for (const s of [-1, 1]) p.add(crystal(0.13, 0.7), mat(c.secondary), { x: s * 0.5, z: 0.1, rz: -s * Math.PI / 2 });
  for (const z of [-0.5, 0.2]) p.add(crystal(0.1, 0.5), mat(c.secondary), { y: 0.4, z });
  for (const [x, y] of [[-0.2, 0], [0.2, 0], [0, 0.25]]) nozzle(p, c, x, y, -1.3, 0.12);
  return p.group;
};

/** Mining: Void Trawler. A grown trawl bell at the nose on cables, lumpy flanks, three glowing engines. */
const voidTrawler: ShipArt = (c) => {
  const p = new Prop();
  p.add(lathe([[0, -1.3], [0.3, -1.25], [0.42, -0.8], [0.46, -0.2], [0.4, 0.3], [0.2, 0.6], [0, 0.65]], 10), mat(c.primary, 'matte'), { rx: Math.PI / 2 });
  p.add(lathe([[0, 0], [0.16, 0], [0.34, 0.2], [0.52, 0.5], [0.6, 0.75], [0.52, 0.85], [0, 0.85]], 10), mat(c.secondary, 'matte'), { z: 0.4, rx: Math.PI / 2 });
  p.add(cyl(0.48, 0.48, 0.02, 10), mat(ROLES.dark, 'matte'), { z: 1.25, rx: Math.PI / 2 });
  for (const a of [Math.PI / 2, Math.PI * 7 / 6, Math.PI * 11 / 6]) {
    strut(p, 0.035, mat(c.secondary, 'matte'), [Math.cos(a) * 0.3, Math.sin(a) * 0.3, 0.2], [Math.cos(a) * 0.52, Math.sin(a) * 0.52, 1.2]);
  }
  for (const s of [-1, 1]) p.add(ball(0.2, 1), mat(c.primary, 'matte'), { x: s * 0.4, y: -0.2, z: -0.5 });
  for (const [x, y] of [[-0.18, 0], [0.18, 0], [0, 0.22]]) nozzle(p, c, x, y, -1.3, 0.13);
  return p.group;
};

/** Logistics: Bulk Freighter. A utilitarian spine with two stacks of cargo containers and a bridge at the nose. */
const bulkFreighter: ShipArt = (c) => {
  const p = new Prop();
  p.add(obox(0.22, 0.22, 2.2, 0.03), mat(c.secondary), { y: 0.2 });
  for (const s of [-1, 1]) {
    for (const z of [-0.55, 0.3]) {
      p.add(obox(0.4, 0.26, 0.6, 0.02), mat(c.primary), { x: s * 0.33, y: 0.18, z });
      p.add(obox(0.4, 0.26, 0.6, 0.02), mat(c.primary), { x: s * 0.33, y: 0.44, z });
    }
  }
  p.add(obox(0.36, 0.3, 0.36, 0.05), mat(c.primary), { y: 0.2, z: 0.85 });
  p.add(obox(0.3, 0.06, 0.02), mat(c.accent, 'emissive'), { y: 0.24, z: 1.04 });
  p.add(obox(0.6, 0.3, 0.2, 0.04), mat(c.secondary), { y: 0.2, z: -1.05 });
  for (const x of [-0.2, 0.2]) nozzle(p, c, x, 0.2, -1.2, 0.12);
  return p.group;
};

/** Logistics: Survey Cutter. A slim technological hull with a sensor dish on a mast and a long-range scanner. */
const surveyCutter: ShipArt = (c) => {
  const p = new Prop();
  p.add(hull([[0, 0.1, 0.8], [0, -0.06, 0.8], [0.18, 0, 0.1], [-0.18, 0, 0.1], [0.2, 0.14, -0.4], [-0.2, 0.14, -0.4], [0.14, 0, -0.8], [-0.14, 0, -0.8], [0, 0.16, -0.1]]), mat(c.primary));
  p.add(cyl(0.03, 0.04, 0.3, 6), mat(c.secondary), { y: 0.3, z: -0.1 });
  const dish = Object.assign(mat(c.secondary, 'matte'), { side: THREE.DoubleSide });
  p.add(lathe([[0.02, 0], [0.2, 0.03], [0.36, 0.1], [0.44, 0.2], [0.42, 0.21], [0.34, 0.12], [0.18, 0.06], [0, 0.03]], 14), dish, { y: 0.44, z: -0.1, rx: -0.5 });
  strut(p, 0.025, mat(c.secondary), [0, 0.3, 0.3], [0, 0.36, 0.8]);
  p.add(ball(0.05, 1), mat(c.accent, 'emissive'), { y: 0.36, z: 0.8 });
  for (const x of [-0.12, 0.12]) nozzle(p, c, x, 0.02, -0.85, 0.08);
  return p.group;
};

/** Logistics: Construction Tender. A utilitarian deck with a portal girder frame, two crane arms and a hook. */
const constructionTender: ShipArt = (c) => {
  const p = new Prop();
  p.add(obox(0.7, 0.4, 1.6, 0.04), mat(c.primary), { y: 0.25, z: -0.1 });
  p.add(obox(0.72, 0.05, 0.2), mat(ROLES.gold), { y: 0.18, z: 0.72 });
  for (const z of [0.2, -0.5]) {
    for (const x of [-0.3, 0.3]) p.add(obox(0.06, 0.6, 0.06), mat(c.secondary), { x, y: 0.7, z });
    p.add(obox(0.72, 0.06, 0.06), mat(c.secondary), { y: 1.0, z });
  }
  for (const s of [-1, 1]) {
    strut(p, 0.05, mat(c.secondary), [s * 0.3, 0.45, 0.6], [s * 0.3, 1.1, 1.3]);
    strut(p, 0.025, mat(c.secondary), [s * 0.3, 0.9, 0.2], [s * 0.3, 1.1, 1.3]);
  }
  p.add(obox(0.7, 0.06, 0.06), mat(c.secondary), { y: 1.1, z: 1.3 });
  p.add(cyl(0.01, 0.01, 0.45, 5), mat(ROLES.dark), { y: 0.85, z: 1.3 });
  p.add(ring(0.06, 0.02, 8), mat(ROLES.gold), { y: 0.6, z: 1.3, rx: Math.PI / 2 });
  for (const x of [-0.16, 0.16]) nozzle(p, c, x, 0.25, -0.95, 0.12);
  return p.group;
};

/** Logistics: Pathfinder Scout. A slim, fast needle with delta wings, a long forward sensor boom and one gun. */
const pathfinder: ShipArt = (c) => {
  const p = new Prop();
  p.add(hull([[0, 0.1, 0.85], [0, -0.06, 0.85], [0.14, 0, 0.1], [-0.14, 0, 0.1], [0.16, 0.12, -0.5], [-0.16, 0.12, -0.5], [0.1, -0.02, -0.7], [-0.1, -0.02, -0.7], [0, 0.16, -0.2]]), mat(c.primary));
  for (const s of [-1, 1]) p.add(obox(0.42, 0.02, 0.5), mat(c.secondary), { x: s * 0.3, y: 0.02, z: -0.35 });
  strut(p, 0.025, mat(c.secondary), [0, 0.06, 0.6], [0, 0.2, 1.15]);
  const dish = Object.assign(mat(c.secondary, 'matte'), { side: THREE.DoubleSide });
  p.add(lathe([[0.02, 0], [0.12, 0.02], [0.2, 0.08], [0.22, 0.12], [0.2, 0.13], [0.1, 0.05], [0, 0.02]], 12), dish, { y: 0.2, z: 1.15, rx: Math.PI / 2 });
  p.add(ball(0.04, 1), mat(c.accent, 'emissive'), { y: 0.2, z: 1.17 });
  p.add(cyl(0.035, 0.035, 0.22, 8), mat(ROLES.dark), { y: -0.03, z: 0.55, rx: Math.PI / 2 });
  for (const x of [-0.1, 0.1]) nozzle(p, c, x, 0.05, -0.72, 0.07);
  return p.group;
};

/** Logistics: Colony Ark. A huge habitat drum on a spoked spin ring, a bridge dome at the nose and four engines. */
const colonyArk: ShipArt = (c) => {
  const p = new Prop();
  p.add(cyl(0.5, 0.5, 1.8, 16), mat(c.primary), { rx: Math.PI / 2 });
  for (const z of [-0.9, 0.9]) p.add(cyl(0.52, 0.52, 0.06, 16), mat(c.secondary), { z, rx: Math.PI / 2 });
  p.add(ring(0.85, 0.07, 28), mat(c.secondary), { rx: Math.PI / 2 });
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    strut(p, 0.03, mat(c.secondary), [Math.cos(a) * 0.45, Math.sin(a) * 0.45, 0], [Math.cos(a) * 0.85, Math.sin(a) * 0.85, 0]);
  }
  p.add(lathe([[0, 0], [0.4, 0], [0.45, 0.1], [0.3, 0.3], [0, 0.36]], 12), mat(c.primary), { z: 0.9, rx: Math.PI / 2 });
  p.add(cyl(0.51, 0.51, 0.06, 16), mat(c.accent, 'emissive'), { z: -0.45, rx: Math.PI / 2 });
  for (const [x, y] of [[-0.22, 0.22], [0.22, 0.22], [-0.22, -0.22], [0.22, -0.22]]) nozzle(p, c, x, y, -0.95, 0.09);
  return p.group;
};

export const CIVIL_SHIP_ART: Readonly<Record<string, ShipArt>> = {
  prospector,
  'gas-harvester': gasHarvester,
  'ice-cutter': iceCutter,
  'crystal-driller': crystalDriller,
  'regolith-dredge': regolithDredge,
  'exotic-siphon': exoticSiphon,
  'void-trawler': voidTrawler,
  'bulk-freighter': bulkFreighter,
  'survey-cutter': surveyCutter,
  'construction-tender': constructionTender,
  pathfinder,
  'colony-ark': colonyArk,
};
