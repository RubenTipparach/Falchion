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

/**
 * Give a ship material its plating: triplanar in ship space, shade and roughness from the
 * texture, and its emission mask lit in `glow` (the design's accent). No-op outside a browser.
 */
export function applyHullTexture(material: THREE.MeshStandardMaterial, name: HullTextureName, glow: THREE.ColorRepresentation, glowStrength = 1.2): void {
  const entry = load(name);
  if (!entry) return;
  const uniforms = {
    uPlate: { value: entry.texture },
    uPlateOn: { value: entry.texture.image ? 1 : 0 },
    uPlateScale: { value: 1 / TILE },
    uPlateGlow: { value: new THREE.Color(glow).multiplyScalar(glowStrength) },
  };
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
varying vec3 vShip;
varying vec3 vShipN;
vec4 plate() {
  vec3 w = pow(abs(normalize(vShipN + 1e-5)), vec3(4.0));
  w /= (w.x + w.y + w.z);
  vec3 p = vShip * uPlateScale;
  return texture2D(uPlate, p.zy) * w.x + texture2D(uPlate, p.xz) * w.y + texture2D(uPlate, p.xy) * w.z;
}`)
      .replace('#include <map_fragment>', `#include <map_fragment>
vec4 plateTexel = uPlateOn > 0.5 ? plate() : vec4(${SHADE_MEAN}, 1.0, 0.0, 0.5);
diffuseColor.rgb *= plateTexel.r / ${SHADE_MEAN.toFixed(2)};`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = clamp(roughnessFactor * (0.4 + 1.2 * plateTexel.a), 0.05, 1.0);')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += uPlateGlow * plateTexel.b;');
  };
  material.customProgramCacheKey = () => `plate-${name}`;
}

/**
 * Bake each textured part's position and normal in the ship's frame into `aShip` / `aShipN`, so
 * the plating is laid in ship space. Parts sharing a geometry get their own copy first.
 */
export function bakeShipSpace(root: THREE.Object3D, textured: ReadonlySet<THREE.Material>): void {
  root.updateMatrixWorld(true);
  const toShip = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const seen = new Set<THREE.BufferGeometry>();
  const m = new THREE.Matrix4(), n = new THREE.Matrix3(), v = new THREE.Vector3();
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
      if (nor) v.fromBufferAttribute(nor, i).applyMatrix3(n).normalize();
      else v.set(0, 1, 0);
      q.set([v.x, v.y, v.z], i * 3);
    }
    geo.setAttribute('aShip', new THREE.BufferAttribute(p, 3));
    geo.setAttribute('aShipN', new THREE.BufferAttribute(q, 3));
  });
}
