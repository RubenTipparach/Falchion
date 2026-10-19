import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { PropKind } from '../../../content/flora';

/**
 * The shapes of the surface's flora and props (change surface-flora): low-poly and flat-shaded,
 * about a unit tall with the base at y = 0 (bones and ribcages lie flat and are a unit long).
 * Attributes: `color` (a part's own colour, or white where it takes the prop's colour), `aTint`
 * (1: multiplied by the prop's colour) and `aEmit` (glows: lava cracks, caps, circuits, windows).
 */

interface PartOpts {
  readonly tint?: boolean;
  readonly emit?: number;
}

/** A primitive as a flat-shaded part: non-indexed, face normals, its colour and flags on every vertex. */
function part(g: THREE.BufferGeometry, color: string, o: PartOpts = {}): THREE.BufferGeometry {
  let geo = g.index ? g.toNonIndexed() : g;
  if (geo !== g) g.dispose();
  for (const name of Object.keys(geo.attributes)) if (name !== 'position') geo.deleteAttribute(name);
  geo.computeVertexNormals();
  const n = geo.getAttribute('position').count;
  const c = new THREE.Color(o.tint ? '#ffffff' : color);
  geo.setAttribute('color', new THREE.Float32BufferAttribute(Array.from({ length: n }, () => [c.r, c.g, c.b]).flat(), 3));
  geo.setAttribute('aTint', new THREE.Float32BufferAttribute(new Array<number>(n).fill(o.tint ? 1 : 0), 1));
  geo.setAttribute('aEmit', new THREE.Float32BufferAttribute(new Array<number>(n).fill(o.emit ?? 0), 1));
  return geo;
}

const at = (g: THREE.BufferGeometry, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, s: [number, number, number] = [1, 1, 1]): THREE.BufferGeometry => {
  g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(...s)));
  return g;
};

/** Move each vertex by a hash of where it is, so a rock's shared corners move together. */
function jitter(g: THREE.BufferGeometry, amount: number, seed: number): THREE.BufferGeometry {
  const p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const h = (k: number) => {
      const s = Math.sin(Math.round(x * 1000) * 12.9898 + Math.round(y * 1000) * 78.233 + Math.round(z * 1000) * 37.719 + seed * 11.1 + k * 3.7) * 43758.5453;
      return (s - Math.floor(s)) * 2 - 1;
    };
    p.setXYZ(i, x + h(1) * amount, y + h(2) * amount, z + h(3) * amount);
  }
  return g;
}

const TRUNK = '#5a4632', DARK_TRUNK = '#3e3226';

/** A thin blade: a triangle from a base `w` wide to a tip, leaning out by `lean` toward angle `a`. */
function blade(a: number, w: number, h: number, lean: number): THREE.BufferGeometry {
  const cx = Math.cos(a), cz = Math.sin(a), px = -cz * w / 2, pz = cx * w / 2;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([px, 0, pz, -px, 0, -pz, cx * lean, h, cz * lean], 3));
  return g;
}

/** A flat leaf from (0,y0,0) outward along angle `a`, drooping at its tip. */
function leaf(a: number, y0: number, len: number, w: number, droop: number): THREE.BufferGeometry {
  const cx = Math.cos(a), cz = Math.sin(a), px = -cz * w / 2, pz = cx * w / 2;
  const mx = cx * len * 0.5, mz = cz * len * 0.5;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([
    0, y0, 0, mx + px, y0 + droop * 0.2, mz + pz, mx - px, y0 + droop * 0.2, mz - pz,
    mx + px, y0 + droop * 0.2, mz + pz, cx * len, y0 - droop, cz * len, mx - px, y0 + droop * 0.2, mz - pz,
  ], 3));
  return g;
}


/**
 * A tapering limb along a path of points: one cylinder a segment, radius `r0` at the start to `r1`
 * at the end, with `sides` sides; `open` leaves the ends uncapped (where segments overlap, the caps
 * are hidden anyway).
 */
function limb(points: readonly THREE.Vector3[], r0: number, r1: number, color = '', o: PartOpts = { tint: true }, sides = 6, open = false): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  const upY = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i], b = points[i + 1];
    const len = a.distanceTo(b);
    const t0 = i / (points.length - 1), t1 = (i + 1) / (points.length - 1);
    const g = new THREE.CylinderGeometry(r0 + (r1 - r0) * t1, r0 + (r1 - r0) * t0, len * 1.04, sides, 1, open);
    const q = new THREE.Quaternion().setFromUnitVectors(upY, b.clone().sub(a).normalize());
    g.applyMatrix4(new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1)));
    out.push(part(g, color, o));
  }
  return out;
}

/** Points along an arc in a vertical plane at angle `yaw`: from `from` (distance out, height) bending up to `to`. */
function arc(yaw: number, x0: number, from: [number, number], mid: [number, number], to: [number, number], n = 6): THREE.Vector3[] {
  const c = new THREE.QuadraticBezierCurve(new THREE.Vector2(...from), new THREE.Vector2(...mid), new THREE.Vector2(...to));
  return c.getPoints(n).map((p) => new THREE.Vector3(x0, p.y, 0).add(new THREE.Vector3(Math.cos(yaw) * p.x, 0, Math.sin(yaw) * p.x)));
}

/**
 * A bone: a limb with five open sides. Bone worlds are thick with them, and every vertex is drawn
 * for every prop (change surface-perf): a skeleton is a third of what it was.
 */
const bone = (points: readonly THREE.Vector3[], r0: number, r1: number) => limb(points, r0, r1, '', { tint: true }, 5, true);

const ring = (n: number) => Array.from({ length: n }, (_, i) => (i / n) * Math.PI * 2);

const BUILDERS: Readonly<Record<PropKind, () => THREE.BufferGeometry[]>> = {
  grass: () => ring(6).map((a, i) => part(blade(a + i * 0.4, 0.09, 0.7 + (i % 3) * 0.15, 0.25 + (i % 2) * 0.15), '', { tint: true })),
  reeds: () => [
    ...ring(8).map((a, i) => part(blade(a + i * 0.3, 0.05, 0.75 + (i % 3) * 0.12, 0.08 + (i % 2) * 0.06), '', { tint: true })),
    part(at(new THREE.CylinderGeometry(0.025, 0.025, 0.14, 5), 0.04, 0.88, 0), '#5a3a22'),
    part(at(new THREE.CylinderGeometry(0.025, 0.025, 0.12, 5), -0.05, 0.8, 0.04), '#5a3a22'),
  ],
  fern: () => ring(7).map((a, i) => part(leaf(a + i * 0.2, 0.05, 0.6, 0.16, 0.25), '', { tint: true })).map((g) => at(g, 0, 0.35, 0, 0, 0, 0, [1, 1.4, 1])),
  shrub: () => [
    part(at(new THREE.IcosahedronGeometry(0.42, 0), 0, 0.42, 0, 0.3, 0.2, 0, [1, 0.8, 1]), '', { tint: true }),
    part(at(new THREE.IcosahedronGeometry(0.3, 0), 0.28, 0.3, 0.12, 0, 0.8, 0.2), '', { tint: true }),
    part(at(new THREE.IcosahedronGeometry(0.28, 0), -0.25, 0.28, -0.15, 0.5, 0, 0), '', { tint: true }),
  ],
  broadleaf: () => [
    part(at(new THREE.CylinderGeometry(0.045, 0.07, 0.55, 5), 0, 0.275, 0), TRUNK),
    part(jitter(at(new THREE.IcosahedronGeometry(0.32, 1), 0, 0.72, 0), 0.04, 1), '', { tint: true }),
    part(jitter(at(new THREE.IcosahedronGeometry(0.22, 1), 0.18, 0.6, 0.1), 0.03, 2), '', { tint: true }),
  ],
  conifer: () => [
    part(at(new THREE.CylinderGeometry(0.035, 0.05, 0.22, 5), 0, 0.11, 0), DARK_TRUNK),
    part(at(new THREE.ConeGeometry(0.3, 0.42, 7), 0, 0.38, 0), '', { tint: true }),
    part(at(new THREE.ConeGeometry(0.23, 0.36, 7), 0, 0.6, 0, 0, 0.4, 0), '', { tint: true }),
    part(at(new THREE.ConeGeometry(0.15, 0.3, 7), 0, 0.82, 0, 0, 0.8, 0), '', { tint: true }),
  ],
  palm: () => {
    const trunk: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 4; i++) trunk.push(part(at(new THREE.CylinderGeometry(0.035, 0.045, 0.24, 5), i * i * 0.012, 0.12 + i * 0.22, 0, 0, 0, -i * 0.08), TRUNK));
    const top = 0.88;
    return [...trunk, ...ring(7).map((a) => part(at(leaf(a, 0, 0.45, 0.12, 0.22), 0.11, top, 0), '', { tint: true }))];
  },
  jungle: () => [
    part(at(new THREE.CylinderGeometry(0.05, 0.085, 0.75, 6), 0, 0.375, 0), TRUNK),
    ...ring(3).map((a) => part(at(new THREE.BoxGeometry(0.03, 0.2, 0.18), Math.cos(a) * 0.08, 0.1, Math.sin(a) * 0.08, 0, -a, 0), TRUNK)),
    part(jitter(at(new THREE.IcosahedronGeometry(0.5, 1), 0, 0.84, 0, 0, 0, 0, [1, 0.38, 1]), 0.03, 3), '', { tint: true }),
    part(jitter(at(new THREE.IcosahedronGeometry(0.3, 1), 0.2, 0.68, -0.15, 0, 0, 0, [1, 0.45, 1]), 0.02, 4), '', { tint: true }),
  ],
  swamptree: () => [
    part(at(new THREE.CylinderGeometry(0.05, 0.12, 0.6, 6), 0, 0.3, 0), DARK_TRUNK),
    ...ring(4).map((a) => part(at(new THREE.CylinderGeometry(0.018, 0.025, 0.3, 4), Math.cos(a) * 0.12, 0.09, Math.sin(a) * 0.12, Math.sin(a) * 0.7, 0, -Math.cos(a) * 0.7), DARK_TRUNK)),
    part(jitter(at(new THREE.IcosahedronGeometry(0.42, 1), 0, 0.72, 0, 0, 0, 0, [1, 0.55, 1]), 0.04, 5), '', { tint: true }),
    ...ring(6).map((a, i) => part(at(new THREE.ConeGeometry(0.035, 0.28 + (i % 2) * 0.1, 4), Math.cos(a) * 0.3, 0.5, Math.sin(a) * 0.3, Math.PI), '#7a8060')),
  ],
  deadtree: () => [
    part(at(new THREE.CylinderGeometry(0.03, 0.07, 0.8, 5), 0, 0.4, 0, 0.05, 0, 0.04), '', { tint: true }),
    ...[[0.5, 0.6, 0.9], [2.3, 0.7, -0.8], [4.2, 0.5, 0.7], [3.3, 0.82, -0.5]].map(([a, y, tilt]) =>
      part(at(new THREE.CylinderGeometry(0.012, 0.025, 0.32, 4), Math.cos(a) * 0.1, y + 0.08, Math.sin(a) * 0.1, Math.sin(a) * tilt, 0, -Math.cos(a) * tilt), '', { tint: true })),
  ],
  cactus: () => [
    part(at(new THREE.CylinderGeometry(0.09, 0.1, 0.9, 8), 0, 0.45, 0), '', { tint: true }),
    part(at(new THREE.SphereGeometry(0.09, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), 0, 0.9, 0), '', { tint: true }),
    part(at(new THREE.CylinderGeometry(0.05, 0.05, 0.18, 6), 0.14, 0.42, 0, 0, 0, Math.PI / 2), '', { tint: true }),
    part(at(new THREE.CylinderGeometry(0.05, 0.05, 0.28, 6), 0.22, 0.55, 0), '', { tint: true }),
    part(at(new THREE.CylinderGeometry(0.045, 0.045, 0.14, 6), -0.12, 0.55, 0, 0, 0, Math.PI / 2), '', { tint: true }),
    part(at(new THREE.CylinderGeometry(0.045, 0.045, 0.2, 6), -0.18, 0.66, 0), '', { tint: true }),
  ],
  rock: () => [part(jitter(at(new THREE.IcosahedronGeometry(0.5, 0), 0, 0.22, 0, 0.4, 0.7, 0.2, [1, 0.62, 0.85]), 0.08, 6), '', { tint: true })],
  boulder: () => [part(jitter(at(new THREE.IcosahedronGeometry(0.5, 1), 0, 0.33, 0, 0.2, 0.3, 0, [1.1, 0.75, 0.95]), 0.07, 7), '', { tint: true })],
  crag: () => [
    part(at(new THREE.ConeGeometry(0.18, 1, 4), 0, 0.48, 0, 0.08, 0.3, 0.05), '', { tint: true }),
    part(at(new THREE.ConeGeometry(0.14, 0.7, 4), 0.18, 0.33, 0.06, 0.1, 0.9, -0.25), '', { tint: true }),
    part(at(new THREE.ConeGeometry(0.12, 0.55, 4), -0.15, 0.26, -0.1, -0.2, 0.2, 0.3), '', { tint: true }),
  ],
  lavarock: () => {
    // A dark rock with glowing cracks: some faces are lava.
    const g = part(jitter(at(new THREE.IcosahedronGeometry(0.5, 1), 0, 0.3, 0, 0.3, 0.6, 0, [1.1, 0.65, 1]), 0.08, 8), '', { tint: true });
    const e = g.getAttribute('aEmit'), p = g.getAttribute('position'), t = g.getAttribute('aTint');
    for (let f = 0; f < p.count; f += 3) {
      const s = Math.sin(p.getX(f) * 91.7 + p.getZ(f) * 47.3 + f) * 43758.5453;
      if (s - Math.floor(s) < 0.22) for (let k = 0; k < 3; k++) { e.setX(f + k, 1); t.setX(f + k, 0); }
    }
    return [g];
  },
  fungus: () => [
    part(at(new THREE.CylinderGeometry(0.05, 0.07, 0.6, 6), 0, 0.3, 0), '#d8d0b8'),
    part(at(new THREE.SphereGeometry(0.34, 10, 4, 0, Math.PI * 2, 0, Math.PI / 2), 0, 0.56, 0, 0, 0, 0, [1, 0.55, 1]), '', { tint: true, emit: 0.45 }),
    part(at(new THREE.CylinderGeometry(0.03, 0.04, 0.3, 5), 0.2, 0.15, 0.1), '#d8d0b8'),
    part(at(new THREE.SphereGeometry(0.14, 8, 3, 0, Math.PI * 2, 0, Math.PI / 2), 0.2, 0.29, 0.1, 0, 0, 0, [1, 0.6, 1]), '', { tint: true, emit: 0.45 }),
  ],
  crystal: () => [[0, 0, 1, 0], [0.12, 0.6, 0.7, 0.35], [-0.1, 2.4, 0.55, -0.4], [0.05, 4.1, 0.45, 0.5]].flatMap(([x, a, h, tilt]) => {
    const col = new THREE.CylinderGeometry(0.06, 0.07, h * 0.8, 6).translate(0, h * 0.4, 0);
    const tip = new THREE.ConeGeometry(0.06, h * 0.2, 6).translate(0, h * 0.9, 0);
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x, 0, x * 0.5), new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.sin(a) * tilt, 0, Math.cos(a) * tilt)), new THREE.Vector3(1, 1, 1));
    return [part(col.applyMatrix4(m), '', { tint: true, emit: 0.25 }), part(tip.applyMatrix4(m), '', { tint: true, emit: 0.4 })];
  }),
  // Bone worlds (change surface-flora): the dead, in the round. A unit long, lying along x.
  bones: () => [
    // A thigh bone with knuckled ends, and a broken one across it.
    ...bone([new THREE.Vector3(-0.42, 0.05, 0), new THREE.Vector3(0.42, 0.05, 0)], 0.045, 0.04),
    ...[[-0.45, 0.06], [-0.45, -0.06], [0.45, 0.06], [0.45, -0.06]].map(([x, z]) => part(at(new THREE.IcosahedronGeometry(0.075, 0), x, 0.07, z), '', { tint: true })),
    ...bone([new THREE.Vector3(-0.05, 0.04, -0.3), new THREE.Vector3(0.2, 0.06, 0.25)], 0.03, 0.025),
    part(jitter(at(new THREE.IcosahedronGeometry(0.06, 0), 0.22, 0.05, 0.28), 0.015, 12), '', { tint: true }),
  ],
  ribcage: () => [
    // An arched spine of vertebrae, tall ribs curving up and in from both sides, and the skull.
    ...[-0.4, -0.27, -0.14, -0.01, 0.12, 0.25, 0.38].map((x, i) => part(at(new THREE.BoxGeometry(0.075, 0.06, 0.07), x, 0.1 + Math.sin((i / 6) * Math.PI) * 0.06, 0, 0, 0, 0.1), '', { tint: true })),
    ...[-0.3, -0.18, -0.06, 0.06, 0.18].flatMap((x) => [1, -1].flatMap((side) => {
      const h = 0.5 - Math.abs(x) * 0.6;
      return bone(arc(side * Math.PI / 2, x, [0, 0.14], [0.32, 0.18 + h * 0.6], [0.18, 0.2 + h], 4), 0.022, 0.012);
    })),
    part(jitter(at(new THREE.IcosahedronGeometry(0.12, 1), 0.56, 0.13, 0, 0, 0, 0.2, [1.35, 0.85, 0.9]), 0.02, 9), '', { tint: true }),
    part(at(new THREE.SphereGeometry(0.035, 6, 4), 0.62, 0.17, 0.07), '#141008'),
    part(at(new THREE.SphereGeometry(0.035, 6, 4), 0.62, 0.17, -0.07), '#141008'),
    ...[1, -1].flatMap((side) => bone(arc(side * Math.PI / 2, 0.52, [0.06, 0.2], [0.18, 0.3], [0.12, 0.45], 4), 0.03, 0.006)),
  ],
  skeleton: () => [
    // A great beast fallen on its side: spine, ribs sprung open, four legs, a long horned skull.
    ...bone([-0.5, -0.3, -0.1, 0.1, 0.3, 0.45].map((x, i) => new THREE.Vector3(x, 0.12 + Math.sin((i / 5) * Math.PI) * 0.1, 0.05 * Math.sin(i))), 0.04, 0.03),
    ...[-0.25, -0.12, 0.01, 0.14, 0.27].flatMap((x, i) => bone(arc(Math.PI / 2 + (i % 2 ? 0.15 : -0.1), x, [0, 0.2], [0.25, 0.42 - Math.abs(x) * 0.4], [0.38, 0.16], 4), 0.024, 0.01)),
    ...[-0.32, 0.3].flatMap((x) => [0.4, 1.0].flatMap((yaw) => bone([new THREE.Vector3(x, 0.1, 0), new THREE.Vector3(x + Math.cos(yaw) * 0.12, 0.05, -0.18), new THREE.Vector3(x + Math.cos(yaw) * 0.22, 0.02, -0.34)], 0.03, 0.02))),
    part(jitter(at(new THREE.IcosahedronGeometry(0.11, 1), 0.6, 0.12, 0.02, 0, 0, -0.15, [1.6, 0.8, 0.85]), 0.02, 13), '', { tint: true }),
    part(at(new THREE.SphereGeometry(0.03, 6, 4), 0.66, 0.16, 0.08), '#141008'),
    ...bone(arc(-Math.PI / 2, 0.58, [0.06, 0.18], [0.2, 0.32], [0.08, 0.5], 4), 0.032, 0.006),
  ],
  tusk: () => [
    // Two great tusks (or the last ribs of something buried) curving up out of the ground.
    ...bone(arc(0, -0.12, [0, -0.05], [0.25, 0.75], [0.5, 1.0], 6), 0.07, 0.012),
    ...bone(arc(Math.PI * 0.85, 0.12, [0, -0.05], [0.2, 0.55], [0.38, 0.72], 5), 0.055, 0.01),
    part(jitter(at(new THREE.IcosahedronGeometry(0.12, 0), 0, 0.02, 0, 0, 0, 0, [1.6, 0.5, 1.2]), 0.03, 14), '#4a3e2e'),
  ],
  spire: () => [
    part(at(new THREE.CylinderGeometry(0.035, 0.11, 1, 4), 0, 0.5, 0, 0, Math.PI / 4, 0), '', { tint: true }),
    ...ring(4).map((a) => part(at(new THREE.BoxGeometry(0.012, 0.7, 0.012), Math.cos(a) * 0.065, 0.42, Math.sin(a) * 0.065), '#ffffff', { emit: 1 })),
    part(at(new THREE.OctahedronGeometry(0.05), 0, 1.04, 0), '#ffffff', { emit: 1.4 }),
  ],
  wreck: () => [
    part(at(new THREE.BoxGeometry(0.62, 0.05, 0.4), 0.05, 0.12, 0, 0.4, 0.3, 0.25), '', { tint: true }),
    part(at(new THREE.BoxGeometry(0.5, 0.04, 0.32), -0.15, 0.06, 0.18, -0.2, 1.2, 0.1), '', { tint: true }),
    part(at(new THREE.BoxGeometry(0.08, 0.95, 0.08), -0.1, 0.45, -0.1, 0.18, 0, 0.12), '', { tint: true }),
    part(at(new THREE.BoxGeometry(0.06, 0.06, 0.06), -0.02, 0.92, -0.18), '#ffffff', { emit: 1 }),
  ],
  block: () => [
    part(at(new THREE.BoxGeometry(0.55, 1, 0.55), 0, 0.5, 0), '', { tint: true, emit: 1 }),
    part(at(new THREE.BoxGeometry(0.3, 0.12, 0.3), 0.06, 1.06, -0.04), '', { tint: true }),
  ],
};

/** One prop kind's merged geometry. */
export function propGeometry(kind: PropKind): THREE.BufferGeometry {
  const parts = BUILDERS[kind]();
  const merged = mergeGeometries(parts, false)!;
  for (const p of parts) p.dispose();
  return merged;
}
