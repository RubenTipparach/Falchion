import * as THREE from 'three';
import type { PartType, ShipKit } from '../ShipKit';
import type { ShipStyleGenerator } from '../ShipStyleGenerator';
import { geometricAccent } from './accents';

/** A revolved profile: [radius, z] pairs running front to back. */
type Profile = ReadonlyArray<readonly [number, number]>;

/** Primitives are built along z; `aim` turns one onto a direction. */
const FWD = new THREE.Vector3(0, 0, 1);
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/**
 * Alien precision built from pure solids: faceted crystals, pyramids, monoliths and rings that
 * float apart from the core on glowing struts, in radial (3, 4, 6 fold) and bilateral symmetry.
 * Four archetypes per seed; the design's size adds pieces (single shard, ship, cathedral).
 */
export const GeometricStyle: ShipStyleGenerator = {
  id: 'geometric',
  name: 'Simple Geometry',
  description: 'Faceted crystals, pyramids and monoliths floating on glowing struts, in strict symmetry.',
  accent: geometricAccent,
  flatShading: true,
  build(kit: ShipKit) {
    const archetype = kit.rng.pick(['core', 'spear', 'pyramid', 'monolith'] as const);
    if (archetype === 'core') buildCore(kit);
    else if (archetype === 'spear') buildSpear(kit);
    else if (archetype === 'pyramid') buildPyramid(kit);
    else buildMonolith(kit);
  },
};

// ── Archetype 1: an octahedral core with an orbiting ring ───────────────

function buildCore(kit: ShipKit): void {
  const { L, B, rng, mat } = kit;
  const tier = tierOf(kit);

  kit.add(kit.lathe([[0, L * 0.46], [B * 0.62, 0], [0, -L * 0.46]], mat.hull, 4), 'hull');

  // A hexagonal-section halo round the core, braced to it by glowing spokes.
  const R = B * rng.range(1.1, 1.3);
  const spokes = rng.pick([3, 4, 6]);
  kit.add(new THREE.Mesh(new THREE.TorusGeometry(R, B * 0.06, 6, 24), mat.detail), 'wing');
  for (let i = 0; i < spokes; i++) {
    const a = (i / spokes) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
    strut(kit, V(c * B * 0.2, s * B * 0.2, 0), V(c * R, s * R, 0), B * 0.05, mat.accent);
    glint(kit, V(c * R, s * R, 0), B * 0.1);
  }

  if (tier >= 1) {
    // A tilted second ring, and a crystal spire off the nose.
    const tilt = new THREE.Mesh(new THREE.TorusGeometry(R * 0.82, B * 0.05, 6, 24), mat.hull);
    tilt.rotation.x = Math.PI / 2;
    kit.add(tilt, 'wing');
    const len = L * 0.4;
    crystal(kit, mat.hull, 'hull', V(0, 0, L * 0.46 + len * 0.3), FWD, len, B * 0.22);
  }
  if (tier >= 2) {
    // Two more octahedra, stacked fore and aft and turned 45 degrees from the core.
    for (const [z, k] of [[L * 0.3, 0.7], [-L * 0.3, 0.8]]) {
      const oct = crystal(kit, mat.detail, 'hull', V(0, 0, z), FWD, L * 0.6 * k, B * 0.6 * k);
      oct.rotation.z = Math.PI / 4;
    }
  }

  // A lone engine sits past the core's tip; a ring hangs off the halo at mid-length.
  const single = kit.design.engines === 1;
  pylonEngines(kit, kit.design.engines, R, single ? L * 0.52 : L * 0.36, (x, y) => (single ? V(0, 0, -L * 0.46) : V(x, y, 0)), B * 0.08);
  ringTurrets(kit, kit.design.weapons, 0, B * 0.47, B * 0.07);
}

// ── Archetype 2: a long faceted spear with crystals round it ────────────

function spearProfile(L: number, B: number): Profile {
  return [[0.0001, L * 0.5], [B * 0.3, L * 0.3], [B * 0.36, L * 0.1], [B * 0.36, -L * 0.3], [B * 0.24, -L * 0.42], [0.0001, -L * 0.5]];
}

function buildSpear(kit: ShipKit): void {
  const { L, B, rng, mat } = kit;
  const tier = tierOf(kit);
  const profile = spearProfile(L, B);
  kit.add(kit.lathe(profile, mat.hull, 6), 'hull');
  if (tier === 2) {
    // A hexagonal nave bulging round the spear's middle: the cathedral's crossing.
    const nave: Profile = [[0.0001, L * 0.14], [B * 0.56, L * 0.04], [B * 0.56, -L * 0.1], [B * 0.4, -L * 0.2], [0.0001, -L * 0.2]];
    kit.add(kit.lathe(nave, mat.detail, 6), 'hull', 0, 0, 0);
    // Tall spires above and below the crossing, joined to the nave by glowing struts.
    for (const side of [1, -1]) {
      const len = L * 0.3, cen = V(0, side * (B * 0.6 + len * 0.4), -L * 0.04);
      strut(kit, V(0, side * B * 0.3, -L * 0.04), V(0, side * B * 0.6, -L * 0.04), B * 0.04, mat.accent);
      crystal(kit, mat.hull, 'hull', cen, V(0, side, 0.15), len, B * 0.22);
    }
  }

  // Crystals ring the spear, floating off its flank on glowing connectors.
  const n = rng.pick([3, 4, 6]);
  const rows = tier === 2 ? [L * 0.16, -L * 0.24] : [L * 0.1];
  rows.forEach((z, row) => {
    const rs = radiusAt(profile, z);
    for (let i = 0; i < n; i++) {
      const a = ((i + row * 0.5) / n) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
      const dir = V(c, s, 0.3).normalize();
      const surf = V(c * rs, s * rs, z);
      const len = B * rng.range(1.0, 1.4);
      const cen = surf.clone().addScaledVector(dir, B * 0.2 + len / 2);
      const base = cen.clone().addScaledVector(dir, -len / 2);
      strut(kit, surf, base, B * 0.03, mat.accent);
      glint(kit, base, B * 0.07);
      crystal(kit, mat.detail, 'wing', cen, dir, len, B * 0.16);
    }
  });

  if (tier >= 1) {
    // Swept blades either side, mirrored about the spine.
    const z = -L * 0.12, rs = radiusAt(profile, z), len = L * 0.34;
    for (const side of [1, -1]) {
      const dir = V(side * 0.85, 0, -0.5).normalize();
      crystal(kit, mat.hull, 'wing', V(side * rs * 0.6, 0, z).addScaledVector(dir, len / 2), dir, len, B * 0.14);
    }
  }

  pylonEngines(kit, kit.design.engines, B * 0.22, L * 0.5, (x, y) => V(x * 0.5, y * 0.5, -L * 0.38), B * 0.08);
  ringTurrets(kit, kit.design.weapons, L * 0.22, radiusAt(profile, L * 0.22) * 0.95, B * 0.07);
}

// ── Archetype 3: a pyramid mothership, or a star of two pyramids ────────

function buildPyramid(kit: ShipKit): void {
  const { L, B, rng, mat } = kit;
  const tier = tierOf(kit);
  // A triangular pyramid, apex forward and base aft; the largest is a star: two bipyramids turned 60 degrees.
  const profile: Profile = tier === 2
    ? [[0.0001, L * 0.5], [B * 0.62, 0], [0.0001, -L * 0.5]]
    : [[0.0001, L * 0.5], [B * 0.62, -L * 0.5], [0.0001, -L * 0.5]];
  const body = kit.lathe(profile, mat.hull, 3);
  body.rotation.z = Math.PI / 6;
  kit.add(body, 'hull');
  if (tier === 2) {
    const twin = kit.lathe(profile, mat.detail, 3);
    twin.rotation.z = Math.PI / 6 + Math.PI / 3;
    kit.add(twin, 'hull');
  }

  if (tier >= 1) {
    // A crystal spire off the apex.
    const len = L * 0.35;
    crystal(kit, mat.hull, 'hull', V(0, 0, L * 0.5 + len * 0.3), FWD, len, B * 0.1);
  }

  // Tetrahedra orbit the body in threes, joined by glowing struts.
  const layers = tier === 0 ? [{ z: -L * 0.02, off: 0 }]
    : tier === 1 ? [{ z: -L * 0.12, off: rng.range(0, 1) }]
    : [{ z: L * 0.1, off: 0 }, { z: -L * 0.25, off: Math.PI / 3 }];
  for (const { z, off } of layers) {
    const rs = radiusAt(profile, z);
    for (let i = 0; i < 3; i++) {
      const a = off + (i / 3) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
      const r = B * (tier === 0 ? 0.34 : 0.28);
      const cen = V(c * (rs + B * 0.5), s * (rs + B * 0.5), z);
      const tet = new THREE.Mesh(new THREE.TetrahedronGeometry(r), mat.detail);
      tet.rotation.z = a;
      kit.add(tet, 'wing', cen.x, cen.y, cen.z);
      strut(kit, V(c * rs, s * rs, z), cen.clone().addScaledVector(V(c, s, 0), -r * 0.9), B * 0.025, mat.accent);
      glint(kit, V(c * rs, s * rs, z), B * 0.05);
    }
  }

  pylonEngines(kit, kit.design.engines, B * 0.2, L * 0.56, (x, y) => V(x * 0.25, y * 0.25, -L * 0.42), B * 0.08);
  ringTurrets(kit, kit.design.weapons, L * 0.05, radiusAt(profile, L * 0.05) * 0.95, B * 0.07);
}

// ── Archetype 4: a monolith of stacked, twisted plates ──────────────────

function buildMonolith(kit: ShipKit): void {
  const { L, B, rng, mat } = kit;
  const tier = tierOf(kit);

  // An obelisk: a square column with pointed ends.
  const column: Profile = [[0.0001, L * 0.5], [B * 0.46, L * 0.3], [B * 0.46, -L * 0.3], [0.0001, -L * 0.5]];
  const obelisk = kit.lathe(column, mat.hull, 4);
  obelisk.rotation.z = Math.PI / 4;
  kit.add(obelisk, 'hull');

  // Plates stacked along the column, each turned a little further than the last: a fan.
  const plates = tier === 0 ? 2 : tier === 1 ? 3 : 5;
  const twist = rng.range(0.3, 0.6);
  const W = B * (1.7 + 0.3 * tier);
  for (let i = 0; i < plates; i++) {
    const z = L * (-0.3 + (0.6 * i) / Math.max(1, plates - 1)), th = i * twist;
    const plate = kit.box(W, B * 0.08, L * 0.07, mat.detail);
    plate.rotation.z = th;
    kit.add(plate, 'wing', 0, 0, z);
    for (const side of [1, -1]) glint(kit, V(side * Math.cos(th) * W / 2, side * Math.sin(th) * W / 2, z), B * 0.05);
  }

  // Rose-window discs fore (and aft on the largest), each on a short strut from the column.
  if (tier >= 1) {
    const dR = B * (1.1 + 0.2 * tier), zf = L * 0.5 + B * 0.4;
    kit.add(kit.lathe([[0.0001, B * 0.05], [dR, B * 0.05], [dR, -B * 0.05], [0.0001, -B * 0.05]], mat.hull, 6), 'wing', 0, 0, zf);
    strut(kit, V(0, 0, L * 0.45), V(0, 0, zf - B * 0.04), B * 0.03, mat.accent);
    if (tier >= 2) {
      const zb = -L * 0.5 - B * 0.3;
      kit.add(kit.lathe([[0.0001, B * 0.05], [dR * 0.8, B * 0.05], [dR * 0.8, -B * 0.05], [0.0001, -B * 0.05]], mat.hull, 6), 'wing', 0, 0, zb);
      strut(kit, V(0, 0, -L * 0.45), V(0, 0, zb + B * 0.04), B * 0.03, mat.accent);
    }
  }

  pylonEngines(kit, kit.design.engines, B * 0.35, L * 0.56, (x, y) => V(x * 0.6, y * 0.6, -L * 0.36), B * 0.08);
  ringTurrets(kit, kit.design.weapons, 0, radiusAt(column, 0) * 0.95, B * 0.06);
}

// ── Shared pieces ───────────────────────────────────────────────────────

/** 0: a single shard, 1: a ship, 2: a cathedral; by the design's length times bulk. */
function tierOf(kit: ShipKit): number {
  const s = kit.design.length * kit.design.bulk;
  return s < 1 ? 0 : s < 2.2 ? 1 : 2;
}

/** A profile's radius at z, interpolated between its points. */
function radiusAt(profile: Profile, z: number): number {
  for (let i = 0; i < profile.length - 1; i++) {
    const [r0, z0] = profile[i], [r1, z1] = profile[i + 1];
    if (z0 === z1) continue;
    const t = (z - z0) / (z1 - z0);
    if (t >= 0 && t <= 1) return r0 + (r1 - r0) * t;
  }
  return 0;
}

/** Turn a z-built object so its axis runs along dir. */
function aim<T extends THREE.Object3D>(m: T, dir: THREE.Vector3): T {
  m.quaternion.setFromUnitVectors(FWD, dir.clone().normalize());
  return m;
}

/** A faceted crystal: a four-sided bipyramid, centred at `centre`, its axis along dir. */
function crystal(kit: ShipKit, material: THREE.Material, type: PartType, centre: THREE.Vector3, dir: THREE.Vector3, len: number, girth: number): THREE.Mesh {
  const m = aim(kit.lathe([[0, len / 2], [girth, 0], [0, -len / 2]], material, 4), dir);
  kit.add(m, type, centre.x, centre.y, centre.z);
  return m;
}

/** A glowing strut between two points (a hexagonal rod, so it reads as a facet, not a wire). */
function strut(kit: ShipKit, a: THREE.Vector3, b: THREE.Vector3, r: number, material: THREE.Material): void {
  const d = b.clone().sub(a), len = d.length();
  if (len < 1e-3) return;
  const rod = aim(kit.cyl(r, r, len, material, 6), d);
  const mid = a.clone().lerp(b, 0.5);
  kit.add(rod, 'detail', mid.x, mid.y, mid.z);
}

/** A small glowing octahedron: a light where two pieces meet. */
function glint(kit: ShipKit, p: THREE.Vector3, r: number): void {
  kit.add(new THREE.Mesh(new THREE.OctahedronGeometry(r), kit.mat.glow), 'detail', p.x, p.y, p.z);
}

/**
 * Engines hung on glowing pylons: a ring of `count` nozzles at depth zNozzle (aft, so given positive),
 * each with a strut from `from(x, y)`. One engine sits on the axis.
 */
function pylonEngines(kit: ShipKit, count: number, ringR: number, zNozzle: number, from: (x: number, y: number) => THREE.Vector3, size: number): void {
  const pts: Array<[number, number]> = count === 1 ? [[0, 0]] : kit.ringSlots(count, ringR);
  for (const [x, y] of pts) {
    strut(kit, from(x, y), V(x, y, -zNozzle), size * 0.35, kit.mat.accent);
    kit.engine(x, y, -zNozzle, size, 'square');
  }
}

/** Weapons spread round the hull at z, each base on the surface (mounted up or down). */
function ringTurrets(kit: ShipKit, count: number, z: number, radius: number, size: number): void {
  for (let i = 0; i < count; i++) {
    const a = ((i + 0.5) / count) * Math.PI * 2;
    kit.turret(Math.cos(a) * radius, Math.sin(a) * radius, z, size, Math.sin(a) >= 0 ? 1 : -1);
  }
}
