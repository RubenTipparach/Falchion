import { ROAD_STEP } from './Roads';
import type { SurfaceLayout } from './SurfaceLayout';
import type { Vec3 } from './Terrain';

/**
 * Where a settled world glows at night, from its layout: one spot per settlement (wider and brighter
 * with its population) and a string of small spots along every road. Both the system view and
 * the close-up paint their night lights from these spots, so the lights are in the same places
 * from orbit down to the ground. Pure and deterministic.
 */
export interface LightSpot {
  /** Centre, a unit direction in the planet's frame. */
  readonly dir: Vec3;
  /** Radius of the glow (chord, planet radii). */
  readonly radius: number;
  /** Brightness at the centre, 0..1. */
  readonly power: number;
}

/** Spacing of the lights along a road (planet radii). */
const ROAD_LIGHT_STEP = 0.006;

export function nightLights(layout: Pick<SurfaceLayout, 'settlements' | 'roads'>): LightSpot[] {
  const spots: LightSpot[] = layout.settlements.map((s) => ({
    dir: s.dir,
    radius: s.radius * (s.kind === 'capital' ? 1.5 : 1.7),
    power: Math.min(0.4 + 0.22 * Math.sqrt(s.pop), 1),
  }));
  for (const road of layout.roads) {
    const every = Math.max(1, Math.round(ROAD_LIGHT_STEP / ROAD_STEP));
    road.path.forEach((dir, i) => {
      if (i % every === 0) spots.push({ dir, radius: 0.0035, power: road.trunk ? 0.32 : 0.24 });
    });
  }
  return spots;
}
