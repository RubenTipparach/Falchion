import * as THREE from 'three';
import type { PlanetLook } from '../../content/planetLooks';
import { Rng } from '../../core/rng/Rng';
import { LIGHT_MAP_GLSL, NO_LIGHTS } from './NightLightMap';
import { NOISE_GLSL } from './noise.glsl';
import { ATMOSPHERE_GLSL, atmosphereDefines } from './atmosphere.glsl';
import { CRATER_DEPTH, EYE_DEPTH, VOLCANO_HEIGHT, surfaceLookOf, type SurfaceLook } from '../../core/surface/Terrain';
import { RELIEF_GLSL } from './relief.glsl';
import { PATTERN_GLSL, PATTERN_IDS } from './patterns.glsl';

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
uniform float uCanyons; uniform float uVolcanoes;
#ifdef GLITTER
uniform vec3 uGlitter;
#endif
varying vec3 vObj; varying vec3 vNormalW; varying vec3 vPosW;
${NOISE_GLSL}
${LIGHT_MAP_GLSL}
${ATMOSPHERE_GLSL}
${RELIEF_GLSL}
${PATTERN_GLSL}
void main() {
  vec3 n = normalize(vNormalW);
  vec3 L = normalize(uStarPos - vPosW);
  vec3 V = normalize(-vPosW);
  vec3 p = vObj * uDetail + uSeed;
  float lat = abs(vObj.y);
  float ndl = dot(n, L);
  float day = smoothstep(-0.12, 0.35, ndl);
  vec3 col; vec3 emissive = vec3(0.0); float spec = 0.0; float hRel = 0.0;

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
  // Height as the close-up's (rawHeight, core/surface/Terrain.ts), at the system view's octaves.
  float h = fbm(p);
  float crater = uCraters > 0.5 ? craters(p, 7.0) : 0.0;
  h += crater * ${CRATER_DEPTH.toFixed(3)};
  float cut = uCanyons > 0.0 ? canyonCut(p, uCanyons) : 0.0;
  h -= canyonDepth(cut, uCanyons);
  vec2 volc = uVolcanoes > 0.5 ? volcanoes(p, uSeed, uDetail) : vec2(0.0);
  h += volc.x * ${VOLCANO_HEIGHT.toFixed(3)};
  // The landforms alone shade the relief below (the fine noise would only alias at this size).
  hRel = crater * ${CRATER_DEPTH.toFixed(3)} - canyonDepth(cut, uCanyons) + volc.x * ${VOLCANO_HEIGHT.toFixed(3)};
#ifdef SEA_GLOW
  vec3 seaE = vec3(0.0);
#endif
#ifdef LOCKED
  // Tidally locked (change planet-audit): the planet keeps its +x pole to the star (SystemLayer
  // turns it so), and the sea fills the sunward basin there (lockedEye, as the close-up bakes it).
  // Beyond the basin's shore the land gives way to ice, to a frozen night side.
  float eye = lockedEye(vObj.x, h, uLocked);
  h -= eye * ${EYE_DEPTH.toFixed(3)};
  if (h < uSea) {
    float iced = 1.0 - smoothstep(uLocked - 0.25, uLocked - 0.05, vObj.x + snoise(p * 3.0) * 0.05);
    col = mix(mix(uC0, uC1, smoothstep(uSea - 0.45, uSea, h)), vec3(0.82, 0.88, 0.94), iced);
    spec = 1.0 - iced;
  } else {
    float shore = 1.0 - smoothstep(uLocked - 0.3, uLocked - 0.05, vObj.x);
    vec3 land = mix(uC2, uC3, smoothstep(-0.2, 0.4, h)) * (0.85 + 0.15 * snoise(p * 6.0));
    // The living band between the sea and the ice: forest and meadow (as the close-up grows them).
    float lush = (1.0 - smoothstep(0.3, 0.7, shore + snoise(p * 3.0) * 0.2)) * (0.55 + 0.45 * smoothstep(-0.3, 0.3, snoise(p * 4.0 + vec3(7.0))));
    land = mix(land, mix(uC2 * vec3(0.45, 0.95, 0.4), uC3 * vec3(0.55, 0.95, 0.4), smoothstep(-0.4, 0.4, snoise(p * 9.0))), lush * 0.85);
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
  // Craters read from orbit by their albedo, as the Moon's do: dark floors, bright rims and ejecta.
  col *= 1.0 + clamp(crater * 1.6, -0.4, 0.35);
  // Volcano flanks: pale ash, so the cones stand out from the dark plains.
  col = mix(col, uC3 * 1.25 + vec3(0.04), clamp(volc.x * 1.2, 0.0, 0.6));
  // Canyon walls: darker, banded strata.
  col *= 1.0 - cut * (0.3 + 0.12 * sin(h * 40.0) * (1.0 - smoothstep(0.5, 1.5, fwidth(h * 40.0))));
  // Volcanoes: lava in the calderas and down the flanks.
  emissive += uGlow * volc.y * 1.8;
  col = mix(col, uGlow * 0.5, volc.y * 0.6);
#ifdef GLITTER
  // Diamond facets: sparks where a facet catches the star.
  vec3 fc = floor(vObj * 260.0);
  float facet = hash13(fc + floor(uSeed));
  float glint = step(0.93, facet) * pow(max(dot(reflect(-L, n), V), 0.0), 6.0) * (0.6 + 0.4 * sin(uTime * 3.0 + facet * 60.0));
  emissive += uGlitter * glint * 2.0 * day;
  spec = max(spec, 0.6);
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
  col = surfacePattern(vObj, p, h, col, 1.0, 0.0, dusk, spec, patE);
#endif
  // Clouds drift slowly (the close-up's cloud shell draws the same ones).
  float cloud = cloudCover(vObj, uSeed, uDetail, uTime, uClouds);
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
  // A thick deck in banded swirls (cyclones on a storm world): the surface hidden.
  vec4 deck = hazeDeck(vObj, uSeed, uTime, uHaze, uCloud, uC3);
  col = mix(col, deck.rgb, deck.a);
  spec *= 1.0 - deck.a;
  emissive *= 1.0 - deck.a * 0.85;
#endif
#ifdef LIGHTNING
  // Flashes in the clouds; they light the night side.
  float darkL = 1.0 - smoothstep(-0.3, 0.3, ndl);
  emissive += LIGHTNING_COLOR * lightningAt(vObj, uSeed, uTime, uLightning) * (1.0 + 0.6 * darkL);
#endif
#ifdef AURORA
  // Curtains round the poles, with a darker band beneath them.
  float band;
  emissive += auroraAt(vObj, uSeed, uTime, uAurora, ndl, pow(1.0 - max(dot(n, V), 0.0), 1.5), band);
  col = mix(col, col * 0.45, band);
#endif
#endif

  // Relief: the height shades the surface (a bump from its screen-space slope), so craters,
  // canyons and volcanoes stand out from orbit as they do in the close-up. The sphere's radius in
  // view units is the ratio of its position's change to its unit direction's.
  float relief = 1.0;
#if KIND != 1
  // Derivatives outside the branch (they are undefined in non-uniform control flow).
  vec3 dpx = dFdx(vPosW), dpy = dFdy(vPosW);
  float R = length(dpx) / max(length(dFdx(vObj)), 1e-7);
  float bh = hRel * 0.045 * R;
  vec3 r1 = cross(dpy, n), r2 = cross(n, dpx);
  float det = dot(dpx, r1);
  vec3 grad = sign(det) * (dFdx(bh) * r1 + dFdy(bh) * r2);
  // Faded out where the relief changes faster than the pixels can follow (a small, far planet).
  float sharp = 1.0 - smoothstep(0.15, 0.4, fwidth(hRel));
  if (spec < 0.5) {
    vec3 nb = normalize(abs(det) * n - grad);
    relief = mix(1.0, clamp(1.0 + (dot(nb, L) - ndl) * 1.8, 0.35, 1.5), sharp);
  }
#endif
  vec3 H = normalize(L + V);
  float sp = pow(max(dot(n, H), 0.0), 40.0) * spec * day;
  vec3 lit = col * (0.03 + 0.97 * day * relief) * uStarColor + sp * 0.6 * uStarColor + emissive;
  float rim = pow(1.0 - max(dot(n, V), 0.0), 2.5);
  lit += uAtmo * rim * uAtmoStrength * (0.15 + 0.85 * smoothstep(-0.3, 0.6, ndl));
  gl_FragColor = vec4(lit, 1.0);
}`;


/** The #defines for a look's optional features (none for a look without them: the original shader). */
function featureDefines(s: SurfaceLook): Record<string, number> {
  const d: Record<string, number> = atmosphereDefines(s);
  if (s.locked !== undefined) d.LOCKED = 1;
  if (s.seaGlow) d.SEA_GLOW = 1;
  if (s.pattern) d.PATTERN = PATTERN_IDS[s.pattern];
  if (s.glitter) d.GLITTER = 1;
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
      uCanyons: { value: s.canyons }, uVolcanoes: { value: s.volcanoes ? 1 : 0 }, uGlitter: { value: c(s.glitter ?? '#000000') },
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
