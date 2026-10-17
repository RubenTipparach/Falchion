/**
 * Axial hex coordinates, flat-top orientation.
 * Neighbouring hex centres are exactly 1 world unit (= 1 light year) apart.
 * World plane is (x, z); elevation (y) is always 0 for map content.
 */

export interface Hex {
  readonly q: number;
  readonly r: number;
}

export interface Point2 {
  readonly x: number;
  readonly z: number;
}

/** Centre-to-corner radius giving a centre-to-centre spacing of 1. */
export const HEX_SIZE = 1 / Math.sqrt(3);
const SQRT3 = Math.sqrt(3);

export const hex = (q: number, r: number): Hex => ({ q, r });

export const hexKey = (h: Hex): string => `${h.q},${h.r}`;

export const hexEquals = (a: Hex, b: Hex): boolean => a.q === b.q && a.r === b.r;

export const hexAdd = (a: Hex, b: Hex): Hex => hex(a.q + b.q, a.r + b.r);

export const HEX_DIRECTIONS: readonly Hex[] = [
  hex(1, 0), hex(1, -1), hex(0, -1), hex(-1, 0), hex(-1, 1), hex(0, 1),
];

export function hexNeighbors(h: Hex): Hex[] {
  return HEX_DIRECTIONS.map((d) => hexAdd(h, d));
}

/** Hex-step distance, which equals light years. */
export function hexDistance(a: Hex, b: Hex): number {
  const dq = a.q - b.q;
  const dr = a.r - b.r;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
}

/** Round fractional axial coordinates to the containing hex. */
export function hexRound(q: number, r: number): Hex {
  const s = -q - r;
  let rq = Math.round(q);
  let rr = Math.round(r);
  const rs = Math.round(s);
  const dq = Math.abs(rq - q);
  const dr = Math.abs(rr - r);
  const ds = Math.abs(rs - s);
  if (dq > dr && dq > ds) rq = -rr - rs;
  else if (dr > ds) rr = -rq - rs;
  return hex(rq + 0, rr + 0); // +0 normalises -0
}

export function hexToWorld(h: Hex): Point2 {
  return {
    x: HEX_SIZE * 1.5 * h.q,
    z: HEX_SIZE * SQRT3 * (h.r + h.q / 2),
  };
}

export function worldToHex(x: number, z: number): Hex {
  const q = ((2 / 3) * x) / HEX_SIZE;
  const r = ((-1 / 3) * x + (SQRT3 / 3) * z) / HEX_SIZE;
  return hexRound(q, r);
}

/** Straight line of hexes from a to b inclusive (length = distance + 1). */
export function hexLine(a: Hex, b: Hex): Hex[] {
  const n = hexDistance(a, b);
  if (n === 0) return [a];
  const out: Hex[] = [];
  // Nudge avoids ties landing exactly on hex edges.
  const aq = a.q + 1e-6, ar = a.r + 1e-6;
  const bq = b.q + 1e-6, br = b.r + 1e-6;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    out.push(hexRound(aq + (bq - aq) * t, ar + (br - ar) * t));
  }
  return out;
}

/** All hexes within `radius` steps of centre. */
export function hexSpiral(center: Hex, radius: number): Hex[] {
  const out: Hex[] = [];
  for (let q = -radius; q <= radius; q++) {
    const r1 = Math.max(-radius, -q - radius);
    const r2 = Math.min(radius, -q + radius);
    for (let r = r1; r <= r2; r++) out.push(hex(center.q + q, center.r + r));
  }
  return out;
}

/** Hexes exactly `radius` steps from centre (radius 0 = the centre). */
export function hexRing(center: Hex, radius: number): Hex[] {
  if (radius === 0) return [center];
  const out: Hex[] = [];
  let h = hexAdd(center, hex(HEX_DIRECTIONS[4].q * radius, HEX_DIRECTIONS[4].r * radius));
  for (let side = 0; side < 6; side++) {
    for (let i = 0; i < radius; i++) {
      out.push(h);
      h = hexAdd(h, HEX_DIRECTIONS[side]);
    }
  }
  return out;
}
