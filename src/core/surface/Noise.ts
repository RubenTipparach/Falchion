/**
 * 3D simplex noise (Ashima Arts / Stefan Gustavson, MIT) with exact integer hashing, so this CPU
 * copy and the GLSL copy the surface shaders use (src/render/planets/surface/shaders.ts) pick the
 * same gradients and agree to float precision. Pure and deterministic.
 */

const m289 = (x: number): number => x - Math.floor((x + 0.5) / 289) * 289;
const perm = (x: number): number => m289(m289(x * 34 + 1) * x);
const NSX = 2 / 7, NSY = 0.5 / 7 - 1;

/**
 * The gradient for hash `j` (0..48), before normalising. `f` rounds each step, so a test can run it
 * as the GPU does (Math.fround, float32) and check both pick the same gradient.
 */
export function gradientOf(j: number, f: (x: number) => number = (x) => x): [number, number, number] {
  const xi = Math.floor(f((j + 0.5) / 7)), yi = Math.floor(f(j - 7 * xi));
  let gx = f(xi * f(NSX) + f(NSY)), gy = f(yi * f(NSX) + f(NSY));
  const gz = f(f(1 - Math.abs(gx)) - Math.abs(gy));
  // gz is a multiple of 1/7 that is often exactly 0: decide with a margin, so float64 here and
  // float32 on the GPU always flip the same gradients (the GLSL uses the same 0.05). Without
  // it, about a quarter of the gradients came out different and the baked globe (CPU) and the
  // detail patch (GPU) disagreed on where the land was.
  if (gz <= 0.05) {
    gx = f(gx - (Math.floor(gx) * 2 + 1));
    gy = f(gy - (Math.floor(gy) * 2 + 1));
  }
  return [gx, gy, gz];
}

function corner(jx: number, jy: number, jz: number, ox: number, oy: number, oz: number, x: number, y: number, z: number): number {
  let m = 0.6 - (x * x + y * y + z * z);
  if (m <= 0) return 0;
  const p = perm(perm(perm(jz + oz) + jy + oy) + jx + ox);
  const [gx, gy, gz] = gradientOf(p - 49 * Math.floor((p + 0.5) / 49));
  const nrm = 1.79284291400159 - 0.85373472095314 * (gx * gx + gy * gy + gz * gz);
  m *= m;
  return m * m * nrm * (gx * x + gy * y + gz * z);
}

/** Simplex noise in about [-1, 1]. */
export function snoise(vx: number, vy: number, vz: number): number {
  const s = (vx + vy + vz) / 3;
  const ix = Math.floor(vx + s), iy = Math.floor(vy + s), iz = Math.floor(vz + s);
  const t = (ix + iy + iz) / 6;
  const x0 = vx - ix + t, y0 = vy - iy + t, z0 = vz - iz + t;
  const gx = x0 >= y0 ? 1 : 0, gy = y0 >= z0 ? 1 : 0, gz = z0 >= x0 ? 1 : 0;
  const lx = 1 - gx, ly = 1 - gy, lz = 1 - gz;
  const i1x = Math.min(gx, lz), i1y = Math.min(gy, lx), i1z = Math.min(gz, ly);
  const i2x = Math.max(gx, lz), i2y = Math.max(gy, lx), i2z = Math.max(gz, ly);
  const jx = m289(ix), jy = m289(iy), jz = m289(iz);
  return 42 * (
    corner(jx, jy, jz, 0, 0, 0, x0, y0, z0)
    + corner(jx, jy, jz, i1x, i1y, i1z, x0 - i1x + 1 / 6, y0 - i1y + 1 / 6, z0 - i1z + 1 / 6)
    + corner(jx, jy, jz, i2x, i2y, i2z, x0 - i2x + 1 / 3, y0 - i2y + 1 / 3, z0 - i2z + 1 / 3)
    + corner(jx, jy, jz, 1, 1, 1, x0 - 0.5, y0 - 0.5, z0 - 0.5));
}

/** Fractal sum with a fractional octave count (the last octave fades in), as the GLSL fbmN. */
export function fbmN(x: number, y: number, z: number, octaves: number): number {
  let v = 0, a = 0.5;
  for (let i = 0; i < 14; i++) {
    const w = Math.min(Math.max(octaves - i, 0), 1);
    if (w <= 0) break;
    v += a * w * snoise(x, y, z);
    x = x * 2.02 + 1.7; y = y * 2.02 + 9.2; z = z * 2.02 + 3.1;
    a *= i < 6 ? 0.5 : 0.62;
  }
  return v;
}

/** Four octaves of ridged noise (mountain chains, craters, lava cracks). */
export function ridged4(x: number, y: number, z: number): number {
  let v = 0, a = 0.5;
  for (let i = 0; i < 4; i++) {
    v += a * (1 - Math.abs(snoise(x, y, z)));
    x *= 2.1; y *= 2.1; z *= 2.1;
    a *= 0.5;
  }
  return v;
}

/** GLSL smoothstep. */
export function smoothstep(e0: number, e1: number, x: number): number {
  const t = Math.min(Math.max((x - e0) / (e1 - e0), 0), 1);
  return t * t * (3 - 2 * t);
}
