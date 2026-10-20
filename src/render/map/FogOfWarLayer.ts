import * as THREE from 'three';
import type { MapLayer, ViewState } from './MapLayer';
import { pointScale } from './StarPointsMaterial';
import { fadeIn } from './ZoomModel';

/** What clears the fog (change admin-snapshots-and-fog). */
export interface FogSource {
  /** Changes whenever `clearings` does. */
  readonly version: number;
  /** The server hides unexplored systems: the fog is thicker. */
  readonly dense: boolean;
  /** Fixed clearings, four floats each: x, z (absolute galaxy coordinates), radius (ly), strength (0..1). */
  clearings(): Float32Array;
  /** Clearings that move (your fleets), read every frame. */
  moving(): ReadonlyArray<{ readonly x: number; readonly z: number; readonly r: number }>;
}

/** The mask is drawn at this fraction of the screen's resolution (it is soft anyway). */
const MASK_SCALE = 0.25;
/** A clearing's sprite is never smaller than this on screen (mask pixels), so explored space shows from far out. */
const MIN_PX = 8;
/** Where the clearing's falloff, exp(-4 d²), crosses the fog's threshold (0.5): its edge, as a share of its sprite. */
const KERNEL_REACH = '0.4163';
/** Most moving clearings (fleets). */
const MAX_MOVING = 256;
/** Fog opacity: with systems shown, and with them hidden. */
const DENSITY = { open: 0.62, dense: 0.9 } as const;

/**
 * Fog of war over the galaxy map. Before each frame the layer draws soft discs at every explored and
 * sighted system and every fleet of yours into a small render target (max blending, the map's own
 * camera); a plane following the view then draws drifting fog whose opacity is one minus that mask,
 * with a faint rim where explored space ends. The fog's noise is sampled at a scale tied to the zoom
 * in powers of four (crossfaded), so it does not swim as you zoom. It is drawn in the opaque pass right
 * after the stars, so ships, territory, the grid and labels stay above it, and it fades out in the
 * system view.
 */
export class FogOfWarLayer implements MapLayer {
  readonly object3d: THREE.Mesh;
  private readonly material: THREE.ShaderMaterial;
  private readonly maskScene = new THREE.Scene();
  private readonly maskRoot = new THREE.Group();
  private readonly maskMaterial: THREE.ShaderMaterial;
  private readonly fixed: THREE.Points;
  private readonly moving: THREE.Points;
  private readonly movingAttr: { pos: THREE.BufferAttribute; info: THREE.BufferAttribute };
  private target: THREE.WebGLRenderTarget | null = null;
  private drawnVersion = -1;
  private opacity = 0;
  private readonly size = new THREE.Vector2();
  private readonly clearColor = new THREE.Color();

  constructor(private readonly source: FogSource) {
    this.maskMaterial = new THREE.ShaderMaterial({
      depthTest: false,
      depthWrite: false,
      transparent: true,
      // Added up: nearby clearings merge into one shape, like metaballs (the fog cuts at a threshold).
      blending: THREE.AdditiveBlending,
      uniforms: { uScale: { value: 400 }, uMinPx: { value: MIN_PX } },
      vertexShader: /* glsl */ `
        attribute vec2 info; // radius (ly), strength
        uniform float uScale; uniform float uMinPx;
        varying float vStrength;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vStrength = info.y;
          // The sprite is wider than the clearing: the falloff crosses the threshold at ${KERNEL_REACH} of it.
          gl_PointSize = clamp(2.0 * info.x / ${KERNEL_REACH} * uScale / -mv.z, uMinPx, 2048.0);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        varying float vStrength;
        void main() {
          float d = length(gl_PointCoord - 0.5) * 2.0;
          float v = exp(-4.0 * d * d) * (1.0 - smoothstep(0.85, 1.0, d)) * vStrength;
          gl_FragColor = vec4(v, v, v, 1.0);
        }`,
    });
    this.fixed = new THREE.Points(new THREE.BufferGeometry(), this.maskMaterial);
    this.fixed.frustumCulled = false;
    const movingGeo = new THREE.BufferGeometry();
    const pos = new THREE.BufferAttribute(new Float32Array(MAX_MOVING * 3), 3);
    const info = new THREE.BufferAttribute(new Float32Array(MAX_MOVING * 2), 2);
    pos.setUsage(THREE.DynamicDrawUsage);
    info.setUsage(THREE.DynamicDrawUsage);
    movingGeo.setAttribute('position', pos);
    movingGeo.setAttribute('info', info);
    movingGeo.setDrawRange(0, 0);
    this.moving = new THREE.Points(movingGeo, this.maskMaterial);
    this.moving.frustumCulled = false;
    this.movingAttr = { pos, info };
    this.maskRoot.add(this.fixed, this.moving);
    this.maskRoot.matrixAutoUpdate = false;
    this.maskScene.add(this.maskRoot);

    this.material = new THREE.ShaderMaterial({
      // Drawn in the opaque pass after the stars (render order -4), blended by hand.
      transparent: false,
      depthTest: false,
      depthWrite: false,
      blending: THREE.CustomBlending,
      blendSrc: THREE.SrcAlphaFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
      uniforms: {
        uMask: { value: null },
        uRes: { value: new THREE.Vector2(1, 1) },
        uOpacity: { value: 0 },
        uTime: { value: 0 },
        uOrigin: { value: new THREE.Vector2() },
        uScale0: { value: 10 },
        uScale1: { value: 40 },
        uBlend: { value: 0 },
        uDeep: { value: new THREE.Color('#0a1120') },
        uMist: { value: new THREE.Color('#3b5280') },
        uRim: { value: new THREE.Color('#7fd3e6') },
      },
      vertexShader: /* glsl */ `
        varying vec2 vWorld;
        void main() {
          vec4 w = modelMatrix * vec4(position, 1.0);
          vWorld = w.xz;
          gl_Position = projectionMatrix * viewMatrix * w;
        }`,
      fragmentShader: /* glsl */ `
        precision highp float;
        uniform sampler2D uMask; uniform vec2 uRes; uniform float uOpacity; uniform float uTime; uniform vec2 uOrigin;
        uniform float uScale0; uniform float uScale1; uniform float uBlend;
        uniform vec3 uDeep; uniform vec3 uMist; uniform vec3 uRim;
        varying vec2 vWorld;
        float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
        float noise(vec2 p) {
          vec2 i = floor(p), f = fract(p);
          vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
        }
        float fbm(vec2 p) {
          float v = 0.0, a = 0.5;
          for (int i = 0; i < 5; i++) { v += a * noise(p); p = p * 2.03 + vec2(17.1, 9.2); a *= 0.5; }
          return v;
        }
        void main() {
          float m = texture2D(uMask, gl_FragCoord.xy / uRes).r;
          // Absolute galaxy coordinates (the scene is drawn about a floating origin), in tiles of a
          // zoom-dependent size so the fog keeps its look as you zoom; it drifts slowly.
          vec2 p = vWorld + uOrigin;
          vec2 drift = vec2(uTime * 0.013, -uTime * 0.009);
          float n0 = fbm(mod(p / uScale0, 256.0) + drift);
          float n1 = fbm(mod(p / uScale1, 256.0) + drift * 0.7 + 31.7);
          float n = smoothstep(0.22, 0.78, mix(n0, n1, uBlend));
          // The clearings, added up, cut the fog at 0.5: one soft shape round everything charted.
          float fog = 1.0 - smoothstep(0.38, 0.62, m);
          // Wisps of lighter mist over a deep haze.
          vec3 col = mix(uDeep, uMist, n);
          float a = uOpacity * fog * (0.6 + 0.5 * n);
          // A faint glowing edge where charted space gives way to the fog.
          float rim = smoothstep(0.24, 0.4, m) * (1.0 - smoothstep(0.42, 0.58, m));
          col = mix(col, uRim, rim * 0.5);
          a = max(a, uOpacity * rim * 0.3);
          gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
        }`,
    });
    this.object3d = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), this.material);
    this.object3d.frustumCulled = false;
    this.object3d.renderOrder = -4;
    this.object3d.visible = false;
  }

  update(view: ViewState): void {
    // Clear in the system view; full over the hex, sector and galaxy views.
    const density = this.source.dense ? DENSITY.dense : DENSITY.open;
    // A little thinner across the whole galaxy, so its shape still reads.
    this.opacity = density * fadeIn(view.visibleWidth, 7, 18) * (1 - 0.25 * fadeIn(view.visibleWidth, 8_000, 40_000));
    this.object3d.visible = this.opacity > 0.01;
    if (!this.object3d.visible) return;
    const u = this.material.uniforms;
    u.uOpacity.value = this.opacity;
    u.uTime.value = view.time;
    u.uOrigin.value.set(view.origin.x, view.origin.z);
    const base = Math.max(1, view.visibleWidth * 0.3);
    const level = Math.log(base) / Math.log(4);
    const f = Math.floor(level);
    u.uScale0.value = 4 ** f;
    u.uScale1.value = 4 ** (f + 1);
    u.uBlend.value = level - f;
    // A plane far wider than the view, centred where the camera looks (absolute coordinates: the
    // layer hangs in the origin-shifted world).
    const span = Math.max(view.visibleWidth * 40, 400);
    this.object3d.position.set(view.focus.x, 0.001, view.focus.z);
    this.object3d.scale.set(span, 1, span);
  }

  prerender(renderer: THREE.WebGLRenderer, camera: THREE.Camera): void {
    if (!this.object3d.visible) return;
    renderer.getDrawingBufferSize(this.size);
    const w = Math.max(1, Math.ceil(this.size.x * MASK_SCALE)), h = Math.max(1, Math.ceil(this.size.y * MASK_SCALE));
    if (!this.target || this.target.width !== w || this.target.height !== h) {
      this.target?.dispose();
      this.target = new THREE.WebGLRenderTarget(w, h, { depthBuffer: false, stencilBuffer: false, magFilter: THREE.LinearFilter, minFilter: THREE.LinearFilter });
    }
    if (this.drawnVersion !== this.source.version) this.rebuildFixed();
    this.updateMoving();
    // The mask is drawn in the same space as the map: through the origin-shifted world group.
    this.object3d.parent?.updateWorldMatrix(true, false);
    this.maskRoot.matrix.copy(this.object3d.parent?.matrixWorld ?? new THREE.Matrix4());
    this.maskRoot.matrixWorldNeedsUpdate = true;
    this.maskMaterial.uniforms.uScale.value = pointScale(camera as THREE.PerspectiveCamera, h);
    const before = renderer.getRenderTarget();
    renderer.getClearColor(this.clearColor);
    const alpha = renderer.getClearAlpha();
    renderer.setRenderTarget(this.target);
    renderer.setClearColor(0x000000, 1);
    renderer.clear(true, false, false);
    renderer.render(this.maskScene, camera);
    renderer.setRenderTarget(before);
    renderer.setClearColor(this.clearColor, alpha);
    this.material.uniforms.uMask.value = this.target.texture;
    this.material.uniforms.uRes.value.set(this.size.x, this.size.y);
  }

  private rebuildFixed(): void {
    this.drawnVersion = this.source.version;
    const c = this.source.clearings();
    const n = Math.floor(c.length / 4);
    const pos = new Float32Array(n * 3), info = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = c[i * 4];
      pos[i * 3 + 2] = c[i * 4 + 1];
      info[i * 2] = c[i * 4 + 2];
      info[i * 2 + 1] = c[i * 4 + 3];
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('info', new THREE.BufferAttribute(info, 2));
    this.fixed.geometry.dispose();
    this.fixed.geometry = geo;
  }

  private updateMoving(): void {
    const list = this.source.moving();
    const n = Math.min(MAX_MOVING, list.length);
    const pos = this.movingAttr.pos.array as Float32Array, info = this.movingAttr.info.array as Float32Array;
    for (let i = 0; i < n; i++) {
      pos[i * 3] = list[i].x;
      pos[i * 3 + 1] = 0;
      pos[i * 3 + 2] = list[i].z;
      info[i * 2] = list[i].r;
      info[i * 2 + 1] = 1;
    }
    this.movingAttr.pos.needsUpdate = true;
    this.movingAttr.info.needsUpdate = true;
    this.moving.geometry.setDrawRange(0, n);
  }

  dispose(): void {
    this.target?.dispose();
    this.fixed.geometry.dispose();
    this.moving.geometry.dispose();
    this.maskMaterial.dispose();
    this.material.dispose();
    this.object3d.geometry.dispose();
  }
}
