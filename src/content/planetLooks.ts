/**
 * How each biome is shaded. Data only: the planet shader reads these and a seed.
 * Add a biome look here; no shader changes needed unless it needs a feature the optional fields
 * below do not have yet.
 */
export type SurfaceKind = 'rocky' | 'gas' | 'lava';

/**
 * A pattern drawn over the whole surface: a planet-wide city (lit gold at night), dead machine
 * plating (rust, seams, a few dying lights), a lattice of faint pulsing lines, or giant skeletons.
 */
export type PlanetPattern = 'city' | 'machine' | 'circuit' | 'bones';

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
  // ── Optional features (change worlds-and-stars). Absent: the planet shades exactly as before. ──
  /**
   * Tidally locked: the sea is where the star is overhead, by the angle to the star (dot of the
   * normal and the light), so it always faces the star while the globe spins. The value is that
   * dot product at the shore (0.7: a sea about 45 degrees in radius round the point under the star); ice beyond, frozen night.
   */
  readonly locked?: number;
  /** Colour of polar aurora curtains (animated, strongest on the night side). */
  readonly aurora?: string;
  /** Rate of lightning flashes in the clouds (about flashes per cell per second); also winds the clouds into cyclones. */
  readonly lightning?: number;
  /** Emissive colour of the sea (acid, lava seas). */
  readonly seaGlow?: string;
  /** A surface pattern; its lights are `glow`. */
  readonly pattern?: PlanetPattern;
  /** A thick opaque cloud deck (0..1) in banded swirls of cloudColor and palette[3]: the surface hidden. */
  readonly haze?: number;
  // ── Landforms (change planet-audit, src/core/surface/Relief.ts) ──
  /** Canyon networks cut this deep (about 0.2 to 1). */
  readonly canyons?: number;
  /** Great volcanoes with lava (in `glow`) in their calderas and down their flanks. */
  readonly volcanoes?: boolean;
  /** Glittering facets in this colour (diamond worlds). */
  readonly glitter?: string;
}

export const PLANET_LOOKS: Readonly<Record<string, PlanetLook>> = {
  terran: { kind: 'rocky', palette: ['#0a2552', '#1e6fa6', '#3f7c38', '#8d7b5a'], sea: 0.02, ice: 0.8, clouds: 0.55, cloudColor: '#ffffff', atmosphere: '#6fb6ff', atmosphereStrength: 0.9, detail: 1.6, glow: '#ffcf7a' },
  ocean: { kind: 'rocky', palette: ['#061c45', '#1a6db0', '#c8b27a', '#6f8f4a'], sea: 0.32, ice: 0.86, clouds: 0.65, cloudColor: '#f4f9ff', atmosphere: '#7fc8ff', atmosphereStrength: 1, detail: 1.9 },
  jungle: { kind: 'rocky', palette: ['#0c2e3a', '#1f6a6a', '#1e5a22', '#4f8a2c'], sea: -0.18, ice: 1.2, clouds: 0.75, cloudColor: '#eaf7ea', atmosphere: '#9fe0a0', atmosphereStrength: 0.9, detail: 2.2 },
  desert: { kind: 'rocky', palette: ['#5a3a1c', '#8a5a2f', '#d29b55', '#f0cf94'], sea: -2, ice: 1.2, clouds: 0.08, cloudColor: '#fff3df', atmosphere: '#f0c08a', atmosphereStrength: 0.7, detail: 2.6, canyons: 0.4 },
  ice: { kind: 'rocky', palette: ['#14304f', '#5c8fb8', '#cfe6f2', '#ffffff'], sea: -0.35, ice: 0.0, clouds: 0.2, cloudColor: '#ffffff', atmosphere: '#bfe8ff', atmosphereStrength: 0.6, detail: 3, craters: true, canyons: 0.25 },
  volcanic: { kind: 'lava', palette: ['#1a1210', '#2e211c', '#4a3a33', '#6a5446'], sea: -2, ice: 1.2, clouds: 0.25, cloudColor: '#5a4a44', atmosphere: '#ff8a4a', atmosphereStrength: 0.8, detail: 2.4, glow: '#ff5a1a', volcanoes: true },
  toxic: { kind: 'rocky', palette: ['#3d4a0f', '#8fa12a', '#5a4a2a', '#8a7a3a'], sea: 0.08, ice: 1.2, clouds: 0.7, cloudColor: '#d8e07a', atmosphere: '#c8e060', atmosphereStrength: 1.1, detail: 2 },
  barren: { kind: 'rocky', palette: ['#3a3836', '#5a5652', '#8a8580', '#c9c4bc'], sea: -2, ice: 1.2, clouds: 0, cloudColor: '#ffffff', atmosphere: '#000000', atmosphereStrength: 0, detail: 3.2, craters: true, canyons: 0.35 },
  gas: { kind: 'gas', palette: ['#d9b38c', '#a8754f', '#f1e1c8', '#c0573a'], sea: -2, ice: 1.2, clouds: 0, cloudColor: '#ffffff', atmosphere: '#f0d0a0', atmosphereStrength: 0.8, detail: 1, ringChance: 0.5,
    variants: [
      ['#d9b38c', '#a8754f', '#f1e1c8', '#c0573a'],
      ['#6fa8dc', '#3d6fb0', '#cfe6f7', '#ffffff'],
      ['#b49ad8', '#6a4a9a', '#e8dcf7', '#ff8fbf'],
      ['#c9d6a0', '#7f9a5a', '#eef3d8', '#5a7a3a'],
    ] },
  // ── Refined types (change worlds-and-stars) ──
  hazy: { kind: 'rocky', palette: ['#3a2a14', '#5a4020', '#8a6a3a', '#e8c880'], sea: -2, ice: 1.2, clouds: 0.3, cloudColor: '#f2e2b0', atmosphere: '#ffd890', atmosphereStrength: 1.3, detail: 2.2, haze: 0.94,
    variants: [
      ['#3a2a14', '#5a4020', '#8a6a3a', '#e8c880'], // Venus: pale sulphur
      ['#2a1a0a', '#4a2e14', '#7a5028', '#d08a3a'], // Titan: orange smog
    ] },
  eyeball: { kind: 'rocky', palette: ['#05214f', '#1d78b8', '#6a6450', '#a09a80'], sea: -0.1, ice: 0.5, clouds: 0.22, cloudColor: '#ffffff', atmosphere: '#9fd0ff', atmosphereStrength: 0.8, detail: 2.2, locked: 0.7 },
  rust: { kind: 'rocky', palette: ['#2a120a', '#4a1e10', '#6e2c18', '#cc7448'], sea: -1.15, ice: 0.84, clouds: 0.06, cloudColor: '#f4d8c0', atmosphere: '#e8a080', atmosphereStrength: 0.45, detail: 2.8, craters: true, canyons: 0.5 },
  swamp: { kind: 'rocky', palette: ['#2e3a24', '#5a6a3a', '#40601e', '#6a7034'], sea: 0.1, ice: 1.2, clouds: 0.4, cloudColor: '#c4cfb0', atmosphere: '#b0c890', atmosphereStrength: 0.9, detail: 4.2, haze: 0.22 },
  storm: { kind: 'rocky', palette: ['#0a1428', '#1a3050', '#3a4a50', '#22262c'], sea: 0.15, ice: 0.9, clouds: 0.9, cloudColor: '#b4b8c0', atmosphere: '#7a88b0', atmosphereStrength: 1, detail: 2, haze: 0.85, lightning: 0.3 },
  choir: { kind: 'rocky', palette: ['#4a4650', '#6a6670', '#a8a4b0', '#d8d4e0'], sea: -2, ice: 1.2, clouds: 0, cloudColor: '#ffffff', atmosphere: '#b8a8e8', atmosphereStrength: 0.35, detail: 2.6, craters: true, pattern: 'circuit', glow: '#b48cff' },
  ecumenopolis: { kind: 'rocky', palette: ['#1c1e22', '#34383e', '#5a5e66', '#8a9098'], sea: -2, ice: 1.2, clouds: 0.2, cloudColor: '#d8d8d0', atmosphere: '#d8c890', atmosphereStrength: 0.8, detail: 2, pattern: 'city', glow: '#ffc860' },
  magma: { kind: 'lava', palette: ['#ff4a08', '#ffb030', '#1c1210', '#3a2620'], sea: 0.12, ice: 1.2, clouds: 0.15, cloudColor: '#3a2a24', atmosphere: '#ff7a30', atmosphereStrength: 1.1, detail: 2.2, glow: '#ff6a10', seaGlow: '#ff5a08', volcanoes: true },
  acid: { kind: 'rocky', palette: ['#4a6a00', '#b8e020', '#4a4232', '#7a6c48'], sea: 0.05, ice: 1.2, clouds: 0.55, cloudColor: '#e8d860', atmosphere: '#e8e050', atmosphereStrength: 1.1, detail: 2.4, seaGlow: '#9aff1a' },
  aurora: { kind: 'rocky', palette: ['#0a1e3a', '#24507a', '#4a5a5a', '#c8d4dc'], sea: -0.05, ice: 0.86, clouds: 0.35, cloudColor: '#f0f6ff', atmosphere: '#7affc4', atmosphereStrength: 0.8, detail: 2.6, aurora: '#40ffa0' },
  bones: { kind: 'rocky', palette: ['#4a3e2e', '#62523e', '#8a7656', '#a69070'], sea: -2, ice: 1.2, clouds: 0.04, cloudColor: '#fff8ea', atmosphere: '#f0e0c0', atmosphereStrength: 0.5, detail: 2.4, pattern: 'bones', canyons: 0.2 },
  deadtech: { kind: 'rocky', palette: ['#1a1816', '#6a625a', '#8a8076', '#a86434'], sea: -2, ice: 1.2, clouds: 0.1, cloudColor: '#5a5048', atmosphere: '#8a7a6a', atmosphereStrength: 0.35, detail: 2.4, pattern: 'machine', glow: '#ff5030', craters: true, canyons: 0.2 },
  // Change planet-audit: carbon worlds of graphite and diamond, and worlds cut by canyons.
  diamond: { kind: 'rocky', palette: ['#07090e', '#141a26', '#283044', '#9fb4d4'], sea: -2, ice: 1.2, clouds: 0, cloudColor: '#ffffff', atmosphere: '#000000', atmosphereStrength: 0, detail: 2.8, craters: true, canyons: 0.3, glitter: '#d8f0ff' },
  canyon: { kind: 'rocky', palette: ['#3a1c10', '#6a3418', '#b0643a', '#e0a070'], sea: -2, ice: 1.2, clouds: 0.05, cloudColor: '#f0d8c0', atmosphere: '#e0a080', atmosphereStrength: 0.35, detail: 2.4, canyons: 1.6 },
};
