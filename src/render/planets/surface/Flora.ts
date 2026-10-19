import * as THREE from 'three';
import { floraOf, type FloraLayer } from '../../../content/flora';
import { smoothstep } from '../../../core/surface/Noise';
import { propGeometry } from './FloraModels';
import { floraWindow, listCells, type V3 } from './floraCells';
import { FLORA_FRAG, FLORA_PLACE_FRAG, FLORA_PLACE_VERT, FLORA_VERT, MAX_FLORA_KINDS } from './shaders';
import type { SurfaceTerrain } from './SurfaceTerrain';

/**
 * Trees, grass, rocks, bones, ruins and city blocks on the surface (change surface-flora), as the
 * planet type's flora table (src/content/flora.ts) says. One instanced draw per prop kind on a grid
 * anchored to the planet round the detail patch's centre, so they stand on the ground exactly as
 * drawn and come and go with the zoom. Nothing is stored.
 *
 * Kept cheap (change surface-perf): each layer works out where its cells' props stand once a cell,
 * on the GPU, into a small float texture (FLORA_PLACE_FRAG) that the props read, rather than once a
 * vertex; and each kind draws only the cells the CPU lists for it (floraCells.ts), not the whole
 * window. Before both, a bone world ran a hundred million vertices a frame, each evaluating the
 * terrain.
 */

/** Each layer's grid: cell size (planet radii), cells across the window, and the camera distance it fades out over. */
const LAYERS: Readonly<Record<FloraLayer['layer'], { spacing: number; k: number; lite: number; fade: readonly [number, number]; salt: number }>> = {
  large: { spacing: 0.0012, k: 96, lite: 56, fade: [0.07, 0.13], salt: 11 },
  small: { spacing: 0.00026, k: 76, lite: 44, fade: [0.014, 0.026], salt: 23 },
};

interface Layer {
  readonly def: FloraLayer;
  readonly k: number;
  readonly uniforms: Record<string, THREE.IUniform>;
  readonly kinds: Array<{ mesh: THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial>; cells: THREE.InstancedBufferAttribute }>;
  /** The cells listed for this window: face and first cell, as a key. */
  window: string;
  target: THREE.WebGLRenderTarget | null;
}

export class Flora {
  readonly group = new THREE.Group();
  private readonly layers: Layer[] = [];
  /** Placement on the GPU (needs float render targets); decided at the first update with a renderer. */
  private placed: boolean | null = null;
  private readonly quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
  private readonly quadCam = new THREE.Camera();

  constructor(biome: string, private readonly terrain: SurfaceTerrain, lite: boolean) {
    this.quad.frustumCulled = false;
    for (const def of floraOf(biome)) {
      const grid = LAYERS[def.layer];
      const k = lite ? grid.lite : grid.k;
      const total = def.entries.reduce((n, e) => n + e.weight, 0);
      const entries = def.entries.slice(0, MAX_FLORA_KINDS);
      const pad = (f: (e: (typeof entries)[number], lo: number, hi: number) => number) => {
        let lo = 0;
        const out = entries.map((e) => { const hi = lo + e.weight / total; const v = f(e, lo, hi); lo = hi; return v; });
        return [...out, ...Array(MAX_FLORA_KINDS - out.length).fill(0)];
      };
      // A layer's own uniforms, shared by its placement pass and every kind it draws.
      const uniforms: Record<string, THREE.IUniform> = {
        // The terrain's own uniforms (shared objects): the height function, the patch, the sun.
        ...terrain.uniforms,
        uSpacing: { value: grid.spacing }, uK: { value: k }, uFill: { value: def.fill }, uSalt: { value: grid.salt }, uFlora: { value: 0 },
        uELo: { value: pad((_e, lo) => lo) }, uEHi: { value: pad((_e, _lo, hi) => hi) },
        uELiving: { value: pad((e) => (e.living ? 1 : 0)) }, uEWet: { value: pad((e) => e.wet ?? 0) },
        uECluster: { value: pad((e) => e.cluster ?? 0) }, uEClusterFreq: { value: pad((e) => e.clusterFreq ?? 60) },
        uEN: { value: entries.length }, uPlace: { value: null },
      };
      const cap = (k + 2) * (k + 2);
      const kinds = entries.map((e, i) => {
        const material = new THREE.ShaderMaterial({
          vertexShader: FLORA_VERT, fragmentShader: FLORA_FRAG, vertexColors: true, side: THREE.DoubleSide,
          uniforms: {
            ...uniforms,
            uEntry: { value: i }, uSizeA: { value: e.size[0] }, uSizeB: { value: e.size[1] }, uStretch: { value: e.stretch ?? 1 }, uSway: { value: e.sway ?? 0 },
            uColA: { value: new THREE.Color(e.colors[0]) }, uColB: { value: new THREE.Color(e.colors[1]) },
            uGlowCol: { value: new THREE.Color(e.glow ?? '#000000') }, uNightGlow: { value: e.nightGlow ? 1 : 0 },
          },
        });
        const shape = propGeometry(e.kind);
        const geo = new THREE.InstancedBufferGeometry().copy(shape as THREE.InstancedBufferGeometry);
        shape.dispose();
        const cells = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
        cells.setUsage(THREE.DynamicDrawUsage);
        geo.setAttribute('aCell', cells);
        geo.instanceCount = 0;
        const mesh = new THREE.Mesh(geo, material);
        mesh.frustumCulled = false;
        mesh.renderOrder = 1;
        this.group.add(mesh);
        return { mesh, cells };
      });
      this.layers.push({ def, k, uniforms, kinds, window: '', target: null });
    }
  }

  /**
   * Before drawing: fade each layer in by the camera's distance `d` from the ground point it looks
   * at, list the cells of a window that has moved, and (given the renderer) place the props.
   */
  update(d: number, renderer?: THREE.WebGLRenderer): void {
    if (renderer && this.placed === null) this.choosePath(renderer);
    let any = false;
    const pc = this.terrain.uniforms.uPC.value as THREE.Vector3;
    const patchOn = this.terrain.uniforms.uPatchOn.value > 0.5;
    for (const layer of this.layers) {
      const [near, far] = LAYERS[layer.def.layer].fade;
      const f = 1 - smoothstep(near, far, d);
      layer.uniforms.uFlora.value = f;
      const on = f > 0 && patchOn;
      for (const { mesh } of layer.kinds) mesh.visible = on;
      if (!on) continue;
      any = true;
      this.listWindow(layer, [pc.x, pc.y, pc.z]);
      if (this.placed && renderer) this.place(layer, renderer);
    }
    this.group.visible = any;
  }

  /** The cells each kind draws, when the window has moved to new cells. */
  private listWindow(layer: Layer, pc: V3): void {
    const { spacing, salt } = LAYERS[layer.def.layer];
    const win = floraWindow(pc, spacing, layer.k);
    const key = `${win.face}:${win.ox}:${win.oy}`;
    if (key === layer.window) return;
    layer.window = key;
    const lo = layer.uniforms.uELo.value as number[], hi = layer.uniforms.uEHi.value as number[];
    const entries = layer.kinds.map((_, i) => ({ lo: lo[i], hi: hi[i] }));
    const counts = listCells(win, layer.k, salt, layer.def.fill, entries, layer.kinds.map((x) => x.cells.array as Float32Array));
    layer.kinds.forEach(({ mesh, cells }, i) => {
      mesh.geometry.instanceCount = counts[i];
      cells.clearUpdateRanges();
      cells.addUpdateRange(0, counts[i] * 3);
      cells.needsUpdate = true;
    });
  }

  /** Where each cell's prop stands, a texel a cell (FLORA_PLACE_FRAG). */
  private place(layer: Layer, renderer: THREE.WebGLRenderer): void {
    if (!layer.target) {
      layer.target = new THREE.WebGLRenderTarget(layer.k, layer.k, { type: THREE.FloatType, format: THREE.RGBAFormat, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: false });
      layer.uniforms.uPlace.value = layer.target.texture;
    }
    this.quad.material = placeMaterial(layer);
    const before = renderer.getRenderTarget();
    renderer.setRenderTarget(layer.target);
    renderer.render(this.quad, this.quadCam);
    renderer.setRenderTarget(before);
  }

  /** Placement on the GPU where float render targets work (WebGL 2 with EXT_color_buffer_float). */
  private choosePath(renderer: THREE.WebGLRenderer): void {
    this.placed = renderer.capabilities.isWebGL2 && renderer.extensions.has('EXT_color_buffer_float');
    if (!this.placed) return;
    for (const layer of this.layers) for (const { mesh } of layer.kinds) {
      mesh.material.defines = { ...mesh.material.defines, PLACED: 1 };
      mesh.material.needsUpdate = true;
    }
  }

  dispose(): void {
    this.group.traverse((o) => { if (o instanceof THREE.Mesh) { o.geometry.dispose(); (o.material as THREE.Material).dispose(); } });
    for (const layer of this.layers) {
      layer.target?.dispose();
      placeMaterials.get(layer)?.dispose();
    }
    this.quad.geometry.dispose();
  }
}

const placeMaterials = new WeakMap<Layer, THREE.ShaderMaterial>();
function placeMaterial(layer: Layer): THREE.ShaderMaterial {
  let m = placeMaterials.get(layer);
  if (!m) {
    m = new THREE.ShaderMaterial({ vertexShader: FLORA_PLACE_VERT, fragmentShader: FLORA_PLACE_FRAG, uniforms: layer.uniforms, depthTest: false, depthWrite: false });
    placeMaterials.set(layer, m);
  }
  return m;
}
