import * as THREE from 'three';

/**
 * The Dyson sphere's plates, shared by the system view (which builds them) and the close-up's sky
 * (which ray-casts them), so the plates, their seams and the few missing ones are the same plates
 * from across the system and from a few thousand km off the hull.
 *
 * The shell is three.js's IcosahedronGeometry at SHELL_DETAIL: each of the icosahedron's 20 faces
 * cut into a triangular grid of SHELL_DETAIL + 1 a side, pushed out onto the sphere. A direction's
 * plate is found the same way here (in TypeScript) and in SHELL_GLSL: the face whose plane it meets
 * first, then its place on that face's grid. A plate is missing by a hash of (face, row, column, which
 * half), never by the order the geometry was built in.
 */
export const SHELL_DETAIL = 14;
/** The share of plates missing (the star shows through). */
export const SHELL_MISSING = 0.03;
/** How far each plate is drawn in toward its centre: the seams between them. */
export const SHELL_SHRINK = 0.07;

const T = (1 + Math.sqrt(5)) / 2;
/** three.js's IcosahedronGeometry, vertex for vertex and face for face. */
const ICO_VERTS = [-1, T, 0, 1, T, 0, -1, -T, 0, 1, -T, 0, 0, -1, T, 0, 1, T, 0, -1, -T, 0, 1, -T, T, 0, -1, T, 0, 1, -T, 0, -1, -T, 0, 1];
const ICO_FACES = [0, 11, 5, 0, 5, 1, 0, 1, 7, 0, 7, 10, 0, 10, 11, 1, 5, 9, 5, 11, 4, 11, 10, 2, 10, 7, 6, 7, 1, 8, 3, 9, 4, 3, 4, 2, 3, 2, 6, 3, 6, 8, 3, 8, 9, 4, 9, 5, 2, 4, 11, 6, 2, 10, 8, 6, 7, 9, 8, 1];
const vert = (k: number): THREE.Vector3 => new THREE.Vector3(ICO_VERTS[k * 3], ICO_VERTS[k * 3 + 1], ICO_VERTS[k * 3 + 2]).normalize();
/** Each face's corners (a, b, c) on the unit sphere. */
export const SHELL_FACES: ReadonlyArray<readonly [THREE.Vector3, THREE.Vector3, THREE.Vector3]> = Array.from({ length: 20 }, (_, f) => [vert(ICO_FACES[f * 3]), vert(ICO_FACES[f * 3 + 1]), vert(ICO_FACES[f * 3 + 2])] as const);

/** A plate: its face, its row (toward c) and column (toward b) on that face's grid, and which half of the cell. */
export interface ShellCell {
  readonly face: number;
  readonly i: number;
  readonly j: number;
  readonly up: number;
}

const n = new THREE.Vector3(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), p = new THREE.Vector3();

/** The plate a direction (from the shell's centre) passes through. */
export function shellCell(dir: THREE.Vector3): ShellCell {
  let best = 0, bestDot = -Infinity;
  SHELL_FACES.forEach(([a, b, c], f) => {
    n.copy(a).add(b).add(c);
    const d = dir.dot(n);
    if (d > bestDot) { bestDot = d; best = f; }
  });
  const [a, b, c] = SHELL_FACES[best];
  e1.subVectors(b, a); e2.subVectors(c, a);
  n.crossVectors(e1, e2).normalize();
  p.copy(dir).multiplyScalar(a.dot(n) / dir.dot(n)).sub(a);
  const d11 = e1.dot(e1), d12 = e1.dot(e2), d22 = e2.dot(e2), p1 = p.dot(e1), p2 = p.dot(e2);
  const den = d11 * d22 - d12 * d12;
  const u = (d22 * p1 - d12 * p2) / den, v = (d11 * p2 - d12 * p1) / den;
  const cols = SHELL_DETAIL + 1;
  const J = u * cols, I = v * cols;
  const i = Math.min(Math.max(Math.floor(I), 0), cols - 1), j = Math.min(Math.max(Math.floor(J), 0), cols - 1);
  return { face: best, i, j, up: I - i + (J - j) > 1 ? 1 : 0 };
}

function lowbias32(x: number): number {
  x ^= x >>> 16; x = Math.imul(x, 0x7feb352d);
  x ^= x >>> 15; x = Math.imul(x, 0x846ca68b);
  x ^= x >>> 16;
  return x >>> 0;
}

/** The plate under the close-up's landing site (the shell's bottom), which is never missing. */
export const SHELL_ANCHOR = shellCell(new THREE.Vector3(0, -1, 0));

/** Whether a plate is there (not one of the few missing). */
export function shellKept(cell: ShellCell, seed: number): boolean {
  if (cell.face === SHELL_ANCHOR.face && cell.i === SHELL_ANCHOR.i && cell.j === SHELL_ANCHOR.j && cell.up === SHELL_ANCHOR.up) return true;
  const key = (cell.face + 20 * (cell.i + 16 * (cell.j + 16 * cell.up))) >>> 0;
  const h = lowbias32((key ^ lowbias32(seed >>> 0)) >>> 0);
  return (h & 0xffff) / 65535 >= SHELL_MISSING;
}

/** The uniforms SHELL_GLSL reads. */
export function shellUniforms(seed: number): Record<string, THREE.IUniform> {
  return {
    uShellA: { value: SHELL_FACES.map((f) => f[0].clone()) },
    uShellB: { value: SHELL_FACES.map((f) => f[1].clone()) },
    uShellC: { value: SHELL_FACES.map((f) => f[2].clone()) },
    uShellSeed: { value: seed >>> 0 },
    uShellAnchor: { value: new THREE.Vector4(SHELL_ANCHOR.face, SHELL_ANCHOR.i, SHELL_ANCHOR.j, SHELL_ANCHOR.up) },
  };
}

/**
 * GLSL: shellCell(dir) -> (face, row, column, half) and the distance to the plate's nearest seam
 * (in grid cells) in `seam`; shellKept(cell) as shellKept above, bit for bit.
 */
export const SHELL_GLSL = /* glsl */ `
uniform vec3 uShellA[20];
uniform vec3 uShellB[20];
uniform vec3 uShellC[20];
uniform uint uShellSeed;
uniform vec4 uShellAnchor;
vec4 shellCell(vec3 dir, out float seam) {
  int best = 0;
  float bestDot = -1e9;
  for (int f = 0; f < 20; f++) {
    float d = dot(dir, uShellA[f] + uShellB[f] + uShellC[f]);
    if (d > bestDot) { bestDot = d; best = f; }
  }
  vec3 a = uShellA[best], e1 = uShellB[best] - a, e2 = uShellC[best] - a;
  vec3 nn = normalize(cross(e1, e2));
  vec3 p = dir * (dot(a, nn) / dot(dir, nn)) - a;
  float d11 = dot(e1, e1), d12 = dot(e1, e2), d22 = dot(e2, e2), p1 = dot(p, e1), p2 = dot(p, e2);
  float den = d11 * d22 - d12 * d12;
  float cols = ${(SHELL_DETAIL + 1).toFixed(1)};
  float J = (d22 * p1 - d12 * p2) / den * cols, I = (d11 * p2 - d12 * p1) / den * cols;
  float i = clamp(floor(I), 0.0, cols - 1.0), j = clamp(floor(J), 0.0, cols - 1.0);
  float fi = I - i, fj = J - j;
  float up = fi + fj > 1.0 ? 1.0 : 0.0;
  // Distance to the nearest of the cell's three edges: its row, its column and its diagonal.
  seam = up > 0.5 ? min(min(1.0 - fi, 1.0 - fj), fi + fj - 1.0) : min(min(fi, fj), 1.0 - fi - fj);
  return vec4(float(best), i, j, up);
}
uint shellHash(uint x) {
  x ^= x >> 16u; x *= 0x7feb352du;
  x ^= x >> 15u; x *= 0x846ca68bu;
  x ^= x >> 16u;
  return x;
}
bool shellKept(vec4 c) {
  if (all(equal(c, uShellAnchor))) return true;
  uint key = uint(c.x + 20.0 * (c.y + 16.0 * (c.z + 16.0 * c.w)));
  uint h = shellHash(key ^ shellHash(uShellSeed));
  return float(h & 0xffffu) / 65535.0 >= ${SHELL_MISSING.toFixed(3)};
}
`;
