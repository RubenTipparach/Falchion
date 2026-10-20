import { LIVERIES } from '../../content/liveries';

/** Plain-data ship design. The 3D model is regenerated from this; only this is stored or sent. */
export interface ShipColors {
  readonly primary: string;
  readonly secondary: string;
  readonly accent: string;
}

export interface ShipDesign {
  readonly name: string;
  /** Id of a registered ShipStyleGenerator. */
  readonly style: string;
  readonly seed: number;
  /** Proportions in [0.5, 2]. */
  readonly length: number;
  readonly bulk: number;
  readonly colors: ShipColors;
  readonly engines: number;
  readonly weapons: number;
  /** Trait tags from research (e.g. 'hive-mind'), applied on top of any style. */
  readonly traits: readonly string[];
  /** Other researched styles mixed in: their signature pieces on this style's hull. */
  readonly blend?: readonly string[];
  /** Paint scheme (`src/content/liveries.ts`); none is Plain. */
  readonly livery?: string;
}

/** How many other styles one design can mix in. */
export const MAX_BLEND = 2;

export const DESIGN_LIMITS = {
  length: [0.5, 2],
  bulk: [0.5, 2],
  engines: [1, 6],
  weapons: [0, 8],
} as const;

export const DEFAULT_DESIGN: ShipDesign = {
  name: 'Falchion',
  style: 'technological',
  seed: 1,
  length: 1,
  bulk: 1,
  colors: { primary: '#b8c4d6', secondary: '#3a4a63', accent: '#4fd1ff' },
  engines: 2,
  weapons: 2,
  traits: [],
};

const clamp = (v: number, [lo, hi]: readonly [number, number]) => Math.min(hi, Math.max(lo, v));

/** Clamp a design into legal ranges. */
export function normalizeDesign(d: ShipDesign): ShipDesign {
  return {
    ...d,
    seed: d.seed >>> 0,
    length: clamp(d.length, DESIGN_LIMITS.length),
    bulk: clamp(d.bulk, DESIGN_LIMITS.bulk),
    engines: Math.round(clamp(d.engines, DESIGN_LIMITS.engines)),
    weapons: Math.round(clamp(d.weapons, DESIGN_LIMITS.weapons)),
    traits: [...new Set(d.traits)].sort(),
    blend: [...new Set(d.blend ?? [])].filter((b) => b !== d.style).slice(0, MAX_BLEND),
    // Plain (or an unknown id) is no livery, so designs made before liveries are unchanged.
    livery: d.livery && d.livery !== 'plain' && LIVERIES.some((l) => l.id === d.livery) ? d.livery : undefined,
  };
}

type Packed = [string, string, number, number, number, string, string, string, number, number, string[], string[]?, string?];

/** Compact, URL-safe share code. */
export function encodeDesign(d: ShipDesign): string {
  const n = normalizeDesign(d);
  const packed: Packed = [n.name, n.style, n.seed, n.length, n.bulk, n.colors.primary, n.colors.secondary, n.colors.accent, n.engines, n.weapons, [...n.traits]];
  if (n.blend?.length || n.livery) packed.push([...(n.blend ?? [])]);
  if (n.livery) packed.push(n.livery);
  const bytes = new TextEncoder().encode(JSON.stringify(packed));
  let bin = '';
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodeDesign(code: string): ShipDesign {
  const b64 = code.trim().replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  const json = new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
  const p = JSON.parse(json) as Packed;
  if (!Array.isArray(p) || p.length < 11 || p.length > 13) throw new Error('Invalid ship design code');
  return normalizeDesign({
    name: p[0], style: p[1], seed: p[2], length: p[3], bulk: p[4],
    colors: { primary: p[5], secondary: p[6], accent: p[7] }, engines: p[8], weapons: p[9], traits: p[10],
    blend: Array.isArray(p[11]) ? p[11].map(String) : [],
    livery: typeof p[12] === 'string' ? p[12] : undefined,
  });
}
