import * as THREE from 'three';
import { floraOf, type FloraLayer } from '../../../content/flora';
import { smoothstep } from '../../../core/surface/Noise';
import { propGeometry } from './FloraModels';
import { FLORA_FRAG, FLORA_VERT } from './shaders';
import type { SurfaceTerrain } from './SurfaceTerrain';

/**
 * Trees, grass, rocks, bones, ruins and city blocks on the surface (change surface-flora), as the
 * planet type's flora table (src/content/flora.ts) says. One instanced draw per prop kind, placed
 * on the GPU (FLORA_VERT) on a grid anchored to the planet round the detail patch's centre, so
 * they stand on the ground exactly as drawn and come and go with the zoom. Nothing is stored.
 */

/** Each layer's grid: cell size (planet radii), cells across the window, and the camera distance it fades out over. */
const LAYERS: Readonly<Record<FloraLayer['layer'], { spacing: number; k: number; lite: number; fade: readonly [number, number]; salt: number }>> = {
  large: { spacing: 0.0012, k: 96, lite: 56, fade: [0.07, 0.13], salt: 11 },
  small: { spacing: 0.00026, k: 76, lite: 44, fade: [0.014, 0.026], salt: 23 },
};

export class Flora {
  readonly group = new THREE.Group();
  private readonly layers: Array<{ layer: FloraLayer['layer']; materials: THREE.ShaderMaterial[] }> = [];

  constructor(biome: string, terrain: SurfaceTerrain, lite: boolean) {
    for (const def of floraOf(biome)) {
      const grid = LAYERS[def.layer];
      const k = lite ? grid.lite : grid.k;
      const total = def.entries.reduce((n, e) => n + e.weight, 0);
      let lo = 0;
      const materials: THREE.ShaderMaterial[] = [];
      for (const e of def.entries) {
        const hi = lo + e.weight / total;
        const material = new THREE.ShaderMaterial({
          vertexShader: FLORA_VERT, fragmentShader: FLORA_FRAG, vertexColors: true, side: THREE.DoubleSide,
          uniforms: {
            // The terrain's own uniforms (shared objects): the height function, the patch, the sun.
            ...terrain.uniforms,
            uSpacing: { value: grid.spacing }, uK: { value: k }, uFill: { value: def.fill }, uLo: { value: lo }, uHi: { value: hi },
            uSizeA: { value: e.size[0] }, uSizeB: { value: e.size[1] }, uCluster: { value: e.cluster ?? 0 }, uClusterFreq: { value: e.clusterFreq ?? 60 },
            uSalt: { value: grid.salt }, uLiving: { value: e.living ? 1 : 0 }, uStretch: { value: e.stretch ?? 1 }, uSway: { value: e.sway ?? 0 },
            uFlora: { value: 0 }, uColA: { value: new THREE.Color(e.colors[0]) }, uColB: { value: new THREE.Color(e.colors[1]) },
            uGlowCol: { value: new THREE.Color(e.glow ?? '#000000') }, uNightGlow: { value: e.nightGlow ? 1 : 0 }, uWet: { value: e.wet ?? 0 },
          },
        });
        const shape = propGeometry(e.kind);
        const geo = new THREE.InstancedBufferGeometry().copy(shape as THREE.InstancedBufferGeometry);
        shape.dispose();
        geo.instanceCount = k * k;
        const mesh = new THREE.Mesh(geo, material);
        mesh.frustumCulled = false;
        mesh.renderOrder = 1;
        this.group.add(mesh);
        materials.push(material);
        lo = hi;
      }
      this.layers.push({ layer: def.layer, materials });
    }
  }

  /** Fade each layer in by the camera's distance from the ground point it looks at. */
  update(d: number): void {
    let any = false;
    for (const { layer, materials } of this.layers) {
      const [near, far] = LAYERS[layer].fade;
      const f = 1 - smoothstep(near, far, d);
      for (const m of materials) m.uniforms.uFlora.value = f;
      any ||= f > 0;
    }
    this.group.visible = any;
  }

  dispose(): void {
    this.group.traverse((o) => { if (o instanceof THREE.Mesh) { o.geometry.dispose(); (o.material as THREE.Material).dispose(); } });
  }
}
