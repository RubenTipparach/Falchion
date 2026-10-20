import type * as THREE from 'three';
import { PLANET_LOOKS } from '../../content/planetLooks';
import { hashSeed } from '../../core/rng/Rng';
import { nightLights } from '../../core/surface/NightLights';
import { SettlementInput, SurfaceLayout, surfaceLayout } from '../../core/surface/SurfaceLayout';
import { SurfaceLook, surfaceLookOf } from '../../core/surface/Terrain';
import { buildNightLightMap } from './NightLightMap';

/**
 * What stands on a planet, computed once and shared: the system view (night lights) and the
 * close-up (cities, roads, lights) draw the very same layout and light map. A layout takes tens of
 * milliseconds (roads are routed over the terrain), so recent ones are kept; light maps evicted
 * from the cache are disposed.
 */

export interface PlanetLayout {
  readonly key: string;
  readonly look: SurfaceLook;
  readonly layout: SurfaceLayout;
}

interface PlanetRef { readonly id: string; readonly biome: string }

const KEEP = 12;
const layouts = new Map<string, PlanetLayout>();
const maps = new Map<string, THREE.DataTexture>();

const keyOf = (planet: PlanetRef, colony: SettlementInput | null) => JSON.stringify([planet.id, planet.biome, colony]);

/** A planet's surface look (cheap: no layout). */
export function planetLook(planet: PlanetRef): SurfaceLook {
  return surfaceLookOf(PLANET_LOOKS[planet.biome] ?? PLANET_LOOKS.barren, hashSeed(planet.id, 'surface'));
}

export function planetLayout(planet: PlanetRef, colony: SettlementInput | null): PlanetLayout {
  const key = keyOf(planet, colony);
  let hit = layouts.get(key);
  if (!hit) {
    const look = planetLook(planet);
    hit = { key, look, layout: surfaceLayout(planet.id, look, colony) };
    remember(layouts, key, hit);
  } else touch(layouts, key, hit);
  return hit;
}

/** The planet's night-light map, or null when nothing stands on it. */
export function planetLightMap(planet: PlanetRef, colony: SettlementInput | null): THREE.DataTexture | null {
  if (!colony) return null;
  const { key, layout } = planetLayout(planet, colony);
  let tex = maps.get(key);
  if (!tex) {
    tex = buildNightLightMap(nightLights(layout));
    const evicted = remember(maps, key, tex);
    evicted?.dispose();
  } else touch(maps, key, tex);
  return tex;
}

/** Whether a planet's layout (and light map) is ready without computing anything. */
export function hasPlanetLightMap(planet: PlanetRef, colony: SettlementInput | null): boolean {
  return !colony || maps.has(keyOf(planet, colony));
}

function remember<T>(cache: Map<string, T>, key: string, value: T): T | undefined {
  cache.set(key, value);
  if (cache.size <= KEEP) return undefined;
  const [oldKey, old] = cache.entries().next().value as [string, T];
  cache.delete(oldKey);
  return old;
}

function touch<T>(cache: Map<string, T>, key: string, value: T): void {
  cache.delete(key);
  cache.set(key, value);
}
