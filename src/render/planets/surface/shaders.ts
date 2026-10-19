/**
 * GLSL for the surface view. Units: one planet radius = 1, in the planet's own frame.
 * NOISE_GLSL (the planets' one copy) hashes on exact integers, like src/core/surface/Noise.ts, so
 * the GPU detail patch and the CPU-baked globe agree where they meet. The clouds, haze, lightning
 * and aurora are the system view's own (ATMOSPHERE_GLSL), so the planet looks the same up close.
 */

import { MAX_SETTLEMENTS } from '../../../core/surface/SurfaceLayout';
import { ATMOSPHERE_GLSL } from '../atmosphere.glsl';
import { LIGHT_MAP_GLSL } from '../NightLightMap';
import { NOISE_GLSL } from '../noise.glsl';
import { RELIEF_GLSL } from '../relief.glsl';
import { PATTERN_GLSL } from '../patterns.glsl';
import { CRATER_DEPTH, EYE_DEPTH, VOLCANO_HEIGHT } from '../../../core/surface/Terrain';

/** Most settlements the terrain shader flattens and draws streets for (main city, cities and towns). */
export const MAX_SITES = MAX_SETTLEMENTS;
/** Terrain relief in planet radii (exaggerated so mountains read from orbit). */
export const AMP = 0.022;
/** Octaves of the baked globe (the patch fades to this at its edge). */
export const BASE_OCT = 7;
/** Narrowest a road is drawn, in screen pixels (thinner roads fade instead). */
export const ROAD_MIN_PX = 1.4;

/** Terrain height, flattened under settlements and dug out for the mine pit (mirrors SurfaceTerrain.shapedHeight). */
const TERRAIN_GLSL = /* glsl */ `
${RELIEF_GLSL}
uniform vec3 uSeed; uniform float uDetail; uniform float uSea; uniform float uCraters; uniform float uDry;
uniform float uCanyons; uniform float uVolcanoes; uniform float uLocked;
uniform vec4 uCityA[${MAX_SITES}]; uniform vec4 uCityB[${MAX_SITES}]; uniform vec4 uCityC[${MAX_SITES}]; uniform int uCityN;
uniform vec4 uPit; uniform float uPitDepth;
/** rawHeight in core/surface/Terrain.ts: noise, ridges and the landforms (RELIEF_GLSL), in the same order. */
float rawH(vec3 d, float oct) {
  vec3 p = d * uDetail + uSeed;
  float h = fbmN(p, oct);
  if (uCraters > 0.5) h += craters(p, oct) * ${CRATER_DEPTH.toFixed(3)};
  float land = smoothstep(uSea + 0.03, uSea + 0.5, h);
  h += land * (ridged(p * 2.0 + vec3(5.1)) - 0.55) * 0.5;
  if (uCanyons > 0.0) h -= canyonDepth(canyonCut(p, uCanyons), uCanyons);
  if (uVolcanoes > 0.5) h += volcanoes(p, uSeed, uDetail).x * ${VOLCANO_HEIGHT.toFixed(3)};
  if (uLocked > 0.0) h -= lockedEye(d.x, h, uLocked) * ${EYE_DEPTH.toFixed(3)};
  return h;
}
float shapedH(vec3 d, float oct) {
  float h = rawH(d, oct);
  for (int i = 0; i < ${MAX_SITES}; i++) {
    if (i >= uCityN) break;
    float ch = length(d - uCityA[i].xyz);
    float f = 1.0 - smoothstep(uCityB[i].x, uCityB[i].y, ch);
    h = mix(h, uCityA[i].w, f);
  }
  float pc = length(d - uPit.xyz) / uPit.w;
  if (pc < 1.0) { float t = 1.0 - pc; h -= uPitDepth * (floor(t * 5.0) + smoothstep(0.65, 1.0, fract(t * 5.0))) / 5.0; }
  return h;
}
float elevOf(float h) { return uDry > 0.5 ? max((h + 0.6) * 0.5, 0.0) : max(h - uSea, 0.0); }
float radiusOf(float h) { return 1.0 + ${AMP.toFixed(4)} * elevOf(h); }
`;

/** The detail patch's square (gnomonic, round uPC): how far out a direction is in it (< 1 inside). */
const PATCH_GLSL = /* glsl */ `
uniform float uPatchOn; uniform vec3 uPC, uPT1, uPT2; uniform float uPSize;
float patchEdge(vec3 d) {
  if (uPatchOn < 0.5) return 9.0;
  float dc = dot(d, uPC);
  if (dc <= 0.0) return 9.0;
  vec3 q = d / dc - uPC;
  vec2 uv = vec2(dot(q, uPT1), dot(q, uPT2)) / uPSize;
  return max(abs(uv.x), abs(uv.y));
}
`;

/** The cube face a direction falls on (normal, then the two axes across it). Needs nothing. */
const FACE_GLSL = /* glsl */ `
void faceOf(vec3 d, out vec3 n, out vec3 u, out vec3 v) {
  vec3 a = abs(d);
  if (a.x >= a.y && a.x >= a.z) {
    if (d.x > 0.0) { n = vec3(1.0, 0.0, 0.0); u = vec3(0.0, 0.0, -1.0); } else { n = vec3(-1.0, 0.0, 0.0); u = vec3(0.0, 0.0, 1.0); }
    v = vec3(0.0, 1.0, 0.0);
  } else if (a.y >= a.z) {
    u = vec3(1.0, 0.0, 0.0);
    if (d.y > 0.0) { n = vec3(0.0, 1.0, 0.0); v = vec3(0.0, 0.0, -1.0); } else { n = vec3(0.0, -1.0, 0.0); v = vec3(0.0, 0.0, 1.0); }
  } else {
    v = vec3(0.0, 1.0, 0.0);
    if (d.z > 0.0) { n = vec3(0.0, 0.0, 1.0); u = vec3(1.0, 0.0, 0.0); } else { n = vec3(0.0, 0.0, -1.0); u = vec3(-1.0, 0.0, 0.0); }
  }
}
`;

/**
 * The ground as drawn. Outside the detail patch it is the baked globe: the cube-sphere grid of
 * SurfaceTerrain (rebuilt here from the same noise), flat between its vertices. Inside the patch it
 * is the noise itself, with more octaves near the camera. The patch's outer ring morphs onto the
 * globe's own triangles (a geomorph), so the two meet exactly at the patch's edge: the globe's
 * coarse triangles turn sharp ridges into broad pyramids, and where the patch cut them off they
 * used to float above the horizon with sky beneath them.
 */
const GROUND_GLSL = /* glsl */ `
uniform float uBaseN, uOct;
const float PI4 = 0.78539816;
float gridT(float i) { return tan((i / uBaseN * 2.0 - 1.0) * PI4); }
vec3 globeCorner(vec3 n, vec3 u, vec3 v, float i, float j) {
  vec3 d = normalize(n + u * gridT(i) + v * gridT(j));
  return d * radiusOf(shapedH(d, ${BASE_OCT}.0));
}
/** Radius of the baked globe's surface along d (the plane of its triangle there). */
float globeRadius(vec3 d) {
  vec3 n, u, v;
  faceOf(d, n, u, v);
  float dn = dot(d, n), s = dot(d, u) / dn, t = dot(d, v) / dn;
  float gi = (atan(s) / PI4 + 1.0) * 0.5 * uBaseN, gj = (atan(t) / PI4 + 1.0) * 0.5 * uBaseN;
  float i = clamp(floor(gi), 0.0, uBaseN - 1.0), j = clamp(floor(gj), 0.0, uBaseN - 1.0);
  float fx = (s - gridT(i)) / (gridT(i + 1.0) - gridT(i)), fy = (t - gridT(j)) / (gridT(j + 1.0) - gridT(j));
  vec3 A = globeCorner(n, u, v, i, j), D = globeCorner(n, u, v, i + 1.0, j + 1.0);
  vec3 X = fx >= fy ? globeCorner(n, u, v, i + 1.0, j) : globeCorner(n, u, v, i, j + 1.0);
  vec3 nrm = cross(X - A, D - A);
  return dot(A, nrm) / dot(d, nrm);
}
/** Octaves at a point of the patch: all of them near the centre, the globe's at the edge. */
float patchOctaves(float edge) { return mix(${BASE_OCT}.0, uOct, 1.0 - smoothstep(0.55, 0.98, edge)); }
/** How far the patch has morphed onto the globe's triangles (1 at the edge). */
float patchMorph(float edge) { return smoothstep(0.68, 0.97, edge); }
/** Ground radius along d as drawn, given its place in the patch (patchEdge). */
float groundRadius(vec3 d, float edge) {
  if (edge >= 0.995) return globeRadius(d);
  float r = radiusOf(shapedH(d, patchOctaves(edge)));
  float m = patchMorph(edge);
  return m > 0.0 ? mix(r, globeRadius(d), m) : r;
}
`;

export const TERRAIN_FRAG = /* glsl */ `
uniform vec3 uC0, uC1, uC2, uC3, uAtmo, uGlow, uCityGlow, uSun, uCam;
uniform float uAtmoStrength, uIce, uSnow, uLava, uTime, uFine, uFar, uClose, uFade;
uniform sampler2D uLightMap;
#ifdef SEA_GLOW
uniform vec3 uSeaGlow;
#endif
#ifdef GLITTER
uniform vec3 uGlitter;
#endif
varying vec3 vDir; varying vec3 vN; varying vec3 vW; varying float vH;
${NOISE_GLSL}
${TERRAIN_GLSL}
${PATCH_GLSL}
${LIGHT_MAP_GLSL}
${ATMOSPHERE_GLSL}
${PATTERN_GLSL}
/**
 * Detail noise anchored to the planet: the two power-of-two frequencies either side of f, blended
 * by where f falls between them. Zooming changes only the blend (detail fades in and out); a
 * frequency that followed the zoom made the ground's pattern slide and shuffle.
 */
float bandNoise(vec3 d, float f, float off) {
  float l = log2(f), f0 = exp2(floor(l)), w = smoothstep(0.0, 1.0, fract(l));
  return mix(snoise(d * f0 + off), snoise(d * (f0 * 2.0) + off), w);
}
float lineAA(float g, float halfW) { float d = abs(g - floor(g + 0.5)); float fw = fwidth(g); return 1.0 - smoothstep(halfW - fw, halfW + fw, d); }
/** lineAA with the pixel's width in g given, for use inside loops (no derivatives there: see the city loop). */
float lineW(float g, float halfW, float fw) { float d = abs(g - floor(g + 0.5)); return 1.0 - smoothstep(halfW - fw, halfW + fw, d); }
void main() {
  vec3 dir = normalize(vDir);
#ifdef IS_BASE
  // The globe gives way to the detail patch where the patch is drawn.
  if (patchEdge(dir) < 0.995) discard;
#endif
  vec3 n = normalize(vN);
  vec3 L = uSun;
  float h = vH;
  float ndlS = dot(dir, L);
  float ndlT = dot(n, L);
  float day = smoothstep(-0.12, 0.3, ndlS);
  float night = 1.0 - smoothstep(-0.18, 0.08, ndlS);
  vec3 p = dir * uDetail + uSeed;
  // Zoom-scaled detail noise, faded out where it would alias (far terrain, the horizon).
  float fwq = length(fwidth(dir * uFine));
  float fade1 = 1.0 - smoothstep(0.2, 0.7, fwq);
  float fine = bandNoise(dir, uFine, 0.0) * 0.6 * fade1;
#ifndef LITE
  float fade2 = 1.0 - smoothstep(0.2, 0.7, fwq * 2.9);
  fine += bandNoise(dir, uFine * 2.9, 3.0) * 0.4 * fade2;
#endif
  float coarse = snoise(p * 6.0);
  vec3 col; vec3 em = vec3(0.0); float spec = 0.0; float cracks = 0.0;
  bool water = uDry < 0.5 && h < uSea;
  // A locked world's water beyond its sunward basin is frozen (as the system view draws it).
  float iced = uLocked > 0.0 ? 1.0 - smoothstep(uLocked - 0.25, uLocked - 0.05, dir.x + snoise(p * 3.0) * 0.05) : 0.0;
  if (water) {
    col = mix(uC0, uC1, smoothstep(uSea - 0.45, uSea, h));
    col = mix(col, uC1 * 1.25 + vec3(0.0, 0.06, 0.05), smoothstep(uSea - 0.05, uSea, h) * 0.6);
    spec = 1.0;
#ifdef SEA_GLOW
    // Glowing seas (acid, lava), as from orbit (PlanetMaterial).
    em += uSeaGlow * (0.55 + 0.6 * smoothstep(uSea - 0.4, uSea, h)) * (0.75 + 0.15 * coarse + 0.1 * fine);
    col *= 0.6;
#endif
  } else {
    float e = uDry > 0.5 ? smoothstep(-0.6, 0.7, h) : smoothstep(uSea, uSea + 0.7, h);
    col = mix(uC2, uC3, clamp(e + fine * 0.06, 0.0, 1.0));
    float veg = smoothstep(-0.25, 0.45, bandNoise(dir, uFine * 0.23, 7.0)) * (1.0 - smoothstep(0.2, 0.7, fwq * 0.23));
    col = mix(col, col * vec3(0.72, 0.86, 0.68), veg * 0.45);
    col *= 0.86 + 0.14 * coarse + 0.1 * fine;
    if (uDry < 0.5) col = mix(mix(uC3, vec3(0.86, 0.8, 0.62), 0.55), col, smoothstep(0.0, 0.012, h - uSea + fine * 0.004));
    float slope = 1.0 - dot(n, dir);
    vec3 rock = mix(uC3, vec3(0.36, 0.34, 0.33), 0.55) * (0.8 + 0.2 * fine);
    col = mix(col, rock, smoothstep(0.035, 0.11, slope + fine * 0.015) * 0.85);
    if (uSnow > 0.5) col = mix(col, vec3(0.93, 0.95, 1.0), smoothstep(uSea + 0.5, uSea + 0.62, h + fine * 0.04));
    if (uLava > 0.5) cracks = smoothstep(0.8, 0.96, ridged(p * 1.3 + vec3(0.0, uTime * 0.01, 0.0)) + fine * 0.03);
  }
  if (uLocked > 0.0) {
    // The frozen side: sea ice, and the land under snow beyond the basin's shore.
    float shore = 1.0 - smoothstep(uLocked - 0.3, uLocked - 0.05, dir.x + fine * 0.01);
    vec3 iceCol = mix(vec3(0.6, 0.7, 0.8), vec3(0.9, 0.94, 0.98), smoothstep(-0.3, 0.4, h + coarse * 0.15)) * (0.94 + 0.06 * fine);
    float frozen = water ? iced : smoothstep(0.25, 0.75, shore + coarse * 0.2);
    col = mix(col, iceCol, frozen);
    spec *= 1.0 - frozen;
  }
  // Craters by their albedo, as from orbit: dark floors, bright rims and ejecta.
  if (uCraters > 0.5) col *= 1.0 + clamp(craters(p, 7.0) * 1.6, -0.4, 0.35);
  // Canyon walls: darker, banded strata (as from orbit); the bands fade where they would alias.
  if (uCanyons > 0.0) {
    float cut = canyonCut(p, uCanyons);
    float bands = 1.0 - smoothstep(0.5, 1.5, fwidth(h * 40.0));
    // The walls in the planet's own darker strata (the pale cliff rock would outline every step of the mesh).
    col = mix(col, mix(uC1, uC2, 0.5 + 0.5 * sin(h * 23.0 + fine * 0.3) * bands), smoothstep(0.15, 0.6, cut) * 0.7);
    col *= 1.0 - cut * (0.25 + 0.12 * sin(h * 40.0 + fine * 0.5) * bands);
  }
  // Volcanoes: ash cones, a glowing caldera rim and lava rivers down the flanks.
  if (uVolcanoes > 0.5) {
    vec2 v = volcanoes(p, uSeed, uDetail);
    col = mix(col, uC3 * 1.25 + vec3(0.04), clamp(v.x * 1.2, 0.0, 0.6));
    float lava = v.y * (0.75 + 0.25 * fine);
    em += uGlow * lava * 1.8;
    col = mix(col, uGlow * 0.5, lava * 0.6);
  }
#ifdef GLITTER
  {
    vec3 fc = floor(dir * 260.0 * max(1.0, uFine / 40.0));
    float facet = hash13(fc + floor(uSeed));
    vec3 Vg = normalize(uCam - vW);
    float glint = step(0.93, facet) * pow(max(dot(reflect(-L, n), Vg), 0.0), 6.0) * (0.6 + 0.4 * sin(uTime * 3.0 + facet * 60.0));
    em += uGlitter * glint * 2.0 * day;
    spec = max(spec, 0.6);
  }
#endif
#ifdef PATTERN
  {
    vec3 patE = vec3(0.0);
    float dusk = 1.0 - smoothstep(-0.2, 0.3, ndlS);
    col = surfacePattern(dir, p, h, col, 1.0, uClose, dusk, spec, patE);
    em += patE;
  }
#endif
  float caps = uLocked > 0.0 ? 0.0 : smoothstep(uIce, uIce + 0.06, abs(dir.y) + h * 0.12 + fine * 0.02);
  col = mix(col, vec3(0.92, 0.95, 1.0) * (0.92 + 0.08 * fine), caps);
  spec *= 1.0 - caps;

  float urbanAll = 0.0;
  // How much of the sphere one pixel covers, taken once here: the loop below must not take
  // derivatives itself (change surface-perf). On Windows, Direct3D's shader compiler has to unroll
  // any loop that does, and unrolled 32 times over every city the compile froze the game the first
  // time a planet came into view.
  float pxDir = length(fwidth(dir));
  // Settlements: concrete, a street grid that glows at night, the capital's avenues and ring road.
  for (int i = 0; i < ${MAX_SITES}; i++) {
    if (i >= uCityN) break;
    vec3 c = uCityA[i].xyz;
    float R = uCityB[i].w;
    float chord = length(dir - c);
    if (chord > R * 1.8) continue;
    vec3 up = abs(c.y) > 0.98 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0);
    vec3 t1 = normalize(cross(up, c));
    vec3 t2 = cross(c, t1);
    vec3 q = dir / dot(dir, c) - c;
    vec2 xy = vec2(dot(q, t1), dot(q, t2));
    float rr = length(xy);
    float cell = uCityB[i].z;
    float edge = R * (0.92 + 0.12 * coarse);
    float inCity = 1.0 - smoothstep(edge * 0.9, edge * 1.08, rr);
    float sprawl = 1.0 - smoothstep(R * 0.6, R * 1.7, rr);
    vec2 g = xy / cell;
    // One pixel, in cells (the tangent plane is the sphere this close to the city).
    float fwG = pxDir / cell;
    float roads = max(lineW(g.x, 0.1, fwG), lineW(g.y, 0.1, fwG));
    float major = max(lineW(g.x * 0.25, 0.035, fwG * 0.25), lineW(g.y * 0.25, 0.035, fwG * 0.25));
    float avenue = 0.0;
    if (uCityC[i].x > 0.5) {
      float ang = atan(xy.y, xy.x);
      float dav = rr * abs(sin(4.0 * ang)) * 0.25 / cell;
      float fwA = fwG;
      avenue = 1.0 - smoothstep(0.28 - fwA, 0.28 + fwA, dav);
      avenue *= step(cell * 1.6, rr);
      float ring1 = abs(rr - R * 0.55) / cell;
      float fwR = fwG;
      avenue = max(avenue, 1.0 - smoothstep(0.28 - fwR, 0.28 + fwR, ring1));
      float plaza = 1.0 - smoothstep(cell * 1.5, cell * 1.6, rr);
      col = mix(col, vec3(0.62, 0.6, 0.55), plaza * 0.9);
      em += uCityGlow * plaza * night * 0.12;
    }
    vec3 urban = vec3(0.34, 0.35, 0.36) * (0.85 + 0.15 * fine);
    col = mix(col, urban, inCity * 0.8);
    col = mix(col, vec3(0.4, 0.4, 0.36), sprawl * (1.0 - inCity) * 0.18);
    float street = max(max(roads * 0.8, major), avenue) * inCity;
    col = mix(col, vec3(0.09, 0.1, 0.11), street * 0.85);
    // Street detail where a pixel is small against a block (change city-life): pavements, lane
    // markings, crossings, and the pools of light under the lamps CityLife stands along the streets.
    vec2 gd = g - floor(g + 0.5);
    float detail = (1.0 - smoothstep(0.015, 0.05, fwG)) * inCity;
    vec2 wideAx = vec2(step(abs(mod(floor(g.x + 0.5), 4.0)), 0.5), step(abs(mod(floor(g.y + 0.5), 4.0)), 0.5));
    vec2 hw = mix(vec2(0.1), vec2(0.14), wideAx);
    // In the street that runs along y (its line is x = const), and the one along x.
    float inSY = step(abs(gd.x), hw.x), inSX = step(abs(gd.y), hw.y);
    vec2 pave = step(hw, abs(gd)) * step(abs(gd), hw + 0.035);
    float onPave = max(pave.x * (1.0 - inSX), pave.y * (1.0 - inSY));
    col = mix(col, vec3(0.46, 0.46, 0.45), detail * onPave * 0.8);
    // A dashed centre line along each street, solid lane lines on the wide ones, zebra crossings.
    float alongY = (step(abs(gd.x), 0.006) * step(0.5, fract(g.y * 5.0)) + wideAx.x * step(abs(abs(gd.x) - 0.07), 0.004)) * inSY * (1.0 - inSX);
    float alongX = (step(abs(gd.y), 0.006) * step(0.5, fract(g.x * 5.0)) + wideAx.y * step(abs(abs(gd.y) - 0.07), 0.004)) * inSX * (1.0 - inSY);
    float crossY = inSY * step(hw.y + 0.01, abs(gd.y)) * step(abs(gd.y), hw.y + 0.06) * step(0.5, fract(gd.x * 40.0));
    float crossX = inSX * step(hw.x + 0.01, abs(gd.x)) * step(abs(gd.x), hw.x + 0.06) * step(0.5, fract(gd.y * 40.0));
    float marks = clamp(alongY + alongX + crossY + crossX, 0.0, 1.0);
    col = mix(col, vec3(0.78, 0.76, 0.66), detail * marks * street * 0.75);
    // Lamps every half block on both pavements, midway between crossings.
    vec2 lampOff = hw + 0.004;
    float dyl = (fract(g.y * 2.0) - 0.5) * 0.5, dxl = (fract(g.x * 2.0) - 0.5) * 0.5;
    float px1 = min(abs(gd.x - lampOff.x * 0.8), abs(gd.x + lampOff.x * 0.8));
    float py1 = min(abs(gd.y - lampOff.y * 0.8), abs(gd.y + lampOff.y * 0.8));
    float pools = exp(-(px1 * px1 + dyl * dyl) / 0.006) + exp(-(py1 * py1 + dxl * dxl) / 0.006);
    vec3 lamp = mix(uCityGlow, vec3(1.0, 0.86, 0.6), avenue);
    em += vec3(1.0, 0.84, 0.58) * night * inCity * pools * 0.42 * mix(0.35, 1.0, detail);
    em += lamp * night * inCity * (roads * 0.03 + major * 0.06 + avenue * 0.14) * (1.0 - detail * 0.6);
    em += uCityGlow * night * inCity * 0.02;
    spec *= 1.0 - inCity;
    urbanAll = max(urbanAll, max(inCity, sprawl * 0.9));
  }
  // From orbit the streets and roads collapse into the planet's light map, the same one the
  // system view draws, so the lights stay where they were seen from afar.
  float lightMap = lightMapAt(uLightMap, dir);
  em += uCityGlow * night * uFar * lightMap * 1.1;
  col = mix(col, vec3(0.42, 0.42, 0.4), lightMap * 0.35 * uFar * (1.0 - urbanAll));
  cracks *= 1.0 - urbanAll;
  em += uGlow * cracks * 2.0;
  col = mix(col, uGlow * 0.4, cracks * 0.5);
  // Deep Mine pit: a terraced ochre bowl.
  float pc = length(dir - uPit.xyz) / uPit.w;
  if (pc < 1.0 && uPitDepth > 0.0) {
    float t = 1.0 - pc;
    float bands = fract(t * 5.0);
    vec3 dirt = mix(vec3(0.55, 0.42, 0.28), vec3(0.4, 0.37, 0.35), step(0.5, fract(t * 2.5)));
    col = mix(col, dirt * (0.75 + 0.35 * smoothstep(0.6, 0.95, bands)), smoothstep(0.0, 0.08, t) * clamp(uPitDepth * 25.0, 0.0, 1.0));
  }

  // Per-pixel bump from the detail noise (surface-gradient method): crisp terrain at any zoom.
  if (!water) {
    float bh = fine * (0.022 / uFine) * (1.0 - urbanAll * 0.8) * (1.0 - uFar * 0.8);
    vec3 dpx = dFdx(vW), dpy = dFdy(vW);
    vec3 r1 = cross(dpy, n), r2 = cross(n, dpx);
    float det = dot(dpx, r1);
    vec3 grad = sign(det) * (dFdx(bh) * r1 + dFdy(bh) * r2);
    n = normalize(abs(det) * n - grad);
    ndlT = dot(n, L);
  }
  float relief = clamp(1.0 + (ndlT - ndlS) * 3.0, 0.15, 1.7);
  vec3 sunCol = mix(vec3(1.0, 0.62, 0.38), vec3(1.0, 0.98, 0.94), smoothstep(0.0, 0.35, ndlS));
  vec3 V = normalize(uCam - vW);
  vec3 Hh = normalize(L + V);
  float sp = pow(max(dot(dir, Hh), 0.0), 60.0) * spec * day;
  // Night: a faint cool skylight so the ground still reads.
  vec3 lit = col * ((0.035 + 0.965 * day * relief) * sunCol + vec3(0.03, 0.04, 0.06) * (1.0 - day)) + sp * 0.55 * sunCol + em;
  // Orbit: atmosphere rim. Near the ground: distance haze.
  float rim = pow(1.0 - max(dot(dir, V), 0.0), 2.5);
  float dist = length(uCam - vW);
  float haze = mix(rim, (1.0 - exp(-dist / 0.3)) * 0.55, uClose) * uAtmoStrength;
  vec3 airCol = uAtmo * (0.12 + 0.88 * smoothstep(-0.3, 0.6, ndlS));
  lit = mix(lit, lit + airCol, clamp(haze * (1.0 - uClose * 0.35), 0.0, 1.0) * (1.0 - uClose));
  lit = mix(lit, airCol * 0.8, clamp(haze * uClose * 0.75, 0.0, 0.85));
  gl_FragColor = vec4(lit, uFade);
}`;

export const BASE_VERT = /* glsl */ `
attribute float aH;
varying vec3 vDir; varying vec3 vN; varying vec3 vW; varying float vH;
void main() {
  vDir = normalize(position); vN = normal; vW = position; vH = aH;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

/** The detail patch: a grid on the sphere near the camera, displaced on the GPU with more octaves. */
export const PATCH_VERT = /* glsl */ `
attribute vec2 aUV; attribute float aSkirt;
uniform float uEps;
varying vec3 vDir; varying vec3 vN; varying vec3 vW; varying float vH;
${NOISE_GLSL}
${TERRAIN_GLSL}
${PATCH_GLSL}
${FACE_GLSL}
${GROUND_GLSL}
vec3 pdir(vec2 uv) { return normalize(uPC + (uv.x * uPT1 + uv.y * uPT2) * uPSize); }
void main() {
  float edge = max(abs(aUV.x), abs(aUV.y));
  float oct = patchOctaves(edge);
  vec3 d0 = pdir(aUV);
  float h0 = shapedH(d0, oct);
  vec3 P0 = d0 * radiusOf(h0);
  vec3 d1 = pdir(aUV + vec2(uEps, 0.0)); vec3 P1 = d1 * radiusOf(shapedH(d1, oct));
  vec3 d2 = pdir(aUV + vec2(0.0, uEps)); vec3 P2 = d2 * radiusOf(shapedH(d2, oct));
  vec3 nn = normalize(cross(P1 - P0, P2 - P0));
  if (dot(nn, d0) < 0.0) nn = -nn;
  // Shading keeps the noise's own normal; the position morphs onto the globe toward the edge.
  float m = patchMorph(edge);
  float r = m > 0.0 ? mix(length(P0), globeRadius(d0), m) : length(P0);
  vec3 P = d0 * (r - aSkirt * uPSize * 0.03);
  vDir = d0; vN = nn; vW = P; vH = h0;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(P, 1.0);
}`;

/** The weather shells (clouds, aurora): a direction in the planet frame and the point drawn. */
export const SHELL_VERT = /* glsl */ `varying vec3 vDir; varying vec3 vW; void main() { vDir = normalize(position); vW = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

/**
 * The cloud shell: the system view's clouds, haze deck, cyclones and lightning (ATMOSPHERE_GLSL),
 * lit as it lights them. Premultiplied alpha: the deck covers the ground as the system view mixes
 * it in, and lightning adds light on top.
 */
export const CLOUD_FRAG = /* glsl */ `
uniform vec3 uSeed, uSun, uCam, uCloud, uC3, uAtmo; uniform float uDetail, uTime, uAmount, uFade, uHaze, uLightning, uAtmoStrength;
varying vec3 vDir; varying vec3 vW;
${NOISE_GLSL}
${ATMOSPHERE_GLSL}
void main() {
  vec3 d = normalize(vDir);
  float ndl = dot(d, uSun);
  float day = smoothstep(-0.12, 0.35, ndl);
  float a = cloudCover(d, uSeed, uDetail, uTime, uAmount);
  vec3 col = uCloud * a;
#ifdef HAZE
  // The deck over the clouds: what mix(mix(ground, cloud, c), deck, h) leaves of the ground.
  vec4 deck = hazeDeck(d, uSeed, uTime, uHaze, uCloud, uC3);
  col = deck.rgb * deck.a + col * (1.0 - deck.a);
  a = deck.a + a * (1.0 - deck.a);
#endif
  vec3 lit = col * (0.03 + 0.97 * day);
  // The system view adds its atmosphere rim over the clouds: keep what they hide of the ground's.
  float rim = pow(1.0 - max(dot(d, normalize(uCam - vW)), 0.0), 2.5);
  lit += uAtmo * rim * uAtmoStrength * (0.15 + 0.85 * smoothstep(-0.3, 0.6, ndl)) * a;
#ifdef LIGHTNING
  lit += LIGHTNING_COLOR * lightningAt(d, uSeed, uTime, uLightning) * (1.0 + 0.6 * (1.0 - smoothstep(-0.3, 0.3, ndl)));
#endif
  gl_FragColor = vec4(lit, a) * uFade;
}`;

/**
 * The aurora shell, just above the clouds: the system view's curtains (ATMOSPHERE_GLSL), seen from
 * orbit and, from inside the shell, overhead and toward the poles from the ground. Premultiplied
 * alpha: from outside it darkens the band beneath the curtains as the system view does (uDim).
 */
export const AURORA_FRAG = /* glsl */ `
uniform vec3 uSeed, uSun, uCam, uAurora; uniform float uTime, uFade, uDim; varying vec3 vDir; varying vec3 vW;
${NOISE_GLSL}
${ATMOSPHERE_GLSL}
void main() {
  vec3 d = normalize(vDir);
  vec3 V = normalize(uCam - vW);
  float ndl = dot(d, uSun);
  // From orbit (the shell's outside) as the system view draws them, brightest toward the limb.
  // From the ground (inside) softer, faint by day, finely rayed.
  bool inside = !gl_FrontFacing;
  float band;
  vec3 light = auroraAt(d, uSeed, uTime, uAurora, ndl, inside ? 0.0 : pow(1.0 - max(dot(d, V), 0.0), 1.5), band);
  light *= auroraFineRays(d, uSeed, uTime);
  if (inside) light *= 0.2 + 0.3 * (1.0 - smoothstep(-0.3, 0.3, ndl));
  float dim = inside ? 0.0 : band * 0.55 * uDim;
  gl_FragColor = vec4(light, dim) * uFade;
}`;

/** Atmosphere shell: a short raymarch through an exponential haze (skipped on phones). */
export const ATMO_VERT = /* glsl */ `varying vec3 vW; void main() { vW = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
export const ATMO_FRAG = /* glsl */ `
uniform vec3 uCam, uSun, uAtmo; uniform float uStrength, uFade; varying vec3 vW;
void main() {
  vec3 rd = normalize(vW - uCam);
  const float Ra = 1.08;
  float b = dot(uCam, rd);
  float c = dot(uCam, uCam) - Ra * Ra;
  float disc = b * b - c;
  if (disc < 0.0) discard;
  float s = sqrt(disc);
  float t0 = max(-b - s, 0.0), t1 = -b + s;
  float dp = b * b - (dot(uCam, uCam) - 1.0);
  if (dp > 0.0) { float tp = -b - sqrt(dp); if (tp > 0.0) t1 = min(t1, tp); }
  if (t1 <= t0) discard;
  float dt = (t1 - t0) / 8.0, sum = 0.0, warm = 0.0;
  for (int i = 0; i < 8; i++) {
    vec3 p = uCam + rd * (t0 + dt * (float(i) + 0.5));
    float r = length(p);
    float dens = exp(-(r - 1.0) / 0.017);
    float mu = dot(p / r, uSun);
    sum += dens * smoothstep(-0.25, 0.35, mu);
    warm += dens * smoothstep(-0.25, 0.05, mu) * (1.0 - smoothstep(0.05, 0.35, mu));
  }
  sum *= dt; warm *= dt;
  vec3 col = uAtmo * (1.0 - exp(-sum * 34.0)) + vec3(1.0, 0.45, 0.2) * (1.0 - exp(-warm * 20.0)) * 0.5;
  gl_FragColor = vec4(col * uStrength * uFade, 1.0);
}`;

/** One shader for every structure: sun and sky light, lit windows at night, beacons and glows (aEmit). */
export const STRUCT_VERT = /* glsl */ `
attribute float aEmit;
varying vec3 vCol; varying vec3 vNw; varying vec3 vUp; varying vec3 vLoc; varying vec3 vLocN; varying float vEmit; varying float vSeed; varying vec3 vW;
void main() {
  mat4 m = modelMatrix;
#ifdef USE_INSTANCING
  m = m * instanceMatrix;
#endif
  vec3 sc = vec3(length(m[0].xyz), length(m[1].xyz), length(m[2].xyz));
  vLoc = position * sc; vLocN = normal;
  vec4 wp = m * vec4(position, 1.0);
  vW = wp.xyz;
  vNw = normalize(mat3(m) * (normal / (sc * sc)));
  vec3 o = (m * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  vUp = normalize(o);
  vSeed = fract(sin(dot(o * 1000.0, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
  vCol = color;
#ifdef USE_INSTANCING_COLOR
  vCol *= instanceColor;
#endif
  vEmit = aEmit;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;
export const STRUCT_FRAG = /* glsl */ `
uniform vec3 uSun, uCam, uAtmo; uniform float uTime, uClose, uAtmoStrength;
varying vec3 vCol; varying vec3 vNw; varying vec3 vUp; varying vec3 vLoc; varying vec3 vLocN; varying float vEmit; varying float vSeed; varying vec3 vW;
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
void main() {
  vec3 n = normalize(vNw);
  if (!gl_FrontFacing) n = -n;
  float sunUp = dot(vUp, uSun);
  float day = smoothstep(-0.1, 0.25, sunUp);
  float night = 1.0 - smoothstep(-0.16, 0.1, sunUp);
  float diff = max(dot(n, uSun), 0.0);
  float sky = 0.5 + 0.5 * dot(n, vUp);
  vec3 col = vCol * (day * (0.28 * sky + 0.9 * diff) + 0.03 + 0.03 * sky + night * 0.05 * (1.0 - sky * 0.5));
  vec3 em = vec3(0.0);
  if (vEmit > 0.5 && vEmit < 1.5) {
    // Windows on the walls, half of them lit at night; they melt into a glow from afar.
    if (abs(vLocN.y) < 0.5) {
      float hc = abs(vLocN.x) > 0.5 ? vLoc.z : vLoc.x;
      vec2 g = vec2(hc / 0.00016, vLoc.y / 0.0002);
      vec2 fw = fwidth(g);
      vec2 f = fract(g);
      float win = step(0.22, f.x) * step(f.x, 0.78) * step(0.3, f.y) * step(f.y, 0.82);
      // Every eighth storey a plant floor with no windows, and a glazed lobby at street level
      // (the towers stand 1.5 storeys into the ground) (change city-life).
      float storey = floor(g.y);
      float plant = step(6.5, mod(storey, 8.0)) * step(2.5, storey);
      float lobby = step(1.0, storey) * step(storey, 2.0);
      win *= 1.0 - plant;
      win = max(win, lobby * step(0.08, f.x) * step(f.x, 0.92));
      vec2 cellId = floor(g);
      float on = max(step(0.5, hash12(cellId + vSeed * 97.0)), lobby);
      float k = smoothstep(0.3, 0.8, max(fw.x, fw.y));
      float w = mix(win * on, 0.17, k);
      vec3 wc = mix(vec3(1.0, 0.78, 0.48), vec3(0.72, 0.9, 1.0), step(0.82, hash12(cellId * 1.7 + 3.1)));
      em += wc * w * night * 1.5;
      col = mix(col, col * 0.55 + vec3(0.04, 0.06, 0.09) * day, win * (1.0 - k) * 0.7);
      col *= 1.0 - plant * 0.18 * (1.0 - k);
    }
  } else if (vEmit > 1.5 && vEmit < 2.5) {
    em += vCol * (0.25 + 0.75 * night);
  } else if (vEmit > 2.5 && vEmit < 3.5) {
    em += vCol * step(0.55, fract(uTime * 0.7 + vSeed * 7.0)) * (0.8 + 1.6 * night);
  } else if (vEmit > 3.5) {
    em += vCol * night * 1.1;
  }
  vec3 lit = col + em;
  float dist = length(uCam - vW);
  vec3 airCol = uAtmo * (0.12 + 0.88 * smoothstep(-0.3, 0.6, sunUp));
  lit = mix(lit, airCol * 0.8, clamp((1.0 - exp(-dist / 0.3)) * 0.55 * uClose * 0.75 * uAtmoStrength, 0.0, 0.85));
  gl_FragColor = vec4(lit, 1.0);
}`;

/**
 * City life (change city-life): cars, flying cars, shuttles, freighters, people and street lamps,
 * each kind one instanced draw moved entirely on the GPU by the clock. An instance follows a path
 * in its city's tangent plane (aCity: centre and ground radius; aT1: the plane's first axis):
 * a straight segment (aPath.x 0: angle, side offset, half length; aAux.x the segment's middle), a
 * circle (1: radius), or a climb from a pad to orbit (2: pad xy, aAux xy the point under the
 * top, aAux.z its height). aMove: speed (signed, per second), phase, height above the street,
 * size. Anything under half a pixel is not drawn, so a whole city of them costs nothing from orbit.
 * Lit with STRUCT_FRAG.
 */
export const LIFE_VERT = /* glsl */ `
attribute float aEmit;
attribute vec4 aCity; attribute vec3 aT1; attribute vec4 aPath; attribute vec4 aMove; attribute vec4 aAux; attribute vec3 aTint;
uniform float uTime, uPxScale;
varying vec3 vCol; varying vec3 vNw; varying vec3 vUp; varying vec3 vLoc; varying vec3 vLocN; varying float vEmit; varying float vSeed; varying vec3 vW;
void main() {
  vec3 c = aCity.xyz;
  vec3 t1 = aT1, t2 = cross(c, aT1);
  float s = aMove.y + aMove.x * uTime;
  float alt = aMove.z, fade = 1.0, climb = 0.0;
  vec2 p, fwd;
  if (aPath.x < 0.5) {
    float L = aPath.w;
    float u = mod(s + L, 2.0 * L) - L;
    vec2 ax = vec2(cos(aPath.y), sin(aPath.y));
    p = ax * (u + aAux.x) + vec2(-ax.y, ax.x) * aPath.z;
    fwd = ax * (aMove.x < 0.0 ? -1.0 : 1.0);
    fade = 1.0 - smoothstep(L * 0.86, L, abs(u));
  } else if (aPath.x < 1.5) {
    float r = aPath.z, th = s / r;
    p = r * vec2(cos(th), sin(th));
    fwd = vec2(-sin(th), cos(th)) * (aMove.x < 0.0 ? -1.0 : 1.0);
  } else {
    float t = fract(s);
    vec2 pad = aPath.yz, top = aAux.xy;
    p = mix(pad, top, smoothstep(0.12, 1.0, t));
    alt = mix(aMove.z, aAux.z, pow(t, 1.7));
    fwd = normalize(top - pad + vec2(1e-7));
    fade = smoothstep(0.0, 0.03, t) * (1.0 - smoothstep(0.88, 1.0, t));
    climb = 1.0 - smoothstep(0.04, 0.35, t);
  }
  vec3 up = normalize(c + t1 * p.x + t2 * p.y);
  vec3 f3 = t1 * fwd.x + t2 * fwd.y;
  f3 = normalize(f3 - up * dot(f3, up));
  // A shuttle leaves its pad nose up and levels out as it climbs.
  if (climb > 0.0) f3 = normalize(mix(f3, up, climb * 0.85));
  vec3 side = normalize(cross(f3, up));
  vec3 yv = normalize(cross(side, f3));
  vec3 base = up * (aCity.w + alt);
  float size = aMove.w * fade;
  vec4 mvB = viewMatrix * vec4(base, 1.0);
  float px = size * uPxScale / max(-mvB.z, 1e-7);
  if (px < 0.5) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); vCol = vec3(0.0); vNw = up; vUp = up; vLoc = vec3(0.0); vLocN = up; vEmit = 0.0; vSeed = 0.0; vW = base; return; }
  size *= smoothstep(0.5, 1.4, px);
  vec3 w = base + (f3 * position.x + yv * position.y + side * position.z) * size;
  vW = w;
  vUp = up;
  vNw = normalize(f3 * normal.x + yv * normal.y + side * normal.z);
  vLoc = position * size;
  vLocN = normal;
  vSeed = fract(aMove.y * 7.31 + aPath.z * 913.0);
  vCol = aEmit > 0.5 ? color : color * aTint;
  vEmit = aEmit;
  gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
}`;

/** Manufactory smoke: points that rise, drift and fade. */
export const SMOKE_VERT = /* glsl */ `
attribute float aSeed; uniform float uTime; uniform float uScale; uniform vec3 uSun;
varying float vA; varying float vDay;
void main() {
  float t = fract(uTime * 0.09 + aSeed);
  vec3 up = normalize(position);
  vec3 side = normalize(cross(up, vec3(0.0, 1.0, 0.0)));
  vec3 p = position + up * (t * 0.0075) + side * (t * t * 0.006) + cross(up, side) * sin(aSeed * 40.0 + t * 3.0) * 0.0004 * t;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = clamp((0.0006 + t * 0.0028) * uScale / -mv.z, 1.0, 160.0);
  vA = (1.0 - t) * smoothstep(0.0, 0.08, t) * 0.55;
  vDay = smoothstep(-0.1, 0.25, dot(up, uSun));
}`;
export const SMOKE_FRAG = /* glsl */ `
varying float vA; varying float vDay;
void main() {
  vec2 c = gl_PointCoord - 0.5; float r = dot(c, c);
  if (r > 0.25) discard;
  float a = vA * (1.0 - r * 4.0);
  vec3 col = mix(vec3(0.25, 0.12, 0.06), vec3(0.78, 0.76, 0.74), vDay);
  gl_FragColor = vec4(col, a);
}`;

/** Full-screen backdrop that fades the map's sky out as the close-up takes the whole screen. */
export const BACKDROP_VERT = /* glsl */ `void main() { gl_Position = vec4(position.xy, 0.9999, 1.0); }`;
export const BACKDROP_FRAG = /* glsl */ `uniform vec3 uColor; uniform float uAlpha; void main() { gl_FragColor = vec4(uColor, uAlpha); }`;

/**
 * Roads: ribbons laid on the terrain exactly as it is drawn (GROUND_GLSL): the patch's own height
 * near the camera, the baked globe's triangle under them elsewhere.
 * Each ribbon is at least ROAD_MIN_PX wide on screen and fades when thinner than that, so from
 * close orbit roads read as faint lines. Lamps light them at night.
 */
export const ROAD_VERT = /* glsl */ `
attribute vec3 aTan; attribute float aSide; attribute float aAlong; attribute float aBridge; attribute float aTrunk;
uniform float uWidth, uPx; uniform vec3 uCam;
varying vec3 vW; varying vec3 vUp; varying float vAlong; varying float vBridge; varying float vAlpha; varying float vTrunk; varying float vAcross;
${NOISE_GLSL}
${TERRAIN_GLSL}
${PATCH_GLSL}
${FACE_GLSL}
${GROUND_GLSL}
void main() {
  vec3 d = normalize(position);
  float edge = patchEdge(d);
  float r = groundRadius(d, edge);
  if (aBridge > 0.5) r = max(r, 1.0) + 0.0004;
  vec3 P = d * r;
  float dist = length(uCam - P);
  float want = uWidth * (aTrunk > 0.5 ? 1.0 : 0.7);
  float minW = uPx * dist * ${ROAD_MIN_PX.toFixed(1)};
  float w = max(want, minW);
  vec3 side = normalize(cross(d, aTan));
  P += side * aSide * w * 0.5 + d * (0.00002 + dist * 0.0006);
  vW = P; vUp = d; vAlong = aAlong; vBridge = aBridge; vTrunk = aTrunk; vAcross = aSide;
  vAlpha = clamp(want / minW, 0.3, 1.0);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(P, 1.0);
}`;

export const ROAD_FRAG = /* glsl */ `
uniform vec3 uSun, uCam, uAtmo, uCityGlow; uniform float uClose, uAtmoStrength, uFade, uFar;
varying vec3 vW; varying vec3 vUp; varying float vAlong; varying float vBridge; varying float vAlpha; varying float vTrunk; varying float vAcross;
void main() {
  float sunUp = dot(normalize(vUp), uSun);
  float day = smoothstep(-0.1, 0.25, sunUp);
  float night = 1.0 - smoothstep(-0.18, 0.08, sunUp);
  vec3 col = mix(vec3(0.11, 0.11, 0.12), vec3(0.5, 0.49, 0.46), vBridge);
  // A pale centre line by day, where it can be seen.
  float centre = 1.0 - smoothstep(0.06, 0.16, abs(vAcross));
  col = mix(col, vec3(0.75, 0.72, 0.6), centre * 0.5 * vAlpha);
  vec3 lit = col * (0.04 + 0.9 * day);
  // Street lamps along the road; far away they average into a steady glow.
  float g = vAlong / 0.0012;
  float fw = fwidth(g);
  float lamp = mix(1.0 - smoothstep(0.15, 0.35, abs(fract(g) - 0.5) * 2.0 - 0.3), 0.45, smoothstep(0.3, 0.8, fw));
  lit += uCityGlow * night * (0.25 + 0.9 * lamp) * (vTrunk > 0.5 ? 1.0 : 0.75);
  float dist = length(uCam - vW);
  vec3 airCol = uAtmo * (0.12 + 0.88 * smoothstep(-0.3, 0.6, sunUp));
  lit = mix(lit, airCol * 0.8, clamp((1.0 - exp(-dist / 0.3)) * 0.55 * uClose * 0.75 * uAtmoStrength, 0.0, 0.85));
  // From orbit the light map carries the lights: the ribbons fade to faint lines.
  float far = mix(1.0, 0.55, uFar);
  gl_FragColor = vec4(lit, vAlpha * uFade * far);
}`;

/** Kinds a flora layer can hold (the longest table in src/content/flora.ts has six). */
export const MAX_FLORA_KINDS = 8;

/**
 * Flora and props (change surface-flora): one instanced draw per prop kind. Each instance is a
 * cell of a grid on the cube face under the detail patch's centre, anchored to the planet, so the
 * same cell always holds the same prop; the cell's hash picks its kind, place, size, turn and
 * colour, and noise gathers them into groves. Each stands on the ground exactly as drawn (the
 * patch's own height), never in water, cities or (living things) on ice and snow.
 *
 * Where a cell's prop stands costs a terrain evaluation, so it is worked out once a cell
 * (change surface-perf): FLORA_PLACE_FRAG writes it to a texture, a texel a cell, and every vertex
 * of the prop reads it (PLACED). Without float render targets the vertex shader works it out
 * itself, once a vertex, as it used to. Either way only the cells the CPU listed for a kind are
 * drawn (floraCells.ts, attribute aCell).
 */
const FLORA_GLSL = /* glsl */ `
uniform float uSpacing, uK, uFill, uSalt, uFlora, uIce, uSnow;
uniform float uELo[${MAX_FLORA_KINDS}], uEHi[${MAX_FLORA_KINDS}], uELiving[${MAX_FLORA_KINDS}], uEWet[${MAX_FLORA_KINDS}], uECluster[${MAX_FLORA_KINDS}], uEClusterFreq[${MAX_FLORA_KINDS}];
uniform int uEN;
uvec3 pcg3(uvec3 v) {
  v = v * 1664525u + 1013904223u;
  v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
  v ^= v >> 16u;
  v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
  return v;
}
float rnd(uvec3 k, uint i) { return float(pcg3(k + uvec3(i * 7919u, i * 104729u, i * 31u)).x & 0xffffffu) / 16777216.0; }
uvec3 cellKey(vec2 cell, uint face) { return uvec3(ivec3(int(cell.x), int(cell.y), int(face) * 977 + int(uSalt))); }
// The window round the patch centre: its face, the centre in face coordinates and the first cell.
void floraWindow(out vec3 n, out vec3 fu, out vec3 fv, out vec2 c, out vec2 origin, out uint face) {
  faceOf(uPC, n, fu, fv);
  float dn = dot(uPC, n);
  c = vec2(dot(uPC, fu), dot(uPC, fv)) / dn;
  origin = floor(c / uSpacing) - floor(uK * 0.5);
  face = uint(dot(abs(n), vec3(0.0, 2.0, 4.0)) + (dot(n, vec3(1.0)) > 0.0 ? 1.0 : 0.0));
}
`;

/** Where a cell's prop stands (needs FLORA_TERRAIN_GLSL and FLORA_GLSL first). */
const FLORA_PLACE_GLSL = /* glsl */ `
// Where a cell's prop stands: xyz the ground point under it, w its kind plus how far it has grown
// (0..0.999); w below zero when nothing grows there.
vec4 placeCell(vec2 cell, uint face, vec3 n, vec3 fu, vec3 fv, vec2 c) {
  vec4 none = vec4(0.0, 0.0, 0.0, -1.0);
  uvec3 key = cellKey(cell, face);
  // The cell's kind: every kind in a layer reads the same roll, so they share the cells.
  float pick = rnd(key, 1u);
  int e = -1;
  for (int i = 0; i < ${MAX_FLORA_KINDS}; i++) {
    if (i >= uEN) break;
    if (pick >= uELo[i] && pick < uEHi[i]) { e = i; break; }
  }
  if (e < 0) return none;
  vec2 st = (cell + 0.15 + 0.7 * vec2(rnd(key, 2u), rnd(key, 3u))) * uSpacing;
  vec3 dir = normalize(n + fu * st.x + fv * st.y);
  // Shrinks away toward the window's edge and as the layer fades with height, never popping.
  float edgeW = length(st - c) / (uK * 0.5 * uSpacing);
  float keep = uFill * uFlora * (1.0 - smoothstep(0.7, 1.0, edgeW));
  if (uECluster[e] > 0.0) keep *= mix(1.0, smoothstep(-0.1, 0.35, snoise(dir * uEClusterFreq[e] + vec3(uSalt * 0.37))), uECluster[e]);
  float grow = clamp((keep - rnd(key, 4u)) / 0.12, 0.0, 1.0);
  if (grow <= 0.0) return none;
  float edge = patchEdge(dir);
  if (patchMorph(edge) > 0.0) return none;
  float h = shapedH(dir, patchOctaves(edge));
  // Out of the water, unless it grows in the shallows (it then stands on the bed, up through the water).
  if (uDry < 0.5 && h < uSea + 0.004 && (uEWet[e] <= 0.0 || h < uSea - uEWet[e])) return none;
  if (uELiving[e] > 0.5) {
    if (abs(dir.y) > uIce - 0.03) return none;
    if (uSnow > 0.5 && h > uSea + 0.5) return none;
    if (uLocked > 0.0 && dir.x < uLocked - 0.25) return none;
  }
  for (int i = 0; i < ${MAX_SITES}; i++) {
    if (i >= uCityN) break;
    if (length(dir - uCityA[i].xyz) < uCityB[i].y * 1.05) return none;
  }
  return vec4(dir * radiusOf(h), float(e) + min(grow, 0.999));
}
`;

/** The terrain as the patch draws it, for placing props on it. */
const FLORA_TERRAIN_GLSL = /* glsl */ `
${NOISE_GLSL}
${TERRAIN_GLSL}
${PATCH_GLSL}
${FACE_GLSL}
${GROUND_GLSL}
`;

/** The placement pass: a texel a cell of the window, as placeCell says. */
export const FLORA_PLACE_VERT = /* glsl */ `
void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }`;

export const FLORA_PLACE_FRAG = /* glsl */ `
${FLORA_TERRAIN_GLSL}
${FLORA_GLSL}
${FLORA_PLACE_GLSL}
void main() {
  if (uFlora <= 0.0 || uPatchOn < 0.5) { gl_FragColor = vec4(0.0, 0.0, 0.0, -1.0); return; }
  vec3 n, fu, fv; vec2 c, origin; uint face;
  floraWindow(n, fu, fv, c, origin, face);
  gl_FragColor = placeCell(origin + floor(gl_FragCoord.xy), face, n, fu, fv, c);
}`;

export const FLORA_VERT = /* glsl */ `
attribute float aTint; attribute float aEmit;
// The cell this instance draws: x, y and its cube face (floraCells.ts).
attribute vec3 aCell;
uniform float uEntry, uSizeA, uSizeB, uStretch, uSway, uTime, uDrift, uHover;
uniform vec3 uColA, uColB;
uniform sampler2D uPlace;
varying vec3 vCol; varying vec3 vNw; varying vec3 vUp; varying vec3 vW; varying vec3 vLoc; varying vec3 vLocN; varying float vEmit; varying float vSeed;
// Placed props read the placement pass and need none of the terrain: leaving it out of this
// shader is most of its compile time (change surface-perf).
#ifdef PLACED
uniform float uPatchOn; uniform vec3 uPC;
${FACE_GLSL}
${FLORA_GLSL}
#else
${FLORA_TERRAIN_GLSL}
${FLORA_GLSL}
${FLORA_PLACE_GLSL}
#endif
void hide() { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); vCol = vec3(0.0); vNw = vec3(0.0, 1.0, 0.0); vUp = vNw; vW = vec3(0.0); vLoc = vec3(0.0); vLocN = vNw; vEmit = 0.0; vSeed = 0.0; }
void main() {
  if (uFlora <= 0.0 || uPatchOn < 0.5) { hide(); return; }
  vec3 n, fu, fv; vec2 c, origin; uint face;
  floraWindow(n, fu, fv, c, origin, face);
  // The CPU listed cells for its own idea of the window: skip any the GPU's window leaves out.
  vec2 t = aCell.xy - origin;
  if (uint(aCell.z) != face || t.x < 0.0 || t.y < 0.0 || t.x >= uK || t.y >= uK) { hide(); return; }
#ifdef PLACED
  vec4 g = texelFetch(uPlace, ivec2(t), 0);
#else
  vec4 g = placeCell(aCell.xy, face, n, fu, fv, c);
#endif
  if (g.w < 0.0 || floor(g.w) != uEntry) { hide(); return; }
  float grow = g.w - uEntry;
  vec3 dir = normalize(g.xyz);
  float r = length(g.xyz);
  uvec3 key = cellKey(aCell.xy, face);
  float size = mix(uSizeA, uSizeB, pow(rnd(key, 6u), 2.0)) * grow;
  float ys = mix(1.0, uStretch, pow(rnd(key, 7u), 1.5));
  float yaw = rnd(key, 5u) * 6.2831853;
  vec3 lane = vec3(0.0);
  if (uDrift > 0.0) {
    // Traffic (change city-life): it flies along the grid's lanes (the face's axes), each its own
    // way and height, round a stretch of six cells, fading in and out at the ends.
    float alongU = step(0.5, rnd(key, 11u));
    lane = mix(fv, fu, alongU) * (rnd(key, 12u) < 0.5 ? -1.0 : 1.0);
    float span = uSpacing * 6.0;
    float t = fract(rnd(key, 13u) + uTime * uDrift / span);
    dir = normalize(dir + lane * (t - 0.5) * span);
    r += uHover * (1.0 + rnd(key, 14u));
    size *= smoothstep(0.0, 0.1, t) * (1.0 - smoothstep(0.9, 1.0, t));
  }
  vec3 up = dir;
  vec3 ax = normalize(cross(up, abs(up.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0)));
  vec3 az = cross(ax, up);
  vec3 x = ax * cos(yaw) + az * sin(yaw);
  if (uDrift > 0.0) x = normalize(lane - up * dot(lane, up));
  vec3 z = cross(x, up);
  vec3 p = position;
  p.y *= ys;
  // Wind: the tops sway, each prop in its own time.
  float seed = rnd(key, 8u);
  p.x += uSway * p.y * p.y * sin(uTime * 1.6 + seed * 6.2831);
  vec3 w = dir * (r - size * 0.06) + (x * p.x + up * p.y + z * p.z) * size;
  vW = w;
  vUp = up;
  vNw = normalize(x * normal.x + up * (normal.y / ys) + z * normal.z);
  vLoc = p * size;
  vLocN = normal;
  vec3 inst = mix(uColA, uColB, rnd(key, 9u)) * (0.85 + 0.3 * rnd(key, 10u));
  vCol = mix(color, color * inst, aTint);
  vEmit = aEmit;
  vSeed = seed;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(w, 1.0);
}`;

export const FLORA_FRAG = /* glsl */ `
uniform vec3 uSun, uCam, uAtmo, uGlowCol; uniform float uClose, uAtmoStrength, uNightGlow;
varying vec3 vCol; varying vec3 vNw; varying vec3 vUp; varying vec3 vW; varying vec3 vLoc; varying vec3 vLocN; varying float vEmit; varying float vSeed;
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
void main() {
  vec3 n = normalize(vNw);
  if (!gl_FrontFacing) n = -n;
  float sunUp = dot(vUp, uSun);
  float day = smoothstep(-0.1, 0.25, sunUp);
  float night = 1.0 - smoothstep(-0.16, 0.1, sunUp);
  // Wrapped light: leaves and blades catch some light from behind.
  float diff = clamp(dot(n, uSun) * 0.75 + 0.25, 0.0, 1.0);
  float sky = 0.5 + 0.5 * dot(n, vUp);
  vec3 col = vCol * (day * (0.3 * sky + 0.85 * diff) + 0.03 + 0.03 * sky + night * 0.05);
  vec3 em = vec3(0.0);
  if (vEmit > 0.0) {
    if (uNightGlow > 0.5) {
      // Windows on the walls, half of them lit at night.
      if (abs(vLocN.y) < 0.5) {
        float hc = abs(vLocN.x) > 0.5 ? vLoc.z : vLoc.x;
        vec2 g = vec2(hc / 0.00008, vLoc.y / 0.0001);
        vec2 f = fract(g);
        float win = step(0.25, f.x) * step(f.x, 0.75) * step(0.3, f.y) * step(f.y, 0.8);
        float on = step(0.5, hash12(floor(g) + vSeed * 97.0));
        float k = smoothstep(0.3, 0.8, max(fwidth(g).x, fwidth(g).y));
        em += uGlowCol * mix(win * on, 0.2, k) * night * 1.4;
      }
    } else {
      em += uGlowCol * vEmit * (0.6 + 0.8 * night);
    }
  }
  vec3 lit = col + em;
  float dist = length(uCam - vW);
  vec3 airCol = uAtmo * (0.12 + 0.88 * smoothstep(-0.3, 0.6, sunUp));
  lit = mix(lit, airCol * 0.8, clamp((1.0 - exp(-dist / 0.3)) * 0.55 * uClose * 0.75 * uAtmoStrength, 0.0, 0.85));
  gl_FragColor = vec4(lit, 1.0);
}`;
