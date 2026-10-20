import * as THREE from 'three';
import type { ShipKit } from '../ShipKit';
import type { ShipStyleGenerator } from '../ShipStyleGenerator';
import { technologicalAccent } from './accents';

/**
 * Angular, engineered hulls: faceted armour, swept nacelles, command towers, light strips.
 * Four archetypes, picked per seed. The size tier (from length and bulk) adds decks,
 * armour belts and superstructure to the bigger ones, so a frigate and a capital ship
 * do not share one silhouette scaled up.
 */

type Mat = THREE.Material;
type Rot = readonly [number, number, number];
const NO_ROT: Rot = [0, 0, 0];
const mid = (a: number, b: number) => (a + b) / 2;

/** A box, tilted by `rot`. Returned unplaced: the caller adds it (or mirrors it) at a point. */
function slab(kit: ShipKit, mat: Mat, w: number, h: number, d: number, rot: Rot = NO_ROT): THREE.Mesh {
  const m = kit.box(w, h, d, mat);
  m.rotation.set(rot[0], rot[1], rot[2]);
  return m;
}

/**
 * A section along z from z0 (rear) to z1 (front), radius r0 at the rear and r1 at the front.
 * `sides` 4, 6 or 8 gives the faceted cross-sections; `roll` turns it (pi/8 on eight sides
 * leaves a flat top). Returned unplaced, centred on its own length: add it at the midpoint.
 */
function seg(kit: ShipKit, mat: Mat, r0: number, r1: number, z0: number, z1: number, sides = 8, roll = 0): THREE.Mesh {
  const m = kit.cyl(Math.max(r1, 0.002), Math.max(r0, 0.002), Math.abs(z1 - z0), mat, sides);
  m.rotation.z = roll;
  return m;
}

/** Ring-shaped profile for kit.lathe: a torus of major radius `R` and minor radius `r`, in (radius, z). */
function torus(R: number, r: number, sides: number): Array<[number, number]> {
  return Array.from({ length: sides + 1 }, (_, k) => {
    const a = (k / sides) * Math.PI * 2;
    return [R + r * Math.cos(a), r * Math.sin(a)] as [number, number];
  });
}

/** A small emissive light, set flush on a surface. */
function lamp(kit: ShipKit, x: number, y: number, z: number, s: number): void {
  kit.add(slab(kit, kit.mat.accent, s, s, s), 'detail', x, y, z);
}

/**
 * Engine nozzles across the stern. Up to three sit in one row; more form two staggered rows;
 * with `ring`, a cluster round the centre line (science ship). Engines take their radius from
 * the spacing, so a crowded bank shrinks rather than overlapping.
 */
function engines(kit: ShipKit, half: number, z: number, shape: 'round' | 'square', ring = false): void {
  const n = kit.design.engines;
  const base = kit.B * 0.12;
  if (ring && n >= 3) {
    const r = Math.min(base, 0.42 * 2 * half * Math.sin(Math.PI / n));
    for (const [x, y] of kit.ringSlots(n, half)) kit.engine(x, y, z, r, shape);
    return;
  }
  const rows = n > 3 ? [Math.ceil(n / 2), Math.floor(n / 2)] : [n];
  rows.forEach((k, row) => {
    const spacing = k > 1 ? (2 * half) / (k - 1) : Infinity;
    const r = Math.min(base, 0.42 * spacing);
    const y = rows.length === 1 ? 0 : (row === 0 ? 1 : -1) * base * 1.05;
    for (const x of kit.symmetricSlots(k, half)) kit.engine(x, y, z, r, shape);
  });
}

interface Mount { x: number; y: number; z: number }

/**
 * Turrets for kit.design.weapons: a centre-line mount first when the count is odd, then
 * mirrored pairs from `pairs` (each x is the outboard offset), front to back. Sinks each
 * base a little into its surface.
 */
function turrets(kit: ShipKit, size: number, centre: readonly Mount[], pairs: readonly Mount[]): void {
  const n = kit.design.weapons;
  const plan: Mount[] = [];
  if (n % 2 === 1) plan.push(centre[0]);
  for (const p of pairs) {
    if (plan.length >= n) break;
    plan.push(p);
    if (plan.length < n) plan.push({ x: -p.x, y: p.y, z: p.z });
  }
  for (const m of plan) kit.turret(m.x, m.y - size * 0.1, m.z, size, 1);
}

/** Small blocks scattered over a deck, so they read as clutter rather than a row. */
function greebles(kit: ShipKit, count: number, xSpan: number, zFrom: number, zTo: number, y: number): void {
  const { B, L, rng, mat } = kit;
  for (let i = 0; i < count; i++) {
    const s = B * rng.range(0.04, 0.09);
    const x = rng.range(-xSpan, xSpan) * B;
    const z = rng.range(zFrom, zTo) * L;
    kit.add(slab(kit, mat.detail, s, s * 0.6, s * rng.range(1.2, 2.2)), 'detail', x, y + s * 0.3, z);
  }
}

/**
 * Long arrowhead destroyer: an octagonal spine with a square spike nose, plates stacked up
 * the aft block, a dorsal command tower and swept delta wings.
 */
function arrowhead(kit: ShipKit, tier: number): void {
  const { L, B, rng, mat } = kit;
  const R = B * 0.42;
  const oct = Math.PI / 8;
  kit.add(seg(kit, mat.hull, R, R, -0.5 * L, 0, 8, oct), 'hull', 0, 0, -0.25 * L);
  kit.add(seg(kit, mat.hull, R, R * 0.8, 0, 0.26 * L, 8, oct), 'hull', 0, 0, mid(0, 0.26 * L));
  kit.add(seg(kit, mat.hull, R * 0.8, R * 0.1, 0.26 * L, 0.5 * L, 4, Math.PI / 4), 'hull', 0, 0, mid(0.26 * L, 0.5 * L));

  // Stacked armour: plates that step up and back over the aft block, alternating colours.
  let top = R * 0.92;
  const layers = tier > 0.5 ? 3 : 2;
  const layer0Top = top + R * 0.22;
  for (let i = 0; i < layers; i++) {
    const h = R * 0.22;
    kit.add(slab(kit, i % 2 ? mat.hull : mat.detail, B * (0.72 - i * 0.2), h, L * (0.4 - i * 0.12)), 'hull', 0, top + h / 2, (-0.27 + i * 0.09) * L);
    top += h;
  }
  // Dorsal command tower on the top plate, with a sensor mast and dish.
  kit.add(slab(kit, mat.hull, R, R * 0.9, L * 0.12), 'hull', 0, top + R * 0.45, -0.1 * L);
  kit.add(kit.cyl(B * 0.012, B * 0.02, R, mat.detail, 6), 'detail', 0, top + R * 1.4, -0.1 * L);
  kit.add(kit.sphere(R * 0.7, mat.detail, 1, 0.22, 1, 12), 'detail', 0, top + R * 1.95, -0.1 * L);

  // Swept delta wings with upturned tip fins.
  const sweep = rng.range(0.45, 0.8);
  const wx = B * 0.36, wy = -R * 0.2, wz = -0.2 * L;
  kit.addMirrored(() => slab(kit, mat.hull, B * 0.85, R * 0.1, L * 0.28, [0, sweep, 0]), 'wing', wx, wy, wz);
  const tipX = wx + B * 0.425 * Math.cos(sweep), tipZ = wz - B * 0.425 * Math.sin(sweep);
  kit.addMirrored(() => slab(kit, mat.detail, B * 0.04, R * 0.9, L * 0.1), 'wing', tipX, R * 0.3, tipZ);
  lamp(kit, tipX, wy + R * 0.1, tipZ, B * 0.03);
  lamp(kit, -tipX, wy + R * 0.1, tipZ, B * 0.03);
  lamp(kit, 0, 0, 0.5 * L, B * 0.03);

  // Light strips down the flanks of the aft block.
  kit.addMirrored(() => slab(kit, mat.accent, B * 0.02, R * 0.08, L * 0.36), 'detail', R * 0.98, 0, -0.25 * L);

  engines(kit, R * 0.7, -0.5 * L + 0.2 * B * 0.12, 'square');

  // Mounts: the spine and armour top on the centre line, wings and flanks in pairs.
  const size = B * 0.065;
  turrets(kit, size, [{ x: 0, y: layer0Top, z: -0.36 * L }], [
    { x: wx + 0.22 * B * Math.cos(sweep), y: wy + R * 0.05, z: wz - 0.22 * B * Math.sin(sweep) },
    { x: 0.2 * B, y: layer0Top, z: -0.25 * L },
    { x: wx + 0.34 * B * Math.cos(sweep), y: wy + R * 0.05, z: wz - 0.34 * B * Math.sin(sweep) },
    { x: 0.2 * B, y: layer0Top, z: -0.42 * L },
  ]);
  greebles(kit, Math.round(4 + tier * 6), 0.3, -0.44, -0.12, layer0Top);
}

/**
 * Twin-nacelle cruiser: an octagonal hull with a hex nose, two warp nacelles on swept pylons,
 * a dorsal command tower with a dish. Bigger ones get an armour belt and a second tower.
 */
function twinNacelle(kit: ShipKit, tier: number): void {
  const { L, B, rng, mat } = kit;
  const R = B * 0.4;
  const base = B * 0.12;
  const nx = B * rng.range(0.6, 0.68);
  const nR = R * 0.6;
  const nY = R * 0.1;
  const nz0 = -0.46 * L, nz1 = 0.3 * L;
  const sweep = rng.range(0.15, 0.4);

  kit.add(seg(kit, mat.hull, R * 1.1, R * 0.85, -0.5 * L, 0.18 * L, 8, Math.PI / 8), 'hull', 0, 0, mid(-0.5 * L, 0.18 * L));
  kit.add(seg(kit, mat.hull, R * 0.85, R * 0.12, 0.18 * L, 0.5 * L, 6, Math.PI / 6), 'hull', 0, 0, mid(0.18 * L, 0.5 * L));

  // Nacelles, each on a swept pylon, with a light strip along the top.
  kit.addMirrored(() => seg(kit, mat.hull, nR, nR * 0.8, nz0, nz1, 8, Math.PI / 8), 'wing', nx, nY, mid(nz0, nz1));
  kit.addMirrored(() => slab(kit, mat.accent, nR * 0.16, nR * 0.16, L * 0.5), 'detail', nx, nY + nR * 0.95, mid(nz0, nz1) - 0.02 * L);
  const px = (nx + R * 0.5) / 2;
  kit.addMirrored(() => slab(kit, mat.hull, (nx - R * 0.5) * 1.1, R * 0.14, L * 0.12, [0, sweep * 0.4, 0]), 'wing', px, nY, -0.14 * L);
  lamp(kit, nx, nY, nz1 + B * 0.02, B * 0.03);
  lamp(kit, -nx, nY, nz1 + B * 0.02, B * 0.03);

  // Dorsal command tower, mast and dish.
  const towerZ = -0.12 * L, towerY = R * 1.2;
  kit.add(slab(kit, mat.hull, R * 0.9, R * 0.8, L * 0.16), 'hull', 0, towerY, towerZ);
  kit.add(kit.cyl(B * 0.012, B * 0.02, R, mat.detail, 6), 'detail', 0, towerY + R * 0.9, towerZ);
  kit.add(kit.sphere(R * 0.7, mat.detail, 1, 0.2, 1, 12), 'detail', 0, towerY + R * 1.45, towerZ);

  if (tier > 0.5) {
    // Capital ships: an armour flange round the hull, and a second, smaller tower aft of the nose.
    kit.add(seg(kit, mat.detail, R * 1.2, R * 1.2, -0.28 * L, -0.23 * L, 8, Math.PI / 8), 'detail', 0, 0, -0.255 * L);
    kit.add(slab(kit, mat.detail, R * 0.6, R * 0.5, L * 0.1), 'detail', 0, R * 1.08, 0.05 * L);
  }

  engines(kit, nx, nz0 + 0.2 * base, 'round');

  const size = B * 0.065;
  turrets(kit, size, [{ x: 0, y: R * 0.8, z: 0.12 * L }], [
    { x: nx, y: nY + nR * 0.9, z: 0.1 * L },
    { x: nx, y: nY + nR * 0.9, z: -0.3 * L },
    { x: R * 0.2, y: R * 0.9, z: -0.3 * L },
    { x: R * 0.2, y: R * 0.95, z: -0.44 * L },
  ]);
  greebles(kit, Math.round(3 + tier * 5), 0.25, 0.15, 0.4, R * 0.8);
}

/**
 * Blocky carrier: a hull block with a stepped bow, a wide flight-deck slab, an island tower
 * to starboard, hangar bays along the flanks and a rear engine housing.
 */
function carrier(kit: ShipKit, tier: number): void {
  const { L, B, mat } = kit;
  const hh = B * 0.24;
  const deckY = hh + B * 0.05;

  kit.add(slab(kit, mat.hull, B * 0.78, hh * 2, L * 0.7), 'hull', 0, 0, -0.1 * L);
  kit.add(slab(kit, mat.hull, B * 0.6, hh * 1.5, L * 0.16), 'hull', 0, -hh * 0.2, 0.36 * L);
  kit.add(seg(kit, mat.hull, B * 0.2, B * 0.05, 0.44 * L, 0.5 * L, 4, Math.PI / 4), 'hull', 0, -hh * 0.2, 0.47 * L);

  // Flight deck: a slab wider than the hull, edged with light strips.
  kit.add(slab(kit, mat.detail, B * 1.0, B * 0.05, L * 0.62), 'hull', 0, hh + B * 0.025, -0.06 * L);
  kit.addMirrored(() => slab(kit, mat.accent, B * 0.02, B * 0.02, L * 0.6), 'detail', B * 0.49, deckY, -0.06 * L);

  // Island tower to starboard, with a window band, radar mast and dish.
  const ix = 0.3 * B, iz = 0.02 * L, ih = B * 0.3;
  kit.add(slab(kit, mat.hull, B * 0.2, ih, L * 0.14), 'hull', ix, deckY + ih / 2, iz);
  kit.add(slab(kit, mat.accent, B * 0.01, ih * 0.12, L * 0.1), 'detail', ix + B * 0.1, deckY + ih * 0.7, iz);
  kit.add(kit.cyl(B * 0.012, B * 0.02, B * 0.4, mat.detail, 6), 'detail', ix, deckY + ih + B * 0.2, iz);
  kit.add(kit.sphere(B * 0.1, mat.detail, 1, 0.22, 1, 12), 'detail', ix, deckY + ih + B * 0.4, iz);

  // Hangar bays: recessed panels down both flanks.
  kit.addMirrored(() => slab(kit, mat.detail, B * 0.02, hh * 1.2, L * 0.4), 'detail', 0.4 * B, 0, -0.22 * L);

  if (tier > 0.5) {
    // Capital ships: an aft superstructure deck on the flight deck.
    kit.add(slab(kit, mat.hull, B * 0.4, B * 0.14, L * 0.14), 'hull', -0.15 * B, deckY + B * 0.07, -0.3 * L);
  }

  // Engine housing across the stern, engines set into it.
  kit.add(slab(kit, mat.detail, B * 0.8, hh * 1.8, L * 0.05), 'detail', 0, 0, -0.475 * L);
  engines(kit, B * 0.24, -0.5 * L + 0.2 * B * 0.12, 'square');

  const size = B * 0.065;
  turrets(kit, size, [{ x: 0, y: deckY, z: 0.12 * L }, { x: 0, y: deckY, z: -0.36 * L }], [
    { x: 0.36 * B, y: deckY, z: 0.2 * L },
    { x: 0.36 * B, y: deckY, z: -0.2 * L },
    { x: 0.2 * B, y: deckY, z: -0.1 * L },
    { x: 0.36 * B, y: deckY, z: -0.4 * L },
  ]);
  greebles(kit, Math.round(4 + tier * 6), 0.35, -0.3, 0.2, deckY);
}

/**
 * Ring-hulled science ship: a spine through a hexagonal ring with an inner light band, spokes,
 * a hub, a forward sensor dish and a cluster of engines round the spine's stern.
 */
function ringHull(kit: ShipKit, tier: number): void {
  const { L, B, rng, mat } = kit;
  const R = B * 0.36;
  const zr = rng.range(-0.12, 0.12) * L;
  const Rr = B * rng.range(0.55, 0.62);
  const t = B * 0.09;

  kit.add(seg(kit, mat.hull, R * 0.7, R * 0.45, -0.5 * L, 0.3 * L, 6, Math.PI / 6), 'hull', 0, 0, mid(-0.5 * L, 0.3 * L));
  kit.add(seg(kit, mat.detail, R * 0.45, R * 0.18, 0.3 * L, 0.5 * L, 6, 0), 'detail', 0, 0, mid(0.3 * L, 0.5 * L));
  kit.add(kit.sphere(R * 0.9, mat.hull, 1, 1, 1.5, 12), 'hull', 0, 0, zr);

  // The ring stands across the hull, in the yz plane, so the spine runs through its centre like
  // an axle and the ring reads as a full circle from the side. Hexagonal section, light band inside.
  const ring = kit.lathe(torus(Rr, t, 6), mat.hull, 12);
  ring.rotation.y = Math.PI / 2;
  kit.add(ring, 'hull', 0, 0, zr);
  const band = kit.lathe(torus(Rr - t * 0.8, t * 0.3, 4), mat.accent, 12);
  band.rotation.y = Math.PI / 2;
  kit.add(band, 'detail', 0, 0, zr);

  const spokes = 2 + Math.round(tier * 2);
  const a0 = rng.range(0, Math.PI / 2);
  for (let k = 0; k < spokes; k++) {
    const a = a0 + (k / spokes) * Math.PI * 2;
    // Spokes run from the hub out to the rim, in the ring's plane.
    kit.add(slab(kit, mat.detail, R * 0.16, Rr, R * 0.2, [a, 0, 0]), 'detail', 0, (Math.cos(a) * Rr) / 2, zr + (Math.sin(a) * Rr) / 2);
  }

  // Sensor mast on the hub, and a forward-facing dish on the boom.
  kit.add(kit.cyl(B * 0.012, B * 0.02, B * 0.3, mat.detail, 6), 'detail', 0, B * 0.48, zr);
  lamp(kit, 0, B * 0.64, zr, B * 0.04);
  kit.add(kit.sphere(R * 0.9, mat.detail, 1, 1, 0.18, 14), 'detail', 0, 0, 0.5 * L);

  engines(kit, B * 0.2, -0.5 * L + 0.2 * B * 0.12, 'round', true);

  // Mounts: the top of the ring on the centre line; the spine's flanks in pairs.
  const size = B * 0.065;
  const rim = Rr + t;
  turrets(kit, size, [{ x: 0, y: rim, z: zr }], [
    { x: 0.2 * B, y: 0, z: -0.2 * L },
    { x: 0.2 * B, y: 0, z: 0.12 * L },
    { x: 0.14 * B, y: 0.14 * B, z: -0.4 * L },
    { x: 0.14 * B, y: 0.14 * B, z: 0.25 * L },
  ]);
  greebles(kit, Math.round(2 + tier * 4), 0.2, -0.4, 0.2, R * 0.45);
}

/** Picks an archetype from the seed and builds it, sized by the design's length and bulk. */
export const TechnologicalStyle: ShipStyleGenerator = {
  id: 'technological',
  name: 'Technological',
  description: 'Faceted, engineered hulls: stacked armour, swept nacelles, command towers and light strips.',
  accent: technologicalAccent,
  flatShading: true,
  build(kit: ShipKit) {
    // 0 nimble frigate .. 1 capital ship, from the mean of length and bulk.
    const tier = Math.min(1, Math.max(0, ((kit.design.length + kit.design.bulk) / 2 - 0.6) / 1.2));
    const archetype = kit.rng.pick(['arrow', 'twin', 'carrier', 'ring'] as const);
    if (archetype === 'arrow') arrowhead(kit, tier);
    else if (archetype === 'twin') twinNacelle(kit, tier);
    else if (archetype === 'carrier') carrier(kit, tier);
    else ringHull(kit, tier);
  },
};
