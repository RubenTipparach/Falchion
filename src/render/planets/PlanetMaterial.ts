import * as THREE from 'three';
import type { PlanetLook } from '../../content/planetLooks';
import { Rng } from '../../core/rng/Rng';
import { LIGHT_MAP_GLSL, NO_LIGHTS } from './NightLightMap';
import { NOISE_GLSL } from './noise.glsl';
import { surfaceLookOf } from '../../core/surface/Terrain';

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
varying vec3 vObj; varying vec3 vNormalW; varying vec3 vPosW;
${NOISE_GLSL}
${LIGHT_MAP_GLSL}
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
  if (h < uSea) {
    col = mix(uC0, uC1, smoothstep(uSea - 0.45, uSea, h));
    spec = 1.0;
  } else {
    float e = smoothstep(uSea, uSea + 0.7, h);
    col = mix(uC2, uC3, e);
    col *= 0.85 + 0.3 * snoise(p * 6.0) * 0.5;
  }
  #if KIND == 2
    float cracks = smoothstep(0.82, 0.97, ridged(p * 1.3 + vec3(0.0, uTime * 0.01, 0.0)));
    emissive += uGlow * cracks * 2.2;
    col = mix(col, uGlow * 0.4, cracks * 0.5);
  #endif
  float caps = smoothstep(uIce, uIce + 0.06, lat + h * 0.12);
  col = mix(col, vec3(0.93, 0.96, 1.0), caps);
  spec *= 1.0 - caps;
  // Cities and roads (the planet's light map, shared with the close-up): grey by day, lit at night.
  float lights = lightMapAt(uLightMap, vObj);
  col = mix(col, vec3(0.42, 0.42, 0.4), lights * 0.35);
  // Clouds drift slowly
  float c = fbm(vObj * (uDetail * 1.4) + uSeed.zxy + vec3(uTime * 0.015, 0.0, uTime * 0.008));
  float cloud = smoothstep(0.05, 0.55, c) * uClouds;
  col = mix(col, uCloud, cloud);
  spec *= 1.0 - cloud;
  emissive += uCityGlow * lights * (1.0 - smoothstep(-0.18, 0.08, ndl)) * (1.0 - cloud * 0.5) * 1.1;
#endif

  vec3 H = normalize(L + V);
  float sp = pow(max(dot(n, H), 0.0), 40.0) * spec * day;
  vec3 lit = col * (0.03 + 0.97 * day) * uStarColor + sp * 0.6 * uStarColor + emissive;
  float rim = pow(1.0 - max(dot(n, V), 0.0), 2.5);
  lit += uAtmo * rim * uAtmoStrength * (0.15 + 0.85 * smoothstep(-0.3, 0.6, ndl));
  gl_FragColor = vec4(lit, 1.0);
}`;

/**
 * Procedural planet surface material for a biome look, varied by seed (the same roll as the surface
 * view). `lights` is the planet's night-light map (NightLightMap); null for a world nobody holds.
 */
export function createPlanetMaterial(look: PlanetLook, seed: number, opts: { lights?: THREE.Texture | null } = {}): THREE.ShaderMaterial {
  const s = surfaceLookOf(look, seed);
  const c = (hex: string) => new THREE.Color(hex);
  return new THREE.ShaderMaterial({
    defines: { KIND: KIND[look.kind] },
    uniforms: {
      uC0: { value: c(s.palette[0]) }, uC1: { value: c(s.palette[1]) }, uC2: { value: c(s.palette[2]) }, uC3: { value: c(s.palette[3]) },
      uCloud: { value: c(s.cloudColor) }, uAtmo: { value: c(s.atmosphere) }, uGlow: { value: c(s.glow) },
      uSea: { value: s.sea }, uIce: { value: s.ice },
      uClouds: { value: s.clouds }, uAtmoStrength: { value: s.atmosphereStrength },
      uDetail: { value: s.detail }, uCraters: { value: s.craters ? 1 : 0 },
      uLightMap: { value: opts.lights ?? NO_LIGHTS }, uCityGlow: { value: c(s.cityGlow) },
      uTime: { value: 0 }, uSeed: { value: new THREE.Vector3(...s.seed) },
      uStarPos: { value: new THREE.Vector3() }, uStarColor: { value: new THREE.Color('#ffffff') },
    },
    vertexShader: VERT,
    fragmentShader: FRAG,
  });
}

/** Animated star surface: granulation, limb darkening and hot spots. */
export function createStarMaterial(color: string, seed: number): THREE.ShaderMaterial {
  const rng = new Rng(seed);
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uTime: { value: 0 }, uSeed: { value: new THREE.Vector3(rng.range(0, 40), rng.range(0, 40), rng.range(0, 40)) } },
    vertexShader: VERT,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform float uTime; uniform vec3 uSeed;
      varying vec3 vObj; varying vec3 vNormalW; varying vec3 vPosW;
      ${NOISE_GLSL}
      void main() {
        vec3 V = normalize(-vPosW);
        float mu = max(dot(normalize(vNormalW), V), 0.0);
        float gran = fbm(vObj * 6.0 + uSeed + vec3(uTime * 0.05, uTime * 0.03, 0.0));
        float spots = smoothstep(0.55, 0.8, fbm(vObj * 2.0 + uSeed.zyx - vec3(0.0, uTime * 0.02, 0.0)));
        vec3 hot = mix(uColor, vec3(1.0), 0.55);
        vec3 col = mix(uColor * 0.85, hot, 0.5 + 0.5 * gran);
        col = mix(col, uColor * 0.45, spots * 0.6);
        col *= 0.55 + 0.6 * pow(mu, 0.45);
        gl_FragColor = vec4(col * 1.25, 1.0);
      }`,
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
