import type { SurfaceLook } from '../../core/surface/Terrain';

/**
 * A planet's weather: clouds, the haze deck, storm cyclones and lightning, and auroras. One copy of
 * the maths for the system-view planet (PlanetMaterial) and the close-up's cloud and aurora shells
 * (surface/SurfaceTerrain), so a planet's sky is the same at every distance.
 *
 * Every function takes a unit direction in the planet's own (spinning) frame and the look's own
 * numbers (seed, detail, amounts), with time from the one world clock (view.time). Include after
 * NOISE_GLSL (snoise, fbm). The optional features compile only under their #define
 * (atmosphereDefines), so a look without them gets exactly the shader it had.
 */
export const ATMOSPHERE_GLSL = /* glsl */ `
/** Cloud cover (0..1) at a direction, slowly drifting. */
float cloudCover(vec3 d, vec3 seed, float detail, float time, float amount) {
  float c = fbm(d * (detail * 1.4) + seed.zxy + vec3(time * 0.015, 0.0, time * 0.008));
  return smoothstep(0.05, 0.55, c) * amount;
}
#if defined(LIGHTNING) || defined(PATTERN) || defined(GLITTER)
float hash13(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
/** Cube-map coordinates of a direction: xy in -1..1 on its face, z the face (0..5). */
vec3 cubeUV(vec3 d) {
  vec3 a = abs(d);
  if (a.x >= a.y && a.x >= a.z) return vec3(d.zy / a.x, d.x > 0.0 ? 0.0 : 1.0);
  if (a.y >= a.z) return vec3(d.xz / a.y, d.y > 0.0 ? 2.0 : 3.0);
  return vec3(d.xy / a.z, d.z > 0.0 ? 4.0 : 5.0);
}
#endif
#ifdef HAZE
/**
 * A thick deck in banded swirls that hides the surface: rgb its colour, a how much it covers.
 * On a storm world (LIGHTNING) the deck is wound into cyclones.
 */
vec4 hazeDeck(vec3 d, vec3 seed, float time, float amount, vec3 cloudCol, vec3 bandCol) {
  float hz = fbm(vec3(d.x * 1.6, d.y * 5.0, d.z * 1.6) + seed.yzx + vec3(time * 0.006, 0.0, 0.0));
  float bands = 0.5 + 0.5 * sin(d.y * 8.0 + hz * 3.5);
  vec3 deck = mix(cloudCol, bandCol, bands * 0.65) * (0.88 + 0.24 * hz);
  float cover = amount * (0.85 + 0.15 * smoothstep(-0.3, 0.3, hz));
  #ifdef LIGHTNING
  float swirl = 0.0;
  for (int i = 0; i < 6; i++) {
    float fi = float(i);
    vec3 sc = normalize(vec3(sin(seed.x + fi * 2.3), sin(seed.y + fi * 1.4) * 0.7, cos(seed.x + fi * 2.3)));
    float k = dot(d, sc);
    if (k < 0.7) continue;
    vec3 up = abs(sc.y) > 0.9 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0);
    vec3 a1 = normalize(cross(up, sc)), a2 = cross(sc, a1);
    vec3 q = d / k - sc;
    float r = length(q);
    float ang = atan(dot(q, a2), dot(q, a1));
    float arm = 0.5 + 0.5 * sin(ang * 2.0 + log(r + 0.02) * 7.0 - time * 0.07 + hz * 2.0);
    float reach = 1.0 - smoothstep(0.15, 0.6, r);
    swirl = max(swirl, arm * reach);
    cover *= 1.0 - (1.0 - smoothstep(0.02, 0.05, r)) * 0.8;
  }
  deck = mix(deck * 0.6, cloudCol * 1.3, swirl * 0.8);
  cover = min(1.0, cover + swirl * 0.35);
  #endif
  return vec4(deck, cover);
}
#endif
#ifdef LIGHTNING
const vec3 LIGHTNING_COLOR = vec3(0.7, 0.8, 1.0);
/** Brief flashes in the clouds, a few cells at a time (rate: about flashes per cell per second). */
float lightningAt(vec3 d, vec3 seed, float time, float rate) {
  vec3 lcu = cubeUV(d);
  vec2 lq = lcu.xy * 6.0;
  vec3 lid = vec3(floor(lq), lcu.z) + floor(seed);
  float l1 = hash13(lid), l2 = hash13(lid + 17.3);
  vec2 lc = vec2(0.25) + 0.5 * vec2(l1, hash13(lid + 41.7));
  float ld = length(fract(lq) - lc);
  float lphase = fract(time * rate * (0.25 + l1 * 0.5) + l2 * 13.0);
  float lon = step(lphase, 0.05) * step(0.45, l2);
  float flick = 0.55 + 0.45 * sin(lphase * 260.0);
  return lon * flick * ((1.0 - smoothstep(0.0, 0.45, ld)) * 0.55 + (1.0 - smoothstep(0.0, 0.08, ld)) * 1.0);
}
#endif
#ifdef AURORA
/**
 * Curtains of light round both magnetic poles: a sharp lower edge fading up into violet, rayed
 * along the oval, drifting; brightest on the night side (ndl: the sun's height there) and towards
 * the limb (limb: 0 face on, 1 edge on). Returns the light; band is where the curtains stand.
 */
vec3 auroraAxis(vec3 seed) { return normalize(vec3(sin(seed.x) * 0.12, 1.0, cos(seed.z) * 0.12)); }
vec3 auroraAt(vec3 d, vec3 seed, float time, vec3 color, float ndl, float limb, out float band) {
  vec3 axis = auroraAxis(seed);
  float my = dot(d, axis);
  float alat = abs(my);
  vec3 side = normalize(d - axis * my + vec3(1e-4));
  float wav = snoise(vec3(side.xz * 2.2, time * 0.05 + sign(my) * 7.0)) * 0.05;
  float ring = alat - (0.72 + wav);
  band = smoothstep(-0.03, 0.0, ring) * (1.0 - smoothstep(0.0, 0.16, ring));
  float rays = 0.45 + 0.55 * smoothstep(-0.4, 0.6, snoise(vec3(side.xz * 14.0, time * 0.25 + sign(my) * 3.0)));
  vec3 aurC = mix(color, vec3(0.62, 0.32, 1.0), smoothstep(0.03, 0.12, ring));
  float dark = 1.0 - smoothstep(-0.3, 0.3, ndl);
  return aurC * band * rays * (1.0 + 1.5 * dark) * (1.0 + limb * 1.5);
}
/**
 * Up close, finer rays along the curtains (from the ground, streaks reaching toward the pole): a
 * factor on auroraAt's light, faded to 1 wherever they would be too fine to draw (so never in the
 * system view).
 */
float auroraFineRays(vec3 d, vec3 seed, float time) {
  vec3 axis = auroraAxis(seed);
  float my = dot(d, axis);
  vec2 q = normalize(d - axis * my + vec3(1e-4)).xz * 90.0;
  float near = 1.0 - smoothstep(0.08, 0.25, length(fwidth(q)));
  return mix(1.0, 0.3 + 1.1 * smoothstep(-0.35, 0.65, snoise(vec3(q, time * 0.4 + sign(my) * 5.0))), near);
}
#endif
`;

/** The #defines for a look's weather (none for a look without it). */
export function atmosphereDefines(s: Pick<SurfaceLook, 'aurora' | 'lightning' | 'haze'>): Record<string, number> {
  const d: Record<string, number> = {};
  if (s.aurora) d.AURORA = 1;
  if (s.lightning) d.LIGHTNING = 1;
  if (s.haze) d.HAZE = 1;
  return d;
}
