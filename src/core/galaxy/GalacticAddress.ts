import { Hex, hexToWorld } from '../hex/Hex';

export const QUADRANTS = ['Alpha', 'Beta', 'Gamma', 'Delta'] as const;
export type Quadrant = (typeof QUADRANTS)[number];

export interface AddressScheme {
  /** Width of each radial ring in light years. */
  readonly ringWidth: number;
  /** Cells in ring n = cellsPerRing * n (ring 0 is the undivided core). */
  readonly cellsPerRing: number;
}

export const DEFAULT_ADDRESS_SCHEME: AddressScheme = { ringWidth: 5_000, cellsPerRing: 8 };

export interface GalacticAddress {
  readonly quadrant: Quadrant;
  /** 0 = galactic core. */
  readonly ring: number;
  readonly cell: number;
  readonly cellsInRing: number;
  readonly hex: Hex;
  readonly distanceFromCore: number;
}

export function ringOfRadius(r: number, scheme = DEFAULT_ADDRESS_SCHEME): number {
  return Math.floor((r + scheme.ringWidth / 2) / scheme.ringWidth);
}

export function cellsInRing(ring: number, scheme = DEFAULT_ADDRESS_SCHEME): number {
  return ring === 0 ? 1 : scheme.cellsPerRing * ring;
}

/**
 * Angle in [0, 2π) measured counter-clockwise on the map as seen from above:
 * from +x toward -z (the default camera shows -z as "up").
 */
export function angleOf(x: number, z: number): number {
  const a = Math.atan2(-z, x);
  return a < 0 ? a + Math.PI * 2 : a;
}

export function addressOf(h: Hex, scheme = DEFAULT_ADDRESS_SCHEME): GalacticAddress {
  const p = hexToWorld(h);
  const r = Math.hypot(p.x, p.z);
  const a = angleOf(p.x, p.z);
  const ring = ringOfRadius(r, scheme);
  const cells = cellsInRing(ring, scheme);
  return {
    quadrant: QUADRANTS[Math.min(3, Math.floor(a / (Math.PI / 2)))],
    ring,
    cell: Math.min(cells - 1, Math.floor((a / (Math.PI * 2)) * cells)),
    cellsInRing: cells,
    hex: h,
    distanceFromCore: r,
  };
}

export function formatAddress(a: GalacticAddress): string {
  const ring = a.ring === 0 ? 'Core' : `Ring ${a.ring} · Cell ${a.cell + 1}/${a.cellsInRing}`;
  return `${a.quadrant} · ${ring} · (${a.hex.q}, ${a.hex.r})`;
}
