import * as THREE from 'three';
import { propGeometry } from '../../planets/surface/FloraModels';
import { smoothstep } from '../../../core/surface/Noise';
import { HABITAT_LAND_GLSL, landDefines } from './MegaTerrain';
import { MAX_MEGA_CITIES, MEGA_GROUND_GLSL } from './megaGround.glsl';

/**
 * Trees round the camera on a megastructure's land (change mega-surfaces). A grid of cells
 * anchored to the land follows the camera; a placement pass works out, once a cell per frame,
 * where each cell's tree stands (on the drawn ground: the same height function and octaves as the
 * terrain) or that it has none (sea, shore, city, rock, a dry plain, a habitat's window), into a
 * small float texture the trees read. Needs WebGL 2 and float render targets; without, no trees.
 */

/** Cell size, km. */
const CELL_KM = 0.016;
/** Trees show below this camera height, km. */
export const TREES_BELOW_KM = 1.6;

const KINDS = [
  { kind: 'conifer' as const, colors: ['#1f4a2a', '#2f5e34'], size: [0.012, 0.024] },
  { kind: 'broadleaf' as const, colors: ['#2e5e26', '#4f7a30'], size: [0.01, 0.02] },
  { kind: 'shrub' as const, colors: ['#3e5a2a', '#5a6a34'], size: [0.0018, 0.0036] },
  { kind: 'boulder' as const, colors: ['#6a6660', '#8a847a'], size: [0.002, 0.007] },
];

const PLACE_VERT = /* glsl */ `void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const PLACE_FRAG = /* glsl */ `
${MEGA_GROUND_GLSL}
${HABITAT_LAND_GLSL}
uniform vec2 uFocus;
uniform vec2 uOrigin;
uniform float uCell;
uniform float uHalfK;
uint pcg(uint v) { uint s = v * 747796405u + 2891336453u; uint w = ((s >> ((s >> 28u) + 4u)) ^ s) * 277803737u; return (w >> 22u) ^ w; }
float rnd(ivec2 c, uint salt) { return float(pcg(uint(c.x) * 73856093u ^ pcg(uint(c.y) * 19349663u ^ salt)) & 0xffffffu) / 16777216.0; }
void main() {
  ivec2 c = ivec2(uOrigin) + ivec2(gl_FragCoord.xy);
  vec2 site = (vec2(c) + 0.15 + 0.7 * vec2(rnd(c, 1u), rnd(c, 2u))) * uCell;
  vec4 none = vec4(0.0, 0.0, 0.0, -1.0);
  if (abs(site.y) > uHalfWidth) { gl_FragColor = none; return; }
  vec2 rel = site - uFocus;
  if (uHabitat > 0.5) {
    float circ = 6.28318530718 * uRadius;
    float t = fract(site.x / circ + 1.0 / 12.0);
    if (abs(rel.x) > circ * 0.5 || mod(floor(t * 6.0), 2.0) > 0.5) { gl_FragColor = none; return; }
  }
  for (int i = 0; i < ${MAX_MEGA_CITIES}; i++) {
    if (i >= uCityN) break;
    if (length(wrapSite(site) - uCityA[i].xy) < uCityA[i].z * 1.1) { gl_FragColor = none; return; }
  }
  float h = groundHeight(site, octavesAt(camDist(rel)));
  float e = h / uRelief;
  if (h < 0.004 || e > 1.05) { gl_FragColor = none; return; }
  // What grows here: forest where it is wet (thick in groves), shrubs and stones on dry plains,
  // boulders up among the rocks.
  vec3 q = vec3(wrapSite(site) / uFeature + uOffset.xy, uOffset.z);
  float wet = snoise(q * 0.8 + vec3(40.0, 11.0, 7.0));
  float groves = snoise(q * 120.0 + vec3(5.0)) * 0.5 + 0.5;
  float forest = smoothstep(-0.45, -0.05, wet) * mix(0.25, 1.0, smoothstep(0.3, 0.6, groves + wet * 0.25)) * (1.0 - smoothstep(0.5, 0.75, e));
#ifdef HABITAT
  // The painted land says where: woods where it is darkest green, none in its rivers.
  vec4 land = textureLod(uLandMap, habitatUv(site), 0.0);
  if (land.a > 0.35) { gl_FragColor = none; return; }
  forest = smoothstep(0.0, 0.08, land.g - max(land.r, land.b) * 1.05) * (1.0 - smoothstep(0.35, 0.6, land.g + land.r));
#endif
  // Thinning out toward the window's edge, so the trees fade off instead of stopping at a line.
  vec2 fromMid = abs(vec2(c) - (uOrigin + uHalfK));
  float edge = max(fromMid.x, fromMid.y) / uHalfK;
  float r = rnd(c, 3u) / max(1.0 - smoothstep(0.55, 1.0, edge), 1e-3);
  float kind;
  if (e > 0.65) { if (r > 0.3) { gl_FragColor = none; return; } kind = 3.0; }
  else if (r < forest * 0.9) kind = rnd(c, 4u) < 0.45 + 0.5 * smoothstep(0.2, 0.5, e) ? 0.0 : 1.0;
  else if (r < forest * 0.9 + 0.28) kind = 2.0;
  else if (r < forest * 0.9 + 0.33) kind = 3.0;
  else { gl_FragColor = none; return; }
  gl_FragColor = vec4(site, h, kind + min(rnd(c, 5u), 0.999));
}`;

const TREE_VERT = /* glsl */ `
${MEGA_GROUND_GLSL}
attribute float aCell;
attribute vec3 color;
attribute float aTint;
uniform sampler2D uPlace;
uniform int uK;
uniform float uKind;
uniform vec2 uSize;
uniform vec2 uFocus;
uniform float uShow;
uniform vec3 uColA;
uniform vec3 uColB;
varying vec3 vCol;
varying vec3 vNrm;
varying vec3 vPos;
varying vec2 vRel;
void main() {
  int i = int(aCell);
  vec4 t = texelFetch(uPlace, ivec2(i % uK, i / uK), 0);
  if (t.w < 0.0 || floor(t.w) != uKind || uShow <= 0.0) { gl_Position = vec4(0.0, 0.0, 2.0, 1.0); return; }
  float g = fract(t.w);
  float size = mix(uSize.x, uSize.y, g) * uShow;
  float a = g * 37.0;
  vec3 l = vec3(position.x * cos(a) - position.z * sin(a), position.y, position.x * sin(a) + position.z * cos(a)) * size;
  vec2 rel = t.xy + l.xz - uFocus;
  vec3 p = bend(rel, t.z + l.y - size * 0.05);
  vCol = color * mix(vec3(1.0), mix(uColA, uColB, fract(g * 7.0)), aTint);
  vNrm = bendDir(rel, normal);
  vPos = p;
  vRel = rel;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`;

const TREE_FRAG = /* glsl */ `
${MEGA_GROUND_GLSL}
varying vec3 vCol;
varying vec3 vNrm;
varying vec3 vPos;
varying vec2 vRel;
void main() {
  vec3 n = normalize(vNrm);
  if (!gl_FrontFacing) n = -n;
  vec3 toCam = uCam - vPos;
  float dist = length(toCam);
  vec3 lit = vCol * (uSunCol * max(dot(n, sunAt(vRel)), 0.0) * 0.9 + vec3(0.3, 0.36, 0.44) * (0.5 + 0.25 * n.y)) * uDay;
  lit += vCol * vec3(0.01, 0.015, 0.03) * (1.0 - uDay);
  gl_FragColor = vec4(airOver(lit, -toCam / dist, dist), 1.0);
}`;

export class MegaTrees {
  readonly group = new THREE.Group();
  private readonly k: number;
  private target: THREE.WebGLRenderTarget | null = null;
  private readonly place: THREE.ShaderMaterial;
  private readonly quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
  private readonly quadCam = new THREE.Camera();
  private readonly meshes: THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial>[] = [];
  private ok: boolean | null = null;

  constructor(uniforms: Record<string, THREE.IUniform>, lite: boolean) {
    this.k = lite ? 72 : 128;
    this.quad.frustumCulled = false;
    this.place = new THREE.ShaderMaterial({
      vertexShader: PLACE_VERT, fragmentShader: PLACE_FRAG, defines: landDefines(uniforms),
      uniforms: { ...uniforms, uOrigin: { value: new THREE.Vector2() }, uCell: { value: CELL_KM }, uHalfK: { value: this.k / 2 } }, depthTest: false, depthWrite: false,
    });
    this.quad.material = this.place;
    const cells = new Float32Array(this.k * this.k).map((_, i) => i);
    KINDS.forEach((def, i) => {
      const shape = propGeometry(def.kind);
      const geo = new THREE.InstancedBufferGeometry().copy(shape as THREE.InstancedBufferGeometry);
      shape.dispose();
      geo.setAttribute('aCell', new THREE.InstancedBufferAttribute(cells, 1));
      geo.instanceCount = this.k * this.k;
      const mat = new THREE.ShaderMaterial({
        vertexShader: TREE_VERT, fragmentShader: TREE_FRAG, side: THREE.DoubleSide,
        uniforms: {
          ...uniforms, uPlace: { value: null }, uK: { value: this.k }, uKind: { value: i }, uShow: { value: 0 },
          uSize: { value: new THREE.Vector2(def.size[0], def.size[1]) },
          uColA: { value: new THREE.Color(def.colors[0]) }, uColB: { value: new THREE.Color(def.colors[1]) },
        },
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.frustumCulled = false;
      this.meshes.push(mesh);
      this.group.add(mesh);
    });
  }

  /** Before drawing: place the cells round the focus (site km), shown below TREES_BELOW_KM. */
  update(renderer: THREE.WebGLRenderer, focus: readonly [number, number], alt: number): void {
    if (this.ok === null) this.ok = renderer.capabilities.isWebGL2 && renderer.extensions.has('EXT_color_buffer_float');
    const show = this.ok ? 1 - smoothstep(TREES_BELOW_KM * 0.5, TREES_BELOW_KM, alt) : 0;
    this.group.visible = show > 0;
    if (!this.group.visible) return;
    if (!this.target) {
      this.target = new THREE.WebGLRenderTarget(this.k, this.k, { type: THREE.FloatType, format: THREE.RGBAFormat, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: false });
      for (const m of this.meshes) m.material.uniforms.uPlace.value = this.target.texture;
    }
    for (const m of this.meshes) m.material.uniforms.uShow.value = show;
    this.place.uniforms.uOrigin.value.set(Math.floor(focus[0] / CELL_KM) - this.k / 2, Math.floor(focus[1] / CELL_KM) - this.k / 2);
    const before = renderer.getRenderTarget();
    renderer.setRenderTarget(this.target);
    renderer.render(this.quad, this.quadCam);
    renderer.setRenderTarget(before);
  }

  dispose(): void {
    this.target?.dispose();
    this.place.dispose();
    this.quad.geometry.dispose();
    for (const m of this.meshes) { m.geometry.dispose(); m.material.dispose(); }
  }
}
