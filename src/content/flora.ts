/**
 * What grows on (or lies about) each planet type's ground in the surface view (change
 * surface-flora). Data only: the shapes are src/render/planets/surface/FloraModels.ts and the
 * placement is the GPU's (Flora.ts), on a grid anchored to the planet, so every visit and every
 * player sees the same groves in the same places.
 *
 * Two layers: `large` (trees, boulders, ruins, city blocks) on a wide grid seen from higher up,
 * and `small` (grass, reeds, stones, bone fragments) on a fine grid only seen close to the ground.
 */
export type PropKind =
  | 'broadleaf' | 'conifer' | 'palm' | 'jungle' | 'swamptree' | 'deadtree' | 'shrub' | 'fern' | 'grass' | 'reeds' | 'cactus'
  | 'rock' | 'boulder' | 'crag' | 'lavarock' | 'fungus' | 'crystal' | 'bones' | 'ribcage' | 'skeleton' | 'tusk' | 'spire' | 'wreck' | 'block';

export interface FloraEntry {
  readonly kind: PropKind;
  /** Share of its layer's props that are this kind. */
  readonly weight: number;
  /** Height range, planet radii (the towers of a city are 0.001 to 0.009). */
  readonly size: readonly [number, number];
  /** Two colours each prop's tinted parts are mixed between. */
  readonly colors: readonly [string, string];
  /** 0: spread evenly; 1: only in groves (or meadows, beds, fields) of their own. */
  readonly cluster?: number;
  /** Groves per radian round the planet (default 60). */
  readonly clusterFreq?: number;
  /** A living thing: none on ice caps, snowy peaks or a locked world's frozen side. */
  readonly living?: boolean;
  /** Glow of its emissive parts (lava cracks, fungus caps, circuits, windows). */
  readonly glow?: string;
  /** The glow only at night (windows). */
  readonly nightGlow?: boolean;
  /** Most it is stretched upward (city blocks): 1 is none. */
  readonly stretch?: number;
  /** How far it sways in the wind (grass, reeds, trees). */
  readonly sway?: number;
  /** Grows in shallow water down to this depth below the shore (reeds, mangroves): height units. */
  readonly wet?: number;
}

export interface FloraLayer {
  readonly layer: 'large' | 'small';
  /** Share of the grid's cells that hold a prop at all. */
  readonly fill: number;
  readonly entries: readonly FloraEntry[];
}

const L = 'large' as const, S = 'small' as const;

// Shared kits.
const STONES: FloraEntry = { kind: 'rock', weight: 1, size: [0.00005, 0.00012], colors: ['#77706a', '#9a948c'] };
const GRASS = (c: [string, string], weight = 3): FloraEntry => ({ kind: 'grass', weight, size: [0.00006, 0.00011], colors: c, cluster: 0.6, clusterFreq: 140, living: true, sway: 0.18 });
const BOULDERS = (c: [string, string], weight = 1): FloraEntry => ({ kind: 'boulder', weight, size: [0.00018, 0.00045], colors: c, cluster: 0.3 });

export const FLORA: Readonly<Record<string, readonly FloraLayer[]>> = {
  terran: [
    { layer: L, fill: 0.55, entries: [
      { kind: 'broadleaf', weight: 4, size: [0.00035, 0.0007], colors: ['#3f7a34', '#6a9a3c'], cluster: 0.85, living: true, sway: 0.03 },
      { kind: 'conifer', weight: 2, size: [0.0004, 0.0008], colors: ['#24502e', '#3a6a3a'], cluster: 0.85, clusterFreq: 40, living: true, sway: 0.02 },
      BOULDERS(['#7a7468', '#9a9282']),
    ] },
    { layer: S, fill: 0.7, entries: [GRASS(['#5a8a34', '#8aa848']), { kind: 'shrub', weight: 1, size: [0.00008, 0.00016], colors: ['#3e6a2e', '#5a7a34'], living: true, sway: 0.05 }, STONES] },
  ],
  ocean: [
    { layer: L, fill: 0.45, entries: [
      { kind: 'palm', weight: 3, size: [0.0004, 0.0007], colors: ['#3e8a3a', '#6aa848'], cluster: 0.5, living: true, sway: 0.05 },
      BOULDERS(['#8a8274', '#a89e88']),
    ] },
    { layer: S, fill: 0.6, entries: [GRASS(['#7a9a48', '#9ab05a']), STONES] },
  ],
  jungle: [
    { layer: L, fill: 0.9, entries: [
      { kind: 'jungle', weight: 4, size: [0.0006, 0.0011], colors: ['#1f5a24', '#3a7a2a'], cluster: 0.3, living: true, sway: 0.02 },
      { kind: 'palm', weight: 2, size: [0.0004, 0.0008], colors: ['#2e7a2e', '#58a03a'], living: true, sway: 0.05 },
      { kind: 'broadleaf', weight: 2, size: [0.0004, 0.0008], colors: ['#2a6a26', '#4a8a2e'], living: true, sway: 0.03 },
    ] },
    { layer: S, fill: 0.85, entries: [
      { kind: 'fern', weight: 3, size: [0.00008, 0.00016], colors: ['#2e7a2a', '#5aa03a'], living: true, sway: 0.12 },
      GRASS(['#3a7a2a', '#5a9a34'], 2),
      { kind: 'shrub', weight: 2, size: [0.0001, 0.0002], colors: ['#2a5a24', '#4a7a2e'], living: true, sway: 0.05 },
    ] },
  ],
  swamp: [
    { layer: L, fill: 0.6, entries: [
      { kind: 'swamptree', weight: 4, size: [0.0004, 0.0008], colors: ['#3e5a2a', '#5a6a34'], cluster: 0.6, living: true, sway: 0.03, wet: 0.45 },
      { kind: 'deadtree', weight: 1, size: [0.0003, 0.0006], colors: ['#4a4234', '#5e5444'], living: true, wet: 0.3 },
    ] },
    { layer: S, fill: 0.85, entries: [
      { kind: 'reeds', weight: 4, size: [0.0001, 0.0002], colors: ['#5a6a2a', '#7a8a3a'], cluster: 0.5, clusterFreq: 120, living: true, sway: 0.2, wet: 0.35 },
      { kind: 'fungus', weight: 1, size: [0.00006, 0.00012], colors: ['#b0a070', '#d0b880'], living: true, glow: '#9acf5a' },
      GRASS(['#4a5a2a', '#6a7a34'], 2),
    ] },
  ],
  aurora: [
    { layer: L, fill: 0.4, entries: [
      { kind: 'conifer', weight: 3, size: [0.0003, 0.0006], colors: ['#1e3a2e', '#2e4a3a'], cluster: 0.85, clusterFreq: 40, living: true, sway: 0.02 },
      BOULDERS(['#6a7078', '#8a9098']),
    ] },
    { layer: S, fill: 0.5, entries: [GRASS(['#5a6a4a', '#7a8a6a']), STONES] },
  ],
  eyeball: [
    { layer: L, fill: 0.4, entries: [
      { kind: 'conifer', weight: 2, size: [0.0003, 0.0006], colors: ['#24502e', '#3a6a3a'], cluster: 0.8, living: true, sway: 0.02 },
      { kind: 'broadleaf', weight: 1, size: [0.0003, 0.0006], colors: ['#3f7a34', '#6a9a3c'], cluster: 0.8, living: true, sway: 0.03 },
      BOULDERS(['#6a7078', '#8a9098']),
    ] },
    { layer: S, fill: 0.6, entries: [GRASS(['#5a8a34', '#7aa040']), STONES] },
  ],
  storm: [
    { layer: L, fill: 0.35, entries: [
      { kind: 'conifer', weight: 2, size: [0.0003, 0.0006], colors: ['#1e3a2e', '#2e4a3a'], cluster: 0.8, living: true, sway: 0.07 },
      BOULDERS(['#4a4e56', '#62666e'], 2),
    ] },
    { layer: S, fill: 0.6, entries: [GRASS(['#3a5a3a', '#4a6a44']), STONES] },
  ],
  desert: [
    { layer: L, fill: 0.18, entries: [
      { kind: 'cactus', weight: 2, size: [0.00025, 0.0005], colors: ['#5a7a3a', '#7a8a4a'], living: true },
      BOULDERS(['#a07a4a', '#c0985a'], 2),
    ] },
    { layer: S, fill: 0.35, entries: [
      { kind: 'shrub', weight: 2, size: [0.00006, 0.00012], colors: ['#7a7040', '#9a8a50'], living: true, sway: 0.04 },
      { ...STONES, colors: ['#a07a4a', '#c09a64'], weight: 2 },
    ] },
  ],
  barren: [
    { layer: L, fill: 0.4, entries: [{ ...BOULDERS(['#6a6864', '#8a8680']), size: [0.00025, 0.0007] }] },
    { layer: S, fill: 0.6, entries: [{ ...STONES, colors: ['#6a6864', '#8e8a84'] }] },
  ],
  canyon: [
    { layer: L, fill: 0.3, entries: [BOULDERS(['#8a4a2a', '#b06a3a'])] },
    { layer: S, fill: 0.55, entries: [{ ...STONES, colors: ['#8a4a2a', '#b46e44'] }] },
  ],
  rust: [
    { layer: L, fill: 0.3, entries: [BOULDERS(['#7a3a22', '#a0522e'])] },
    { layer: S, fill: 0.55, entries: [{ ...STONES, colors: ['#7a3a22', '#a8603a'] }] },
  ],
  hazy: [
    { layer: L, fill: 0.25, entries: [BOULDERS(['#6a5030', '#8a6a40'])] },
    { layer: S, fill: 0.45, entries: [{ ...STONES, colors: ['#6a5030', '#8a6a44'] }] },
  ],
  ice: [
    { layer: L, fill: 0.3, entries: [
      { kind: 'crag', weight: 2, size: [0.0003, 0.0007], colors: ['#b8d4e8', '#e0eef8'], cluster: 0.4 },
      BOULDERS(['#8a98a8', '#aab8c4']),
    ] },
    { layer: S, fill: 0.4, entries: [{ ...STONES, colors: ['#9aaabb', '#c8d8e4'] }] },
  ],
  volcanic: [
    { layer: L, fill: 0.4, entries: [
      { kind: 'lavarock', weight: 2, size: [0.0002, 0.0005], colors: ['#1e1814', '#2e2620'], glow: '#ff5a1a' },
      BOULDERS(['#1e1a18', '#2e2824']),
    ] },
    { layer: S, fill: 0.6, entries: [{ ...STONES, colors: ['#1a1614', '#2e2824'] }] },
  ],
  magma: [
    { layer: L, fill: 0.35, entries: [{ kind: 'lavarock', weight: 1, size: [0.0002, 0.0005], colors: ['#1a1210', '#2a1e1a'], glow: '#ff6a10' }] },
    { layer: S, fill: 0.4, entries: [{ ...STONES, colors: ['#1a1210', '#2a1e1a'] }] },
  ],
  toxic: [
    { layer: L, fill: 0.45, entries: [
      { kind: 'fungus', weight: 3, size: [0.0003, 0.0007], colors: ['#7a9a3a', '#a0c048'], cluster: 0.7, living: true, glow: '#c8ff40' },
      { kind: 'swamptree', weight: 1, size: [0.0003, 0.0006], colors: ['#4a5a2a', '#6a7a30'], cluster: 0.5, living: true },
    ] },
    { layer: S, fill: 0.7, entries: [
      { kind: 'fungus', weight: 2, size: [0.00005, 0.00012], colors: ['#8aaa3a', '#b0d048'], living: true, glow: '#c8ff40' },
      GRASS(['#6a8a2a', '#8aa834'], 2),
    ] },
  ],
  acid: [
    { layer: L, fill: 0.3, entries: [
      { kind: 'fungus', weight: 2, size: [0.0003, 0.0006], colors: ['#8a9a2a', '#b0c030'], cluster: 0.7, living: true, glow: '#9aff1a' },
      BOULDERS(['#5a5034', '#7a6c48']),
    ] },
    { layer: S, fill: 0.5, entries: [{ ...STONES, colors: ['#5a5034', '#7a6c48'] }] },
  ],
  diamond: [
    { layer: L, fill: 0.35, entries: [
      { kind: 'crystal', weight: 3, size: [0.0002, 0.0006], colors: ['#a8c8f0', '#e8f4ff'], cluster: 0.6, glow: '#9fd0ff' },
      BOULDERS(['#14161c', '#262a34']),
    ] },
    { layer: S, fill: 0.6, entries: [
      { kind: 'crystal', weight: 1, size: [0.00005, 0.00012], colors: ['#a8c8f0', '#e8f4ff'], glow: '#9fd0ff' },
      { ...STONES, colors: ['#14161c', '#262a34'], weight: 2 },
    ] },
  ],
  // Bone white on dark dust, so they stand out as things, not paint.
  bones: [
    { layer: L, fill: 0.75, entries: [
      { kind: 'skeleton', weight: 3, size: [0.0011, 0.0022], colors: ['#e6dfcc', '#f6f1e4'], cluster: 0.4 },
      { kind: 'ribcage', weight: 3, size: [0.0007, 0.0014], colors: ['#e2d9c2', '#f2ecdc'], cluster: 0.4 },
      { kind: 'tusk', weight: 2, size: [0.0007, 0.0016], colors: ['#ddd2b8', '#efe8d6'], cluster: 0.5 },
      { kind: 'deadtree', weight: 2, size: [0.0004, 0.0008], colors: ['#4a4034', '#5e5444'], cluster: 0.7 },
      BOULDERS(['#5a4c3a', '#6e5e48']),
    ] },
    { layer: S, fill: 0.75, entries: [
      { kind: 'bones', weight: 4, size: [0.00012, 0.00024], colors: ['#e6dfcc', '#f6f1e4'] },
      { ...STONES, colors: ['#4a3e2e', '#62523e'] },
    ] },
  ],
  deadtech: [
    { layer: L, fill: 0.5, entries: [
      { kind: 'wreck', weight: 3, size: [0.0003, 0.0007], colors: ['#5a524a', '#8a6038'], cluster: 0.4, glow: '#ff5030' },
      { kind: 'block', weight: 1, size: [0.0004, 0.0008], colors: ['#4a4640', '#6a625a'], stretch: 2.5 },
    ] },
    { layer: S, fill: 0.5, entries: [{ ...STONES, colors: ['#4a4640', '#7a5a3a'] }] },
  ],
  choir: [
    { layer: L, fill: 0.3, entries: [
      { kind: 'spire', weight: 2, size: [0.0008, 0.0018], colors: ['#5a5662', '#8a8694'], cluster: 0.5, glow: '#b48cff' },
      BOULDERS(['#6a6670', '#8a8690']),
    ] },
    { layer: S, fill: 0.5, entries: [{ ...STONES, colors: ['#6a6670', '#a8a4b0'] }] },
  ],
  ecumenopolis: [
    { layer: L, fill: 0.85, entries: [
      { kind: 'block', weight: 4, size: [0.0004, 0.0008], colors: ['#7d8792', '#b9b2a2'], stretch: 6, glow: '#ffc860', nightGlow: true },
      { kind: 'spire', weight: 1, size: [0.0012, 0.0024], colors: ['#5f7d99', '#8a9aa8'], glow: '#ffd890', nightGlow: true },
    ] },
  ],
};

/** The flora of a planet type (none for gas giants, megastructures and anything unlisted). */
export const floraOf = (biome: string): readonly FloraLayer[] => FLORA[biome] ?? [];
