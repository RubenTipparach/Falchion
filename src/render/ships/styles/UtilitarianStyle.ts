import * as THREE from 'three';
import type { ShipKit } from '../ShipKit';
import type { ShipStyleGenerator } from '../ShipStyleGenerator';
import { utilitarianAccent } from './accents';

/** A surface a turret can sit on: its centre x, its top height and its z. */
interface Mount {
  readonly x: number;
  readonly top: number;
  readonly z: number;
}

const UP = new THREE.Vector3(0, 1, 0);
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** Half-width of the truss spine: thin on small hulls, a real girder on wide ones. */
const spineHalf = (B: number): number => B * 0.09 + 0.02;

/** A square member from a to b, turned to lie along the segment: braces, jibs, pylons. */
function member(kit: ShipKit, a: THREE.Vector3, b: THREE.Vector3, t: number, material: THREE.Material, type: 'hull' | 'detail' = 'detail'): void {
  const dir = b.clone().sub(a);
  const m = kit.box(t, dir.length(), t, material);
  m.quaternion.setFromUnitVectors(UP, dir.normalize());
  kit.add(m, type, (a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
}

/** The spine: four longerons and one zigzag brace per face in each bay, an exposed lattice. */
function truss(kit: ShipKit, zA: number, zB: number, h: number): void {
  const { mat } = kit;
  const t = Math.max(0.02, h * 0.3);
  const span = zB - zA;
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) kit.add(kit.box(t, t, span, mat.hull), 'hull', sx * h, sy * h, (zA + zB) / 2);
  const bays = clamp(Math.round(span / (h * 3.5)), 3, 8);
  // Points on the four faces: u runs across a face from -1 to 1, z runs along the spine.
  const faces = [
    (u: number, z: number) => new THREE.Vector3(u * h, h, z),
    (u: number, z: number) => new THREE.Vector3(u * h, -h, z),
    (u: number, z: number) => new THREE.Vector3(h, u * h, z),
    (u: number, z: number) => new THREE.Vector3(-h, u * h, z),
  ];
  for (let i = 0; i < bays; i++) {
    const z0 = zA + (span * i) / bays, z1 = zA + (span * (i + 1)) / bays;
    const u0 = i % 2 === 0 ? -1 : 1;
    for (const point of faces) member(kit, point(u0, z0), point(-u0, z1), t * 0.8, mat.detail);
  }
}

/** The boxy bridge: a window band on its front, a mast with a running light on top. Returns its top. */
function cab(kit: ShipKit, zc: number, len: number, w: number, height: number, yc: number, mast = true): number {
  const { B, mat } = kit;
  kit.add(kit.box(w, height, len, mat.hull), 'hull', 0, yc, zc);
  kit.add(kit.box(w * 0.78, height * 0.28, 0.02, mat.accent), 'detail', 0, yc + height * 0.15, zc + len / 2 + 0.006);
  const top = yc + height / 2;
  if (mast) {
    const t = Math.max(0.015, B * 0.02);
    kit.add(kit.box(t, B * 0.3, t, mat.detail), 'detail', 0, top + B * 0.15, zc - len * 0.25);
    kit.add(kit.box(t * 2, t * 2, t * 2, mat.accent), 'detail', 0, top + B * 0.3, zc - len * 0.25);
  }
  return top;
}

/** A jib from a base, leaning by `lean` radians towards the bow, with a two-claw grapple at its tip. */
function crane(kit: ShipKit, base: THREE.Vector3, length: number, lean: number, thick: number): void {
  const { mat } = kit;
  const tip = base.clone().add(new THREE.Vector3(0, Math.sin(lean), Math.cos(lean)).multiplyScalar(length));
  member(kit, base, tip, thick, mat.detail);
  for (const s of [-1, 1]) {
    const claw = tip.clone().add(new THREE.Vector3(s * thick * 1.4, 0, 0));
    member(kit, claw, claw.clone().add(new THREE.Vector3(0, -thick * 3.5, 0)), thick * 0.7, mat.accent);
  }
}

/** Bell engines on the back face of a block: up to three to a row, two rows for more. */
function engines(kit: ShipKit, z: number, w: number, h: number, r: number): void {
  const n = kit.design.engines;
  const perRow = n <= 3 ? n : Math.ceil(n / 2);
  const rows = Math.ceil(n / perRow);
  let left = n;
  for (let row = 0; row < rows; row++) {
    const count = Math.min(perRow, left);
    left -= count;
    const y = rows === 1 ? 0 : (row === 0 ? 1 : -1) * h * 0.22;
    for (const x of kit.symmetricSlots(count, w * 0.34)) kit.engine(x, y, z, r);
  }
}

/** A rear engine block with its engines hung off its back face. */
function engineBlock(kit: ShipKit, zc: number, len: number, w: number, h: number, material: THREE.Material): void {
  kit.add(kit.box(w, h, len, material), 'hull', 0, 0, zc);
  const r = kit.B * 0.09;
  engines(kit, zc - len / 2 + r * 0.3, w, h, r);
}

/** Radiator fins standing either side of an engine block. */
function radiators(kit: ShipKit, zc: number, len: number, w: number, h: number): void {
  const t = Math.max(0.02, kit.B * 0.025);
  kit.addMirrored(() => kit.box(t, h * 0.9, len * 0.9, kit.mat.detail), 'wing', w / 2 + t, 0, zc);
}

/** Cargo containers hung either side of the spine in rows; long hulls stack a second tier on some. */
function containers(kit: ShipKit, zA: number, zB: number, h: number, stack: boolean): Mount[] {
  const { B, L, rng, mat } = kit;
  const cw = B * 0.5, ch = B * 0.36;
  const span = zB - zA;
  const n = clamp(Math.round(span / (L * 0.12)), 2, 7);
  const cl = span / n;
  const mounts: Mount[] = [];
  for (const s of [-1, 1]) {
    const x = s * (h + cw / 2 - 0.02);
    for (let i = 0; i < n; i++) {
      if (rng.chance(0.12)) continue;
      // Gaps between containers leave the truss showing, as on any lattice-framed hauler.
      const z = zA + cl * (i + 0.5), len = cl * 0.72;
      kit.add(kit.box(cw, ch, len, rng.pick([mat.hull, mat.detail])), 'hull', x, 0, z);
      let top = ch / 2;
      if (stack && rng.chance(0.45)) {
        kit.add(kit.box(cw * 0.9, ch, len * 0.9, rng.pick([mat.hull, mat.detail])), 'hull', x, ch, z);
        top = ch * 1.5;
      }
      mounts.push({ x, top, z });
    }
  }
  return mounts;
}

/** Cylindrical tanks lying along the spine, two or three to a side, each banded with straps. */
function tanks(kit: ShipKit, zA: number, zB: number, h: number, r: number): Mount[] {
  const { L, mat, rng } = kit;
  const span = zB - zA;
  const n = clamp(Math.round(span / (L * 0.28)), 2, 3);
  const cl = span / n;
  const xc = h + r;
  const mounts: Mount[] = [];
  for (const s of [-1, 1]) {
    for (let i = 0; i < n; i++) {
      if (rng.chance(0.1)) continue;
      const z = zA + cl * (i + 0.5), len = cl * 0.86;
      kit.add(kit.cyl(r, r, len, mat.hull, 14), 'hull', s * xc, 0, z);
      for (const k of [-0.3, 0.3]) kit.add(kit.cyl(r * 1.06, r * 1.06, len * 0.06, mat.detail, 14), 'detail', s * xc, 0, z + len * k);
      mounts.push({ x: s * xc, top: r, z });
    }
  }
  return mounts;
}

/**
 * Turrets on the mounts in order. Any beyond the mounts sit on the spine's top, spread along it,
 * so every seed gets exactly `weapons` turrets, each on a surface.
 */
function turrets(kit: ShipKit, mounts: Mount[], spineTop: number, zA: number, zB: number): void {
  const size = Math.max(0.05, kit.B * 0.09);
  const n = kit.design.weapons;
  const extra = Math.max(0, n - mounts.length);
  for (let i = 0; i < n; i++) {
    const m = mounts[i];
    if (m) kit.turret(m.x, m.top + size * 0.35, m.z, size);
    else {
      const j = i - mounts.length;
      kit.turret(0, spineTop + size * 0.35, zA + ((zB - zA) * (j + 1)) / (extra + 1), size);
    }
  }
}

/** Spine hauler: a long truss hung with container rows, a cab at the bow and a rear engine block. */
function hauler(kit: ShipKit): void {
  const { L, B, mat, rng } = kit;
  const h = spineHalf(B);
  const zA = -L * 0.36, zB = L * 0.34;
  truss(kit, zA, zB, h);
  engineBlock(kit, -L * 0.44, L * 0.16, B * 0.8, B * 0.62, mat.hull);
  radiators(kit, -L * 0.44, L * 0.16, B * 0.8, B * 0.62);
  const mounts = containers(kit, zA, zB, h, L >= 5);
  const top = cab(kit, L * 0.41, L * 0.13, B * 0.6, B * 0.4, B * 0.05);
  mounts.push({ x: 0, top, z: L * 0.41 });
  if (rng.chance(0.6)) crane(kit, new THREE.Vector3(B * 0.2, top, L * 0.35), L * 0.2, 0.9, Math.max(0.02, B * 0.06));
  turrets(kit, mounts, h, zA, zB);
}

/** Tank ship: a truss carrying cylinder tanks on both sides and a sphere on its back, a mobile fuel depot. */
function tanker(kit: ShipKit): void {
  const { L, B, mat, rng } = kit;
  const h = spineHalf(B);
  const zA = -L * 0.36, zB = L * 0.34;
  truss(kit, zA, zB, h);
  engineBlock(kit, -L * 0.44, L * 0.15, B * 0.9, B * 0.7, mat.hull);
  radiators(kit, -L * 0.44, L * 0.15, B * 0.9, B * 0.7);
  const mounts = tanks(kit, zA, zB, h, B * 0.26);
  if (L >= 5 || rng.chance(0.5)) {
    const rs = B * 0.3;
    kit.add(kit.sphere(rs, mat.hull, 1, 1, 1, 12), 'hull', 0, h + rs * 0.7, L * 0.02);
    mounts.push({ x: 0, top: h + rs * 1.7, z: L * 0.02 });
  }
  const top = cab(kit, L * 0.41, L * 0.13, B * 0.6, B * 0.4, B * 0.05);
  mounts.push({ x: 0, top, z: L * 0.41 });
  turrets(kit, mounts, h, zA, zB);
}

/** Brick tug: one squat block with an armour belt and side vents, a huge engine block behind, a grapple at the nose. */
function tug(kit: ShipKit): void {
  const { L, B, mat } = kit;
  const bw = B * 0.85, bh = B * 0.8;
  const z0 = -L * 0.36, z1 = L * 0.24, bl = z1 - z0, bc = (z0 + z1) / 2;
  kit.add(kit.box(bw, bh, bl, mat.hull), 'hull', 0, 0, bc);
  kit.add(kit.box(B * 0.92, B * 0.08, bl * 0.98, mat.detail), 'detail', 0, 0, bc);
  for (const y of [0.2, 0.3]) {
    kit.addMirrored(() => kit.box(B * 0.03, B * 0.05, bl * 0.6, mat.detail), 'detail', bw / 2 + B * 0.015, B * y, bc);
  }
  engineBlock(kit, -L * 0.43, L * 0.14, B * 0.95, B * 0.8, mat.detail);
  const top = cab(kit, L * 0.12, L * 0.16, B * 0.6, B * 0.32, bh / 2 + B * 0.16);
  crane(kit, new THREE.Vector3(B * 0.26, -B * 0.1, z1), L * 0.24, -0.25, Math.max(0.02, B * 0.07));
  const mounts: Mount[] = [];
  for (const s of [-1, 1]) {
    mounts.push({ x: s * B * 0.22, top: bh / 2, z: -L * 0.2 });
    mounts.push({ x: s * B * 0.22, top: bh / 2, z: 0 });
  }
  mounts.push({ x: 0, top, z: L * 0.12 });
  turrets(kit, mounts, bh / 2, z0, z1);
}

/** Modular gunship: a truss with turret pods bolted along both flanks, one turret on each pod. */
function gunship(kit: ShipKit): void {
  const { L, B, mat, rng, design } = kit;
  const h = spineHalf(B);
  const zA = -L * 0.36, zB = L * 0.34;
  truss(kit, zA, zB, h);
  engineBlock(kit, -L * 0.44, L * 0.14, B * 0.8, B * 0.6, mat.hull);
  radiators(kit, -L * 0.44, L * 0.14, B * 0.8, B * 0.6);
  cab(kit, L * 0.41, L * 0.12, B * 0.5, B * 0.34, B * 0.03);
  const count = Math.max(2, design.weapons);
  const perSide = Math.ceil(count / 2);
  const pw = B * 0.42, ph = B * 0.36, pl = L * 0.13;
  const mounts: Mount[] = [];
  for (let i = 0; i < count; i++) {
    const s = i % 2 === 0 ? 1 : -1;
    const slot = Math.floor(i / 2);
    const z = zA + ((zB - zA) * (slot + 0.5)) / perSide + rng.range(-0.02, 0.02) * L;
    const x = s * (h + pw / 2 - 0.02);
    kit.add(kit.box(pw, ph, pl, mat.hull), 'hull', x, 0, z);
    kit.add(kit.box(0.02, ph * 0.3, pl * 0.4, mat.accent), 'detail', s * (Math.abs(x) + pw / 2 + 0.008), 0, z);
    mounts.push({ x, top: ph / 2, z });
  }
  turrets(kit, mounts, h, zA, zB);
}

/** Small hulls are tugs and shuttles; long ones are haulers, tankers and factories. */
const SMALL_KINDS = ['tug', 'gunship', 'tug'] as const;
const MID_KINDS = ['tank', 'gunship', 'hauler'] as const;
const LARGE_KINDS = ['hauler', 'tank', 'hauler', 'gunship'] as const;

/** Function over form: a truss spine with containers, tanks, radiators, cranes and bell engines. */
export const UtilitarianStyle: ShipStyleGenerator = {
  id: 'utilitarian',
  name: 'Utilitarian',
  description: 'Truss spines hung with containers, tanks, radiators, cranes and bell engines.',
  accent: utilitarianAccent,
  build(kit: ShipKit) {
    const { L, rng } = kit;
    const kinds = L < 4.4 ? SMALL_KINDS : L < 6.4 ? MID_KINDS : LARGE_KINDS;
    switch (rng.pick(kinds)) {
      case 'tug': tug(kit); break;
      case 'gunship': gunship(kit); break;
      case 'tank': tanker(kit); break;
      default: hauler(kit);
    }
  },
};
