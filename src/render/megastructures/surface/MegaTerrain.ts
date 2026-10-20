import * as THREE from 'three';
import { isTube, type MegaCity, type MegaGroundDef } from '../../../core/mega/MegaGround';
import { habitatArt } from './habitatArt';
import { MAX_MEGA_CITIES, MEGA_GROUND_GLSL } from './megaGround.glsl';

/**
 * A megastructure's land round the camera (change mega-surfaces): nested square grids, each twice
 * the last, centred on the camera and bent to the structure's shape. Each grid's vertices slide
 * onto the next grid's as they get further from the camera, and the land's octaves are a function
 * of distance alone, so where two grids meet they draw the same ground. A grid hides where a finer
 * one is drawn. A grid is dropped once it is fully slid onto the next, so nothing pops as the
 * camera climbs.
 */

/** Grid cells across half a level. */
const HALF = 32;
/** The finest spacing the land is drawn at, km. */
const FINEST_KM = 0.0005;
/**
 * A level starts sliding onto the next from this fraction of its half-width, and is fully slid by
 * FULL. START is past the finer level's farthest corner (a quarter of this level's grid off, with
 * the camera up to a cell from centre and up its altitude: 0.79 of the half-width), so where the
 * two meet this level has not begun to slide and its edge is the finer one's, with no cracks; FULL
 * is short of this level's own nearest edge (30 of its 32 cells).
 */
const MORPH_START = 0.8, MORPH_FULL = 0.93;

export interface TerrainView {
  /** Focus (site km) and the camera, km in the focus frame. */
  readonly focus: readonly [number, number];
  readonly cam: THREE.Vector3;
  /** Camera height above the ground under it, km. */
  readonly alt: number;
}

/** Uniforms shared by everything drawn on the land (terrain, towers, trees). */
export function landUniforms(def: MegaGroundDef): Record<string, THREE.IUniform> {
  return {
    uOffset: { value: new THREE.Vector3(...def.offset) },
    uFeature: { value: def.featureKm },
    uRelief: { value: def.reliefKm },
    uSea: { value: def.sea },
    uBroad: { value: def.broad },
    uCityA: { value: Array.from({ length: MAX_MEGA_CITIES }, () => new THREE.Vector4()) },
    uCityLevel: { value: new Array<number>(MAX_MEGA_CITIES).fill(0) },
    uCityN: { value: 0 },
    uShape: { value: def.radiusKm > 0 ? (def.type === 'dyson-sphere' ? 2 : 1) : 0 },
    uRadius: { value: def.radiusKm || 1 },
    uFocus: { value: new THREE.Vector2() },
    uCam: { value: new THREE.Vector3() },
    uCamGround: { value: 0 },
    uSun: { value: new THREE.Vector3(0, 1, 0) },
    uSunCol: { value: new THREE.Color(1, 0.96, 0.9) },
    uDay: { value: 1 },
    uDawn: { value: 0 },
    uCamAlt: { value: 1 },
    uHazeKm: { value: def.type === 'dyson-swarm' ? 30 : def.type === 'topopolis' ? 80 : 110 },
    uAtmKm: { value: def.type === 'dyson-swarm' ? 6 : def.type === 'topopolis' ? 12 : 14 },
    uDetailOrigin: { value: new THREE.Vector2() },
    uTime: { value: 0 },
    uHalfWidth: { value: def.widthKm > 0 ? def.widthKm / 2 : 1e12 },
    uHabitat: { value: isTube(def) ? 1 : 0 },
    ...(isTube(def) ? habitatUniforms(def) : {}),
  };
}

/** A habitat's painted land (Star Crew's O'Neill stripe, its rivers and its close-up detail). */
function habitatUniforms(def: MegaGroundDef): Record<string, THREE.IUniform> {
  const art = habitatArt();
  // A closed habitat has the stripe once along; an endless tube repeats it, as long as four strips are wide.
  const period = def.widthKm > 0 ? 0 : (4 * 2 * Math.PI * def.radiusKm) / 6;
  return { uLandMap: { value: art.land }, uLandDetail: { value: art.landDetail }, uDetailMean: { value: art.detailMean }, uLandPeriod: { value: period } };
}

/** Shader switches for the structure the uniforms are for. */
export const landDefines = (u: Record<string, THREE.IUniform>): Record<string, string> => (u.uHabitat.value > 0.5 ? { HABITAT: '' } : {});

/**
 * GLSL (HABITAT only): the painted land at a site: rgb, and in alpha its rivers and lakes. The
 * stripe is painted once across each land strip (mirrored on the middle one), once along.
 */
export const HABITAT_LAND_GLSL = /* glsl */ `
#ifdef HABITAT
uniform sampler2D uLandMap;
uniform sampler2D uLandDetail;
uniform vec3 uDetailMean;
uniform float uLandPeriod;
vec2 habitatUv(vec2 site) {
  vec2 ws = wrapSite(site);
  float t6 = fract(ws.x / (6.28318530718 * uRadius) + 1.0 / 12.0) * 6.0;
  float u = fract(t6);
  if (mod(floor(t6), 4.0) > 1.5) u = 1.0 - u;
  return vec2(u, uLandPeriod > 0.0 ? ws.y / uLandPeriod + 0.5 : clamp(ws.y / (2.0 * uHalfWidth) + 0.5, 0.0, 1.0));
}
#endif
`;

/** Put the cities the land should flatten and draw into the uniforms. */
export function setCities(u: Record<string, THREE.IUniform>, cities: readonly MegaCity[]): void {
  const a = u.uCityA.value as THREE.Vector4[], l = u.uCityLevel.value as number[];
  const n = Math.min(cities.length, MAX_MEGA_CITIES);
  for (let i = 0; i < n; i++) {
    a[i].set(cities[i].x, cities[i].z, cities[i].r, cities[i].size);
    l[i] = cities[i].level;
  }
  u.uCityN.value = n;
}

const TERRAIN_VERT = /* glsl */ `
${MEGA_GROUND_GLSL}
uniform vec2 uFocus;
uniform vec2 uLevelCentre;
uniform float uSpacing;
uniform float uE;
uniform float uOuter;
varying vec2 vSite;
varying float vH;
varying vec3 vN;
varying vec3 vPos;
varying float vSlope;
varying float vLand;
varying float vOct;
void main() {
  vec2 g = position.xz;
  vec2 site = uLevelCentre + g * uSpacing;
  vec2 rel = site - uFocus;
  float a = smoothstep(${MORPH_START} * uE, ${MORPH_FULL} * uE, camDist(rel));
  // Slide onto the next level's grid (every other vertex onto its lower neighbour).
  g -= mod(g, 2.0) * a;
  site = uLevelCentre + g * uSpacing;
  rel = site - uFocus;
  float oct = octavesAt(camDist(rel));
  float h = groundHeight(site, oct);
  float e = uSpacing * (1.0 + a);
  float hx = groundHeight(site + vec2(e, 0.0), oct), hz = groundHeight(site + vec2(0.0, e), oct);
  // The outermost level settles onto the floor at its edge, where the far view takes over.
  float edge = uOuter > 0.5 ? 1.0 - smoothstep(0.8, 1.0, max(abs(g.x), abs(g.y)) / ${HALF}.0) : 1.0;
  vec3 n0 = normalize(vec3((h - hx) * edge, e, (h - hz) * edge));
  vSlope = 1.0 - n0.y;
  vLand = groundNoise(site, oct) - uSea;
  vOct = oct;
  vH = h;
  vSite = site;
  vN = bendDir(rel, n0);
  vec3 p = bend(rel, max(h, 0.0) * edge);
  vPos = p;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`;

const TERRAIN_FRAG = /* glsl */ `
${MEGA_GROUND_GLSL}
${HABITAT_LAND_GLSL}
uniform vec2 uFocus;
uniform vec2 uFinerCentre;
uniform float uFinerE;
varying vec2 vSite;
varying float vH;
varying vec3 vN;
varying vec3 vPos;
varying float vSlope;
varying float vLand;
varying float vOct;
float hash12(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float lineW(float g, float halfW, float fw) { float d = abs(g - floor(g + 0.5)); return 1.0 - smoothstep(halfW - fw, halfW + fw, d); }
void main() {
  vec2 q = abs(vSite - uFinerCentre);
  if (max(q.x, q.y) < uFinerE) discard;
  if (abs(vSite.y) > uHalfWidth) discard;
  vec2 rel = vSite - uFocus;
  if (uHabitat > 0.5) {
    // A habitat: land on three strips (windows between), round once.
    float circ = 6.28318530718 * uRadius;
    if (abs(rel.x) > circ * 0.5) discard;
    float t = fract(vSite.x / circ + 1.0 / 12.0);
    if (mod(floor(t * 6.0), 2.0) > 0.5) discard;
  }
  // A pixel's size on the land (taken here, before any loop).
  float fw = length(fwidth(vSite));
  // Near the shore, the octaves of the land finer than the mesh carries are worked per pixel, so
  // the coast is the land's own curve (not the mesh's polygons) and stays put as the view moves.
  float h = vH;
  if (abs(vLand) < 0.1 && uHabitat < 0.5) {
    float lp = groundNoise(vSite, max(clamp(log2(uFeature / max(fw * 3.0, 1e-6)), 1.0, 12.0), vOct)) - uSea;
    h += (lp - vLand) * uRelief * (lp < 0.0 ? 0.8 : 0.6);
  }
  vec2 gd = groundDetail(vSite, fw);
  vec3 col = landColour(vSite, h, vSlope, fw);
  // Far off (toward the horizon), the mesh's vertices are too far apart to say where the coast is:
  // the land as the far view draws it, its share of land and sea, rather than rows that flicker.
  float farW = uHabitat < 0.5 ? smoothstep(uFeature * 0.02, uFeature * 0.1, fw) : 0.0;
  if (farW > 0.0) col = mix(col, landFrom(vSite, fw), farW);
#ifdef HABITAT
  {
    // The painted stripe: fields, woods and towns, its rivers and lakes; close up, the detail map
    // tiled every 280 m (not on the water), fading out with distance.
    vec4 land = texture2D(uLandMap, habitatUv(vSite));
    vec3 det = texture2D(uLandDetail, wrapSite(vSite) / 0.28).rgb / max(uDetailMean, vec3(0.05));
    float water = smoothstep(0.35, 0.65, land.a);
    float near = 1.0 - smoothstep(0.35, 2.6, length(uCam - vPos));
    col = land.rgb * mix(vec3(1.0), det, near * (1.0 - water) * 0.6);
    col = mix(col, vec3(0.06, 0.2, 0.26), water * 0.85);
    h = water > 0.5 ? -0.001 : max(h, 0.0005);
    gd *= 0.4;
  }
#endif
  if (h >= 0.0) {
    // Fields, groves and tufts: brightness and a touch of hue, more on grass than on rock or snow.
    float soft = 1.0 - smoothstep(0.65, 1.0, h / uRelief);
    col *= 1.0 + gd.x * 0.22 + gd.y * 0.25 * soft;
    col = mix(col, col * vec3(1.3, 1.12, 0.7), clamp(gd.y, 0.0, 1.0) * 0.7 * soft);
    col = mix(col, col * vec3(0.62, 0.8, 0.62), clamp(-gd.y, 0.0, 1.0) * 0.7 * soft);
  } else col *= 1.0 + gd.y * 0.06;
  vec3 n = normalize(vN);
  vec3 toCam = uCam - vPos;
  float dist = length(toCam);
  vec3 view = -toCam / dist;
  // The nearest city (no derivatives in the loop).
  float best = 1e9; vec4 city = vec4(0.0);
  for (int i = 0; i < ${MAX_MEGA_CITIES}; i++) {
    if (i >= uCityN) break;
    float d = length(wrapSite(vSite) - uCityA[i].xy) / uCityA[i].z;
    if (d < best) { best = d; city = uCityA[i]; }
  }
  float glow = 0.0;
  if (best < 1.15) {
    vec2 cq = (wrapSite(vSite) - city.xy);
    float wobble = snoise(vec3(cq / city.z * 2.5, 4.0)) * 0.12;
    float inCity = 1.0 - smoothstep(0.82, 1.0, best + wobble);
    // Streets on a block grid, avenues every eighth, a ring road; they fade to their average far off.
    const float B = 0.11;
    float fb = fw / B;
    vec2 gq = cq / B;
    float street = max(lineW(gq.x, 0.07, fb), lineW(gq.y, 0.07, fb));
    float avenue = max(lineW(gq.x / 8.0, 0.025, fb / 8.0), lineW(gq.y / 8.0, 0.025, fb / 8.0));
    float ring = 1.0 - smoothstep(0.004, 0.004 + fw / city.z + 0.002, abs(best - 0.62));
    float roads = max(max(street, avenue), ring);
    float far = smoothstep(0.25, 0.9, fb);
    roads = mix(roads, 0.28, far);
    vec2 blk = floor(gq);
    float r = hash12(blk + city.xy);
    float park = step(0.9, r) * (1.0 - smoothstep(0.3, 0.6, best));
    vec3 roof = mix(vec3(0.34, 0.33, 0.32), vec3(0.52, 0.46, 0.4), r) * (0.75 + 0.25 * hash12(blk * 1.7));
    roof = mix(roof, vec3(0.16, 0.3, 0.12), park);
    roof = mix(roof, vec3(0.4, 0.39, 0.37), far);
    vec3 cityCol = mix(roof, vec3(0.22, 0.22, 0.23), roads);
    col = mix(col, cityCol, inCity);
    // At night: street lamps along the roads and lit windows in the blocks.
    float lit = step(0.45, hash12(blk * 3.1 + floor(uTime * 0.02)));
    // Lamps every 30 m along the streets (a glow along them once they are too small to tell apart).
    vec2 lp = fract(cq / 0.03) - 0.5;
    float lamp = mix(smoothstep(0.25, 0.1, min(abs(lp.x), abs(lp.y))) * 0.5, 0.25, smoothstep(0.1, 0.5, fw / 0.03));
    glow = inCity * (roads * lamp + (1.0 - roads) * (1.0 - park) * lit * 0.18 * (1.0 - far * 0.5)) * (1.0 - smoothstep(0.4, 1.0, best) * 0.6);
  }
  // Light: the sun (overhead on a ring or a sphere, low on a disc), the sky's light, and the sea's glint.
  vec3 L = sunAt(rel);
  float ndl = max(dot(n, L), 0.0);
#ifdef HABITAT
  // Mirror light through the windows, as Star Crew lights its O'Neill land.
  vec3 lit = col * uSunCol * (0.45 + 0.55 * ndl) * uDay;
#else
  vec3 lit = col * (uSunCol * ndl * 0.82 + vec3(0.3, 0.36, 0.46) * (0.3 + 0.2 * n.y)) * uDay;
#endif
  if (h < 0.0) {
    vec3 hv = normalize(L - view);
    lit += uSunCol * pow(max(dot(n, hv), 0.0), 120.0) * 0.8 * uDay;
    lit = mix(lit, skyColour(reflect(view, n)) * 0.7, pow(1.0 - max(dot(-view, n), 0.0), 4.0) * 0.6);
  }
  // Night is a blue dusk (starlight, the glow of the far side, the cities), never black.
  lit += col * vec3(0.16, 0.19, 0.27) * (0.75 + 0.25 * n.y) * (1.0 - uDay);
  lit += vec3(1.0, 0.72, 0.38) * glow * (1.0 - uDay) * 0.7;
  gl_FragColor = vec4(airOver(lit, view, dist), 1.0);
}`;

/** One grid: (2 HALF + 1)^2 vertices on integer coordinates, all quads cut the same way. */
function gridGeometry(): THREE.BufferGeometry {
  const n = HALF * 2 + 1;
  const pos = new Float32Array(n * n * 3);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) pos.set([i - HALF, 0, j - HALF], (j * n + i) * 3);
  const idx: number[] = [];
  for (let j = 0; j < n - 1; j++) {
    for (let i = 0; i < n - 1; i++) {
      const a = j * n + i, b = a + 1, c = a + n, d = c + 1;
      idx.push(a, c, d, a, d, b);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g;
}

export class MegaTerrain {
  readonly group = new THREE.Group();
  private readonly geo = gridGeometry();
  private readonly levels: Array<{ mesh: THREE.Mesh; mat: THREE.ShaderMaterial }> = [];
  /** How far out the land is drawn (km) this frame: the far view takes over beyond. */
  extent = 0;

  constructor(readonly uniforms: Record<string, THREE.IUniform>, count: number) {
    for (let i = 0; i < count; i++) {
      const mat = new THREE.ShaderMaterial({
        vertexShader: TERRAIN_VERT, fragmentShader: TERRAIN_FRAG, side: THREE.DoubleSide, defines: landDefines(uniforms),
        uniforms: {
          ...uniforms,
          uLevelCentre: { value: new THREE.Vector2() }, uSpacing: { value: 1 }, uE: { value: 1 }, uOuter: { value: i === count - 1 ? 1 : 0 },
          uFinerCentre: { value: new THREE.Vector2() }, uFinerE: { value: 0 },
        },
      });
      const mesh = new THREE.Mesh(this.geo, mat);
      mesh.frustumCulled = false;
      this.group.add(mesh);
      this.levels.push({ mesh, mat });
    }
  }

  /** Place the levels round the camera. */
  update(v: TerrainView): void {
    // The finest level: the smallest whose slide is not yet complete under the camera.
    let k = 0;
    while (MORPH_FULL * HALF * FINEST_KM * 2 ** k < Math.max(v.alt, 1e-6)) k++;
    let finer: { c: THREE.Vector2; e: number } | null = null;
    // Centred under the camera (not on the focus, which may be well ahead of it): each level's
    // slide is measured from the camera, so its edge must be as far from the camera as it can be.
    const gx = v.focus[0] + v.cam.x, gz = v.focus[1] + v.cam.z;
    this.levels.forEach(({ mat }, i) => {
      const s = FINEST_KM * 2 ** (k + i);
      const step = 2 * s;
      const c = new THREE.Vector2(Math.floor(gx / step) * step, Math.floor(gz / step) * step);
      const u = mat.uniforms;
      u.uLevelCentre.value.copy(c);
      u.uSpacing.value = s;
      u.uE.value = HALF * s;
      u.uFinerCentre.value.copy(finer?.c ?? c);
      // Inside the finer level's square, less one of this level's cells: the finer level's outer
      // ring has slid fully onto this grid, so the two lie on each other there, and a grazing view
      // finds no gap between them (cut at the edge itself, slivers of sky showed through).
      u.uFinerE.value = finer ? finer.e - s : 0;
      finer = { c, e: HALF * s };
      this.extent = HALF * s;
    });
  }

  dispose(): void {
    this.geo.dispose();
    for (const l of this.levels) l.mat.dispose();
  }
}
