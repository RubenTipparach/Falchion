import { describe, expect, it } from 'vitest';
import { PLANET_LOOKS } from '../../content/planetLooks';
import { surfaceLookOf } from '../../core/surface/Terrain';
import { ATMOSPHERE_GLSL, atmosphereDefines } from './atmosphere.glsl';
import { NOISE_GLSL } from './noise.glsl';
import { createPlanetMaterial } from './PlanetMaterial';
import { AURORA_FRAG, CLOUD_FRAG } from './surface/shaders';

/** How many times `needle` occurs in `s`. */
const count = (s: string, needle: string) => s.split(needle).length - 1;

describe('one atmosphere for the system view and the close-up', () => {
  it('both views draw the weather with the same GLSL and the same noise', () => {
    const planet = createPlanetMaterial(PLANET_LOOKS.aurora, 7).fragmentShader;
    for (const frag of [planet, CLOUD_FRAG, AURORA_FRAG]) {
      expect(frag).toContain(ATMOSPHERE_GLSL);
      expect(frag).toContain(NOISE_GLSL);
      // No second copy of the cloud maths or the noise.
      expect(count(frag, 'float cloudCover(')).toBe(1);
      expect(count(frag, 'float snoise(')).toBe(1);
      expect(count(frag, 'float fbm(')).toBe(1);
    }
    expect(planet).toContain('cloudCover(vObj, uSeed, uDetail, uTime, uClouds)');
    expect(CLOUD_FRAG).toContain('cloudCover(d, uSeed, uDetail, uTime, uAmount)');
  });

  it('gates each feature on the look, as the system view does', () => {
    const defs = (biome: string) => atmosphereDefines(surfaceLookOf(PLANET_LOOKS[biome], 1));
    expect(defs('terran')).toEqual({});
    expect(defs('aurora')).toEqual({ AURORA: 1 });
    expect(defs('storm')).toEqual({ LIGHTNING: 1, HAZE: 1 });
    expect(defs('hazy')).toEqual({ HAZE: 1 });
    for (const biome of ['terran', 'aurora', 'storm', 'hazy']) {
      const m = createPlanetMaterial(PLANET_LOOKS[biome], 1);
      expect(m.defines).toMatchObject(defs(biome));
    }
  });
});
