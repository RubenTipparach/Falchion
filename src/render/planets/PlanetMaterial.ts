import * as THREE from 'three';
import type { PlanetLook } from '../../content/planetLooks';
import { Rng } from '../../core/rng/Rng';
import { LIGHT_MAP_GLSL, NO_LIGHTS } from './NightLightMap';
import { NOISE_GLSL } from './noise.glsl';
import { surfaceLookOf, type SurfaceLook } from '../../core/surface/Terrain';

const KIND: Record<PlanetLook['kind'], number> = { rocky: 0, gas: 1, lava: 2 };

/**
 * View-space vertex shader. Systems sit ~30,000 ly from the origin, where
 * float32 world coordinates can't resolve a 0.02 ly planet; modelViewMatrix is
 * composed on the CPU in double precision, so camera-relative maths stays exact.
 */
const VERT = /* glsl */ `
varying vec3 vObj;
varying vec3 vNormalW;
varying vec3 vPosW;
void main() {
  vObj = normalize(position);
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vPosW = mv.xyz;
  vNormalW = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * mv;
}`;

/**
 * Optional features (change worlds-and-stars), each compiled in only for a look that asks for it
 * (#define), so every older look compiles to exactly the shader it had.
 */
const FEATURES_GLSL = /* glsl */ `
#if defined(LIGHTNING) || defined(PATTERN)
float hash13(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
/** Antialiased line: 1 within halfW of an integer of g (at least about a pixel wide). */
float gridLine(float g, float halfW) { float fw = fwidth(g); float w = max(halfW, fw * 0.6); float d = abs(g - floor(g + 0.5)); return 1.0 - smoothstep(w - fw * 0.5, w + fw * 0.5, d); }
#endif
#if defined(LIGHTNING) || defined(PATTERN)
/** Cube-map coordinates of a direction: xy in -1..1 on its face, z the face (0..5). */
vec3 cubeUV(vec3 d) {
  vec3 a = abs(d);
  if (a.x >= a.y && a.x >= a.z) return vec3(d.zy / a.x, d.x > 0.0 ? 0.0 : 1.0);
  if (a.y >= a.z) return vec3(d.xz / a.y, d.y > 0.0 ? 2.0 : 3.0);
  return vec3(d.xy / a.z, d.z > 0.0 ? 4.0 : 5.0);
}
#endif
#ifdef PATTERN
#if PATTERN == 4
/**
 * Giant skeletons, one round each of six directions (an octahedron turned by the seed, so every
 * side shows one): a spine, a skull and a cage of ribs curving back. 1 on bone, and a halo (y)
 * where the bone's shadow darkens the ground.
 */
vec2 bonesAt(vec3 d) {
  float bone = 0.0, halo = 0.0;
  float ca = cos(uSeed.x * 0.37), sa = sin(uSeed.x * 0.37), cb = cos(uSeed.y * 0.29), sb = sin(uSeed.y * 0.29);
  for (int i = 0; i < 6; i++) {
    float fi = float(i);
    vec3 c = i == 0 ? vec3(1.0, 0.0, 0.0) : i == 1 ? vec3(-1.0, 0.0, 0.0) : i == 2 ? vec3(0.0, 1.0, 0.0) : i == 3 ? vec3(0.0, -1.0, 0.0) : i == 4 ? vec3(0.0, 0.0, 1.0) : vec3(0.0, 0.0, -1.0);
    c = vec3(c.x * ca - c.z * sa, c.y, c.x * sa + c.z * ca);
    c = vec3(c.x, c.y * cb - c.z * sb, c.y * sb + c.z * cb);
    float k = dot(d, c);
    if (k < 0.55) continue;
    vec3 up = abs(c.y) > 0.9 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0);
    vec3 t1 = normalize(cross(up, c)), t2 = cross(c, t1);
    float a = uSeed.z * 0.53 + fi * 1.9;
    vec3 e1 = t1 * cos(a) + t2 * sin(a), e2 = cross(c, e1);
    vec3 q = d / k - c;
    float sc = 1.15 + 0.4 * fract(sin(fi * 12.9898 + uSeed.x) * 43758.5);
    float u = dot(q, e1) / sc, v = dot(q, e2) / sc;
    float L = 0.5;
    if (abs(u) > L + 0.2 || abs(v) > 0.4) continue;
    // Spine with knobbly vertebrae; it tapers into a tail.
    float vert = 0.022 + 0.008 * smoothstep(0.3, 0.5, abs(fract(u * 18.0) - 0.5) * 2.0);
    float sw = vert * mix(0.45, 1.0, smoothstep(-L, -0.15, u));
    float spine = (1.0 - smoothstep(sw * 0.7, sw, abs(v))) * step(-L, u) * step(u, L);
    // The cage: ribs from u = -0.22 to 0.32, longest in the middle, arcing back from the spine.
    float cage = clamp((u + 0.22) / 0.54, 0.0, 1.0);
    float ribLen = 0.3 * sqrt(max(0.0, 1.0 - pow(cage * 2.0 - 1.0, 2.0)));
    float uu = (u + 1.1 * v * v) / 0.085;
    float rib = gridLine(uu, 0.14) * step(abs(v), ribLen) * step(0.015, abs(v)) * step(-0.24, u) * step(u, 0.34);
    // Skull ahead of the spine, with dark eye sockets.
    vec2 sk = vec2((u - L - 0.07) / 1.35, v);
    float skull = 1.0 - smoothstep(0.055, 0.068, length(sk));
    float eyes = 1.0 - smoothstep(0.012, 0.02, length(vec2(u - L - 0.085, abs(v) - 0.03)));
    float b = max(max(spine, rib), skull) * (1.0 - eyes * 0.8);
    bone = max(bone, b);
    float near = max(max(1.0 - smoothstep(sw, sw * 2.6, abs(v)), 0.0) * step(-L, u) * step(u, L), 1.0 - smoothstep(0.068, 0.1, length(sk)));
    halo = max(halo, max(near, gridLine(uu, 0.3) * step(abs(v), ribLen + 0.02) * step(-0.25, u) * step(u, 0.35)));
  }
  return vec2(bone, halo);
}
#endif
#endif
`;

const FRAG = /* glsl */ `
uniform vec3 uC0; uniform vec3 uC1; uniform vec3 uC2; uniform vec3 uC3;
uniform vec3 uCloud; uniform vec3 uAtmo; uniform vec3 uGlow;
uniform float uSea; uniform float uIce; uniform float uClouds; uniform float uAtmoStrength; uniform float uDetail;
uniform float uCraters; uniform sampler2D uLightMap; uniform vec3 uCityGlow; uniform float uTime; uniform vec3 uSeed; uniform vec3 uStarPos; uniform vec3 uStarColor;
#ifdef LOCKED
uniform float uLocked;
#endif
#ifdef AURORA
uniform vec3 uAurora;
#endif
#ifdef LIGHTNING
uniform float uLightning;
#endif
#ifdef SEA_GLOW
uniform vec3 uSeaGlow;
#endif
#ifdef HAZE
uniform float uHaze;
#endif
varying vec3 vObj; varying vec3 vNormalW; varying vec3 vPosW;
${NOISE_GLSL}
${LIGHT_MAP_GLSL}
${FEATURES_GLSL}
void main() {
  vec3 n = normalize(vNormalW);
  vec3 L = normalize(uStarPos - vPosW);
  vec3 V = normalize(-vPosW);
  vec3 p = vObj * uDetail + uSeed;
  float lat = abs(vObj.y);
  float ndl = dot(n, L);
  float day = smoothstep(-0.12, 0.35, ndl);
  vec3 col; vec3 emissive = vec3(0.0); float spec = 0.0;

#if KIND == 1
  // Gas giant: warped latitude bands with a storm.
  float warp = fbm(vec3(vObj.x * 2.0, vObj.y * 9.0, vObj.z * 2.0) + uSeed + vec3(uTime * 0.01, 0.0, 0.0));
  float b = vObj.y * 7.0 + warp * 1.6;
  float t1 = 0.5 + 0.5 * sin(b * 3.1);
  float t2 = 0.5 + 0.5 * sin(b * 7.3 + 1.7);
  col = mix(uC0, uC1, t1);
  col = mix(col, uC2, smoothstep(0.55, 0.95, t2) * 0.7);
  vec3 stormC = normalize(vec3(0.7, -0.35, 0.6));
  float storm = smoothstep(0.22, 0.0, distance(vObj, stormC) + snoise(p * 4.0) * 0.04);
  col = mix(col, uC3, storm * 0.85);
#else
  float h = fbm(p);
  if (uCraters > 0.5) {
    float cr = ridged(p * 1.6);
    h += (cr - 0.6) * 0.5;
  }
#ifdef SEA_GLOW
  vec3 seaE = vec3(0.0);
#endif
#ifdef LOCKED
  // Tidally locked: the sea lies where the star stands overhead (the angle to the star, so it
  // faces the star however the globe turns), a shore of bare ground, then ice to a frozen night.
  float sub = ndl + h * 0.22;
  if (sub > uLocked) {
    col = mix(uC1, uC0, smoothstep(uLocked, uLocked + 0.4, sub));
    spec = 1.0;
  } else {
    float shore = 1.0 - smoothstep(uLocked - 0.22, uLocked, sub);
    vec3 land = mix(uC2, uC3, smoothstep(-0.2, 0.4, h)) * (0.85 + 0.15 * snoise(p * 6.0));
    vec3 ice = mix(vec3(0.55, 0.66, 0.78), vec3(0.9, 0.94, 0.98), smoothstep(-0.3, 0.4, h + snoise(p * 5.0) * 0.15));
    col = mix(land, ice, smoothstep(0.25, 0.75, shore + snoise(p * 3.0) * 0.2));
  }
#else
  if (h < uSea) {
    col = mix(uC0, uC1, smoothstep(uSea - 0.45, uSea, h));
    spec = 1.0;
  #ifdef SEA_GLOW
    // Glowing seas (acid, lava): brightest in the shallows, slowly churning.
    float churn = 0.7 + 0.3 * snoise(p * 3.0 + vec3(uTime * 0.02, 0.0, uTime * 0.015));
    seaE = uSeaGlow * (0.55 + 0.6 * smoothstep(uSea - 0.4, uSea, h)) * churn;
    col *= 0.6;
  #endif
  } else {
    float e = smoothstep(uSea, uSea + 0.7, h);
    col = mix(uC2, uC3, e);
    col *= 0.85 + 0.3 * snoise(p * 6.0) * 0.5;
  }
#endif
  #if KIND == 2
    float cracks = smoothstep(0.82, 0.97, ridged(p * 1.3 + vec3(0.0, uTime * 0.01, 0.0)));
    emissive += uGlow * cracks * 2.2;
    col = mix(col, uGlow * 0.4, cracks * 0.5);
  #endif
  float caps = smoothstep(uIce, uIce + 0.06, lat + h * 0.12);
#ifdef LOCKED
  caps = 0.0;
#endif
  col = mix(col, vec3(0.93, 0.96, 1.0), caps);
  spec *= 1.0 - caps;
  // Cities and roads (the planet's light map, shared with the close-up): grey by day, lit at night.
  float lights = lightMapAt(uLightMap, vObj);
  col = mix(col, vec3(0.42, 0.42, 0.4), lights * 0.35);
#ifdef PATTERN
  // Night here reaches a little past the terminator, so a thumbnail's thin night side still shows lights.
  float dusk = 1.0 - smoothstep(-0.2, 0.3, ndl);
  vec3 patE = vec3(0.0);
  vec3 cu = cubeUV(vObj);
  #if PATTERN == 1
  // City world: blocks of grey and metal, streets and avenues; gold lights over the whole night.
  vec2 g = cu.xy * 9.0;
  vec2 bid = floor(g);
  float bh = hash13(vec3(bid, cu.z) + floor(uSeed));
  float dist = fbm(vObj * 3.0 + uSeed);
  vec3 block = mix(uC1, uC3, bh) * (0.8 + 0.35 * hash13(vec3(floor(g * 3.0), cu.z + 7.0)));
  block = mix(block, mix(uC2, vec3(0.62, 0.6, 0.55), 0.4), smoothstep(0.1, 0.5, dist) * 0.5);
  float street = max(gridLine(g.x, 0.07), gridLine(g.y, 0.07));
  float avenue = max(gridLine(cu.x * 3.0, 0.03), gridLine(cu.y * 3.0, 0.03));
  col = mix(block, uC0, max(street * 0.8, avenue));
  spec = 0.25;
  float windows = step(0.45, hash13(vec3(floor(g * 4.0), cu.z + 3.0)));
  float dense = 0.55 + 0.45 * smoothstep(-0.4, 0.4, dist);
  patE = uGlow * (windows * 0.35 * dense + street * 0.7 + avenue * 1.3) * (dusk * 1.6 + 0.06);
  #elif PATTERN == 2
  // Dead machine world: rusting plates, seams and dead blocks; a few dying lights.
  vec2 g = cu.xy * 11.0;
  vec2 pid = floor(g), f = fract(g);
  float ph = hash13(vec3(pid, cu.z) + floor(uSeed));
  vec2 g3 = cu.xy * 3.5;
  float blk = hash13(vec3(floor(g3), cu.z + 11.0) + floor(uSeed));
  vec3 plate = mix(uC1, uC2, ph) * (0.75 + 0.5 * step(0.7, blk));
  float rust = smoothstep(0.0, 0.5, fbm(vObj * 4.0 + uSeed.zxy) + h * 0.4);
  plate = mix(plate, uC3 * (0.8 + 0.4 * snoise(p * 9.0)), rust * 0.75);
  // Bevel: lit top-left edge, shadowed bottom-right, dark seams.
  plate *= 1.0 + 0.25 * (1.0 - smoothstep(0.0, 0.1, f.x)) - 0.3 * smoothstep(0.88, 1.0, f.y);
  float seam = max(gridLine(g.x, 0.05), gridLine(g.y, 0.05));
  float trench = max(gridLine(g3.x, 0.04), gridLine(g3.y, 0.04));
  col = mix(plate, uC0, max(seam * 0.85, trench));
  spec = 0.4 * (1.0 - rust);
  vec3 lid = vec3(floor(cu.xy * 22.0), cu.z);
  float lh = hash13(lid + floor(uSeed) + 5.0);
  float lamp = step(0.95, lh) * (1.0 - smoothstep(0.1, 0.42, length(fract(cu.xy * 22.0) - 0.5)));
  float flicker = smoothstep(0.2, 0.5, fract(uTime * (0.1 + lh * 0.3) + lh * 17.0)) * (0.7 + 0.3 * sin(uTime * 13.0 + lh * 40.0));
  patE = uGlow * lamp * flicker * (dusk * 1.8 + 0.9);
  #elif PATTERN == 3
  // Choir world: circuit traces over a pale dead crust, pulses running along them.
  vec2 g = cu.xy * 12.0;
  vec2 cid = floor(g);
  float hx = hash13(vec3(cid.x + 0.5, floor(g.y + 0.5), cu.z) + floor(uSeed));
  float hy = hash13(vec3(floor(g.x + 0.5), cid.y + 0.5, cu.z + 9.0) + floor(uSeed));
  float trX = gridLine(g.y, 0.05) * step(0.45, hx);
  float trY = gridLine(g.x, 0.05) * step(0.45, hy);
  vec2 nd = g - floor(g + 0.5);
  float node = (1.0 - smoothstep(0.1, 0.16, length(nd))) * step(0.6, hash13(vec3(floor(g + 0.5), cu.z + 4.0)));
  float trace = max(max(trX, trY), node);
  float pulse = pow(0.5 + 0.5 * sin((g.x + g.y) * 0.9 - uTime * 2.2 + cu.z * 1.7), 6.0);
  float breathe = 0.55 + 0.45 * sin(uTime * 0.7 + fbm(vObj * 2.0 + uSeed) * 6.0);
  col = mix(col, col * 0.55, trace * 0.8);
  patE = uGlow * trace * (0.35 + 1.2 * pulse) * breathe * (dusk * 1.3 + 0.8);
  #elif PATTERN == 4
  // Bone world: ivory skeletons over a scored pale desert.
  float score = ridged(vec3(vObj.x * 9.0, vObj.y * 2.0, vObj.z * 9.0) + uSeed);
  col *= 0.88 + 0.22 * smoothstep(0.55, 0.95, score);
  vec2 bo = bonesAt(vObj);
  col *= 1.0 - bo.y * 0.45;
  col = mix(col, vec3(0.98, 0.95, 0.87), bo.x);
  #endif
#endif
  // Clouds drift slowly
  float c = fbm(vObj * (uDetail * 1.4) + uSeed.zxy + vec3(uTime * 0.015, 0.0, uTime * 0.008));
  float cloud = smoothstep(0.05, 0.55, c) * uClouds;
  col = mix(col, uCloud, cloud);
  spec *= 1.0 - cloud;
  emissive += uCityGlow * lights * (1.0 - smoothstep(-0.18, 0.08, ndl)) * (1.0 - cloud * 0.5) * 1.1;
#ifdef SEA_GLOW
  emissive += seaE * (1.0 - cloud * 0.6);
#endif
#ifdef PATTERN
  emissive += patE * (1.0 - cloud * 0.6);
#endif
#ifdef HAZE
  // A thick deck in banded swirls: the surface hidden.
  float hz = fbm(vec3(vObj.x * 1.6, vObj.y * 5.0, vObj.z * 1.6) + uSeed.yzx + vec3(uTime * 0.006, 0.0, 0.0));
  float bands = 0.5 + 0.5 * sin(vObj.y * 8.0 + hz * 3.5);
  vec3 deck = mix(uCloud, uC3, bands * 0.65) * (0.88 + 0.24 * hz);
  float cover = uHaze * (0.85 + 0.15 * smoothstep(-0.3, 0.3, hz));
  #ifdef LIGHTNING
  // Storm world: the deck wound into cyclones.
  float swirl = 0.0;
  for (int i = 0; i < 6; i++) {
    float fi = float(i);
    vec3 sc = normalize(vec3(sin(uSeed.x + fi * 2.3), sin(uSeed.y + fi * 1.4) * 0.7, cos(uSeed.x + fi * 2.3)));
    float k = dot(vObj, sc);
    if (k < 0.7) continue;
    vec3 up = abs(sc.y) > 0.9 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0);
    vec3 a1 = normalize(cross(up, sc)), a2 = cross(sc, a1);
    vec3 q = vObj / k - sc;
    float r = length(q);
    float ang = atan(dot(q, a2), dot(q, a1));
    float arm = 0.5 + 0.5 * sin(ang * 2.0 + log(r + 0.02) * 7.0 - uTime * 0.2 + hz * 2.0);
    float reach = 1.0 - smoothstep(0.15, 0.6, r);
    swirl = max(swirl, arm * reach);
    cover *= 1.0 - (1.0 - smoothstep(0.02, 0.05, r)) * 0.8;
  }
  deck = mix(deck * 0.6, uCloud * 1.3, swirl * 0.8);
  cover = min(1.0, cover + swirl * 0.35);
  #endif
  col = mix(col, deck, cover);
  spec *= 1.0 - cover;
  emissive *= 1.0 - cover * 0.85;
#endif
#ifdef LIGHTNING
  // Brief flashes in the clouds, a few cells at a time; they light the night side.
  vec3 lcu = cubeUV(vObj);
  vec2 lq = lcu.xy * 6.0;
  vec3 lid = vec3(floor(lq), lcu.z) + floor(uSeed);
  float l1 = hash13(lid), l2 = hash13(lid + 17.3);
  vec2 lc = vec2(0.25) + 0.5 * vec2(l1, hash13(lid + 41.7));
  float ld = length(fract(lq) - lc);
  float lphase = fract(uTime * uLightning * (0.25 + l1 * 0.5) + l2 * 13.0);
  float lon = step(lphase, 0.08) * step(0.3, l2);
  float flick = 0.55 + 0.45 * sin(lphase * 260.0);
  float bolt = lon * flick * ((1.0 - smoothstep(0.0, 0.45, ld)) * 0.75 + (1.0 - smoothstep(0.0, 0.08, ld)) * 1.4);
  float darkL = 1.0 - smoothstep(-0.3, 0.3, ndl);
  emissive += vec3(0.7, 0.8, 1.0) * bolt * (1.0 + 0.6 * darkL);
#endif
#ifdef AURORA
  // Curtains of light round both magnetic poles: a sharp lower edge fading up into violet,
  // rayed along the oval, drifting; brightest on the night side and towards the limb.
  vec3 axis = normalize(vec3(sin(uSeed.x) * 0.12, 1.0, cos(uSeed.z) * 0.12));
  float my = dot(vObj, axis);
  float alat = abs(my);
  vec3 side = normalize(vObj - axis * my + vec3(1e-4));
  float wav = snoise(vec3(side.xz * 2.2, uTime * 0.05 + sign(my) * 7.0)) * 0.05;
  float ring = alat - (0.72 + wav);
  float band = smoothstep(-0.03, 0.0, ring) * (1.0 - smoothstep(0.0, 0.16, ring));
  float rays = 0.45 + 0.55 * smoothstep(-0.4, 0.6, snoise(vec3(side.xz * 14.0, uTime * 0.25 + sign(my) * 3.0)));
  vec3 aurC = mix(uAurora, vec3(0.62, 0.32, 1.0), smoothstep(0.03, 0.12, ring));
  float darkA = 1.0 - smoothstep(-0.3, 0.3, ndl);
  float limb = pow(1.0 - max(dot(n, V), 0.0), 1.5);
  emissive += aurC * band * rays * (1.0 + 1.5 * darkA) * (1.0 + limb * 1.5);
  col = mix(col, col * 0.45, band);
#endif
#endif

  vec3 H = normalize(L + V);
  float sp = pow(max(dot(n, H), 0.0), 40.0) * spec * day;
  vec3 lit = col * (0.03 + 0.97 * day) * uStarColor + sp * 0.6 * uStarColor + emissive;
  float rim = pow(1.0 - max(dot(n, V), 0.0), 2.5);
  lit += uAtmo * rim * uAtmoStrength * (0.15 + 0.85 * smoothstep(-0.3, 0.6, ndl));
  gl_FragColor = vec4(lit, 1.0);
}`;

const PATTERN: Record<NonNullable<PlanetLook['pattern']>, number> = { city: 1, machine: 2, circuit: 3, bones: 4 };

/** The #defines for a look's optional features (none for a look without them: the original shader). */
function featureDefines(s: SurfaceLook): Record<string, number> {
  const d: Record<string, number> = {};
  if (s.locked !== undefined) d.LOCKED = 1;
  if (s.aurora) d.AURORA = 1;
  if (s.lightning) d.LIGHTNING = 1;
  if (s.seaGlow) d.SEA_GLOW = 1;
  if (s.pattern) d.PATTERN = PATTERN[s.pattern];
  if (s.haze) d.HAZE = 1;
  return d;
}

/**
 * Procedural planet surface material for a biome look, varied by seed (the same roll as the surface
 * view). `lights` is the planet's night-light map (NightLightMap); null for a world nobody holds.
 */
export function createPlanetMaterial(look: PlanetLook, seed: number, opts: { lights?: THREE.Texture | null } = {}): THREE.ShaderMaterial {
  const s = surfaceLookOf(look, seed);
  const c = (hex: string) => new THREE.Color(hex);
  return new THREE.ShaderMaterial({
    defines: { KIND: KIND[look.kind], ...featureDefines(s) },
    uniforms: {
      uC0: { value: c(s.palette[0]) }, uC1: { value: c(s.palette[1]) }, uC2: { value: c(s.palette[2]) }, uC3: { value: c(s.palette[3]) },
      uCloud: { value: c(s.cloudColor) }, uAtmo: { value: c(s.atmosphere) }, uGlow: { value: c(s.glow) },
      uSea: { value: s.sea }, uIce: { value: s.ice },
      uClouds: { value: s.clouds }, uAtmoStrength: { value: s.atmosphereStrength },
      uDetail: { value: s.detail }, uCraters: { value: s.craters ? 1 : 0 },
      uLightMap: { value: opts.lights ?? NO_LIGHTS }, uCityGlow: { value: c(s.cityGlow) },
      uTime: { value: 0 }, uSeed: { value: new THREE.Vector3(...s.seed) },
      uStarPos: { value: new THREE.Vector3() }, uStarColor: { value: new THREE.Color('#ffffff') },
      // Optional features (read only where their #define is on).
      uLocked: { value: s.locked ?? 0 }, uAurora: { value: c(s.aurora ?? '#000000') }, uLightning: { value: s.lightning ?? 0 },
      uSeaGlow: { value: c(s.seaGlow ?? '#000000') }, uHaze: { value: s.haze ?? 0 },
    },
    vertexShader: VERT,
    fragmentShader: FRAG,
  });
}

/** Translucent ring band for gas giants. */
export function createRingMaterial(color: string, seed: number): THREE.ShaderMaterial {
  const rng = new Rng(seed);
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    uniforms: { uColor: { value: new THREE.Color(color) }, uFreq: { value: rng.range(30, 70) }, uPhase: { value: rng.range(0, 10) } },
    vertexShader: /* glsl */ `varying vec2 vUv; varying vec3 vPos; void main() { vUv = uv; vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform float uFreq; uniform float uPhase; varying vec3 vPos;
      void main() {
        float r = length(vPos.xy);
        float bands = 0.5 + 0.5 * sin(r * uFreq + uPhase) * sin(r * uFreq * 0.37 + 1.3);
        float edge = smoothstep(0.0, 0.08, r - 1.35) * smoothstep(0.0, 0.08, 2.2 - r);
        float gap = 1.0 - smoothstep(0.02, 0.0, abs(r - 1.8)) * 0.85;
        float a = bands * edge * gap * 0.55;
        gl_FragColor = vec4(uColor * (0.7 + 0.3 * bands), a);
      }`,
  });
}

/** Show a planet's night lights (its light map), or none. */
export function setPlanetLights(material: THREE.ShaderMaterial, lights: THREE.Texture | null): void {
  material.uniforms.uLightMap.value = lights ?? NO_LIGHTS;
}
