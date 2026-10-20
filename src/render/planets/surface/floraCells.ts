/**
 * The flora grid on the CPU (change surface-perf): the same cube-face cells and hash as the flora
 * shaders (FLORA_GLSL), so the CPU can list, for each prop kind, the cells where that kind can grow
 * and draw only those instead of every cell of the window. Which kind a cell holds, and whether
 * anything can grow there at all, depend on the hash alone; the GPU decides the rest (the ground,
 * water, clusters, the fade).
 */
export type V3 = readonly [number, number, number];

/** GLSL's faceOf: the cube face a direction falls on (normal, then the two axes across it). */
export function faceOf(d: V3): { n: V3; u: V3; v: V3 } {
  const ax = Math.abs(d[0]), ay = Math.abs(d[1]), az = Math.abs(d[2]);
  if (ax >= ay && ax >= az) return d[0] > 0 ? { n: [1, 0, 0], u: [0, 0, -1], v: [0, 1, 0] } : { n: [-1, 0, 0], u: [0, 0, 1], v: [0, 1, 0] };
  if (ay >= az) return d[1] > 0 ? { n: [0, 1, 0], u: [1, 0, 0], v: [0, 0, -1] } : { n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1] };
  return d[2] > 0 ? { n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0] } : { n: [0, 0, -1], u: [-1, 0, 0], v: [0, 1, 0] };
}

const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** The flora window round the patch centre: its cube face (0..5, as the shader numbers them) and its first cell. */
export function floraWindow(pc: V3, spacing: number, k: number): { face: number; ox: number; oy: number } {
  const { n, u, v } = faceOf(pc);
  const dn = dot(pc, n);
  const cx = dot(pc, u) / dn, cy = dot(pc, v) / dn;
  const face = Math.abs(n[1]) * 2 + Math.abs(n[2]) * 4 + (n[0] + n[1] + n[2] > 0 ? 1 : 0);
  return { face, ox: Math.floor(cx / spacing) - Math.floor(k * 0.5), oy: Math.floor(cy / spacing) - Math.floor(k * 0.5) };
}

/** GLSL's pcg3 (uvec3 arithmetic, wrapping at 2^32); its x. */
function pcg3x(x: number, y: number, z: number): number {
  x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
  y = (Math.imul(y, 1664525) + 1013904223) >>> 0;
  z = (Math.imul(z, 1664525) + 1013904223) >>> 0;
  x = (x + Math.imul(y, z)) >>> 0; y = (y + Math.imul(z, x)) >>> 0; z = (z + Math.imul(x, y)) >>> 0;
  x = (x ^ (x >>> 16)) >>> 0; y = (y ^ (y >>> 16)) >>> 0; z = (z ^ (z >>> 16)) >>> 0;
  return (x + Math.imul(y, z)) >>> 0;
}

/** GLSL's rnd(key, i): a number in [0, 1) for a cell key and a roll index. */
export function rnd(kx: number, ky: number, kz: number, i: number): number {
  const x = pcg3x((kx + i * 7919) >>> 0, (ky + i * 104729) >>> 0, (kz + i * 31) >>> 0);
  return (x & 0xffffff) / 16777216;
}

export interface CellEntry {
  /** The share of the layer's cells this kind takes: [lo, hi) of the kind roll. */
  readonly lo: number;
  readonly hi: number;
}

/**
 * For each kind, the cells of the window (one cell of margin all round) where it can grow:
 * x, y and the face, three floats a cell, and how many. A cell holds one kind (by the kind roll) and
 * nothing at all when its growth roll is above the layer's fill.
 */
export function listCells(win: { face: number; ox: number; oy: number }, k: number, salt: number, fill: number, entries: readonly CellEntry[], out: Float32Array[]): number[] {
  const counts = entries.map(() => 0);
  const kz = win.face * 977 + salt;
  for (let j = -1; j <= k; j++) {
    for (let i = -1; i <= k; i++) {
      const cx = win.ox + i, cy = win.oy + j;
      // ivec3 to uvec3: negative cells wrap, as in the shader.
      const kx = cx >>> 0, ky = cy >>> 0;
      if (rnd(kx, ky, kz, 4) >= fill) continue;
      const pick = rnd(kx, ky, kz, 1);
      for (let e = 0; e < entries.length; e++) {
        if (pick < entries[e].lo || pick >= entries[e].hi) continue;
        const o = counts[e]++ * 3;
        out[e][o] = cx; out[e][o + 1] = cy; out[e][o + 2] = win.face;
        break;
      }
    }
  }
  return counts;
}
