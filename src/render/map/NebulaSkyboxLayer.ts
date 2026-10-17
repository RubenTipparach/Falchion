import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { MapLayer, ViewState } from './MapLayer';
import { NebulaField } from './nebulaField';
import { NebulaSkyPainter, SkyAnchor } from './nebulaSky';
import { fade } from './ZoomModel';

/** The skybox is fully in below this visible width (ly) and gone above SKY_ZERO. */
export const SKY_FULL = 2;
export const SKY_ZERO = 12;
/** Icosphere detail: 32 segments per edge, 10,242 vertices. */
const DETAIL = 31;
/** Painted skies kept, keyed by anchor id. */
const CACHE_SIZE = 24;
/** Repaint a cached sky once the map's clouds have drifted this long (s). */
const STALE_AFTER = 600;
/** Deep space: anchor the sky to a grid this coarse (ly) so it repaints as the camera travels. */
const DEEP_CELL = 8;

/**
 * Resolves the anchor for a camera focus (absolute galaxy coords): the star system
 * there, or null in deep space.
 */
export type SkyAnchorResolver = (x: number, z: number) => SkyAnchor | null;

/**
 * Homeworld 1-style vertex-colour skybox for system view: a finely subdivided sphere
 * around the camera with one colour per vertex and nothing else, so the sky is all
 * big soft gradients. The colours are painted on the CPU from the map's own nebula
 * field around the star (or the followed ship in deep space), so the system sits
 * inside the nebula the map shows there. Drawn first, additively, in the opaque pass
 * (negative renderOrder) so stars, planets and ships draw over it at full opacity.
 */
export class NebulaSkyboxLayer implements MapLayer {
  readonly object3d: THREE.Mesh;
  private readonly material: THREE.ShaderMaterial;
  private readonly colors: THREE.BufferAttribute;
  private readonly painter: NebulaSkyPainter;
  private readonly cache = new Map<string, { colors: Float32Array; time: number }>();
  private target: Float32Array | null = null;
  private anchorId: string | null = null;
  private settled = true;
  private shown = false;

  constructor(galaxySeed: number, private readonly anchorAt: SkyAnchorResolver) {
    const ico = new THREE.IcosahedronGeometry(1, DETAIL);
    ico.deleteAttribute('normal');
    ico.deleteAttribute('uv');
    const geo = mergeVertices(ico);
    ico.dispose();
    const dirs = geo.getAttribute('position').array as Float32Array;
    this.colors = new THREE.BufferAttribute(new Float32Array(dirs.length), 3);
    this.colors.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('color', this.colors);
    this.painter = new NebulaSkyPainter(new NebulaField(galaxySeed), galaxySeed, dirs);

    this.material = new THREE.ShaderMaterial({
      transparent: false, // additive background, drawn in the opaque pass before planets
      depthWrite: false,
      depthTest: false,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
      uniforms: { uOpacity: { value: 0 } },
      vertexShader: /* glsl */ `
        attribute vec3 color; varying vec3 vColor;
        void main() { vColor = color; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform float uOpacity; varying vec3 vColor;
        void main() {
          // A whisper of dither keeps the long dark gradients from banding.
          float d = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5;
          gl_FragColor = vec4(max(vColor + d / 255.0, 0.0) * uOpacity, 1.0);
        }`,
    });
    this.object3d = new THREE.Mesh(geo, this.material);
    this.object3d.renderOrder = -11; // behind the starfield
    this.object3d.frustumCulled = false;
    this.object3d.visible = false;
  }

  update(view: ViewState): void {
    const opacity = fade(view.visibleWidth, SKY_FULL, SKY_ZERO);
    this.object3d.visible = opacity > 0.01;
    if (!this.object3d.visible) {
      this.shown = false;
      return;
    }
    this.retarget(view);
    this.blend(!this.shown);
    this.shown = true;
    this.material.uniforms.uOpacity.value = opacity;
    // Centred on the camera (the world group is offset by -origin), just inside the far plane.
    const cam = view.camera;
    this.object3d.position.set(cam.position.x + view.origin.x, cam.position.y, cam.position.z + view.origin.z);
    this.object3d.scale.setScalar(cam.far * 0.8);
  }

  /** Pick the sky for the current focus, painting (and caching) it if needed. */
  private retarget(view: ViewState): void {
    const anchor = this.anchorAt(view.focus.x, view.focus.z) ?? deepSpace(view.focus.x, view.focus.z);
    const cached = this.cache.get(anchor.id);
    if (anchor.id === this.anchorId && cached) return;
    let colors = cached && Math.abs(cached.time - view.time) < STALE_AFTER ? cached.colors : null;
    if (!colors) {
      colors = this.painter.paint(anchor, view.time, new Float32Array(this.colors.array.length));
      this.cache.delete(anchor.id);
      this.cache.set(anchor.id, { colors, time: view.time });
      if (this.cache.size > CACHE_SIZE) this.cache.delete(this.cache.keys().next().value!);
    }
    this.anchorId = anchor.id;
    this.target = colors;
    this.settled = false;
  }

  /** Ease the vertex colours toward the target sky (or snap when it first appears). */
  private blend(snap: boolean): void {
    if (this.settled || !this.target) return;
    const cur = this.colors.array as Float32Array, tgt = this.target;
    if (snap) cur.set(tgt);
    else {
      let moving = false;
      for (let i = 0; i < cur.length; i++) {
        const d = tgt[i] - cur[i];
        if (Math.abs(d) > 0.002) { cur[i] += d * 0.12; moving = true; } else cur[i] = tgt[i];
      }
      this.settled = !moving;
    }
    if (snap) this.settled = true;
    this.colors.needsUpdate = true;
  }

  dispose(): void {
    this.object3d.geometry.dispose();
    this.material.dispose();
  }
}

function deepSpace(x: number, z: number): SkyAnchor {
  const cx = Math.round(x / DEEP_CELL), cz = Math.round(z / DEEP_CELL);
  return { id: `deep:${cx},${cz}`, x: cx * DEEP_CELL, z: cz * DEEP_CELL };
}
