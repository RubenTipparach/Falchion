import * as THREE from 'three';

/**
 * Hull plating (the ship-materials skill): one small tiling texture per ship style and one for the
 * machinery on detail parts, rendered from Material Maker graphs (tools/materials) into
 * public/textures/ships/. Each is packed: R shade (albedo with its relief and occlusion baked in,
 * mean 0.7), G occlusion, B emission mask, A roughness.
 *
 * Ships are textured triplanar in ship space: every part's vertices carry their position and
 * normal in the ship's frame (`aShip`, `aShipN`, baked by `bakeShipSpace`), so plating runs on
 * across parts and does not swim as the ship flies. Nothing is loaded outside a browser (the
 * server and the tests build ships too), and a material only switches to its texture once it
 * has loaded.
 */

export const HULL_TEXTURE_NAMES = ['technological', 'utilitarian', 'organic', 'geometric', 'classic', 'machinery'] as const;
export type HullTextureName = (typeof HULL_TEXTURE_NAMES)[number];

/** World units one repeat of the plating covers (a ship of length 1 is about 4 long). */
const TILE = 1.6;
/** The packed shade's mean: the shader divides by it, so a hull keeps its colour on average. */
const SHADE_MEAN = 0.7;

const cache = new Map<HullTextureName, { texture: THREE.Texture; ready: Promise<THREE.Texture> }>();
const browser = typeof document !== 'undefined' && typeof Image !== 'undefined';

function load(name: HullTextureName): { texture: THREE.Texture; ready: Promise<THREE.Texture> } | null {
  if (!browser) return null;
  let entry = cache.get(name);
  if (!entry) {
    const base = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';
    let texture!: THREE.Texture;
    const ready = new Promise<THREE.Texture>((done, fail) => {
      texture = new THREE.TextureLoader().load(`${base}textures/ships/${name}.png`, done, undefined, fail);
    });
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.colorSpace = THREE.NoColorSpace;
    texture.anisotropy = 4;
    ready.catch(() => {});
    entry = { texture, ready };
    cache.set(name, entry);
  }
  return entry;
}

/** Load every hull texture now (the app and the contact sheet wait for this before rendering ships). */
export function preloadHullTextures(): Promise<unknown> {
  return Promise.all(HULL_TEXTURE_NAMES.map((n) => load(n)?.ready.catch(() => null)));
}

/** The style's plating texture name (unknown styles fall back to technological). */
export const hullTextureFor = (style: string): HullTextureName =>
  (HULL_TEXTURE_NAMES as readonly string[]).includes(style) && style !== 'machinery' ? (style as HullTextureName) : 'technological';

/** A paint scheme on the hull (change ship-liveries): its index in LIVERIES, the paint and the trim. */
export interface HullLivery {
  readonly index: number;
  readonly paint: THREE.ColorRepresentation;
  readonly trim: THREE.ColorRepresentation;
}

/**
 * The liveries' patterns, one case per row of `LIVERIES` (src/content/liveries.ts), in the hull's
 * own frame scaled to its bounds: q.x across (-1 port, 1 starboard), q.y up (-1 to 1), q.z along
 * (0 tail, 1 nose). Returns the paint mask and the trim mask, anti-aliased by `fwidth`.
 */
export const LIVERY_GLSL = `
float livAa(float d) { float w = max(fwidth(d), 1e-4); return smoothstep(-w, w, d); }
float livBand(float d, float t) { return livAa(t - abs(d)); }
vec2 livery(vec3 q) {
  int k = int(uLivery + 0.5);
  float paint = 0.0, trim = 0.0;
  if (k == 1) { // two-tone: the belly
    float d = -0.08 - q.y;
    paint = livAa(d); trim = livBand(d + 0.04, 0.025);
  } else if (k == 2) { // racing stripes along the spine, a pinstripe between
    float top = livAa(q.y + 0.15);
    paint = livAa(0.09 - abs(abs(q.x) - 0.2)) * top; trim = livBand(q.x, 0.025) * top;
  } else if (k == 3) { // nose cap and tail
    paint = max(livAa(q.z - 0.76), livAa(0.1 - q.z)); trim = livBand(q.z - 0.72, 0.022);
  } else if (k == 4) { // bands round the hull
    float a = abs(q.z - 0.34), b = abs(q.z - 0.58);
    paint = max(livAa(0.05 - a), livAa(0.05 - b)); trim = max(livBand(a - 0.068, 0.012), livBand(b - 0.068, 0.012));
  } else if (k == 5) { // chevrons pointing forward
    float v = q.z * 5.0 + abs(q.x) * 1.4;
    paint = livAa(0.17 - abs(fract(v) - 0.5)) * livAa(0.85 - q.z) * livAa(q.z - 0.15);
  } else if (k == 6) { // harlequin: starboard painted, a trim line down the keel and spine
    paint = livAa(q.x); trim = livBand(q.x, 0.02);
  } else if (k == 7) { // hazard: the stern painted, warning stripes on it
    float stern = livAa(0.36 - q.z);
    paint = stern; trim = livAa(0.25 - abs(fract(q.z * 6.0 + q.x * 2.5 + q.y * 2.5) - 0.5)) * stern;
  } else if (k == 8) { // tiger: ragged stripes across the back and flanks
    float w = q.z * 7.0 + sin(q.x * 9.0 + q.z * 13.0) * 0.3 + sin(q.x * 3.1) * 0.35;
    paint = livAa(0.19 - abs(fract(w) - 0.5) - abs(q.x) * 0.12) * livAa(q.y + 0.35);
  }
  return vec2(paint, trim);
}`;

/**
 * Give a ship material its plating: triplanar in ship space, shade and roughness from the
 * texture, and its emission mask lit in `glow` (the design's accent). With a `livery` the hull is
 * painted under the plating. No-op outside a browser.
 */
export function applyHullTexture(material: THREE.MeshStandardMaterial, name: HullTextureName, glow: THREE.ColorRepresentation, glowStrength = 1.2, livery?: HullLivery): void {
  const entry = load(name);
  if (!entry) return;
  const uniforms = {
    uPlate: { value: entry.texture },
    uPlateOn: { value: entry.texture.image ? 1 : 0 },
    uPlateScale: { value: 1 / TILE },
    uPlateGlow: { value: new THREE.Color(glow).multiplyScalar(glowStrength) },
    uLivery: { value: livery?.index ?? 0 },
    uLivPaint: { value: new THREE.Color(livery?.paint ?? 0) },
    uLivTrim: { value: new THREE.Color(livery?.trim ?? 0) },
    // The hull's bounds in ship space, set by bakeShipSpace.
    uLivMin: { value: new THREE.Vector3(-1, -1, -2) },
    uLivSize: { value: new THREE.Vector3(2, 2, 4) },
  };
  material.userData.plate = uniforms;
  entry.ready.then(() => { uniforms.uPlateOn.value = 1; material.needsUpdate = true; }).catch(() => {});
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 aShip;\nattribute vec3 aShipN;\nvarying vec3 vShip;\nvarying vec3 vShipN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvShip = aShip;\nvShipN = aShipN;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
uniform sampler2D uPlate;
uniform float uPlateOn;
uniform float uPlateScale;
uniform vec3 uPlateGlow;
uniform float uLivery;
uniform vec3 uLivPaint;
uniform vec3 uLivTrim;
uniform vec3 uLivMin;
uniform vec3 uLivSize;
varying vec3 vShip;
varying vec3 vShipN;
${LIVERY_GLSL}
vec4 plate() {
  vec3 w = pow(abs(normalize(vShipN + 1e-5)), vec3(4.0));
  w /= (w.x + w.y + w.z);
  vec3 p = vShip * uPlateScale;
  return texture2D(uPlate, p.zy) * w.x + texture2D(uPlate, p.xz) * w.y + texture2D(uPlate, p.xy) * w.z;
}`)
      .replace('#include <map_fragment>', `#include <map_fragment>
vec4 plateTexel = uPlateOn > 0.5 ? plate() : vec4(${SHADE_MEAN}, 1.0, 0.0, 0.5);
// Paint is matte: where the livery is, the hull is less metal and rougher (below).
float livPainted = 0.0;
if (uLivery > 0.5) {
  vec3 lq = (vShip - uLivMin) / max(uLivSize, vec3(1e-3));
  vec2 lm = livery(vec3(lq.x * 2.0 - 1.0, lq.y * 2.0 - 1.0, lq.z));
  diffuseColor.rgb = mix(mix(diffuseColor.rgb, uLivPaint, lm.x), uLivTrim, lm.y);
  livPainted = max(lm.x, lm.y);
}
diffuseColor.rgb *= plateTexel.r / ${SHADE_MEAN.toFixed(2)};`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = clamp(mix(roughnessFactor * (0.4 + 1.2 * plateTexel.a), 0.62, livPainted * 0.7), 0.05, 1.0);')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor *= 1.0 - 0.75 * livPainted;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += uPlateGlow * plateTexel.b;');
  };
  material.customProgramCacheKey = () => `plate-${name}`;
}

/**
 * Bake each textured part's position and normal in the ship's frame into `aShip` / `aShipN`, so
 * the plating is laid in ship space, and give each textured material the bounds of those parts
 * (a livery is laid out within them). Parts sharing a geometry get their own copy first.
 */
export function bakeShipSpace(root: THREE.Object3D, textured: ReadonlySet<THREE.Material>): void {
  root.updateMatrixWorld(true);
  const toShip = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const seen = new Set<THREE.BufferGeometry>();
  const m = new THREE.Matrix4(), n = new THREE.Matrix3(), v = new THREE.Vector3();
  const bounds = new THREE.Box3();
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh) || !textured.has(o.material as THREE.Material)) return;
    if (seen.has(o.geometry)) o.geometry = o.geometry.clone();
    const geo = o.geometry as THREE.BufferGeometry;
    seen.add(geo);
    const pos = geo.getAttribute('position'), nor = geo.getAttribute('normal');
    if (!pos) return;
    m.multiplyMatrices(toShip, o.matrixWorld);
    n.getNormalMatrix(m);
    const p = new Float32Array(pos.count * 3), q = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(m);
      p.set([v.x, v.y, v.z], i * 3);
      bounds.expandByPoint(v);
      if (nor) v.fromBufferAttribute(nor, i).applyMatrix3(n).normalize();
      else v.set(0, 1, 0);
      q.set([v.x, v.y, v.z], i * 3);
    }
    geo.setAttribute('aShip', new THREE.BufferAttribute(p, 3));
    geo.setAttribute('aShipN', new THREE.BufferAttribute(q, 3));
  });
  if (bounds.isEmpty()) return;
  for (const mat of textured) {
    const u = mat.userData.plate as { uLivMin: { value: THREE.Vector3 }; uLivSize: { value: THREE.Vector3 } } | undefined;
    if (!u) continue;
    u.uLivMin.value.copy(bounds.min);
    bounds.getSize(u.uLivSize.value);
  }
}
