/**
 * Exponential zoom: altitude = minAltitude * e^z. A wheel step adds a constant
 * Δz, so every step scales the view by the same factor at any scale.
 * Pure (no three.js) so it can be unit tested.
 */
export interface ZoomConfig {
  readonly minAltitude: number;
  readonly maxAltitude: number;
  /** Δz per 100 px of wheel delta. */
  readonly stepPer100px: number;
  /** Altitude above which the map is in galaxy (quadrant) mode. */
  readonly galaxyThreshold: number;
  readonly hexPreset: number;
  readonly galaxyPreset: number;
}

export const DEFAULT_ZOOM: ZoomConfig = {
  minAltitude: 0.02,
  maxAltitude: 110_000,
  stepPer100px: 0.22,
  galaxyThreshold: 2_500,
  hexPreset: 40,
  galaxyPreset: 80_000,
};

export class ZoomModel {
  private z: number;
  private targetZ: number;
  /** Lowest z allowed: 0 (minAltitude) unless a floor lets the zoom go further in (a planet's surface). */
  private minZ = 0;

  constructor(readonly config: ZoomConfig = DEFAULT_ZOOM, initialAltitude = config.hexPreset) {
    this.z = this.targetZ = this.zOf(initialAltitude);
  }

  get altitude(): number {
    return this.config.minAltitude * Math.exp(this.z);
  }

  get targetAltitude(): number {
    return this.config.minAltitude * Math.exp(this.targetZ);
  }

  get maxZ(): number {
    return Math.log(this.config.maxAltitude / this.config.minAltitude);
  }

  /** The lowest altitude the zoom goes to now. */
  get floor(): number {
    return this.config.minAltitude * Math.exp(this.minZ);
  }

  /**
   * Let the zoom go below `minAltitude`, down to `altitude` (null: back to `minAltitude`). Raising
   * the floor above the current target eases the view back up to it.
   */
  setFloor(altitude: number | null): void {
    this.minZ = altitude === null ? 0 : Math.min(0, Math.log(altitude / this.config.minAltitude));
    this.targetZ = this.clampZ(this.targetZ);
  }

  get isGalaxyMode(): boolean {
    return this.targetAltitude >= this.config.galaxyThreshold;
  }

  /** Wheel input. Positive delta zooms out. */
  wheel(deltaPx: number): void {
    this.targetZ = this.clampZ(this.targetZ + (deltaPx / 100) * this.config.stepPer100px);
  }

  setTargetAltitude(altitude: number): void {
    this.targetZ = this.zOf(altitude);
  }

  /** Jump straight to an altitude (pinch zoom follows the fingers exactly). */
  setAltitude(altitude: number): void {
    this.z = this.targetZ = this.zOf(altitude);
  }

  snap(): void {
    this.z = this.targetZ;
  }

  /** Toggle between hex and galaxy presets. */
  toggle(): void {
    this.setTargetAltitude(this.isGalaxyMode ? this.config.hexPreset : this.config.galaxyPreset);
  }

  /** Ease toward target; `rate` is fraction per second. Returns true while moving. */
  step(dt: number, rate = 8): boolean {
    const k = 1 - Math.exp(-rate * dt);
    this.z += (this.targetZ - this.z) * k;
    if (Math.abs(this.targetZ - this.z) < 1e-4) {
      this.z = this.targetZ;
      return false;
    }
    return true;
  }

  private zOf(altitude: number): number {
    return this.clampZ(Math.log(Math.max(altitude, 1e-12) / this.config.minAltitude));
  }

  private clampZ(z: number): number {
    return Math.min(this.maxZ, Math.max(this.minZ, z));
  }
}

/** 1 when value <= full, 0 when value >= zero, smooth in between (either order). */
export function fade(value: number, full: number, zero: number): number {
  const t = Math.min(1, Math.max(0, (value - full) / (zero - full)));
  return 1 - t * t * (3 - 2 * t);
}

/** 0 when value <= lo, 1 when value >= hi, smooth in between. */
export function fadeIn(value: number, lo: number, hi: number): number {
  return 1 - fade(value, lo, hi);
}
