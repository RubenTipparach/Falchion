import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { ShipKit } from '../ShipKit';
import type { ShipStyleGenerator } from '../ShipStyleGenerator';

/**
 * Industrial: the used future of the commercial towing vehicle and the colonial transport.
 * Chunky slab-sided blocks clad in greebles, exposed pipework, antenna clusters, folded
 * landing struts and huge rectangular engine blocks. Four archetypes, by size and seed: a
 * wedge-nosed dropship (small), a towing tug (small and mid), a hammerhead troop transport
 * (mid and large) and a tug riding a towed refinery whose spires hang below it (large).
 * Forward is +z.
 */

/** A surface a turret can sit on: where, and which way it faces (1 up, -1 down). */
interface Mount {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly up: 1 | -1;
}

/**
 * Small pieces of machinery collected per material and added as one merged mesh each, so a
 * hull can wear a hundred greebles for a handful of draws.
 */
class Greebles {
  private readonly geos = new Map<THREE.Material, THREE.BufferGeometry[]>();
  constructor(private readonly kit: ShipKit) {}

  box(w: number, h: number, d: number, x: number, y: number, z: number, m: THREE.Material = this.kit.mat.detail): void {
    this.push(m, new THREE.BoxGeometry(w, h, d).translate(x, y, z));
  }

  /** The box and its mirror across x = 0. */
  pair(w: number, h: number, d: number, x: number, y: number, z: number, m: THREE.Material = this.kit.mat.detail): void {
    this.box(w, h, d, x, y, z, m);
    if (Math.abs(x) > 1e-6) this.box(w, h, d, -x, y, z, m);
  }

  /** A pipe along z (both sides of the centreline when `x` is off it). */
  pipe(r: number, len: number, x: number, y: number, z: number, m: THREE.Material = this.kit.mat.detail): void {
    for (const sx of Math.abs(x) > 1e-6 ? [x, -x] : [x]) {
      this.push(m, new THREE.CylinderGeometry(r, r, len, 6).rotateX(Math.PI / 2).translate(sx, y, z));
    }
  }

  /** A post along y (a mast, a spire), with an optional cone at its end pointing `dir` (1 up, -1 down). */
  post(r: number, len: number, x: number, y: number, z: number, dir: 1 | -1, cone = 0, m: THREE.Material = this.kit.mat.detail): void {
    this.push(m, new THREE.CylinderGeometry(r, r, len, 6).translate(x, y + (dir * len) / 2, z));
    if (cone > 0) {
      const tip = new THREE.ConeGeometry(r * 1.8, cone, 6);
      if (dir < 0) tip.rotateX(Math.PI);
      this.push(m, tip.translate(x, y + dir * (len + cone / 2), z));
    }
  }

  /** Scatter `n` greebles over a box's top (or bottom) face: vents, hatches, conduit runs. */
  scatterTop(n: number, w: number, len: number, x: number, y: number, z: number, size: number, dir: 1 | -1 = 1): void {
    const { rng, mat } = this.kit;
    for (let i = 0; i < n; i++) {
      const gw = size * rng.range(0.4, 1.4), gd = size * rng.range(0.5, 2.2), gh = size * rng.range(0.2, 0.7);
      const gx = x + rng.range(-0.5, 0.5) * Math.max(0, w - gw);
      const gz = z + rng.range(-0.5, 0.5) * Math.max(0, len - gd);
      this.box(gw, gh, gd, gx, y + (dir * gh) / 2, gz, rng.chance(0.25) ? mat.hull : mat.detail);
    }
  }

  /** Greebles on both flanks of a box (mirrored): panels, ducts and ribs standing proud of the side. */
  scatterSides(n: number, h: number, len: number, xFace: number, y: number, z: number, size: number): void {
    const { rng, mat } = this.kit;
    for (let i = 0; i < n; i++) {
      const gh = size * rng.range(0.4, 1.2), gd = size * rng.range(0.6, 2.4), gt = size * rng.range(0.15, 0.45);
      const gy = y + rng.range(-0.5, 0.5) * Math.max(0, h - gh);
      const gz = z + rng.range(-0.5, 0.5) * Math.max(0, len - gd);
      this.pair(gt, gh, gd, xFace + gt / 2, gy, gz, rng.chance(0.2) ? mat.hull : mat.detail);
    }
  }

  private push(m: THREE.Material, g: THREE.BufferGeometry): void {
    // Merged pieces must share attributes: drop the uvs and groups the primitives come with.
    g.deleteAttribute('uv');
    g.clearGroups();
    const list = this.geos.get(m) ?? [];
    list.push(g.index ? g.toNonIndexed() : g);
    this.geos.set(m, list);
  }

  /** Add every collected piece to the ship, one mesh per material. */
  flush(): void {
    for (const [m, list] of this.geos) {
      const merged = mergeGeometries(list, false);
      list.forEach((g) => g.dispose());
      if (merged) this.kit.add(new THREE.Mesh(merged, m), 'detail');
    }
    this.geos.clear();
  }
}

/** A box part of the hull, added at its centre. */
function block(kit: ShipKit, w: number, h: number, d: number, x: number, y: number, z: number, m: THREE.Material = kit.mat.hull, type: 'hull' | 'detail' | 'wing' = 'hull'): THREE.Mesh {
  return kit.add(kit.box(w, h, d, m), type, x, y, z);
}

/** A thin lit window band on a face looking +z (the bridge's slit windows). */
function windowBand(kit: ShipKit, w: number, h: number, x: number, y: number, z: number): void {
  block(kit, w, h, Math.max(0.01, kit.B * 0.015), x, y, z, kit.mat.accent, 'detail');
}

/**
 * A side profile (z along, y up) extruded across the ship to `width`, centred on x = 0: wedge
 * noses and sloped hull blocks. The profile runs counter-clockwise (bottom, front, top).
 */
function profileBlock(pts: ReadonlyArray<readonly [number, number]>, width: number, m: THREE.Material): THREE.Mesh {
  const shape = new THREE.Shape(pts.map(([z, y]) => new THREE.Vector2(z, y)));
  const geo = new THREE.ExtrudeGeometry(shape, { depth: width, bevelEnabled: false, steps: 1, curveSegments: 1 }).translate(0, 0, -width / 2);
  // Shape x is along the ship (+z), the extrusion runs across it.
  geo.rotateY(-Math.PI / 2);
  return new THREE.Mesh(geo, m);
}

/**
 * Engines on the back face of a block: `n` square nozzles in rows of up to three, the rows
 * stacked; or round ones for the transport.
 */
function engineGrid(kit: ShipKit, n: number, x: number, y: number, z: number, w: number, h: number, r: number, shape: 'round' | 'square' = 'square'): void {
  if (n <= 0) return;
  const perRow = n <= 3 ? n : Math.ceil(n / 2);
  const rows = Math.ceil(n / perRow);
  let left = n;
  for (let row = 0; row < rows; row++) {
    const count = Math.min(perRow, left);
    left -= count;
    const yy = rows === 1 ? y : y + (row === 0 ? 1 : -1) * h * 0.24;
    for (const xx of kit.symmetricSlots(count, w * 0.32)) kit.engine(x + xx, yy, z, r, shape);
  }
}

/** Turrets on the mounts in order; any beyond them run down the centreline between zA and zB on top. */
function arm(kit: ShipKit, mounts: readonly Mount[], topY: number, zA: number, zB: number, size: number): void {
  const n = kit.design.weapons;
  const extra = Math.max(0, n - mounts.length);
  for (let i = 0; i < n; i++) {
    const m = mounts[i];
    if (m) kit.turret(m.x, m.y + m.up * size * 0.3, m.z, size, m.up);
    else {
      const j = i - mounts.length;
      kit.turret(0, topY + size * 0.3, zA + ((zB - zA) * (j + 1)) / (extra + 1), size, 1);
    }
  }
}

/** An antenna cluster: masts of different heights, cross-booms and a dish, standing on (x, y, z). */
function antennas(kit: ShipKit, g: Greebles, x: number, y: number, z: number, scale: number): void {
  const { rng, mat } = kit;
  const t = Math.max(0.01, scale * 0.03);
  const masts = rng.int(2, 3);
  for (let i = 0; i < masts; i++) {
    const h = scale * rng.range(0.35, 0.8);
    const dx = (i - (masts - 1) / 2) * scale * 0.14, dz = rng.range(-0.08, 0.08) * scale;
    g.post(t, h, x + dx, y, z + dz, 1, i === 0 ? scale * 0.08 : 0);
    g.box(scale * rng.range(0.15, 0.3), t, t, x + dx, y + h * rng.range(0.5, 0.85), z + dz);
  }
  g.box(t * 1.5, t * 1.5, t * 1.5, x, y + scale * 0.3, z, mat.accent);
  // The dish: a shallow cone tipped back, on a short stalk.
  const r = scale * 0.2;
  const dish = new THREE.Mesh(new THREE.ConeGeometry(r, r * 0.35, 10), mat.hull);
  dish.rotation.x = Math.PI + 0.7;
  kit.add(dish, 'detail', x + scale * 0.22, y + scale * 0.28, z - scale * 0.05);
  g.post(t, scale * 0.24, x + scale * 0.22, y, z - scale * 0.05, 1);
}

/** Folded landing struts under a block: a leg angled back to a foot pad, on both sides. */
function struts(kit: ShipKit, g: Greebles, x: number, y: number, z: number, len: number): void {
  const t = Math.max(0.015, kit.B * 0.04);
  for (const sx of [x, -x]) {
    const leg = new THREE.BoxGeometry(t, len, t).rotateX(0.9).translate(sx, y - len * 0.3, z - len * 0.35);
    g.box(t * 2.6, t * 0.6, t * 3, sx, y - len * 0.62, z - len * 0.7);
    // Rotated pieces go in as their own geometry (the helpers take axis-aligned boxes).
    leg.deleteAttribute('uv');
    leg.clearGroups();
    kit.add(new THREE.Mesh(leg.toNonIndexed(), kit.mat.detail), 'detail');
  }
}

// ── Archetypes ─────────────────────────────────────────────────────────

/**
 * A towing tug in the box between z0 and z1, riding at height y0, `s` its width scale: a
 * command block with slit windows at the bow, a greebled spine with side modules, and a huge
 * engine block astern with square nozzles. Returns the turret mounts and the spine's top.
 */
function tugBody(kit: ShipKit, g: Greebles, z0: number, z1: number, y0: number, s: number): { mounts: Mount[]; top: number } {
  const { B, mat, rng } = kit;
  const len = z1 - z0;
  const at = (t: number) => z0 + len * t;
  // Widths grow a little with length too, so a long tug stays a heavy brick, not a dumbbell.
  const W = (B * 0.8 + len * 0.06) * s;
  const gs = W * 0.06;

  // Command block and its raised bridge, both with slit windows on the bow face.
  const cw = W * 0.95, ch = W * 0.62, cl = len * 0.22, cz = at(0.88);
  block(kit, cw, ch, cl, 0, y0, cz);
  const bw = cw * 0.58, bh = W * 0.22, bl = cl * 0.62, bz = cz + cl * 0.12, by = y0 + ch / 2 + bh / 2;
  block(kit, bw, bh, bl, 0, by, bz);
  windowBand(kit, bw * 0.8, bh * 0.2, 0, by + bh * 0.08, bz + bl / 2);
  windowBand(kit, cw * 0.7, ch * 0.06, 0, y0 + ch * 0.2, cz + cl / 2);
  // A lower forward module under the bow, as on the commercial tugs.
  block(kit, cw * 0.55, ch * 0.4, len * 0.07, 0, y0 - ch * 0.3, cz + cl / 2 + len * 0.035, mat.detail);
  g.scatterTop(6, cw, cl, 0, y0 + ch / 2, cz - cl * 0.2, gs);
  g.scatterSides(5, ch, cl, cw / 2, y0, cz, gs);

  // The body: a full-width hull of side modules round a spine, a superstructure stacked on top.
  const sz0 = at(0.27), sz1 = cz - cl / 2, sl = sz1 - sz0, sc = (sz0 + sz1) / 2;
  const sw = W * 0.62, sh = W * 0.56;
  block(kit, sw, sh, sl, 0, y0, sc);
  const mods = rng.int(2, 3);
  for (let i = 0; i < mods; i++) {
    const mw = W * rng.range(0.16, 0.24), mh = sh * rng.range(0.8, 1.15), ml = (sl / mods) * rng.range(0.7, 0.9);
    const mz = sz0 + sl * ((i + 0.5) / mods), my = y0 + rng.range(-0.1, 0.1) * sh;
    kit.addMirrored(() => kit.box(mw, mh, ml, i % 2 === 0 ? mat.hull : mat.detail), 'hull', sw / 2 + mw / 2, my, mz);
    g.scatterSides(3, mh, ml, sw / 2 + mw, my, mz, gs);
  }
  const tw = sw * 0.7, th = W * rng.range(0.22, 0.32), tl = sl * rng.range(0.35, 0.5), tz = sc + sl * rng.range(-0.15, 0.1);
  block(kit, tw, th, tl, 0, y0 + sh / 2 + th / 2, tz);
  block(kit, tw * 0.6, th * 0.7, tl * 0.5, 0, y0 + sh / 2 + th + th * 0.35, tz - tl * 0.1, mat.detail);
  g.pipe(W * 0.025, sl, sw / 2 + W * 0.02, y0 + sh * 0.42, sc);
  g.scatterTop(8, sw, sl, 0, y0 + sh / 2, sc, gs);
  g.scatterTop(4, sw, sl, 0, y0 - sh / 2, sc, gs, -1);
  antennas(kit, g, 0, y0 + sh / 2 + th + th * 0.7, tz - tl * 0.1, W * 0.7);

  // The engine block: the biggest thing on the ship, radiator fins on top, square nozzles astern.
  const ew = W * 1.2, eh = W * 0.95, el = len * 0.27, ez = at(0.135);
  block(kit, ew, eh, el, 0, y0, ez);
  block(kit, ew * 1.04, eh * 0.14, el * 0.3, 0, y0 + eh * 0.22, ez + el * 0.2, mat.detail, 'detail');
  for (const fx of [0.2, 0.36]) g.pair(W * 0.02, eh * 0.3, el * 0.7, ew * fx, y0 + eh / 2 + eh * 0.15, ez);
  g.scatterSides(6, eh, el, ew / 2, y0, ez, gs);
  g.scatterTop(4, ew, el, 0, y0 - eh / 2, ez, gs, -1);
  g.pair(W * 0.05, W * 0.05, W * 0.05, ew * 0.42, y0 + eh * 0.42, ez + el / 2, mat.accent);
  engineGrid(kit, kit.design.engines, 0, y0, z0 + W * 0.03, ew, eh, W * 0.13);
  struts(kit, g, cw * 0.32, y0 - ch / 2, cz, W * 0.4);
  struts(kit, g, ew * 0.36, y0 - eh / 2, ez, W * 0.4);

  const mounts: Mount[] = [
    { x: 0, y: y0 - eh / 2, z: ez, up: -1 },
    { x: cw * 0.3, y: y0 + ch / 2, z: cz - cl * 0.3, up: 1 },
    { x: -cw * 0.3, y: y0 + ch / 2, z: cz - cl * 0.3, up: 1 },
    { x: ew * 0.32, y: y0 + eh / 2, z: ez - el * 0.25, up: 1 },
    { x: -ew * 0.32, y: y0 + eh / 2, z: ez - el * 0.25, up: 1 },
    { x: 0, y: y0 - ch / 2 - ch * 0.4, z: cz + cl * 0.2, up: -1 },
  ];
  return { mounts, top: y0 + sh / 2 };
}

/** The commercial towing tug on its own. */
function tug(kit: ShipKit): void {
  const { L, B } = kit;
  const g = new Greebles(kit);
  const { mounts, top } = tugBody(kit, g, -L / 2, L / 2, 0, 1);
  arm(kit, mounts, top, -L * 0.2, L * 0.2, Math.max(0.05, B * 0.07));
  g.flush();
}

/**
 * The tug riding a towed refinery: a long platform on a towing frame behind it, processing
 * towers rising in two cathedral rows either side of a central trough the tug's exhaust runs
 * down, and spires hanging below the deck.
 */
function refinery(kit: ShipKit): void {
  const { L, B, mat, rng } = kit;
  const g = new Greebles(kit);
  const { mounts, top } = tugBody(kit, g, L * 0.08, L * 0.5, 0, 0.8);

  // The platform behind the tug, a little below its centreline, on a towing frame.
  const pz0 = -L * 0.5, pz1 = L * 0.1, pl = pz1 - pz0, pc = (pz0 + pz1) / 2;
  const pw = B * 1.7 + L * 0.06, ph = B * 0.1, py = -B * 0.42;
  const t = Math.max(0.02, B * 0.05);
  block(kit, pw, ph, pl, 0, py, pc);
  g.pair(t, ph * 1.6, pl, pw / 2, py, pc);
  for (const x of [pw * 0.18, -pw * 0.18]) block(kit, t, t, L * 0.2, x, py + ph / 2 + t / 2, L * 0.15, mat.detail, 'detail');
  g.scatterTop(8, pw * 0.3, pl * 0.9, 0, py + ph / 2, pc, B * 0.05);

  // Towers in two rows either side of the trough: stacked blocks narrowing upward, each topped by
  // a pipe spire, the tallest in the middle of the run like a nave.
  const rowsN = L > 7 ? 5 : 4;
  for (const side of [-1, 1]) {
    for (let r = 0; r < rowsN; r++) {
      const z = pz0 + pl * ((r + 0.5) / rowsN);
      const peak = 0.6 + 0.4 * Math.sin(Math.PI * ((r + 0.5) / rowsN));
      for (const lane of [0.28, 0.42]) {
        if (lane === 0.42 && rng.chance(0.4)) continue;
        const x = side * pw * lane;
        let y = py + ph / 2, w = B * rng.range(0.22, 0.32);
        const levels = Math.max(2, Math.round(rng.range(2.5, 4.5) * peak));
        for (let k = 0; k < levels; k++) {
          const h = B * rng.range(0.16, 0.26) * peak;
          g.box(w, h, w * rng.range(0.9, 1.5), x, y + h / 2, z, k % 2 === 0 ? mat.hull : mat.detail);
          y += h;
          w *= 0.78;
        }
        g.post(Math.max(0.01, B * 0.022), B * rng.range(0.2, 0.45) * peak, x, y, z, 1, B * 0.1);
        if (rng.chance(0.3)) g.box(B * 0.035, B * 0.035, B * 0.035, x, y + B * 0.04, z + w * 0.6, mat.accent);
      }
      // Spires hanging below the deck.
      if (rng.chance(0.6)) g.post(Math.max(0.01, B * 0.03), B * rng.range(0.2, 0.4), side * pw * 0.35, py - ph / 2, z, -1, B * 0.12);
    }
  }
  // Catwalk girders across the trough, high enough to clear the exhaust.
  for (let i = 0; i < 3; i++) g.box(pw * 0.6, t * 0.6, t * 0.8, 0, py + B * 0.75, pz0 + pl * (0.2 + i * 0.3));
  mounts.push({ x: pw * 0.46, y: py - ph / 2, z: pz0 + pl * 0.15, up: -1 }, { x: -pw * 0.46, y: py - ph / 2, z: pz0 + pl * 0.15, up: -1 });
  arm(kit, mounts, top, L * 0.2, L * 0.4, Math.max(0.05, B * 0.06));
  g.flush();
}

/** A wedge-nosed dropship: a sloped boxy body, two engine pods on stubby drooping wings, chin guns. */
function dropship(kit: ShipKit): void {
  const { L, B, mat } = kit;
  const g = new Greebles(kit);
  const w = B * 0.62, h = B * 0.3;
  const zb = -L * 0.42, zf = L * 0.5;
  const slopeTop: [number, number] = [L * 0.24, h * 0.95], slopeBot: [number, number] = [zf, -h * 0.15];
  kit.add(profileBlock([[zb, -h], [L * 0.22, -h], [L * 0.46, -h * 0.55], slopeBot, slopeTop, [zb, h]], w, mat.hull), 'hull');
  // The canopy: a lit band laid along the sloped nose.
  const dz = slopeBot[0] - slopeTop[0], dy = slopeBot[1] - slopeTop[1], sl = Math.hypot(dz, dy);
  const band = kit.box(w * 0.62, Math.max(0.01, B * 0.012), sl * 0.12, mat.accent);
  band.rotation.x = Math.atan2(-dy, dz);
  const k = 0.22, nrm = 0.008;
  kit.add(band, 'detail', 0, slopeTop[1] + dy * k + (dz / sl) * nrm, slopeTop[0] + dz * k - (dy / sl) * nrm);

  // Engine pods on the flanks with drooping stub wings, square nozzles in their tails.
  const pw = B * 0.26, ph = B * 0.3, pl = L * 0.36, pz = -L * 0.24, px = w / 2 + pw / 2 + B * 0.04;
  kit.addMirrored(() => kit.box(pw, ph, pl, mat.hull), 'hull', px, -h * 0.1, pz);
  kit.addMirrored(() => {
    const wing = kit.box(B * 0.34, B * 0.04, pl * 0.55, mat.detail);
    wing.rotation.z = -0.28;
    return wing;
  }, 'wing', px + pw / 2 + B * 0.13, -h * 0.25, pz + pl * 0.05);
  g.scatterSides(4, ph, pl, px + pw / 2, -h * 0.1, pz, B * 0.05);
  g.scatterTop(5, w, L * 0.5, 0, h, -L * 0.1, B * 0.05);
  g.pipe(B * 0.02, L * 0.4, w / 2 + B * 0.02, h * 0.4, -L * 0.05);
  const n = kit.design.engines, perPod = Math.floor(n / 2), r = B * 0.09;
  for (const sx of [px, -px]) for (const y of kit.symmetricSlots(perPod, ph * 0.22)) kit.engine(sx, -h * 0.1 + y, pz - pl / 2 + r * 0.3, r, 'square');
  if (n % 2 === 1) kit.engine(0, 0, zb + r * 0.3, r, 'square');
  // Skids folded under the belly.
  for (const sx of [w * 0.35, -w * 0.35]) block(kit, B * 0.04, B * 0.04, L * 0.5, sx, -h - B * 0.07, -L * 0.05, mat.detail, 'detail');
  for (const z of [L * 0.1, -L * 0.25]) g.pair(B * 0.03, B * 0.08, B * 0.03, w * 0.35, -h - B * 0.03, z);

  const mounts: Mount[] = [
    { x: 0, y: -h * 0.75, z: L * 0.36, up: -1 },
    { x: px, y: -h * 0.1 + ph / 2, z: pz + pl * 0.2, up: 1 },
    { x: -px, y: -h * 0.1 + ph / 2, z: pz + pl * 0.2, up: 1 },
    { x: w * 0.25, y: -h, z: L * 0.1, up: -1 },
    { x: -w * 0.25, y: -h, z: L * 0.1, up: -1 },
  ];
  arm(kit, mounts, h, -L * 0.3, L * 0.1, Math.max(0.045, B * 0.07));
  g.flush();
}

/**
 * A colonial troop transport: a broad hammerhead bow, a long spine between two armoured slab
 * flanks, gun pods on the slabs, a dropship bay underneath and a round-nozzled engine block.
 */
function transport(kit: ShipKit): void {
  const { L, B, mat, rng } = kit;
  const g = new Greebles(kit);
  // Widths grow a little with length too, so a long hull stays heavy.
  const W = B * 0.85 + L * 0.06;
  // The hammerhead bow, sloped under the chin.
  const hw = W * 1.3, hh = W * 0.4, hz0 = L * 0.3;
  kit.add(profileBlock([[hz0, -hh * 0.4], [L * 0.44, -hh * 0.5], [L * 0.5, -hh * 0.1], [L * 0.5, hh * 0.5], [hz0, hh * 0.5]], hw, mat.hull), 'hull');
  windowBand(kit, hw * 0.5, hh * 0.1, 0, hh * 0.25, L * 0.5);
  g.scatterTop(6, hw, L * 0.15, 0, hh * 0.5, L * 0.41, B * 0.05);

  // The spine and its slab flanks, held off by struts.
  const sw = W * 0.5, sh = W * 0.48, sz0 = -L * 0.3, sl = hz0 - sz0, sc = (sz0 + hz0) / 2;
  block(kit, sw, sh, sl, 0, 0, sc);
  const fw = W * 0.14, fh = W * 0.72, fl = L * rng.range(0.46, 0.54), fz = L * 0.0, fx = sw / 2 + W * 0.22;
  kit.addMirrored(() => kit.box(fw, fh, fl, mat.hull), 'hull', fx, 0, fz);
  for (const t of [-0.35, 0, 0.35]) g.pair(W * 0.22, W * 0.06, W * 0.06, sw / 2 + W * 0.11, 0, fz + fl * t);
  g.scatterSides(7, fh, fl, fx + fw / 2, 0, fz, B * 0.05);
  g.pipe(B * 0.022, sl * 0.9, sw / 2 + B * 0.02, sh * 0.3, sc);
  g.scatterTop(8, sw, sl, 0, sh / 2, sc, B * 0.045);
  // The dropship bay under the spine, its doors lit.
  block(kit, sw * 1.3, B * 0.22, L * 0.24, 0, -sh / 2 - B * 0.1, L * 0.05, mat.detail, 'detail');
  block(kit, sw * 0.9, B * 0.02, L * 0.18, 0, -sh / 2 - B * 0.215, L * 0.05, mat.accent, 'detail');
  // A dorsal fin with an antenna cluster.
  block(kit, B * 0.04, B * 0.3, L * 0.16, 0, sh / 2 + B * 0.15, -L * 0.1, mat.detail, 'wing');
  antennas(kit, g, 0, sh / 2, L * 0.18, B * 0.6);

  // The engine block and round nozzles.
  const ew = W * 1.1, eh = W * 0.8, el = L * 0.2, ez = -L * 0.4;
  block(kit, ew, eh, el, 0, 0, ez);
  g.scatterSides(5, eh, el, ew / 2, 0, ez, B * 0.05);
  g.scatterTop(4, ew, el, 0, eh / 2, ez, B * 0.05);
  engineGrid(kit, kit.design.engines, 0, 0, -L / 2 + W * 0.03, ew, eh, W * 0.12, 'round');

  // Gun pods on the slabs carry the turrets; extras ride the spine.
  const mounts: Mount[] = [];
  const pods = Math.min(3, Math.ceil(kit.design.weapons / 2));
  for (let i = 0; i < pods; i++) {
    const z = fz + fl * (0.3 - (i * 0.6) / Math.max(1, pods - 1 || 1));
    for (const s of [1, -1]) {
      block(kit, B * 0.16, B * 0.14, L * 0.07, s * (fx + fw / 2 + B * 0.08), fh * 0.3, z, mat.detail, 'detail');
      mounts.push({ x: s * (fx + fw / 2 + B * 0.08), y: fh * 0.3 + B * 0.07, z, up: 1 });
    }
  }
  mounts.push({ x: 0, y: -hh * 0.45, z: L * 0.42, up: -1 }, { x: 0, y: eh / 2, z: ez, up: 1 });
  arm(kit, mounts, sh / 2, sz0, hz0, Math.max(0.05, B * 0.065));
  g.flush();
}

/** Pipe runs down the flanks, an antenna cluster and dish on the back, hazard lamps fore and aft. */
export function industrialAccent(kit: ShipKit): void {
  const rng = kit.rng.fork('accent-industrial');
  const { size, center } = kit.hullBox();
  const w = Math.max(0.08, Math.min(size.x, size.y) / 2);
  const g = new Greebles(kit);
  const len = size.z * rng.range(0.45, 0.6);
  g.pipe(0.012 + w * 0.06, len, w * 1.02, center.y + w * 0.25, center.z);
  g.pipe(0.01 + w * 0.045, len * 0.85, w * 1.02, center.y - w * 0.2, center.z - size.z * 0.05);
  for (const t of [-0.35, 0, 0.35]) g.pair(w * 0.12, w * 0.5, w * 0.12, w * 1.0, center.y, center.z + len * t);
  antennas(kit, g, center.x, center.y + w * 0.95, center.z - size.z * 0.2, 0.2 + w * 0.8);
  for (const z of [center.z + size.z * 0.4, center.z - size.z * 0.4]) g.pair(w * 0.1, w * 0.1, w * 0.1, w * 0.9, center.y + w * 0.6, z, kit.mat.accent);
  g.flush();
}

/** Small hulls are dropships and tugs, mid ones tugs and transports, long ones transports and refinery tows. */
export const IndustrialStyle: ShipStyleGenerator = {
  id: 'industrial',
  name: 'Industrial',
  description: 'Towing tugs, towed refineries, dropships and troop transports: blocky, greebled, worn.',
  flatShading: true,
  accent: industrialAccent,
  build(kit: ShipKit) {
    const { L, rng } = kit;
    const kind = L < 4.4 ? rng.pick(['dropship', 'dropship', 'tug'] as const)
      : L < 6.2 ? rng.pick(['tug', 'transport', 'tug'] as const)
        : rng.pick(['refinery', 'transport', 'refinery'] as const);
    if (kind === 'dropship') dropship(kit);
    else if (kind === 'tug') tug(kit);
    else if (kind === 'transport') transport(kit);
    else refinery(kit);
  },
};
