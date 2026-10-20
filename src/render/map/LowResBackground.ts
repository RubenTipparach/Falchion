import * as THREE from 'three';
import type { MapLayer, ViewState } from './MapLayer';

/**
 * Draws expensive, smooth background layers (the nebula and galaxy-disc shaders) into a small
 * offscreen buffer and stretches it over the screen. Those layers run hundreds of noise
 * lookups per pixel; at a third of the resolution a phone GPU does about a tenth of the work,
 * and soft clouds look the same.
 *
 * The wrapped layers must blend additively over the background (they do): the buffer then
 * holds exactly what they would have added, and the full-screen quad adds it back.
 */
/** With the view still, the drifting clouds are redrawn this often (ms). */
const REDRAW_STILL_MS = 100;

export class LowResBackground implements MapLayer {
  readonly object3d: THREE.Mesh;
  private readonly scene = new THREE.Scene();
  /** Floating origin, as MapView's world group: layers placed in galaxy coordinates sit under it. */
  private readonly world = new THREE.Group();
  private target: THREE.WebGLRenderTarget | null = null;
  private readonly composite: THREE.ShaderMaterial;
  private readonly size = new THREE.Vector2();
  /** The camera the buffer was last drawn with, and when: it is only redrawn when the view moves, or a few times a second for the slow drift. */
  private readonly lastCam = new THREE.Matrix4();
  private readonly lastProj = new THREE.Matrix4();
  private lastDrawn = -Infinity;
  private readonly lastOrigin = new THREE.Vector3();

  /** `scale`: buffer size as a fraction of the drawing buffer, per axis (e.g. 0.35). */
  constructor(private readonly layers: readonly MapLayer[], private readonly scale: number) {
    this.scene.add(this.world);
    for (const l of layers) this.world.add(l.object3d);
    this.composite = new THREE.ShaderMaterial({
      uniforms: { tMap: { value: null } },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D tMap; varying vec2 vUv;
        void main() { gl_FragColor = vec4(texture2D(tMap, vUv).rgb, 1.0); }`,
      depthTest: false,
      depthWrite: false,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneFactor,
    });
    this.object3d = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.composite);
    this.object3d.frustumCulled = false;
    this.object3d.renderOrder = -9;
  }

  update(view: ViewState): void {
    this.world.position.set(-view.origin.x, 0, -view.origin.z);
    for (const l of this.layers) l.update(view);
    this.object3d.visible = this.layers.some((l) => l.object3d.visible);
  }

  /** Render the wrapped layers into the small buffer; MapView calls this before the main render. */
  prerender(renderer: THREE.WebGLRenderer, camera: THREE.Camera): void {
    if (!this.object3d.visible) return;
    renderer.getDrawingBufferSize(this.size);
    const w = Math.max(1, Math.round(this.size.x * this.scale)), h = Math.max(1, Math.round(this.size.y * this.scale));
    const now = performance.now();
    const still = this.target?.width === w && this.target.height === h
      && this.lastCam.equals(camera.matrixWorld) && this.lastProj.equals(camera.projectionMatrix) && this.world.position.equals(this.lastOrigin);
    if (still && now - this.lastDrawn < REDRAW_STILL_MS) return;
    this.lastCam.copy(camera.matrixWorld);
    this.lastProj.copy(camera.projectionMatrix);
    this.lastOrigin.copy(this.world.position);
    this.lastDrawn = now;
    if (!this.target) {
      // Half floats where the GPU can render to them: soft gradients without 8-bit banding.
      const half = renderer.extensions.has('EXT_color_buffer_half_float') || renderer.extensions.has('EXT_color_buffer_float');
      this.target = new THREE.WebGLRenderTarget(w, h, { type: half ? THREE.HalfFloatType : THREE.UnsignedByteType, depthBuffer: false, stencilBuffer: false });
      this.composite.uniforms.tMap.value = this.target.texture;
    } else if (this.target.width !== w || this.target.height !== h) {
      this.target.setSize(w, h);
    }
    const before = renderer.getRenderTarget();
    const clear = renderer.getClearColor(new THREE.Color());
    const alpha = renderer.getClearAlpha();
    renderer.setRenderTarget(this.target);
    renderer.setClearColor(0x000000, 0);
    renderer.clear(true, false, false);
    renderer.render(this.scene, camera);
    renderer.setRenderTarget(before);
    renderer.setClearColor(clear, alpha);
  }

  dispose(): void {
    for (const l of this.layers) l.dispose();
    this.target?.dispose();
    this.object3d.geometry.dispose();
    this.composite.dispose();
  }
}
