/**
 * GLSL for the surface view. Units: one planet radius = 1, in the planet's own frame.
 * NOISE_GLSL hashes on exact integers, like src/core/surface/Noise.ts, so the GPU detail patch
 * and the CPU-baked globe agree where they meet.
 */

import { MAX_SETTLEMENTS } from '../../../core/surface/SurfaceLayout';
import { LIGHT_MAP_GLSL } from '../NightLightMap';

/** Most settlements the terrain shader flattens and draws streets for (main city, cities and towns). */
export const MAX_SITES = MAX_SETTLEMENTS;
/** Terrain relief in planet radii (exaggerated so mountains read from orbit). */
export const AMP = 0.022;
/** Octaves of the baked globe (the patch fades to this at its edge). */
export const BASE_OCT = 7;
/** Narrowest a road is drawn, in screen pixels (thinner roads fade instead). */
export const ROAD_MIN_PX = 1.4;

export const NOISE_GLSL = /* glsl */ `
float m289(float x) { return x - floor((x + 0.5) * (1.0 / 289.0)) * 289.0; }
vec4 m289(vec4 x) { return x - floor((x + 0.5) * (1.0 / 289.0)) * 289.0; }
vec3 m289(vec3 x) { return x - floor((x + 0.5) * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return m289(m289(x * 34.0 + 1.0) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
float snoise(vec3 v) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - 0.5;
  i = m289(i);
  vec4 p = permute(permute(permute(i.z + vec4(0.0, i1.z, i2.z, 1.0)) + i.y + vec4(0.0, i1.y, i2.y, 1.0)) + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  vec4 j = p - 49.0 * floor((p + 0.5) * (1.0 / 49.0));
  vec4 x_ = floor((j + 0.5) * (1.0 / 7.0));
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * (2.0 / 7.0) + (0.5 / 7.0 - 1.0);
  vec4 y = y_ * (2.0 / 7.0) + (0.5 / 7.0 - 1.0);
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  // h is a multiple of 1/7 and often exactly 0: a margin makes every GPU (and the CPU copy,
  // src/core/surface/Noise.ts) flip the same gradients, whatever its rounding.
  vec4 sh = -step(h, vec4(0.05));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}
float fbmN(vec3 p, float oct) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 14; i++) {
    float w = clamp(oct - float(i), 0.0, 1.0);
    if (w <= 0.0) break;
    v += a * w * snoise(p);
    p = p * 2.02 + vec3(1.7, 9.2, 3.1);
    a *= i < 6 ? 0.5 : 0.62;
  }
  return v;
}
float ridged4(vec3 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { v += a * (1.0 - abs(snoise(p))); p *= 2.1; a *= 0.5; } return v; }
`;

/** Terrain height, flattened under settlements and dug out for the mine pit (mirrors SurfaceTerrain.shapedHeight). */
const TERRAIN_GLSL = /* glsl */ `
uniform vec3 uSeed; uniform float uDetail; uniform float uSea; uniform float uCraters; uniform float uDry;
uniform vec4 uCityA[${MAX_SITES}]; uniform vec4 uCityB[${MAX_SITES}]; uniform vec4 uCityC[${MAX_SITES}]; uniform int uCityN;
uniform vec4 uPit; uniform float uPitDepth;
float rawH(vec3 d, float oct) {
  vec3 p = d * uDetail + uSeed;
  float h = fbmN(p, oct);
  if (uCraters > 0.5) h += (ridged4(p * 1.6) - 0.6) * 0.5;
  float land = smoothstep(uSea + 0.03, uSea + 0.5, h);
  h += land * (ridged4(p * 2.0 + vec3(5.1)) - 0.55) * 0.5;
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
varying vec3 vDir; varying vec3 vN; varying vec3 vW; varying float vH;
${NOISE_GLSL}
${TERRAIN_GLSL}
${PATCH_GLSL}
${LIGHT_MAP_GLSL}
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
  if (water) {
    col = mix(uC0, uC1, smoothstep(uSea - 0.45, uSea, h));
    col = mix(col, uC1 * 1.25 + vec3(0.0, 0.06, 0.05), smoothstep(uSea - 0.05, uSea, h) * 0.6);
    spec = 1.0;
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
    if (uLava > 0.5) cracks = smoothstep(0.8, 0.96, ridged4(p * 1.3 + vec3(0.0, uTime * 0.01, 0.0)) + fine * 0.03);
  }
  float caps = smoothstep(uIce, uIce + 0.06, abs(dir.y) + h * 0.12 + fine * 0.02);
  col = mix(col, vec3(0.92, 0.95, 1.0) * (0.92 + 0.08 * fine), caps);
  spec *= 1.0 - caps;

  float urbanAll = 0.0;
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
    float roads = max(lineAA(g.x, 0.1), lineAA(g.y, 0.1));
    float major = max(lineAA(g.x * 0.25, 0.035), lineAA(g.y * 0.25, 0.035));
    float avenue = 0.0;
    if (uCityC[i].x > 0.5) {
      float ang = atan(xy.y, xy.x);
      float dav = rr * abs(sin(4.0 * ang)) * 0.25 / cell;
      float fwA = fwidth(dav);
      avenue = 1.0 - smoothstep(0.28 - fwA, 0.28 + fwA, dav);
      avenue *= step(cell * 1.6, rr);
      float ring1 = abs(rr - R * 0.55) / cell;
      float fwR = fwidth(rr / cell);
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
    vec3 lamp = mix(uCityGlow, vec3(1.0, 0.86, 0.6), avenue);
    em += lamp * night * inCity * (roads * 0.16 + major * 0.28 + avenue * 0.3);
    em += uCityGlow * night * inCity * 0.035;
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

export const CLOUD_VERT = /* glsl */ `varying vec3 vDir; void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
export const CLOUD_FRAG = /* glsl */ `
uniform vec3 uSeed, uSun, uCloud; uniform float uDetail, uTime, uAmount, uFade; varying vec3 vDir;
${NOISE_GLSL}
void main() {
  vec3 d = normalize(vDir);
  float c = fbmN(d * (uDetail * 1.4) + uSeed.zxy + vec3(uTime * 0.012, 0.0, uTime * 0.006), 5.0);
  float cloud = smoothstep(0.05, 0.55, c) * uAmount;
  float ndl = dot(d, uSun);
  float day = smoothstep(-0.15, 0.3, ndl);
  vec3 tint = mix(vec3(1.0, 0.62, 0.42), vec3(1.0), smoothstep(0.0, 0.3, ndl));
  gl_FragColor = vec4(uCloud * tint * (0.04 + 0.96 * day), cloud * uFade);
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
      vec2 cellId = floor(g);
      float on = step(0.5, hash12(cellId + vSeed * 97.0));
      float k = smoothstep(0.3, 0.8, max(fw.x, fw.y));
      float w = mix(win * on, 0.17, k);
      vec3 wc = mix(vec3(1.0, 0.78, 0.48), vec3(0.72, 0.9, 1.0), step(0.82, hash12(cellId * 1.7 + 3.1)));
      em += wc * w * night * 1.5;
      col = mix(col, col * 0.55 + vec3(0.04, 0.06, 0.09) * day, win * (1.0 - k) * 0.7);
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
