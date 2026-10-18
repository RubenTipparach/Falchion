import * as THREE from 'three';
import type { ShipKit } from '../ShipKit';
import type { ShipStyleGenerator } from '../ShipStyleGenerator';
import { classicAccent } from './accents';

/**
 * Classic: gothic cathedral warships, after Battlefleet Gothic, with Roman and art deco variants.
 * A long armoured hull behind a diamond ram, a nave of decks stepping up toward a spired bridge
 * tower at the stern, flying buttresses down the flanks, broadside batteries on gun decks, gilt
 * bands and an eagle on the prow, a ribbed keel below and a bank of great nozzles astern. Four
 * archetypes, chosen per seed and by size: frigates, cruisers, grand cathedral battleships, and
 * (at any size) a basilica with colonnades and an art deco ziggurat tower. Forward is +z.
 */
export const ClassicStyle: ShipStyleGenerator = {
  id: 'classic',
  name: 'Classic',
  description: 'Gothic cathedral warships: armoured prows, spired towers, flying buttresses, broadside batteries and gilt.',
  accent: classicAccent,
  build(kit: ShipKit) {
    const size = (kit.design.length + kit.design.bulk) / 2;
    const pool: Archetype[] = size < 1.1 ? ['frigate', 'frigate', 'basilica'] : size < 1.6 ? ['cruiser', 'cruiser', 'basilica'] : ['battleship', 'battleship', 'basilica'];
    const kind = kit.rng.pick(pool);
    if (kind === 'frigate') buildFrigate(kit);
    else if (kind === 'cruiser') buildCruiser(kit);
    else if (kind === 'battleship') buildBattleship(kit);
    else buildBasilica(kit, size);
  },
};

type Archetype = 'frigate' | 'cruiser' | 'battleship' | 'basilica';
/** Outline points: [z, y] for a side profile, [x, y] for a cross-section. */
type Profile = Array<[number, number]>;

/** The armoured hull every archetype stands on: where its decks are and how wide it is. */
interface Hull {
  readonly W: number;
  readonly yb: number;
  readonly yt: number;
  readonly zStern: number;
  readonly zProw: number;
}

const UP = new THREE.Vector3(0, 1, 0);

// ── Shapes ─────────────────────────────────────────────────────────────

/** A side profile ([z, y] points) extruded `width` across the ship, centred on x = 0. */
function sideSlab(points: Profile, width: number): THREE.ExtrudeGeometry {
  const shape = new THREE.Shape(points.map(([z, y]) => new THREE.Vector2(z, y)));
  const geo = new THREE.ExtrudeGeometry(shape, { depth: width, bevelEnabled: false, steps: 1, curveSegments: 1 });
  // Shape x becomes z (forward), the extrusion runs across x.
  return geo.translate(0, 0, -width / 2).rotateY(-Math.PI / 2);
}

/** A cross-section ([x, y] points) extruded `length` along z, centred on z = 0. */
function section(points: Profile, length: number): THREE.ExtrudeGeometry {
  const shape = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
  return new THREE.ExtrudeGeometry(shape, { depth: length, bevelEnabled: false, steps: 1, curveSegments: 1 }).translate(0, 0, -length / 2);
}

/** A square member from a to b (buttresses, struts). */
function strut(kit: ShipKit, a: THREE.Vector3, b: THREE.Vector3, t: number, material: THREE.Material): void {
  const dir = b.clone().sub(a);
  const m = kit.box(t, dir.length(), t * 0.7, material);
  m.quaternion.setFromUnitVectors(UP, dir.normalize());
  kit.add(m, 'detail', (a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
}

/** A cone standing up: spires (8 sides) and pinnacles (4 sides). */
function cone(r: number, h: number, sides: number, material: THREE.Material): THREE.Mesh {
  return new THREE.Mesh(new THREE.ConeGeometry(r, h, sides), material);
}

/** A column standing up. */
function column(r: number, h: number, material: THREE.Material): THREE.Mesh {
  return new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.1, h, 6), material);
}

// ── Parts ──────────────────────────────────────────────────────────────

/**
 * The armoured hull: a slab with a vertical prow face, its stern rounded up from the keel; a
 * diamond ram in front, gilt at its root; a keel spine with ribs below.
 */
function hull(kit: ShipKit, W: number, yb: number, yt: number, ribs: number): Hull {
  const { L, B, mat } = kit;
  const zStern = -L / 2 + B * 0.05, zProw = L * 0.3;
  const H = yt - yb;
  // Hexagonal in section: a flat deck, upright sides, flanks sloping in to a narrow keel.
  const body = new THREE.Mesh(section([
    [-W * 0.5, yt], [-W * 0.5, yb + H * 0.5], [-W * 0.28, yb], [W * 0.28, yb], [W * 0.5, yb + H * 0.5], [W * 0.5, yt],
  ], zProw - zStern), mat.hull);
  kit.add(body, 'hull', 0, 0, (zProw + zStern) / 2);
  // The ram: a diamond in section, from the prow face to the bow.
  const ramLen = L / 2 - zProw;
  const ram = new THREE.Mesh(new THREE.ConeGeometry(1, ramLen, 4, 1).rotateX(Math.PI / 2), mat.hull);
  ram.scale.set(W * 0.6, H * 0.64, 1);
  kit.add(ram, 'hull', 0, yb + H * 0.5, zProw + ramLen / 2 - B * 0.01);
  // The prow's armour: a block broader and taller than the hull, framed in gilt.
  kit.add(kit.box(W * 1.2, H * 1.3, L * 0.06, mat.hull), 'hull', 0, yb + H * 0.5, zProw - L * 0.025);
  kit.add(kit.box(W * 1.26, H * 1.36, L * 0.012, mat.gold), 'detail', 0, yb + H * 0.5, zProw - L * 0.055);
  // The beak: a gilded tip.
  const beak = new THREE.Mesh(new THREE.ConeGeometry(1, ramLen * 0.3, 4, 1).rotateX(Math.PI / 2), mat.gold);
  beak.scale.set(W * 0.17, H * 0.155, 1);
  kit.add(beak, 'detail', 0, yb + H * 0.5, L / 2 - ramLen * 0.15);
  // Keel spine and ribs.
  kit.add(kit.box(B * 0.05, B * 0.07, zProw - zStern - L * 0.12, mat.detail), 'detail', 0, yb - B * 0.03, (zProw + zStern) / 2 - L * 0.02);
  for (let i = 0; i < ribs; i++) {
    const z = zStern + L * 0.1 + ((zProw - zStern - L * 0.24) * i) / Math.max(1, ribs - 1);
    kit.add(kit.box(W * 0.75, B * 0.045, B * 0.035, mat.detail), 'detail', 0, yb - B * 0.02, z);
  }
  // A gilt band round the stern.
  kit.add(kit.box(W * 1.03, H * 0.6, B * 0.03, mat.gold), 'detail', 0, yb + H * 0.6, zStern + L * 0.06);
  return { W, yb, yt, zStern, zProw };
}

/**
 * The nave: decks stepping up from the bow toward the stern (`steps` of them), `w` wide and `h`
 * tall at the stern, with rows of lit windows down its flanks. Returns its top at a given z.
 */
function nave(kit: ShipKit, zFrom: number, zTo: number, yBase: number, h: number, w: number, steps: number, material: THREE.Material): (z: number) => number {
  const pts: Profile = [[zFrom, yBase], [zFrom, yBase + h]];
  const heights: number[] = [];
  for (let i = 0; i < steps; i++) {
    const hi = h * (1 - (0.5 * i) / steps);
    heights.push(hi);
    const z = zFrom + ((zTo - zFrom) * (i + 1)) / steps;
    pts.push([z, yBase + hi]);
    if (i < steps - 1) pts.push([z, yBase + h * (1 - (0.5 * (i + 1)) / steps)]);
  }
  pts.push([zTo, yBase]);
  kit.add(new THREE.Mesh(sideSlab(pts, w), material), 'hull');
  // A gabled roof over each step, ridges of the cathedral's nave.
  for (let i = 0; i < steps; i++) {
    const z0 = zFrom + ((zTo - zFrom) * i) / steps, z1 = zFrom + ((zTo - zFrom) * (i + 1)) / steps;
    const roof = new THREE.Mesh(section([[-w * 0.5, 0], [w * 0.5, 0], [0, w * 0.32]], (z1 - z0) * 0.98), kit.mat.detail);
    kit.add(roof, 'hull', 0, yBase + heights[i], (z0 + z1) / 2);
    // Pinnacles along the eaves: the cathedral's spiky skyline.
    const n = Math.max(2, Math.round((z1 - z0) / (w * 0.45)));
    for (let k = 0; k < n; k++) {
      const z = z0 + ((z1 - z0) * (k + 0.5)) / n;
      kit.addMirrored(() => cone(w * 0.05, w * 0.42, 4, kit.mat.detail), 'detail', w * 0.5, yBase + heights[i] + w * 0.21, z);
    }
  }
  const top = (z: number): number => {
    const i = Math.min(steps - 1, Math.max(0, Math.floor(((z - zFrom) / (zTo - zFrom)) * steps)));
    return yBase + heights[i];
  };
  // Lit windows: one row per step on each flank.
  const { mat } = kit;
  for (let i = 0; i < steps; i++) {
    const z0 = zFrom + ((zTo - zFrom) * i) / steps, z1 = zFrom + ((zTo - zFrom) * (i + 1)) / steps;
    const len = (z1 - z0) * 0.7;
    kit.addMirrored(() => kit.box(0.008, heights[i] * 0.22, len, mat.accent), 'detail', w / 2 + 0.004, yBase + heights[i] * 0.55, (z0 + z1) / 2);
  }
  return top;
}

/**
 * A gothic tower: a square body with lancet windows, a gilt band, an octagonal spire with a gold
 * tip, and four pinnacles round its foot. Returns the spire's tip height.
 */
function tower(kit: ShipKit, x: number, yBase: number, z: number, w: number, h: number, spireH: number): number {
  const { mat } = kit;
  kit.add(kit.box(w, h, w, mat.hull), 'hull', x, yBase + h / 2, z);
  kit.add(kit.box(w * 1.08, h * 0.06, w * 1.08, mat.gold), 'detail', x, yBase + h, z);
  for (const dx of [-w * 0.2, w * 0.2]) {
    kit.add(kit.box(w * 0.13, h * 0.5, 0.012, mat.accent), 'detail', x + dx, yBase + h * 0.55, z + w / 2 + 0.004);
  }
  kit.addMirrored(() => kit.box(0.012, h * 0.5, w * 0.13, mat.accent), 'detail', x + w / 2 + 0.004, yBase + h * 0.55, z);
  const top = yBase + h;
  kit.add(cone(w * 0.42, spireH, 8, mat.detail), 'detail', x, top + spireH / 2, z);
  kit.add(cone(w * 0.1, spireH * 0.28, 6, mat.gold), 'detail', x, top + spireH * 0.95, z);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    kit.add(cone(w * 0.12, spireH * 0.5, 4, mat.detail), 'detail', x + sx * w * 0.44, top + spireH * 0.25, z + sz * w * 0.44);
    kit.add(cone(w * 0.03, spireH * 0.12, 4, mat.gold), 'detail', x + sx * w * 0.44, top + spireH * 0.53, z + sz * w * 0.44);
  }
  return top + spireH * 1.09;
}

/**
 * Flying buttresses on both flanks at each z: a pier standing on the gun deck outside the hull,
 * a gilt pinnacle on it, and an arm leaning in to the nave wall.
 */
function buttresses(kit: ShipKit, hl: Hull, zs: readonly number[], naveHalf: number, naveTop: (z: number) => number): void {
  const { mat } = kit;
  const H = hl.yt - hl.yb, t = hl.W * 0.06;
  const xOut = hl.W / 2 + hl.W * 0.08;
  const bottom = hl.yb + H * 0.74, top = hl.yt + H * 0.5;
  for (const z of zs) {
    const yIn = hl.yt + (naveTop(z) - hl.yt) * 0.85;
    for (const sx of [-1, 1]) {
      kit.add(kit.box(t * 1.2, top - bottom, t * 1.6, mat.detail), 'detail', sx * xOut, (top + bottom) / 2, z);
      kit.add(cone(t * 0.8, H * 0.6, 4, mat.gold), 'detail', sx * xOut, top + H * 0.3, z);
      strut(kit, new THREE.Vector3(sx * xOut, top - H * 0.1, z), new THREE.Vector3(sx * naveHalf, yIn, z), t, mat.detail);
    }
  }
}

/** Gun decks down each flank: a sponson with lit gun ports, from zFrom to zTo. Returns their x and top. */
function gunDecks(kit: ShipKit, hl: Hull, zFrom: number, zTo: number): { x: number; top: number } {
  const { mat } = kit;
  const w = hl.W * 0.17, h = (hl.yt - hl.yb) * 0.38;
  const x = hl.W / 2 + w / 2 - w * 0.1, y = hl.yb + (hl.yt - hl.yb) * 0.55;
  const len = zTo - zFrom;
  kit.addMirrored(() => kit.box(w, h, len, mat.detail), 'detail', x, y, (zFrom + zTo) / 2);
  const ports = Math.max(3, Math.round(len / (w * 2.2)));
  for (let i = 0; i < ports; i++) {
    const z = zFrom + (len * (i + 0.5)) / ports;
    kit.addMirrored(() => kit.box(0.01, h * 0.35, len / ports * 0.45, mat.accent), 'detail', x + w / 2 + 0.004, y - h * 0.05, z);
  }
  return { x, top: y + h / 2 };
}

/**
 * Broadside batteries: turrets in port/starboard pairs along the gun decks from the bow aft, and
 * an odd last one on the foredeck.
 */
function broadsides(kit: ShipKit, n: number, deck: { x: number; top: number }, zFrom: number, zTo: number, foredeck: { y: number; z: number }): void {
  const size = deck.x * 0.16;
  const pairs = Math.floor(n / 2);
  for (let i = 0; i < pairs; i++) {
    const z = pairs === 1 ? (zFrom + zTo) / 2 : zTo - ((zTo - zFrom) * i) / (pairs - 1);
    kit.turret(-deck.x, deck.top + size * 0.3, z, size, 1);
    kit.turret(deck.x, deck.top + size * 0.3, z, size, 1);
  }
  if (n % 2 === 1) kit.turret(0, foredeck.y + size * 0.3, foredeck.z, size, 1);
}

/** The eagle on the prow's armour: two gilt wings spread up and out from a head, facing forward. */
function aquila(kit: ShipKit, y: number, z: number, span: number): void {
  const { mat } = kit;
  kit.addMirrored(() => {
    const wing = kit.box(span * 0.5, span * 0.13, span * 0.05, mat.gold);
    wing.rotation.z = 0.38;
    return wing;
  }, 'detail', span * 0.25, y + span * 0.08, z);
  kit.add(kit.sphere(span * 0.08, mat.gold, 1, 1.2, 1, 8), 'detail', 0, y + span * 0.02, z + span * 0.02);
}

/** The engine bank: great nozzles across the stern, two rows when there are more than three. */
function engineBank(kit: ShipKit, hl: Hull): void {
  const { B } = kit;
  const n = kit.design.engines;
  const y = hl.yb + (hl.yt - hl.yb) * 0.5, z = hl.zStern - B * 0.02;
  const spread = hl.W * 0.32;
  if (n <= 3) {
    for (const x of kit.symmetricSlots(n, spread)) kit.engine(x, y, z, B * (n === 1 ? 0.14 : 0.1));
    return;
  }
  const top = Math.ceil(n / 2), r = B * 0.075;
  for (const x of kit.symmetricSlots(top, spread)) kit.engine(x, y + r * 1.15, z, r);
  for (const x of kit.symmetricSlots(n - top, spread * 0.75)) kit.engine(x, y - r * 1.15, z, r);
}

/**
 * The citadel at the stern: tiers stepping back and up like a cathedral's west front, each
 * banded in gilt with lit windows on its face. Returns the top tier's top, z and width.
 */
function citadel(kit: ShipKit, zBack: number, zFront: number, yBase: number, w: number, tiers: number, tierH: number): { top: number; z: number; w: number } {
  const { mat } = kit;
  let y = yBase, wk = w, zf = zFront;
  for (let k = 0; k < tiers; k++) {
    const len = zf - zBack;
    kit.add(kit.box(wk, tierH, len, k % 2 ? mat.detail : mat.hull), 'hull', 0, y + tierH / 2, zBack + len / 2);
    kit.add(kit.box(wk * 1.04, tierH * 0.08, len * 1.02, mat.gold), 'detail', 0, y + tierH, zBack + len / 2);
    const lancets = Math.max(2, Math.round(wk / (tierH * 0.35)));
    for (let j = 0; j < lancets; j++) {
      const x = -wk * 0.4 + (wk * 0.8 * j) / Math.max(1, lancets - 1);
      kit.add(kit.box(wk * 0.05, tierH * 0.5, 0.012, mat.accent), 'detail', x, y + tierH * 0.5, zf + 0.004);
    }
    kit.addMirrored(() => kit.box(0.012, tierH * 0.3, len * 0.6, mat.accent), 'detail', wk / 2 + 0.004, y + tierH * 0.5, zBack + len / 2);
    y += tierH;
    wk *= 0.74;
    zf -= len * 0.3;
  }
  return { top: y, z: (zBack + zf) / 2, w: wk / 0.74 };
}

// ── Archetypes ─────────────────────────────────────────────────────────

/**
 * The height unit: towers and decks must stand tall against a long hull, so heights grow with
 * the ship's length as well as its bulk. The hull's width does the same, more gently.
 */
const unit = (kit: ShipKit): number => kit.B * 0.5 + kit.L * 0.085;
const width = (kit: ShipKit, k: number): number => Math.max(kit.B * k * 1.15, kit.L * 0.13);

/** A frigate: a ram, a short two-step nave, one spired tower at the stern, a pair of buttresses. */
function buildFrigate(kit: ShipKit): void {
  const { L, mat } = kit;
  const U = unit(kit);
  const hl = hull(kit, width(kit, 0.55), -U * 0.26, U * 0.14, 3);
  const naveW = hl.W * 0.7;
  const top = nave(kit, -L * 0.3, L * 0.08, hl.yt, U * 0.44, naveW, 2, mat.hull);
  const c = citadel(kit, hl.zStern + L * 0.02, -L * 0.26, hl.yt, hl.W * 0.9, 2, U * 0.4);
  tower(kit, 0, c.top, c.z, c.w * 0.6, U * 0.5, U * 1.5);
  buttresses(kit, hl, [-L * 0.1, L * 0.02], naveW / 2, top);
  const deck = gunDecks(kit, hl, -L * 0.3, L * 0.2);
  broadsides(kit, kit.design.weapons, deck, -L * 0.24, L * 0.17, { y: hl.yt, z: L * 0.2 });
  aquila(kit, (hl.yt + hl.yb) / 2 + (hl.yt - hl.yb) * 0.15, hl.zProw + 0.012, hl.W * 0.95);
  engineBank(kit, hl);
}

/** A cruiser: a three-step nave, a great tower flanked by two lesser spires, three buttresses a side. */
function buildCruiser(kit: ShipKit): void {
  const { L, mat } = kit;
  const U = unit(kit);
  const hl = hull(kit, width(kit, 0.6), -U * 0.28, U * 0.14, 5);
  const naveW = hl.W * 0.72;
  const top = nave(kit, -L * 0.28, L * 0.16, hl.yt, U * 0.5, naveW, 3, mat.hull);
  const c = citadel(kit, hl.zStern + L * 0.02, -L * 0.2, hl.yt, hl.W * 0.92, 3, U * 0.42);
  const tw = c.w * 0.6;
  tower(kit, 0, c.top, c.z, tw, U * 0.55, U * 1.8);
  for (const sx of [-1, 1]) tower(kit, sx * hl.W * 0.36, hl.yt + U * 0.42, -L * 0.22, naveW * 0.22, U * 0.45, U * 1.0);
  buttresses(kit, hl, [-L * 0.2, -L * 0.05, L * 0.1], naveW / 2, top);
  const deck = gunDecks(kit, hl, -L * 0.36, L * 0.22);
  broadsides(kit, kit.design.weapons, deck, -L * 0.3, L * 0.2, { y: hl.yt, z: L * 0.23 });
  aquila(kit, (hl.yt + hl.yb) / 2 + (hl.yt - hl.yb) * 0.15, hl.zProw + 0.012, hl.W);
  engineBank(kit, hl);
}

/**
 * A grand cathedral battleship: a four-step nave under a second, narrower tier, a great tower
 * with two lesser spires at the stern and a fore tower amidships, four buttresses a side.
 */
function buildBattleship(kit: ShipKit): void {
  const { L, mat } = kit;
  const U = unit(kit);
  const hl = hull(kit, width(kit, 0.62), -U * 0.3, U * 0.14, 6);
  const naveW = hl.W * 0.74, h = U * 0.56;
  const lower = nave(kit, -L * 0.3, L * 0.2, hl.yt, h, naveW, 4, mat.hull);
  const upperW = naveW * 0.62;
  nave(kit, -L * 0.28, -L * 0.04, hl.yt + h * 0.6, h * 0.4 + U * 0.3, upperW, 2, mat.detail);
  const c = citadel(kit, hl.zStern + L * 0.02, -L * 0.22, hl.yt, hl.W * 0.94, 4, U * 0.4);
  const tw = c.w * 0.62;
  tower(kit, 0, c.top, c.z, tw, U * 0.55, U * 2.0);
  for (const sx of [-1, 1]) tower(kit, sx * hl.W * 0.38, hl.yt + U * 0.4, -L * 0.24, naveW * 0.24, U * 0.7, U * 1.1);
  const fz = L * 0.05;
  tower(kit, 0, lower(fz), fz, naveW * 0.4, U * 0.4, U * 1.2);
  buttresses(kit, hl, [-L * 0.26, -L * 0.13, L * 0.0, L * 0.13], naveW / 2, lower);
  const deck = gunDecks(kit, hl, -L * 0.38, L * 0.24);
  broadsides(kit, kit.design.weapons, deck, -L * 0.32, L * 0.22, { y: hl.yt, z: L * 0.25 });
  aquila(kit, (hl.yt + hl.yb) / 2 + (hl.yt - hl.yb) * 0.15, hl.zProw + 0.012, hl.W * 1.05);
  engineBank(kit, hl);
}

/**
 * A basilica: Roman and art deco. A temple on the hull (a stylobate, colonnades down both sides,
 * a pitched roof with a gilt pediment over a lit cella), a stepped ziggurat tower at the stern
 * with gilt deco fins and a crown, and gilt speed lines down the flanks.
 */
function buildBasilica(kit: ShipKit, size: number): void {
  const { L, mat } = kit;
  const U = unit(kit);
  const hl = hull(kit, width(kit, 0.6), -U * 0.26, U * 0.14, size < 1.1 ? 3 : 5);
  const tw = hl.W * 0.84;
  const zA = -L * 0.28, zB = L * 0.18, len = zB - zA;
  // Stylobate, cella, columns, entablature, roof, pediment.
  const st = U * 0.05;
  kit.add(kit.box(tw, st, len, mat.detail), 'detail', 0, hl.yt + st / 2, (zA + zB) / 2);
  const colH = U * 0.4, y0 = hl.yt + st;
  kit.add(kit.box(tw * 0.5, colH, len * 0.92, mat.detail), 'hull', 0, y0 + colH / 2, (zA + zB) / 2);
  const cols = Math.max(5, Math.min(10, Math.round(len / (tw * 0.35))));
  for (let i = 0; i < cols; i++) {
    const z = zA + tw * 0.08 + ((len - tw * 0.16) * i) / (cols - 1);
    kit.addMirrored(() => column(tw * 0.045, colH, mat.hull), 'detail', tw / 2 - tw * 0.06, y0 + colH / 2, z);
  }
  const yRoof = y0 + colH, ent = U * 0.05;
  kit.add(kit.box(tw * 1.02, ent, len * 1.01, mat.gold), 'detail', 0, yRoof + ent / 2, (zA + zB) / 2);
  const roofH = U * 0.24;
  kit.add(new THREE.Mesh(section([[-tw * 0.52, 0], [tw * 0.52, 0], [0, roofH]], len), mat.hull), 'hull', 0, yRoof + ent, (zA + zB) / 2);
  kit.add(new THREE.Mesh(section([[-tw * 0.46, 0], [tw * 0.46, 0], [0, roofH * 0.8]], tw * 0.04), mat.gold), 'detail', 0, yRoof + ent, zB + tw * 0.02);
  for (let i = 0; i < 3; i++) {
    kit.addMirrored(() => kit.box(0.008, colH * 0.45, len * 0.2, mat.accent), 'detail', tw * 0.25 + 0.004, y0 + colH * 0.5, zA + len * (0.2 + 0.3 * i));
  }
  // The ziggurat: three steps, gilt fins up its front, a crown and a spire.
  let y = hl.yt, w = hl.W * 0.7;
  const zz = hl.zStern + L * 0.09;
  for (let k = 0; k < 3; k++) {
    const hk = U * (0.42 - 0.06 * k);
    kit.add(kit.box(w, hk, w * 0.9, k === 1 ? mat.detail : mat.hull), 'hull', 0, y + hk / 2, zz);
    kit.add(kit.box(w * 1.04, U * 0.03, w * 0.94, mat.gold), 'detail', 0, y + hk, zz);
    y += hk;
    w *= 0.72;
  }
  for (const dx of [-0.18, 0, 0.18]) kit.add(kit.box(hl.W * 0.04, (y - hl.yt) * 0.85, hl.W * 0.05, mat.gold), 'detail', dx * hl.W, hl.yt + (y - hl.yt) * 0.45, zz + hl.W * 0.315 + 0.01);
  kit.add(kit.box(w * 1.2, U * 0.08, w * 1.2, mat.gold), 'detail', 0, y + U * 0.04, zz);
  kit.add(cone(w * 0.4, U * 0.9, 8, mat.detail), 'detail', 0, y + U * 0.08 + U * 0.45, zz);
  kit.add(cone(w * 0.1, U * 0.22, 6, mat.gold), 'detail', 0, y + U * 0.08 + U * 0.86, zz);
  // Deco speed lines down the flanks.
  for (const k of [0.25, 0.42, 0.59]) {
    const ln = L * (0.5 - k * 0.3);
    kit.addMirrored(() => kit.box(0.01, U * 0.018, ln, mat.gold), 'detail', hl.W / 2 + 0.005, hl.yb + (hl.yt - hl.yb) * k, hl.zProw - ln / 2 - L * 0.02);
  }
  const deck = gunDecks(kit, hl, -L * 0.34, -L * 0.02);
  broadsides(kit, kit.design.weapons, deck, -L * 0.3, -L * 0.04, { y: hl.yt, z: L * 0.24 });
  aquila(kit, (hl.yt + hl.yb) / 2 + (hl.yt - hl.yb) * 0.15, hl.zProw + 0.012, hl.W * 0.95);
  engineBank(kit, hl);
}
