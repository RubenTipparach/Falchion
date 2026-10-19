import { smoothstep } from './Noise';
import { BASE_OCTAVES, rawHeight, type SurfaceLook } from './Terrain';

/**
 * The close-up's globe, baked from the terrain noise (change surface-perf): the ground height with
 * the settlements' plateaus and the Deep Mine's pit dug in (the GPU's shapedH), and one cube face of
 * the cube-sphere mesh at a time. Pure and plain data in and out, so a face can be baked in a Web
 * Worker (src/render/planets/surface/bake.worker.ts) as well as on the main thread.
 */
export type Vec3 = readonly [number, number, number];

/** A settlement's plateau: the ground is flattened to `level` within `flatIn` of `dir`, blending out by `flatOut`. */
export interface Plateau {
  readonly dir: Vec3;
  readonly flatIn: number;
  readonly flatOut: number;
  readonly level: number;
}

export interface Pit {
  readonly dir: Vec3;
  readonly radius: number;
  readonly depth: number;
}

/** Ground height under a unit direction, with plateaus and the pit. */
export function shapedHeight(look: SurfaceLook, plateaus: readonly Plateau[], pit: Pit | null, x: number, y: number, z: number, octaves = BASE_OCTAVES): number {
  let h = rawHeight(look, x, y, z, octaves);
  for (const c of plateaus) {
    const ch = Math.hypot(x - c.dir[0], y - c.dir[1], z - c.dir[2]);
    const f = 1 - smoothstep(c.flatIn, c.flatOut, ch);
    if (f > 0) h += (c.level - h) * f;
  }
  if (pit) {
    const pc = Math.hypot(x - pit.dir[0], y - pit.dir[1], z - pit.dir[2]) / pit.radius;
    if (pc < 1) {
      const t = 1 - pc;
      h -= (pit.depth * (Math.floor(t * 5) + smoothstep(0.65, 1, t * 5 - Math.floor(t * 5)))) / 5;
    }
  }
  return h;
}

/** Radius of the ground for a height (planet radius 1); `amp` is the relief's amplitude. */
export const radiusOfHeight = (look: SurfaceLook, h: number, amp: number): number =>
  1 + amp * (look.dry ? Math.max((h + 0.6) * 0.5, 0) : Math.max(h - look.sea, 0));

/** The cube's faces: normal, then the two axes across it. */
export const CUBE_FACES: ReadonlyArray<readonly [Vec3, Vec3, Vec3]> = [
  [[1, 0, 0], [0, 0, -1], [0, 1, 0]], [[-1, 0, 0], [0, 0, 1], [0, 1, 0]],
  [[0, 1, 0], [1, 0, 0], [0, 0, -1]], [[0, -1, 0], [1, 0, 0], [0, 0, 1]],
  [[0, 0, 1], [1, 0, 0], [0, 1, 0]], [[0, 0, -1], [-1, 0, 0], [0, 1, 0]],
];

export interface BakeJob {
  readonly look: SurfaceLook;
  readonly plateaus: readonly Plateau[];
  readonly pit: Pit | null;
  /** Cells across a face. */
  readonly cells: number;
  readonly face: number;
  readonly amp: number;
}

export interface BakedFace {
  readonly position: Float32Array;
  readonly normal: Float32Array;
  /** The height at each vertex (the shader's colour reads it). */
  readonly height: Float32Array;
  readonly index: Uint32Array;
}

/**
 * One face of the cube-sphere. Heights come from a grid one cell wider on every side, so normals
 * are central differences of neighbours (no extra noise per vertex) and agree across face edges.
 */
export function bakeFace(job: BakeJob): BakedFace {
  const { look, plateaus, pit, cells: N, amp } = job;
  const M = N + 3;
  const [n, u, v] = CUBE_FACES[job.face];
  const P = new Float32Array(M * M * 3), H = new Float32Array(M * M);
  for (let j = 0; j < M; j++) {
    const t = Math.tan((((j - 1) / N) * 2 - 1) * (Math.PI / 4));
    for (let i = 0; i < M; i++) {
      const s = Math.tan((((i - 1) / N) * 2 - 1) * (Math.PI / 4));
      let x = n[0] + u[0] * s + v[0] * t, y = n[1] + u[1] * s + v[1] * t, z = n[2] + u[2] * s + v[2] * t;
      const l = Math.hypot(x, y, z);
      x /= l; y /= l; z /= l;
      const h = shapedHeight(look, plateaus, pit, x, y, z), r = radiusOfHeight(look, h, amp);
      const k = j * M + i;
      P[k * 3] = x * r; P[k * 3 + 1] = y * r; P[k * 3 + 2] = z * r;
      H[k] = h;
    }
  }
  const V = (N + 1) * (N + 1);
  const position = new Float32Array(V * 3), normal = new Float32Array(V * 3), height = new Float32Array(V);
  for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) {
    const k = (j + 1) * M + (i + 1), o = j * (N + 1) + i;
    const ax = P[(k + 1) * 3] - P[(k - 1) * 3], ay = P[(k + 1) * 3 + 1] - P[(k - 1) * 3 + 1], az = P[(k + 1) * 3 + 2] - P[(k - 1) * 3 + 2];
    const bx = P[(k + M) * 3] - P[(k - M) * 3], by = P[(k + M) * 3 + 1] - P[(k - M) * 3 + 1], bz = P[(k + M) * 3 + 2] - P[(k - M) * 3 + 2];
    let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
    const nl = Math.hypot(nx, ny, nz) || 1;
    nx /= nl; ny /= nl; nz /= nl;
    const px = P[k * 3], py = P[k * 3 + 1], pz = P[k * 3 + 2];
    if (nx * px + ny * py + nz * pz < 0) { nx = -nx; ny = -ny; nz = -nz; }
    position[o * 3] = px; position[o * 3 + 1] = py; position[o * 3 + 2] = pz;
    normal[o * 3] = nx; normal[o * 3 + 1] = ny; normal[o * 3 + 2] = nz;
    height[o] = H[k];
  }
  // Wind each face counter-clockwise seen from outside.
  const cx = u[1] * v[2] - u[2] * v[1], cy = u[2] * v[0] - u[0] * v[2], cz = u[0] * v[1] - u[1] * v[0];
  const outward = cx * n[0] + cy * n[1] + cz * n[2] > 0;
  const index = new Uint32Array(N * N * 6);
  let ii = 0;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const A = j * (N + 1) + i, B = A + 1, C = A + N + 1, D = C + 1;
    if (outward) { index[ii++] = A; index[ii++] = B; index[ii++] = D; index[ii++] = A; index[ii++] = D; index[ii++] = C; }
    else { index[ii++] = A; index[ii++] = D; index[ii++] = B; index[ii++] = A; index[ii++] = C; index[ii++] = D; }
  }
  return { position, normal, height, index };
}
