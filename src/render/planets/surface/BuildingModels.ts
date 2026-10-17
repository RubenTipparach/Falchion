import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Rng } from '../../../core/rng/Rng';

/**
 * Special buildings on a planet's surface: one recognisable silhouette per building id
 * (src/content/buildings.ts), built in a local frame (y up, 1 unit = 1 planet radius) from three.js
 * primitives, so every solid part faces outward. Add a building to the content table and a model
 * here (buildingModels.test.ts fails until you do).
 *
 * Emission codes (aEmit, read by the structure shader): 0 plain, 1 lit windows, 2 glow, 3 blinking
 * beacon, 4 lit at night.
 */
export interface BuildingModel {
  readonly geo: THREE.BufferGeometry;
  /** Height of its top (labels sit above). */
  readonly top: number;
  /** Smoke stack tops, local (Manufactory). */
  readonly stacks?: readonly THREE.Vector3[];
  /** A part that turns (the shipyard's ring). */
  readonly ring?: THREE.BufferGeometry;
}

type ModelBuilder = () => BuildingModel;

const M4 = new THREE.Matrix4(), EUL = new THREE.Euler();

/** Vertex colour and emission code for a whole part (uvs dropped so parts merge). */
export function paint(geo: THREE.BufferGeometry, color: string, emit = 0): THREE.BufferGeometry {
  geo.deleteAttribute('uv');
  const n = geo.getAttribute('position').count, c = new THREE.Color(color);
  const ca = new Float32Array(n * 3), ea = new Float32Array(n).fill(emit);
  for (let i = 0; i < n; i++) { ca[i * 3] = c.r; ca[i * 3 + 1] = c.g; ca[i * 3 + 2] = c.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(ca, 3));
  geo.setAttribute('aEmit', new THREE.BufferAttribute(ea, 1));
  return geo;
}

function piece(geo: THREE.BufferGeometry, color: string, emit: number, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0): THREE.BufferGeometry {
  paint(geo, color, emit);
  geo.applyMatrix4(M4.makeRotationFromEuler(EUL.set(rx, ry, rz)));
  geo.translate(x, y, z);
  return geo;
}
const box = (w: number, h: number, d: number, color: string, emit: number, x: number, y: number, z: number, ry = 0) =>
  piece(new THREE.BoxGeometry(w, h, d), color, emit, x, y + h / 2, z, 0, ry, 0);
const cyl = (rt: number, rb: number, h: number, seg: number, color: string, emit: number, x: number, y: number, z: number) =>
  piece(new THREE.CylinderGeometry(rt, rb, h, seg, 1), color, emit, x, y + h / 2, z);
const ball = (r: number, color: string, emit: number, x: number, y: number, z: number, ws = 8, hs = 6) =>
  piece(new THREE.SphereGeometry(r, ws, hs), color, emit, x, y, z);
const merged = (parts: THREE.BufferGeometry[]): THREE.BufferGeometry => {
  const g = mergeGeometries(parts);
  parts.forEach((p) => p.dispose());
  if (!g) throw new Error('building model parts do not merge');
  return g;
};

const temple: ModelBuilder = () => {
  const p: THREE.BufferGeometry[] = [], stone = '#b9ae98';
  p.push(cyl(0.0042, 0.0046, 0.00025, 24, '#8f8676', 0, 0, 0, 0));
  for (let k = 0; k < 4; k++) {
    const a = (k * Math.PI) / 2 + Math.PI / 4;
    p.push(box(0.00045, 0.0026, 0.00045, '#cfc4ad', 0, Math.cos(a) * 0.0032, 0.00025, Math.sin(a) * 0.0032));
    p.push(box(0.0006, 0.0002, 0.0006, '#e6b450', 2, Math.cos(a) * 0.0032, 0.00285, Math.sin(a) * 0.0032));
  }
  let y = 0.00025, r = 0.0021;
  for (let k = 0; k < 4; k++) {
    const h = 0.0019 - k * 0.0003;
    p.push(cyl(r * 0.82, r, h, 8, k % 2 ? stone : '#a99e88', k === 3 ? 1 : 0, 0, y, 0));
    y += h;
    p.push(cyl(r * 0.84, r * 0.84, 0.00012, 8, '#e6b450', 2, 0, y, 0));
    y += 0.00012;
    r *= 0.72;
  }
  p.push(cyl(0.00002, r, 0.0062, 8, '#d9a441', 0, 0, y, 0));
  p.push(ball(0.00028, '#fff0c0', 3, 0, y + 0.0063, 0, 12, 8));
  return { geo: merged(p), top: y + 0.0066 };
};

const lab: ModelBuilder = () => {
  const p: THREE.BufferGeometry[] = [];
  p.push(cyl(0.0042, 0.0044, 0.0003, 32, '#59636e', 0, 0, 0, 0));
  p.push(cyl(0.0035, 0.0035, 0.00012, 32, '#7fd3e6', 2, 0, 0.0003, 0));
  p.push(piece(new THREE.SphereGeometry(0.0033, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2), '#8fd8ee', 4, 0, 0.00042, 0));
  for (let k = 0; k < 3; k++) {
    const a = k * 2.1 + 0.4;
    p.push(piece(new THREE.SphereGeometry(0.0012, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2), '#a6d0dc', 4, Math.cos(a) * 0.0052, 0.0001, Math.sin(a) * 0.0052));
  }
  p.push(box(0.0006, 0.0016, 0.0006, '#7c8794', 0, -0.0062, 0, 0.0014));
  p.push(piece(new THREE.SphereGeometry(0.0016, 20, 8, 0, Math.PI * 2, 0, Math.PI / 2.6), '#d9e0e6', 0, -0.0062, 0.0024, 0.0014, -2.3, 0, 0.3));
  p.push(cyl(0.00006, 0.0001, 0.0042, 6, '#9aa6b2', 0, 0.0058, 0, -0.0028));
  p.push(ball(0.00018, '#ff5040', 3, 0.0058, 0.0043, -0.0028));
  return { geo: merged(p), top: 0.0045 };
};

const manufactory: ModelBuilder = () => {
  const p: THREE.BufferGeometry[] = [];
  p.push(box(0.0085, 0.0018, 0.0042, '#5d6670', 1, 0, 0, -0.0015));
  for (let k = 0; k < 4; k++) p.push(piece(new THREE.CylinderGeometry(0.0006, 0.0006, 0.0042, 3, 1), '#6f7984', 0, -0.0032 + k * 0.0021, 0.0018, -0.0015, Math.PI / 2, 0, 0));
  p.push(box(0.005, 0.0012, 0.003, '#6b5f55', 1, 0.0012, 0, 0.0024));
  p.push(box(0.0022, 0.00025, 0.0022, '#ff7a2a', 4, -0.003, 0, 0.0026));
  const stacks: THREE.Vector3[] = [];
  for (let k = 0; k < 4; k++) {
    const x = -0.0034 + k * 0.0021, z = 0.0006, h = 0.0058 + (k % 2) * 0.0016;
    p.push(cyl(0.00034, 0.00048, h, 12, k % 2 ? '#8c4a3a' : '#9a9590', 0, x, 0, z));
    p.push(cyl(0.00036, 0.00036, 0.00016, 12, '#e8e3dc', 0, x, h - 0.0009, z));
    p.push(ball(0.00012, '#ff4030', 3, x, h + 0.0001, z, 6, 4));
    stacks.push(new THREE.Vector3(x, h, z));
  }
  return { geo: merged(p), top: 0.008, stacks };
};

const tradeHub: ModelBuilder = () => {
  const p: THREE.BufferGeometry[] = [];
  for (const [x, z] of [[-0.0042, -0.0032], [0.0042, -0.0032], [-0.0042, 0.0034], [0.0042, 0.0034]]) {
    p.push(cyl(0.0024, 0.0025, 0.00022, 28, '#4e555d', 0, x, 0, z));
    p.push(cyl(0.0021, 0.0021, 0.00006, 28, '#7fd3e6', 2, x, 0.00022, z));
    p.push(cyl(0.0019, 0.0019, 0.00008, 28, '#5a626b', 0, x, 0.00022, z));
    p.push(box(0.0022, 0.00004, 0.0003, '#e6b450', 2, x, 0.0003, z));
    p.push(box(0.0003, 0.00004, 0.0022, '#e6b450', 2, x, 0.0003, z));
  }
  p.push(box(0.0034, 0.0011, 0.0016, '#8994a0', 1, 0, 0, 0));
  p.push(piece(new THREE.CylinderGeometry(0.0009, 0.0009, 0.0034, 16, 1, false, 0, Math.PI), '#c8d0d8', 0, 0, 0.0011, 0, 0, 0, Math.PI / 2));
  p.push(cyl(0.00032, 0.0004, 0.0042, 10, '#9aa4ae', 0, 0.0013, 0, 0.0001));
  p.push(cyl(0.0008, 0.0006, 0.0006, 10, '#7fd3e6', 2, 0.0013, 0.0042, 0.0001));
  p.push(ball(0.00014, '#ff4030', 3, 0.0013, 0.005, 0.0001, 6, 4));
  // A shuttle on one pad.
  p.push(piece(new THREE.ConeGeometry(0.0006, 0.0022, 8), '#e9edf1', 0, 0.0042, 0.0014, -0.0032));
  p.push(box(0.0018, 0.00012, 0.0007, '#c8ced4', 0, 0.0042, 0.0003, -0.0032));
  return { geo: merged(p), top: 0.005 };
};

const mine: ModelBuilder = () => {
  const p: THREE.BufferGeometry[] = [];
  // Headframe lattice, conveyor and spoil heaps beside the pit (the pit is dug into the terrain).
  const hx = 0.0078, hz = 0.0014;
  for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) p.push(piece(new THREE.CylinderGeometry(0.00007, 0.0001, 0.0046, 4), '#9a8c78', 0, hx + dx * 0.00042, 0.0023, hz + dz * 0.00042, dz * 0.12, 0, -dx * 0.12));
  for (let k = 0; k < 4; k++) p.push(box(0.0013 - k * 0.0002, 0.00008, 0.0013 - k * 0.0002, '#7e7262', 0, hx, 0.0008 + k * 0.001, hz));
  p.push(cyl(0.0005, 0.0005, 0.0002, 16, '#c9a04a', 0, hx, 0.0044, hz));
  p.push(ball(0.00012, '#ff4030', 3, hx, 0.0048, hz, 6, 4));
  p.push(piece(new THREE.BoxGeometry(0.0066, 0.0002, 0.0004), '#585048', 0, 0.0048, 0.0011, -0.0024, 0, 0.5, 0.22));
  for (const [x, z, r, h] of [[0.0092, -0.0042, 0.0016, 0.0012], [0.0102, 0.0034, 0.0013, 0.0009], [0.0062, 0.0058, 0.001, 0.0007]]) p.push(piece(new THREE.ConeGeometry(r, h, 12), '#8a6a44', 0, x, h / 2, z));
  p.push(box(0.0018, 0.0007, 0.0012, '#6f7780', 1, 0.0095, 0, 0.0005));
  p.push(box(0.0008, 0.00025, 0.0008, '#ffb050', 4, 0.0085, 0.0007, 0.0005));
  return { geo: merged(p), top: 0.005 };
};

const farm: ModelBuilder = () => {
  const p: THREE.BufferGeometry[] = [], rng = new Rng(5);
  const greens = ['#4f8a2c', '#6aa33a', '#3d7a3a', '#86b04a', '#5c9a50', '#a2b84a'];
  for (let i = 0; i < 6; i++) for (let j = 0; j < 4; j++) {
    if (i === 2 && j === 1) continue;
    p.push(box(0.0023, 0.00006, 0.0023, rng.pick(greens), 0, -0.0075 + i * 0.0026, 0, -0.005 + j * 0.0026));
  }
  p.push(cyl(0.0021, 0.0021, 0.00007, 32, '#7dbb44', 0, -0.0023, 0, -0.0011));
  p.push(piece(new THREE.BoxGeometry(0.0021, 0.00008, 0.00008), '#cfd6dc', 0, -0.0023, 0.00016, -0.0011, 0, 0.6, 0));
  for (let k = 0; k < 5; k++) p.push(piece(new THREE.CylinderGeometry(0.00055, 0.00055, 0.0021, 14, 1, false, 0, Math.PI), '#b9f0b0', 4, -0.0075 + k * 0.0026, 0, 0.0054, 0, 0, Math.PI / 2));
  p.push(box(0.0016, 0.0009, 0.001, '#d8d2c4', 1, 0.0068, 0, 0.0054));
  p.push(cyl(0.00045, 0.00045, 0.0016, 12, '#c4c9ce', 0, 0.0082, 0, 0.0054));
  return { geo: merged(p), top: 0.0022 };
};

const warehouse: ModelBuilder = () => {
  const p: THREE.BufferGeometry[] = [], roofs = ['#8a4a3a', '#6f7a86', '#4f7f86', '#9a9083'];
  for (let r = 0; r < 3; r++) for (let k = 0; k < 2; k++) {
    p.push(box(0.0046, 0.0009, 0.0014, '#a7a196', 1, -0.0026 + k * 0.0052, 0, -0.0034 + r * 0.0024));
    p.push(piece(new THREE.CylinderGeometry(0.00072, 0.00072, 0.0046, 3, 1), roofs[(r + k) % 4], 0, -0.0026 + k * 0.0052, 0.0009, -0.0034 + r * 0.0024, 0, 0, Math.PI / 2));
  }
  const rng = new Rng(11), cc = ['#c0573a', '#3d6fb0', '#e6b450', '#4f8a2c', '#8a8580'];
  for (let i = 0; i < 18; i++) p.push(box(0.0007, 0.0003 * rng.int(1, 3), 0.0003, rng.pick(cc), 0, -0.0045 + (i % 6) * 0.0018, 0, 0.0039 + Math.floor(i / 6) * 0.0005));
  for (let k = 0; k < 4; k++) p.push(cyl(0.00004, 0.00004, 0.0014, 4, '#8a8f96', 0, -0.0056 + k * 0.0037, 0, 0.0031), ball(0.0001, '#ffd28a', 4, -0.0056 + k * 0.0037, 0.0015, 0.0031, 6, 4));
  return { geo: merged(p), top: 0.0018 };
};

const shipyard: ModelBuilder = () => {
  const p: THREE.BufferGeometry[] = [];
  // A hull along +x in a scaffold cradle; a ring turns around it.
  p.push(piece(new THREE.CylinderGeometry(0.0016, 0.0019, 0.012, 6, 1), '#c9cfd6', 1, 0, 0, 0, 0, 0, Math.PI / 2));
  p.push(piece(new THREE.ConeGeometry(0.0016, 0.0042, 6), '#d8dde2', 0, 0.0081, 0, 0, 0, 0, -Math.PI / 2));
  p.push(piece(new THREE.BoxGeometry(0.0034, 0.0008, 0.0062), '#9aa3ad', 0, -0.0034, 0, 0));
  for (const z of [-0.0012, 0.0012]) p.push(piece(new THREE.CylinderGeometry(0.0007, 0.0009, 0.0018, 10), '#5c636b', 0, -0.0068, 0, z, 0, 0, Math.PI / 2));
  const corners = [[0.0034, 0.0034], [-0.0034, 0.0034], [0.0034, -0.0034], [-0.0034, -0.0034]];
  for (let i = 0; i < 6; i++) {
    const x = -0.0075 + i * 0.003;
    for (const [y, z] of corners) p.push(piece(new THREE.BoxGeometry(0.00016, 0.00016, 0.00016), '#8a8f96', 0, x, y, z));
    p.push(piece(new THREE.BoxGeometry(0.0001, 0.0068, 0.0001), '#7d848c', 0, x, 0, 0.0034), piece(new THREE.BoxGeometry(0.0001, 0.0068, 0.0001), '#7d848c', 0, x, 0, -0.0034));
    p.push(piece(new THREE.BoxGeometry(0.0001, 0.0001, 0.0068), '#7d848c', 0, x, 0.0034, 0), piece(new THREE.BoxGeometry(0.0001, 0.0001, 0.0068), '#7d848c', 0, x, -0.0034, 0));
    p.push(ball(0.00011, i % 2 ? '#ffd27a' : '#ff5040', 3, x, 0.0036, 0.0036, 6, 4));
  }
  for (const [y, z] of corners) p.push(piece(new THREE.BoxGeometry(0.0152, 0.00012, 0.00012), '#8a8f96', 0, 0, y, z));
  p.push(piece(new THREE.BoxGeometry(0.0003, 0.0003, 0.0003), '#fff6d0', 3, 0.0021, 0.0019, 0.0006));
  const ring: THREE.BufferGeometry[] = [];
  ring.push(piece(new THREE.TorusGeometry(0.0072, 0.00045, 8, 64), '#b8bfc7', 0, 0, 0, 0, 0, Math.PI / 2, 0));
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    ring.push(ball(0.00016, k % 2 ? '#7fd3e6' : '#e6b450', 3, 0, Math.cos(a) * 0.0072, Math.sin(a) * 0.0072, 6, 4));
  }
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + 0.4;
    ring.push(piece(new THREE.BoxGeometry(0.00012, 0.0036, 0.00012), '#8a8f96', 0, 0, Math.cos(a) * 0.0054, Math.sin(a) * 0.0054, a, 0, 0));
  }
  return { geo: merged(p), ring: merged(ring), top: 0.0085 };
};

/** The capital's seat of government: a stepped tower on a ringed plaza. */
export const capitolModel: ModelBuilder = () => {
  const p: THREE.BufferGeometry[] = [];
  p.push(cyl(0.0042, 0.0045, 0.0003, 32, '#8d8a82', 0, 0, 0, 0));
  p.push(cyl(0.0038, 0.0038, 0.00008, 48, '#a88a4a', 0, 0, 0.0003, 0), cyl(0.0039, 0.0039, 0.00003, 48, '#e6b450', 2, 0, 0.00038, 0));
  p.push(box(0.0022, 0.0062, 0.0022, '#5f7d99', 1, 0, 0.0003, 0, Math.PI / 4));
  p.push(box(0.0016, 0.004, 0.0016, '#6f8aa4', 1, 0, 0.0065, 0, Math.PI / 4));
  p.push(cyl(0.0006, 0.0008, 0.0024, 12, '#8ca0b4', 1, 0, 0.0105, 0));
  p.push(cyl(0.00095, 0.00095, 0.00022, 24, '#e6b450', 2, 0, 0.0122, 0));
  p.push(cyl(0.00002, 0.0003, 0.0034, 8, '#e6b450', 2, 0, 0.0129, 0));
  p.push(ball(0.0002, '#ff5040', 3, 0, 0.0164, 0));
  return { geo: merged(p), top: 0.0168 };
};

/** One model per building id. */
export const BUILDING_MODELS: Readonly<Record<string, ModelBuilder>> = {
  farm, mine, manufactory, 'trade-hub': tradeHub, shipyard, lab, warehouse, temple,
};
