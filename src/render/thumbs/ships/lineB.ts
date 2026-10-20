import * as THREE from 'three';
import type { ShipColors } from '../../../core/ships/ShipDesign';
import { ball, crystal, cyl, hull, lathe, mat, obox, Prop, prism, ring, ROLES } from '../propKit';
import type { ShipArt } from './types';

/**
 * Thumbnail art for the support combat (suppression, capture, assault, support) and capital ship classes: one hand-modelled hull per class id, painted in the
 * empire's design colours (the `thumbnails` skill). Nose along +z, centred on the origin.
 */

const QUARTER = Math.PI / 2;
type Pt = readonly [number, number];

/** A side profile [z, y] (nose +z), extruded `w` across x: the silhouette of a hull. */
const sideSlab = (profile: readonly Pt[], w: number) => prism(profile.map(([z, y]) => [-z, y] as const), w).rotateY(QUARTER);

/** A top profile [x, z], extruded `h` tall and centred on y. */
const topSlab = (profile: readonly Pt[], h: number) => prism(profile, h).rotateX(QUARTER);

/** A thin sheet, seen from both sides (dishes, fins). */
const sheet = (color: string) => Object.assign(mat(color, 'matte'), { side: THREE.DoubleSide });

/** A stern nozzle: a flared tube that glows, its mouth at -z. */
function nozzle(p: Prop, c: ShipColors, x: number, y: number, z: number, r: number): void {
  p.add(cyl(r * 0.8, r, r * 1.2, 8), mat(c.accent, 'emissive'), { x, y, z, rx: QUARTER });
}

/** A gun on a squat mount, its barrel of length `len` reaching forward (+z). */
function gun(p: Prop, base: string, barrel: string, x: number, y: number, z: number, r: number, len: number): void {
  p.add(cyl(r, r * 1.15, 0.06, 8), mat(base), { x, y, z });
  p.add(cyl(r * 0.25, r * 0.3, len, 6), mat(barrel), { x, y: y + 0.04, z: z + len / 2, rx: QUARTER });
}

/** Jammer Frigate: a slim wedge with a mast of antennas and dishes, blinding the enemy's aim. */
const jammer: ShipArt = (c) => {
  const p = new Prop();
  p.add(hull([[0, 0.1, 0.85], [-0.14, 0.04, 0.1], [0.14, 0.04, 0.1], [-0.2, 0.06, -0.7], [0.2, 0.06, -0.7], [0, 0.17, -0.45], [0, -0.04, -0.6]]), mat(c.primary));
  // The main mast: a tall antenna with a lit tip and a crossbar; a shorter one forward.
  p.add(cyl(0.015, 0.025, 0.5, 5), mat(c.secondary), { y: 0.42, z: -0.35 });
  p.add(obox(0.42, 0.025, 0.025), mat(c.secondary), { y: 0.5, z: -0.35 });
  p.add(ball(0.04, 0), mat(c.accent, 'emissive'), { y: 0.68, z: -0.35 });
  p.add(cyl(0.012, 0.02, 0.32, 5), mat(c.secondary), { y: 0.3, z: 0.2 });
  // Two dishes on the flanks of the mast, tilted up and forward.
  for (const x of [-0.2, 0.2]) p.add(lathe([[0, 0], [0.08, 0.03], [0.13, 0.08], [0.14, 0.11]], 8), sheet(c.secondary), { x, y: 0.22, z: -0.25, rx: 1.0 });
  // Sensor pods on the flanks, a forward gun, two engines.
  for (const x of [-0.22, 0.22]) p.add(obox(0.12, 0.08, 0.3, 0.02), mat(c.secondary), { x, y: 0.1, z: -0.3 });
  p.add(cyl(0.03, 0.03, 0.22, 6), mat(ROLES.trim), { y: 0.1, z: 0.79, rx: QUARTER });
  for (const x of [-0.1, 0.1]) nozzle(p, c, x, 0.08, -0.74, 0.07);
  return p.group;
};

/** Flak Picket: a boxy, bolted hull bristling with five flak mounts. */
const flakPicket: ShipArt = (c) => {
  const p = new Prop();
  p.add(obox(0.5, 0.26, 1.2, 0.05), mat(c.primary), { y: 0.2, z: -0.1 });
  p.add(hull([[-0.25, 0.07, 0.5], [0.25, 0.07, 0.5], [-0.25, 0.33, 0.5], [0.25, 0.33, 0.5], [0, 0.22, 0.85]]), mat(c.primary));
  // Exposed frames: a keel and a top rail.
  p.add(obox(0.56, 0.03, 1.25), mat(c.secondary), { y: 0.05, z: -0.1 });
  p.add(obox(0.54, 0.03, 1.2), mat(c.secondary), { y: 0.345, z: -0.1 });
  // Side sponsons carrying the flak mounts, and two boxy engine blocks.
  for (const x of [-0.27, 0.27]) p.add(obox(0.12, 0.12, 0.5, 0.02), mat(c.secondary), { x, y: 0.2, z: 0 });
  for (const x of [-0.17, 0.17]) {
    p.add(obox(0.2, 0.2, 0.26, 0.03), mat(c.secondary), { x, y: 0.16, z: -0.75 });
    nozzle(p, c, x, 0.16, -0.92, 0.08);
  }
  // Five flak mounts: two on the back, two on the sponsons, one on the prow.
  for (const z of [0.3, -0.4]) gun(p, c.secondary, ROLES.dark, 0, 0.39, z, 0.09, 0.22);
  for (const x of [-0.27, 0.27]) gun(p, c.secondary, ROLES.dark, x, 0.29, 0, 0.08, 0.2);
  gun(p, c.secondary, ROLES.dark, 0, 0.36, 0.5, 0.08, 0.2);
  return p.group;
};

/** Parasite Boarder: a grown, barbed pod that latches onto a crippled hull. */
const boardingCorvette: ShipArt = (c) => {
  const p = new Prop();
  p.add(lathe([[0, -0.7], [0.2, -0.55], [0.3, -0.2], [0.3, 0.2], [0.22, 0.55], [0.1, 0.7], [0, 0.75]], 8).rotateX(QUARTER), mat(c.primary));
  // A brood sac under the belly, lumps on the flanks.
  p.add(ball(0.18, 1), mat(c.secondary), { y: -0.22, z: -0.1 });
  p.add(ball(0.1, 1), mat(c.primary), { x: 0.27, y: 0.1, z: -0.25 });
  p.add(ball(0.1, 1), mat(c.primary), { x: -0.28, y: 0.05, z: 0.1 });
  // Two barbed claws latching forward from the flanks, and barbs down the back.
  for (const s of [-1, 1]) p.add(hull([[-0.05, -0.03, 0], [0.05, -0.03, 0], [0, 0.03, 0], [s * 0.2, 0, 0.35]]), mat(ROLES.trim), { x: s * 0.22, y: -0.02, z: 0.25 });
  for (const z of [-0.2, 0, 0.2]) p.add(hull([[-0.03, 0, -0.03], [0.03, 0, -0.03], [0, 0, 0.03], [0, 0.14, 0]]), mat(ROLES.trim), { y: 0.27, z });
  // Latching tendrils reaching forward under the belly.
  for (const x of [-0.12, 0.12]) p.add(cyl(0.03, 0.015, 0.45, 5), mat(c.secondary), { x, y: -0.28, z: 0.35, rx: 2.2 });
  // Two glowing nozzles, a spit-gland spike with a glowing tip.
  for (const x of [-0.12, 0.12]) nozzle(p, c, x, 0, -0.72, 0.08);
  p.add(cyl(0.02, 0.04, 0.2, 6), mat(ROLES.trim), { y: 0, z: 0.85, rx: QUARTER });
  p.add(ball(0.04, 0), mat(c.accent, 'emissive'), { y: 0, z: 0.96 });
  return p.group;
};

/** Tractor Tender: a squat tug with a big tractor emitter on its bow and tow clamps at the sides. */
const tractorTender: ShipArt = (c) => {
  const p = new Prop();
  p.add(obox(0.8, 0.4, 1.3, 0.05), mat(c.primary), { y: 0.3, z: -0.15 });
  p.add(hull([[-0.4, 0.1, 0.5], [0.4, 0.1, 0.5], [-0.4, 0.5, 0.5], [0.4, 0.5, 0.5], [-0.3, 0.3, 0.8], [0.3, 0.3, 0.8]]), mat(c.primary));
  p.add(obox(0.84, 0.05, 1.3), mat(c.secondary), { y: 0.08, z: -0.15 });
  // The tractor emitter: a flared funnel on the bow, a glowing mouth and field.
  p.add(lathe([[0.04, 0], [0.14, 0.1], [0.22, 0.22], [0.24, 0.28]], 10).rotateX(QUARTER), mat(c.secondary), { y: 0.3, z: 0.6 });
  p.add(ring(0.24, 0.025, 16), mat(c.accent, 'emissive'), { y: 0.3, z: 0.88, rx: QUARTER });
  p.add(ball(0.13, 1), mat(c.accent, 'glow'), { y: 0.3, z: 0.86 });
  // Tow clamps on arms out from the flanks.
  for (const s of [-1, 1]) {
    p.add(obox(0.1, 0.1, 0.9), mat(c.secondary), { x: s * 0.46, y: 0.3, z: -0.1 });
    p.add(obox(0.14, 0.32, 0.14, 0.03), mat(ROLES.trim), { x: s * 0.5, y: 0.22, z: 0.5 });
  }
  // Two big engine blocks, cargo containers and a sensor mast.
  for (const x of [-0.2, 0.2]) {
    p.add(obox(0.26, 0.3, 0.3, 0.04), mat(c.secondary), { x, y: 0.28, z: -0.85 });
    nozzle(p, c, x, 0.28, -1.04, 0.11);
  }
  for (const x of [-0.18, 0.18]) p.add(obox(0.32, 0.2, 0.5, 0.02), mat(c.secondary), { x, y: 0.6, z: -0.4 });
  p.add(cyl(0.015, 0.02, 0.35, 5), mat(ROLES.trim), { y: 0.67, z: 0.1 });
  p.add(ball(0.05, 0), mat(c.accent, 'emissive'), { y: 0.87, z: 0.1 });
  return p.group;
};

/** Drop Ship: a wide lifting body with a beaked nose and a troop bay, pods hung under it. */
const dropShip: ShipArt = (c) => {
  const p = new Prop();
  p.add(obox(0.95, 0.2, 1.25, 0.05), mat(c.primary), { y: 0.2, z: -0.1 });
  p.add(sideSlab([[0.5, 0.1], [0.5, 0.3], [0.8, 0.26], [0.9, 0.14], [0.8, 0.1]], 0.9), mat(c.primary));
  // The cockpit dome and the dark troop-bay hatch beneath.
  p.add(ball(0.14, 1), mat(c.accent, 'glass'), { y: 0.36, z: 0.55 });
  p.add(obox(0.6, 0.02, 0.8), mat(ROLES.dark, 'matte'), { y: 0.09, z: -0.1 });
  // Stub wings.
  for (const s of [-1, 1]) p.add(obox(0.6, 0.03, 0.9, 0.01), mat(c.secondary), { x: s * 0.75, y: 0.2, z: -0.1 });
  // Four drop pods hung from the wings, where they show from above too, each with an accent band.
  for (const [x, z] of [[0.62, 0.2], [-0.62, 0.2], [0.95, -0.3], [-0.95, -0.3]]) {
    p.add(lathe([[0, 0], [0.1, 0.03], [0.15, 0.12], [0.16, 0.24], [0.13, 0.33], [0.06, 0.36], [0, 0.37]], 8), mat(c.secondary), { x, y: -0.18, z });
    p.add(ring(0.15, 0.012, 12), mat(c.accent, 'emissive'), { x, y: -0.06, z });
  }
  for (const x of [-0.3, 0.3]) nozzle(p, c, x, 0.2, -0.8, 0.08);
  return p.group;
};

/** Legion Carrier: a flat-decked capital with hangar bays along its flanks, a command island and three engines. */
const assaultCarrier: ShipArt = (c) => {
  const p = new Prop();
  p.add(hull([[0, 0.2, 1.6], [-0.3, 0.2, 1.2], [0.3, 0.2, 1.2], [-0.62, 0.32, 0.5], [0.62, 0.32, 0.5], [-0.62, 0.42, -0.9], [0.62, 0.42, -0.9], [-0.55, 0.16, -1.45], [0.55, 0.16, -1.45], [-0.5, 0, 0.4], [0.5, 0, 0.4], [-0.5, 0, -1], [0.5, 0, -1]]), mat(c.primary));
  p.add(obox(1.0, 0.04, 2.3), mat(c.primary), { y: 0.44, z: -0.25 });
  // Hangar bays along both flanks, each with a lit lip.
  for (const s of [-1, 1]) {
    for (const z of [-0.2, -0.8]) {
      p.add(obox(0.06, 0.14, 0.4), mat(ROLES.dark, 'matte'), { x: s * 0.6, y: 0.26, z });
      p.add(obox(0.04, 0.02, 0.36), mat(c.accent, 'emissive'), { x: s * 0.62, y: 0.36, z });
    }
  }
  // The command island on the starboard side: a stepped tower with a mast and a dish.
  p.add(obox(0.3, 0.3, 0.55, 0.03), mat(c.primary), { x: 0.25, y: 0.62, z: -0.5 });
  p.add(obox(0.22, 0.2, 0.3, 0.03), mat(c.secondary), { x: 0.25, y: 0.88, z: -0.6 });
  p.add(cyl(0.015, 0.02, 0.45, 5), mat(ROLES.trim), { x: 0.25, y: 1.2, z: -0.6 });
  p.add(lathe([[0, 0], [0.14, 0.03], [0.18, 0.07]], 8), sheet(c.secondary), { x: 0.25, y: 1.34, z: -0.6, rx: 0.6 });
  // Two landing craft parked on the deck.
  p.add(obox(0.22, 0.12, 0.36, 0.03), mat(c.secondary), { x: -0.2, y: 0.5, z: 0.1 });
  p.add(hull([[-0.11, 0.46, 0.28], [0.11, 0.46, 0.28], [-0.11, 0.58, 0.28], [0.11, 0.58, 0.28], [0, 0.52, 0.45]]), mat(c.primary), { x: -0.2 });
  // Three gun mounts: one forward, two aft on the deck edges.
  gun(p, c.secondary, ROLES.dark, 0, 0.46, 0.7, 0.1, 0.3);
  gun(p, c.secondary, ROLES.dark, -0.42, 0.46, -1.0, 0.1, 0.3);
  gun(p, c.secondary, ROLES.dark, 0.42, 0.46, -1.0, 0.1, 0.3);
  // Three engine pods across the stern, each with a glowing nozzle.
  for (const x of [-0.32, 0, 0.32]) {
    p.add(obox(0.3, 0.3, 0.25, 0.03), mat(c.primary), { x, y: 0.22, z: -1.3 });
    nozzle(p, c, x, 0.22, -1.5, 0.12);
  }
  p.add(ball(0.05, 0), mat(c.accent, 'emissive'), { y: 0.2, z: 1.62 });
  return p.group;
};

/** Mender: a grown spindle with repair arms reaching forward and a healing glow ring round its waist. */
const repairTender: ShipArt = (c) => {
  const p = new Prop();
  p.add(lathe([[0, -1.2], [0.3, -1.1], [0.45, -0.6], [0.5, 0], [0.42, 0.6], [0.3, 1.0], [0, 1.2]], 10).scale(1, 1, 0.85).rotateX(QUARTER), mat(c.primary));
  // Lumps along the spine and on the flanks.
  for (const z of [-0.6, 0.1, 0.7]) p.add(ball(0.16, 1), mat(c.secondary), { y: 0.36, z });
  for (const s of [-1, 1]) p.add(ball(0.14, 1), mat(c.primary), { x: s * 0.42, y: -0.05, z: 0.3 });
  // Two repair arms: a joint, a long arm reaching forward, and a glowing emitter at each tip.
  for (const s of [-1, 1]) {
    p.add(ball(0.1, 1), mat(c.secondary), { x: s * 0.42, y: 0, z: 0.5 });
    p.add(cyl(0.045, 0.035, 0.75, 6), mat(c.primary), { x: s * 0.45, y: 0, z: 0.9, rx: QUARTER });
    p.add(ball(0.1, 1), mat(c.accent, 'emissive'), { x: s * 0.45, y: 0, z: 1.3 });
  }
  // The healing glow ring, a hoop round the body.
  p.add(ring(0.62, 0.05, 28), mat(c.accent, 'glow'), { y: 0, z: 0, rx: QUARTER });
  for (const x of [-0.22, 0.22]) nozzle(p, c, x, 0.05, -1.15, 0.12);
  return p.group;
};

/** Dreadnought: a spine of three lances wrapped in an armoured slab, five engines at the stern. */
const dreadnought: ShipArt = (c) => {
  const p = new Prop();
  // The armoured hull: a long wedge slab, tall along the spine, with a blunt stern.
  p.add(sideSlab([[-1.6, 0.1], [-1.6, 0.56], [-1.45, 0.66], [1.0, 0.66], [1.3, 0.52], [1.6, 0.3], [1.6, 0.12], [1.0, 0.05], [-1.0, 0.05]], 1.2), mat(c.primary));
  // The spine rail that wraps the lances, and the armour skirts down the flanks.
  p.add(obox(0.7, 0.14, 2.8, 0.04), mat(c.secondary), { y: 0.74, z: 0 });
  for (const s of [-1, 1]) p.add(obox(0.08, 0.4, 2.2, 0.03), mat(c.secondary), { x: s * 0.62, y: 0.33, z: 0 });
  // The three lances, their tips glowing at the nose.
  for (const x of [-0.22, 0, 0.22]) {
    p.add(cyl(0.05, 0.05, 3.0, 6), mat(ROLES.hull), { x, y: 0.86, rx: QUARTER });
    p.add(ball(0.06, 0), mat(c.accent, 'emissive'), { x, y: 0.86, z: 1.52 });
  }
  // Four turrets on the skirts, one gun at the bow.
  for (const s of [-1, 1]) for (const z of [0.5, -0.5]) gun(p, c.secondary, ROLES.dark, s * 0.62, 0.5, z, 0.09, 0.3);
  gun(p, c.secondary, ROLES.dark, 0.3, 0.68, 1.0, 0.1, 0.3);
  // The stern block and five engines: three above, two below.
  p.add(obox(1.1, 0.4, 0.2, 0.03), mat(c.secondary), { y: 0.32, z: -1.42 });
  for (const x of [-0.36, 0, 0.36]) nozzle(p, c, x, 0.34, -1.6, 0.11);
  for (const x of [-0.18, 0.18]) nozzle(p, c, x, 0.12, -1.6, 0.085);
  return p.group;
};

/** Leviathan: a living whale-like capital, a blunt head with a dark jaw, flukes and glowing organs. */
const leviathan: ShipArt = (c) => {
  const p = new Prop();
  // The body: a whale's bulk, blunt at the head, tapering to the tail, flattened under the belly.
  p.add(lathe([[0, -1.6], [0.25, -1.5], [0.45, -1.0], [0.55, -0.2], [0.55, 0.5], [0.48, 1.05], [0.3, 1.42], [0, 1.6]], 10).scale(1, 1, 0.8).rotateX(QUARTER), mat(c.primary));
  // The dark jaw under the head, and the eyes.
  p.add(hull([[-0.3, -0.12, 0.95], [0.3, -0.12, 0.95], [-0.26, -0.42, 1.3], [0.26, -0.42, 1.3], [0, -0.3, 1.56]]), mat(c.secondary));
  for (const s of [-1, 1]) p.add(ball(0.07, 1), mat(c.accent, 'emissive'), { x: s * 0.46, y: 0.12, z: 0.95 });
  // A sail-like dorsal fin and two flukes spread flat at the tail.
  p.add(hull([[-0.04, 0.3, 0.4], [0.04, 0.3, 0.4], [-0.04, 0.3, -0.4], [0.04, 0.3, -0.4], [0, 0.95, -0.5]]), mat(c.secondary));
  p.add(topSlab([[-0.85, -1.8], [-0.25, -1.5], [0, -1.4], [0.25, -1.5], [0.85, -1.8], [0.4, -1.7], [0, -1.6], [-0.4, -1.7]], 0.1), mat(c.primary));
  // Four glowing organs at the stern, and a glowing barb at each fluke tip.
  for (const x of [-0.25, 0.25]) for (const y of [0.15, -0.1]) p.add(ball(0.11, 1), mat(c.accent, 'emissive'), { x, y, z: -1.5 });
  for (const s of [-1, 1]) p.add(ball(0.06, 0), mat(c.accent, 'emissive'), { x: s * 0.85, y: 0, z: -1.8 });
  // Two bio-cannons on the flanks of the head, two spines on the back.
  for (const s of [-1, 1]) {
    p.add(cyl(0.06, 0.08, 0.5, 6), mat(c.secondary), { x: s * 0.5, y: -0.05, z: 0.6, rx: QUARTER });
    p.add(cyl(0.03, 0.01, 0.5, 5), mat(ROLES.trim), { x: s * 0.45, y: 0.25, z: -0.3, rz: -s * 0.7 });
  }
  // Bio-glow spots on the flanks.
  for (const s of [-1, 1]) {
    p.add(ball(0.1, 1), mat(c.accent, 'glow'), { x: s * 0.52, y: 0.05, z: 0.2 });
    p.add(ball(0.1, 1), mat(c.accent, 'glow'), { x: s * 0.5, y: -0.12, z: -0.7 });
  }
  return p.group;
};

/** Monolith: a silent siege fortress, a hex block with a faceted crown, a long siege gun and side bays. */
const monolith: ShipArt = (c) => {
  const p = new Prop();
  // A hex-section block, flat on top and bottom, tapering to a faceted nose.
  p.add(lathe([[0, -1.5], [0.8, -1.5], [0.9, -1.0], [0.9, 1.0], [0.6, 1.5], [0, 1.7]], 6).rotateY(Math.PI / 6).rotateX(QUARTER), mat(c.primary));
  // A faceted crown on the rear half, with a crystal spire.
  p.add(hull([[-0.5, 0.78, -1.1], [0.5, 0.78, -1.1], [-0.5, 0.78, -0.3], [0.5, 0.78, -0.3], [0, 1.2, -0.7]]), mat(c.secondary));
  p.add(crystal(0.1, 0.45), mat(c.secondary), { y: 1.15, z: -0.7 });
  // The siege gun on a hex housing, its muzzle glowing.
  p.add(lathe([[0, 0], [0.28, 0], [0.3, 0.08], [0.22, 0.16], [0, 0.18]], 6), mat(c.secondary), { y: 0.78, z: 0.5 });
  p.add(cyl(0.12, 0.15, 2.0, 6), mat(ROLES.hull), { y: 0.95, z: 0.9, rx: QUARTER });
  p.add(ball(0.15, 0), mat(c.accent, 'emissive'), { y: 0.95, z: 1.92 });
  // Side bays with a short gun each, and a belly turret.
  for (const s of [-1, 1]) {
    p.add(obox(0.3, 0.4, 0.6, 0.04), mat(c.secondary), { x: s * 1.0, y: 0, z: 0.4 });
    p.add(cyl(0.05, 0.06, 0.4, 6), mat(ROLES.trim), { x: s * 1.2, y: 0, z: 0.4, rz: QUARTER });
  }
  gun(p, c.secondary, ROLES.dark, 0, -0.8, 0.3, 0.12, 0.35);
  // Four engines in the rear face, each with a glowing mouth.
  for (const x of [-0.35, 0.35]) for (const y of [0.25, -0.25]) nozzle(p, c, x, y, -1.55, 0.13);
  return p.group;
};

/** Grand Flagship: a regal capital, a stepped command tower under a gold crown, gold trim, five engines. */
const flagship: ShipArt = (c) => {
  const p = new Prop();
  // A long naval hull with a sweeping bow.
  p.add(hull([[0, 0.3, 1.7], [-0.26, 0.3, 1.2], [0.26, 0.3, 1.2], [-0.52, 0.4, 0.3], [0.52, 0.4, 0.3], [-0.56, 0.44, -0.9], [0.56, 0.44, -0.9], [-0.4, 0.2, -1.45], [0.4, 0.2, -1.45], [-0.45, 0, 0.2], [0.45, 0, 0.2], [-0.3, 0, -1], [0.3, 0, -1]]), mat(c.primary));
  // Gold pinstripes along the flanks, a gold figurehead at the prow, the deck.
  for (const s of [-1, 1]) p.add(obox(0.03, 0.03, 2.6), mat(ROLES.gold), { x: s * 0.53, y: 0.3, z: -0.2 });
  p.add(ball(0.07, 0), mat(ROLES.gold), { y: 0.3, z: 1.72 });
  p.add(obox(0.9, 0.03, 2.4), mat(c.primary), { y: 0.455, z: -0.2 });
  // The command tower in three tiers under a gold crown, a window band and a beacon.
  p.add(obox(0.5, 0.2, 0.6, 0.04), mat(c.primary), { y: 0.55, z: -0.15 });
  p.add(obox(0.4, 0.18, 0.46, 0.04), mat(c.secondary), { y: 0.74, z: -0.2 });
  p.add(obox(0.26, 0.14, 0.3, 0.03), mat(c.primary), { y: 0.9, z: -0.25 });
  p.add(ring(0.2, 0.025, 20), mat(ROLES.gold), { y: 0.83 });
  p.add(cyl(0.015, 0.025, 0.45, 5), mat(ROLES.gold), { y: 1.2, z: -0.25 });
  p.add(ball(0.05, 0), mat(c.accent, 'emissive'), { y: 1.45, z: -0.25 });
  p.add(obox(0.36, 0.05, 0.02), mat(c.accent, 'emissive'), { y: 0.55, z: 0.16 });
  // Five engines in a bank at the stern, in a housing.
  p.add(obox(0.95, 0.22, 0.3, 0.04), mat(c.secondary), { y: 0.2, z: -1.4 });
  for (const x of [-0.34, -0.17, 0, 0.17, 0.34]) nozzle(p, c, x, 0.2, -1.6, 0.075);
  // Six gun mounts with gold bases: four broadside, two on the bow.
  for (const s of [-1, 1]) {
    gun(p, ROLES.gold, ROLES.dark, s * 0.42, 0.44, 0.6, 0.09, 0.3);
    gun(p, ROLES.gold, ROLES.dark, s * 0.42, 0.44, -0.6, 0.09, 0.3);
    gun(p, ROLES.gold, ROLES.dark, s * 0.14, 0.34, 1.0, 0.08, 0.22);
  }
  return p.group;
};

export const LINE_B_SHIP_ART: Readonly<Record<string, ShipArt>> = {
  jammer,
  'flak-picket': flakPicket,
  'boarding-corvette': boardingCorvette,
  'tractor-tender': tractorTender,
  'drop-ship': dropShip,
  'assault-carrier': assaultCarrier,
  'repair-tender': repairTender,
  dreadnought,
  leviathan,
  monolith,
  flagship,
};
