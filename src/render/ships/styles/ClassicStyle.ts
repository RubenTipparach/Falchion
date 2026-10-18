import * as THREE from 'three';
import type { ShipKit } from '../ShipKit';
import type { ShipStyleGenerator } from '../ShipStyleGenerator';
import { classicAccent } from './accents';

/**
 * Aesthetic / classic: elegant, symmetrical, retro-futurist. Smooth lathed hulls, swept wings and
 * graceful pylons, with gold trim on rims, spires and fin edges. Four archetypes, chosen per seed
 * and by size: small ships are pulp rockets and yachts (couriers, fighters), mid ships also get
 * saucer cruisers, and the large ones are saucer flagships or tiered galleons. Forward is +z.
 */
export const ClassicStyle: ShipStyleGenerator = {
  id: 'classic',
  name: 'Aesthetic / Classic',
  description: 'Saucer cruisers, pulp rockets, swept-wing yachts and tiered galleon flagships.',
  accent: classicAccent,
  build(kit: ShipKit) {
    const size = (kit.design.length + kit.design.bulk) / 2;
    const pool: Archetype[] = size < 1.1 ? ['rocket', 'yacht'] : size < 1.6 ? ['saucer', 'rocket', 'yacht'] : ['saucer', 'galleon'];
    const kind = kit.rng.pick(pool);
    if (kind === 'saucer') buildSaucer(kit, size);
    else if (kind === 'rocket') buildRocket(kit);
    else if (kind === 'yacht') buildYacht(kit);
    else buildGalleon(kit, size);
  },
};

type Archetype = 'saucer' | 'rocket' | 'yacht' | 'galleon';
/** Lathe or outline points: [radius, z] for a body of revolution, [x, y] for a planar shape. */
type Profile = Array<[number, number]>;

const TAU = Math.PI * 2;

// ── Shapes ─────────────────────────────────────────────────────────────

/**
 * A body of revolution along z: a rounded nose of length `nose` ending on the axis, a straight
 * waist, then a rounded tail (tailR 0) or a flat transom of radius tailR. Closed through the axis.
 */
function bodyProfile(R: number, front: number, back: number, nose: number, tail: number, tailR: number, n = 6): Profile {
  const pts: Profile = [[0, front]];
  for (let i = 1; i <= n; i++) {
    const a = (Math.PI / 2) * (i / n);
    pts.push([R * Math.sin(a), front - nose + nose * Math.cos(a)]);
  }
  const waistEnd = back + tail;
  if (front - nose > waistEnd + 1e-6) pts.push([R, waistEnd]);
  if (tail > 1e-6) {
    for (let i = 1; i <= 4; i++) {
      const a = (Math.PI / 2) * (i / 4);
      pts.push([tailR + (R - tailR) * Math.cos(a), back + tail - tail * Math.sin(a)]);
    }
  } else {
    pts.push([tailR, back]);
  }
  if (tailR > 1e-6) pts.push([0, back]);
  return pts;
}

/** A saucer section: a lens with a domed top and a shallower underside, from the top centre over the rim. */
function lensProfile(R: number, top: number, bottom: number, n = 6): Profile {
  const pts: Profile = [];
  for (let i = 0; i <= n; i++) {
    const a = (Math.PI / 2) * (1 - i / n);
    pts.push([R * Math.cos(a), top * Math.sin(a)]);
  }
  for (let i = 1; i <= n; i++) {
    const a = -(Math.PI / 2) * (i / n);
    pts.push([R * Math.cos(a), bottom * Math.sin(a)]);
  }
  return pts;
}

/** A planar outline extruded to `depth` and centred on zero thickness, in the x (across) / y (up) plane. */
function plate(points: Profile, depth: number): THREE.ExtrudeGeometry {
  const shape = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
  return new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, steps: 1, curveSegments: 1 }).translate(0, 0, -depth / 2);
}

/** A torus around the z axis (a band or trim ring), or lying flat when `flat`. */
function ring(radius: number, tube: number, material: THREE.Material, flat = false): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.TorusGeometry(radius, tube, 5, 20), material);
  if (flat) m.rotation.x = Math.PI / 2;
  return m;
}

/** A small light: a low-poly sphere (lights are a few pixels at thumbnail size). */
function light(r: number, material: THREE.Material): THREE.Mesh {
  return new THREE.Mesh(new THREE.SphereGeometry(r, 5, 4), material);
}

/** A lathe profile laid flat with its axis up (profile [radius, height]). */
function flatLathe(kit: ShipKit, profile: Profile, material: THREE.Material, segments: number): THREE.Mesh {
  const m = kit.lathe(profile, material, segments);
  m.rotation.x = -Math.PI / 2;
  return m;
}

/** Rocket body radius at t (0 = tail, 1 = nose tip): a flared nozzle, a straight body, a needle nose. */
function rocketRadius(t: number, Rm: number): number {
  if (t < 0.1) return Rm * (0.55 + 0.45 * Math.sin((Math.PI / 2) * (t / 0.1)));
  if (t < 0.6) return Rm * (1 + 0.03 * Math.sin((Math.PI * (t - 0.1)) / 0.5));
  return Rm * Math.pow(1 - ((t - 0.6) / 0.4) ** 2, 0.8);
}

/** Engines in a row across the stern, or two staggered rows when there are more than three. */
function engineRack(kit: ShipKit, n: number, spread: number, y: number, z: number, r: number): void {
  if (n <= 3) {
    for (const x of kit.symmetricSlots(n, spread)) kit.engine(x, y, z, r);
    return;
  }
  const top = Math.ceil(n / 2);
  for (const x of kit.symmetricSlots(top, spread)) kit.engine(x, y + r * 1.2, z, r * 0.85);
  for (const x of kit.symmetricSlots(n - top, spread * 0.7)) kit.engine(x, y - r * 1.2, z, r * 0.85);
}

/**
 * Turrets along a deck between zFrom and zTo: port and starboard in pairs at ±xs, and an odd
 * last one on the centreline. `surfaceY` gives the deck height at an x offset.
 */
function deckTurrets(kit: ShipKit, n: number, zFrom: number, zTo: number, xs: number, surfaceY: (x: number) => number): void {
  const size = kit.B * 0.05;
  const rows = Math.ceil(n / 2);
  for (let i = 0; i < n; i++) {
    const row = Math.floor(i / 2);
    const z = rows === 1 ? zTo : zFrom + ((zTo - zFrom) * row) / (rows - 1);
    const x = i === n - 1 && n % 2 === 1 ? 0 : i % 2 === 0 ? -xs : xs;
    kit.turret(x, surfaceY(x) - size * 0.2, z, size, 1);
  }
}

// ── Archetypes ─────────────────────────────────────────────────────────

/** Federation-style saucer on a neck, over a long secondary hull with two nacelles on pylons. */
function buildSaucer(kit: ShipKit, size: number): void {
  const { L, B, rng, mat } = kit;
  const R = B * rng.range(0.85, 1.0);
  const s = L * 0.2; // saucer centre along z
  const h = B * 0.36; // saucer centre height
  const top = B * 0.16;
  const tall = size >= 1.5;

  kit.add(flatLathe(kit, lensProfile(R, top, B * 0.05, 4), mat.hull, 20), 'hull', 0, h, s);
  kit.add(ring(R * 0.98, B * 0.022, mat.gold, true), 'detail', 0, h, s);

  // Large saucers add a second, smaller deck on the dome.
  let crown = h + top;
  if (tall) {
    const r2 = R * 0.6;
    const y2 = h + top * 0.8 - B * 0.01;
    kit.add(flatLathe(kit, lensProfile(r2, B * 0.09, B * 0.03, 3), mat.hull, 16), 'hull', 0, y2, s);
    kit.add(ring(r2 * 0.99, B * 0.02, mat.gold, true), 'detail', 0, y2, s);
    crown = y2 + B * 0.09;
  }

  // Bridge cupola with a gold collar.
  const cr = R * 0.2;
  const cupBase = crown - B * 0.03;
  kit.add(flatLathe(kit, [[0, 0], [cr, 0], [cr, cr * 0.35], [cr * 0.8, cr * 0.7], [cr * 0.45, cr * 0.95], [0, cr * 1.05]], mat.detail, 12), 'detail', 0, cupBase, s);

  // Running lights round the rim.
  const lights = size >= 1.2 ? 8 : 6;
  for (let i = 0; i < lights; i++) {
    const a = (i / lights) * TAU;
    kit.add(light(B * 0.03, mat.accent), 'detail', Math.cos(a) * R * 0.99, h, s + Math.sin(a) * R * 0.99);
  }

  // Turrets on the saucer's top, outside the deck.
  const ringR = tall ? 0.8 : 0.62;
  const yT = h + top * Math.sqrt(1 - ringR * ringR);
  for (let i = 0; i < kit.design.weapons; i++) {
    const a = (i / kit.design.weapons) * TAU + 0.4;
    kit.turret(Math.cos(a) * R * ringR, yT - B * 0.02, s + Math.sin(a) * R * ringR, B * 0.05, 1);
  }

  // Secondary hull under the saucer, joined by a tapered neck.
  const h2 = h - B * 0.28;
  const rs = B * 0.2;
  const fz = s - R * 0.45;
  const tailZ = -L / 2;
  const len2 = fz - tailZ;
  kit.add(kit.lathe(bodyProfile(rs, fz, tailZ, len2 * 0.28, len2 * 0.14, rs * 0.5, 4), mat.hull, 16), 'hull', 0, h2, 0);

  const ay = h - B * 0.03, az = s - R * 0.3;
  const by = h2 + rs * 0.3, bz = s - R * 0.7;
  const neck = kit.cyl(B * 0.09, B * 0.11, Math.hypot(by - ay, bz - az), mat.hull, 12);
  neck.rotation.x = Math.atan2(-(by - ay), bz - az);
  kit.add(neck, 'hull', 0, (ay + by) / 2, (az + bz) / 2);

  // Nacelles on graceful pylons, with gold collars at their noses.
  const nz = -L * 0.12, nx = B * 0.62, ny = h2 + B * 0.12;
  const Ln = L * 0.3, rn = B * 0.15;
  const nFront = nz + Ln / 2, nBack = nz - Ln / 2;
  kit.addMirrored(() => kit.lathe(bodyProfile(rn, nFront, nBack, rn * 1.1, Ln * 0.3, rn * 0.55, 3), mat.hull, 14), 'hull', nx, ny, 0);
  kit.addMirrored(() => ring(rn * 0.99, rn * 0.07, mat.gold), 'detail', nx, ny, nFront - rn * 1.1);

  const px0 = rs * 0.4, py0 = h2 + B * 0.02;
  const pdx = nx - px0, pdy = ny - py0;
  kit.addMirrored(() => {
    const p = kit.box(B * 0.08, Math.hypot(pdx, pdy), L * 0.035, mat.hull);
    p.rotation.z = Math.atan2(-pdx, pdy);
    return p;
  }, 'detail', (px0 + nx) / 2, (py0 + ny) / 2, nz);

  // Engines: one centre engine on the hull, or pairs in the nacelle tails.
  const n = kit.design.engines;
  const pairs = Math.floor(n / 2);
  if (n % 2 === 1) kit.engine(0, h2, tailZ + B * 0.03, B * 0.085);
  if (pairs > 0) {
    const rE = pairs === 1 ? rn * 0.42 : rn * 0.26;
    for (const sx of [-1, 1]) {
      for (const [dx, dy] of kit.ringSlots(pairs, rn * 0.22)) kit.engine(sx * nx + dx, ny + dy, nBack + rE * 0.3, rE);
    }
  }
}

/** A pulp rocket: a bulbous body with a long needle nose, three swept gold-edged tail fins. */
function buildRocket(kit: ShipKit): void {
  const { L, B, rng, mat } = kit;
  const Rm = B * 0.36;
  const z0 = -L / 2;
  const at = (t: number): number => z0 + t * L;

  const prof: Profile = [[0, z0]];
  for (let i = 0; i <= 12; i++) prof.push([rocketRadius(i / 12, Rm), at(i / 12)]);
  kit.add(kit.lathe(prof, mat.hull, 20), 'hull');

  // Three fins at 12, 8 and 4 o'clock, swept back, each with a gold leading edge.
  const sweep = L * rng.range(0.22, 0.3);
  const zRF = at(0.4), zRB = at(0.04), zTF = zRF - sweep, zTB = zTF - L * 0.12;
  const v0 = Rm * 0.6, vT = Rm * rng.range(1.8, 2.05);
  const finPts: Profile = [[zRF, v0], [zTF, vT], [zTB, vT], [zRB, v0]];
  const edgePts: Profile = [[zRF, v0], [zTF, vT], [zTF + L * 0.03, vT], [zRF + L * 0.03, v0]];
  for (let i = 0; i < 3; i++) {
    const g = new THREE.Group();
    const fin = new THREE.Mesh(plate(finPts, B * 0.07), mat.hull);
    const edge = new THREE.Mesh(plate(edgePts, B * 0.1), mat.gold);
    fin.rotation.y = -Math.PI / 2;
    edge.rotation.y = -Math.PI / 2;
    g.add(fin, edge);
    g.rotation.z = (i / 3) * TAU;
    kit.add(g, 'wing');
  }

  // Gold bands round the body, and a row of portholes along each flank.
  for (const t of [0.2, 0.66]) kit.add(ring(rocketRadius(t, Rm), B * 0.02, mat.gold), 'detail', 0, 0, at(t));
  for (const t of [0.14, 0.24, 0.32]) {
    kit.addMirrored(() => light(B * 0.03, mat.accent), 'detail', rocketRadius(t, Rm) * 0.98, 0, at(t));
  }
  kit.add(light(B * 0.03, mat.accent), 'detail', 0, 0, at(0.985));

  // Turrets ringing the body just ahead of the fins.
  const wz = at(0.5), wr = rocketRadius(0.5, Rm) * 0.97;
  for (let i = 0; i < kit.design.weapons; i++) {
    const a = (i / kit.design.weapons) * TAU;
    kit.turret(Math.cos(a) * wr, Math.sin(a) * wr, wz, B * 0.05, Math.sin(a) >= 0 ? 1 : -1);
  }

  // Engine bell: one nozzle, or a ring of them.
  const n = kit.design.engines;
  if (n === 1) kit.engine(0, 0, z0 + Rm * 0.1, Rm * 0.42);
  else for (const [x, y] of kit.ringSlots(n, Rm * 0.3)) kit.engine(x, y, z0 + Rm * 0.1, Rm * 0.2);
}

/** A swept-wing royal yacht: a flattened hull with a glass canopy, swept wings with gold leading edges, a gold tail fin. */
function buildYacht(kit: ShipKit): void {
  const { L, B, rng, mat } = kit;
  const R = B * 0.5;
  const front = L * 0.47, back = -L * 0.45;

  const hull = kit.lathe(bodyProfile(R, front, back, L * 0.24, L * 0.12, B * 0.4, 4), mat.hull, 20);
  hull.scale.y = 0.42;
  kit.add(hull, 'hull');

  const canopy = kit.lathe(bodyProfile(B * 0.2, L * 0.22, -L * 0.02, L * 0.08, L * 0.08, 0, 3), mat.accent, 12);
  canopy.scale.y = 0.6;
  kit.add(canopy, 'detail', 0, B * 0.2, 0);

  // A gold stripe along each flank.
  kit.addMirrored(() => kit.cyl(B * 0.012, B * 0.012, L * 0.45, mat.gold, 6), 'detail', R * 0.99, 0, -L * 0.025);

  // Swept wings: one planform through the hull, leading edges trimmed in gold.
  const sp = B * 1.15;
  const zRF = L * 0.14, sw = L * rng.range(0.18, 0.26), zRB = -L * 0.2;
  const tipF = zRF - sw, tipB = tipF - L * 0.16;
  const wing = new THREE.Mesh(plate([[0, zRF], [sp, tipF], [sp, tipB], [0, zRB], [-sp, tipB], [-sp, tipF]], B * 0.05), mat.hull);
  wing.rotation.x = Math.PI / 2;
  kit.add(wing, 'wing');
  const lead = Math.hypot(sp, sw), lean = Math.atan2(sw, sp);
  kit.addMirrored(() => {
    const b = kit.box(lead, B * 0.03, B * 0.05, mat.gold);
    b.rotation.y = lean;
    return b;
  }, 'detail', sp / 2, 0, (zRF + tipF) / 2);
  kit.addMirrored(() => light(B * 0.03, mat.accent), 'detail', sp, 0, (tipF + tipB) / 2);

  // A gold swept tail fin on the stern.
  const tailFin = new THREE.Mesh(plate([[back + L * 0.22, B * 0.1], [back + L * 0.12, B * 0.55], [back + L * 0.02, B * 0.55], [back, B * 0.1]], B * 0.05), mat.gold);
  tailFin.rotation.y = -Math.PI / 2;
  kit.add(tailFin, 'wing');

  engineRack(kit, kit.design.engines, B * 0.26, 0, back + B * 0.03, B * 0.08);
  deckTurrets(kit, kit.design.weapons, L * 0.18, -L * 0.28, B * 0.3, (x) => B * 0.21 * Math.sqrt(Math.max(0, 1 - (x / R) ** 2)));
}

/** A long galleon-like flagship: a pointed prow, three stepped gold-banded decks at the stern, a gold spire. */
function buildGalleon(kit: ShipKit, size: number): void {
  const { L, B, mat } = kit;
  const R = B * 0.44;
  const front = L * 0.5, back = -L * 0.5;
  const hullTop = R * 0.6;

  const hull = kit.lathe(bodyProfile(R, front, back, L * 0.34, L * 0.06, B * 0.32, 4), mat.hull, 20);
  hull.scale.y = 0.6;
  kit.add(hull, 'hull');
  const belt = ring(R * 0.98, B * 0.022, mat.gold);
  belt.scale.y = 0.6;
  kit.add(belt, 'detail', 0, 0, L * 0.08);
  kit.addMirrored(() => kit.cyl(B * 0.012, B * 0.012, L * 0.7, mat.gold, 5), 'detail', R * 0.99, 0, L * 0.02);

  // Stepped decks, each a rounded tier narrower and higher than the one below.
  const tiers = size >= 1.8 ? 3 : 2;
  const sy = 0.7;
  let base = hullTop - B * 0.08;
  let lastTop = base, lastZ = 0;
  for (let k = 0; k < tiers; k++) {
    const Rk = B * (0.36 - 0.08 * k);
    const len = L * (0.5 - 0.1 * k);
    const zb = back + L * (0.03 + 0.04 * k);
    const zf = zb + len;
    const yc = base + Rk * sy;
    const tier = kit.lathe(bodyProfile(Rk, zf, zb, len * 0.3, len * 0.3, 0, 3), k === 0 ? mat.detail : mat.hull, 14);
    tier.scale.y = sy;
    kit.add(tier, 'hull', 0, yc, 0);
    if (k < tiers - 1) {
      const band = ring(Rk * 0.99, B * 0.018, mat.gold);
      band.scale.y = sy;
      kit.add(band, 'detail', 0, yc, zb + len * 0.5);
    }
    lastTop = yc + Rk * sy;
    lastZ = zb + len / 2;
    base = lastTop - B * 0.05;
  }

  // Gold spire on the top deck, and a bowsprit forward.
  kit.add(new THREE.Mesh(new THREE.ConeGeometry(B * 0.05, B * 1.1, 8), mat.gold), 'detail', 0, lastTop + B * 0.5, lastZ);
  const sy0 = 0.1 * B, sy1 = 0.42 * B, sz0 = L * 0.4, sz1 = L * 0.56;
  const sprit = kit.cyl(B * 0.02, B * 0.012, Math.hypot(sy1 - sy0, sz1 - sz0), mat.gold, 6);
  sprit.rotation.x = Math.atan2(-(sy1 - sy0), sz1 - sz0);
  kit.add(sprit, 'detail', 0, (sy0 + sy1) / 2, (sz0 + sz1) / 2);

  deckTurrets(kit, kit.design.weapons, L * 0.42, L * 0.1, B * 0.24, (x) => hullTop * Math.sqrt(Math.max(0, 1 - (x / R) ** 2)));
  engineRack(kit, kit.design.engines, B * 0.26, -B * 0.05, back + B * 0.03, B * 0.08);
}
