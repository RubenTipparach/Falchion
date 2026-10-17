/**
 * How each biome is shaded. Data only: the planet shader reads these and a seed.
 * Add a biome look here; no shader changes needed.
 */
export type SurfaceKind = 'rocky' | 'gas' | 'lava';

export interface PlanetLook {
  readonly kind: SurfaceKind;
  /** Rocky: deep water, shallow water, lowland, highland. Gas: three band colours + storm. */
  readonly palette: readonly [string, string, string, string];
  /** Height (-1..1) below which surface is liquid; < -1 means no liquid. */
  readonly sea: number;
  /** Latitude (0..1) where ice caps begin; > 1 means no caps. */
  readonly ice: number;
  readonly clouds: number;
  readonly cloudColor: string;
  readonly atmosphere: string;
  readonly atmosphereStrength: number;
  /** Noise frequency: higher = more, smaller continents. */
  readonly detail: number;
  /** Craters (barren worlds). */
  readonly craters?: boolean;
  /** Emissive colour for lava cracks / city lights. */
  readonly glow?: string;
  /** Chance (0..1) of a ring system. */
  readonly ringChance?: number;
  /** Alternative palettes chosen by seed (gas giants). */
  readonly variants?: ReadonlyArray<readonly [string, string, string, string]>;
}

export const PLANET_LOOKS: Readonly<Record<string, PlanetLook>> = {
  terran: { kind: 'rocky', palette: ['#0a2552', '#1e6fa6', '#3f7c38', '#8d7b5a'], sea: 0.02, ice: 0.8, clouds: 0.55, cloudColor: '#ffffff', atmosphere: '#6fb6ff', atmosphereStrength: 0.9, detail: 1.6, glow: '#ffcf7a' },
  ocean: { kind: 'rocky', palette: ['#061c45', '#1a6db0', '#c8b27a', '#6f8f4a'], sea: 0.32, ice: 0.86, clouds: 0.65, cloudColor: '#f4f9ff', atmosphere: '#7fc8ff', atmosphereStrength: 1, detail: 1.9 },
  jungle: { kind: 'rocky', palette: ['#0c2e3a', '#1f6a6a', '#1e5a22', '#4f8a2c'], sea: -0.18, ice: 1.2, clouds: 0.75, cloudColor: '#eaf7ea', atmosphere: '#9fe0a0', atmosphereStrength: 0.9, detail: 2.2 },
  desert: { kind: 'rocky', palette: ['#5a3a1c', '#8a5a2f', '#d29b55', '#f0cf94'], sea: -2, ice: 1.2, clouds: 0.08, cloudColor: '#fff3df', atmosphere: '#f0c08a', atmosphereStrength: 0.7, detail: 2.6 },
  ice: { kind: 'rocky', palette: ['#14304f', '#5c8fb8', '#cfe6f2', '#ffffff'], sea: -0.35, ice: 0.0, clouds: 0.2, cloudColor: '#ffffff', atmosphere: '#bfe8ff', atmosphereStrength: 0.6, detail: 3 },
  volcanic: { kind: 'lava', palette: ['#1a1210', '#2e211c', '#4a3a33', '#6a5446'], sea: -2, ice: 1.2, clouds: 0.25, cloudColor: '#5a4a44', atmosphere: '#ff8a4a', atmosphereStrength: 0.8, detail: 2.4, glow: '#ff5a1a' },
  toxic: { kind: 'rocky', palette: ['#3d4a0f', '#8fa12a', '#5a4a2a', '#8a7a3a'], sea: 0.08, ice: 1.2, clouds: 0.7, cloudColor: '#d8e07a', atmosphere: '#c8e060', atmosphereStrength: 1.1, detail: 2 },
  barren: { kind: 'rocky', palette: ['#3a3836', '#5a5652', '#8a8580', '#c9c4bc'], sea: -2, ice: 1.2, clouds: 0, cloudColor: '#ffffff', atmosphere: '#000000', atmosphereStrength: 0, detail: 3.2, craters: true },
  gas: { kind: 'gas', palette: ['#d9b38c', '#a8754f', '#f1e1c8', '#c0573a'], sea: -2, ice: 1.2, clouds: 0, cloudColor: '#ffffff', atmosphere: '#f0d0a0', atmosphereStrength: 0.8, detail: 1, ringChance: 0.5,
    variants: [
      ['#d9b38c', '#a8754f', '#f1e1c8', '#c0573a'],
      ['#6fa8dc', '#3d6fb0', '#cfe6f7', '#ffffff'],
      ['#b49ad8', '#6a4a9a', '#e8dcf7', '#ff8fbf'],
      ['#c9d6a0', '#7f9a5a', '#eef3d8', '#5a7a3a'],
    ] },
};
