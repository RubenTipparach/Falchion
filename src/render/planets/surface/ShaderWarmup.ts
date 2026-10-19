import * as THREE from 'three';
import { BIOMES } from '../../../content/biomes';
import { PLANET_LOOKS } from '../../../content/planetLooks';
import { hashSeed } from '../../../core/rng/Rng';
import { surfaceLookOf, type SurfaceLook } from '../../../core/surface/Terrain';
import { atmosphereDefines } from '../atmosphere.glsl';
import { createPlanetMaterial } from '../PlanetMaterial';
import { planetLayout } from '../planetLayouts';
import { Flora } from './Flora';
import { Settlements } from './Settlements';
import { RoadMesh } from './RoadMesh';
import { FULL_QUALITY, LITE_QUALITY, SurfaceTerrain } from './SurfaceTerrain';

/**
 * Compiles every shader a planet's close-up can use, and the system view's planet spheres, up front
 * (change surface-perf), so zooming into a planet never stops to compile: one terrain for each mix of shader switches the planet
 * types use (city, machine, circuit and bone patterns, glowing seas, glitter, auroras, storms,
 * haze), the props, the towers, the city's traffic and the props' placement pass.
 *
 * With KHR_parallel_shader_compile (Chrome on Windows has it) the driver compiles them all off
 * the main thread and this only counts them in. Without it, a program's compile finishes when
 * the game first asks how it went, so this asks one program a frame: short stalls behind a
 * progress bar, instead of one long freeze on the first zoom. The materials are kept: three.js
 * deletes a program once no material uses it.
 */
export class ShaderWarmup {
  total = 0;
  ready = 0;
  private readonly keep: THREE.Material[] = [];
  private pending: Array<{ material: THREE.Material; program: WebGLProgram }> = [];
  private listeners: Array<(ready: number, total: number) => void> = [];

  get done(): boolean {
    return this.total > 0 && this.ready >= this.total;
  }

  onProgress(fn: (ready: number, total: number) => void): void {
    this.listeners.push(fn);
  }

  start(renderer: THREE.WebGLRenderer, lite: boolean): void {
    const quality = lite ? LITE_QUALITY : FULL_QUALITY;
    const camera = new THREE.PerspectiveCamera();
    const scene = new THREE.Scene();
    // One terrain for each mix of switches; the rest of a close-up's shaders are the same for all.
    const seen = new Set<string>();
    for (const b of BIOMES) {
      if (b.id === 'gas' || b.megastructure) continue;
      const look: SurfaceLook = surfaceLookOf(PLANET_LOOKS[b.id] ?? PLANET_LOOKS.barren, hashSeed(`warmup:${b.id}`, 'surface'));
      const key = JSON.stringify([look.pattern ?? '', !!look.seaGlow, !!look.glitter, atmosphereDefines(look), look.clouds > 0.01 || !!look.haze || !!look.lightning, !!look.aurora, look.atmosphereStrength > 0]);
      if (seen.has(key)) continue;
      seen.add(key);
      const terrain = new SurfaceTerrain(look, [], quality, null);
      scene.add(terrain.group);
      // The globe's material is only put in the scene once a globe is baked: a stand-in carries it.
      scene.add(new THREE.Mesh(new THREE.BufferGeometry(), terrain.globeMaterial));
    }
    // The planets as the system view draws them, one of each type (a few defines between them).
    for (const b of BIOMES) {
      if (b.megastructure) continue;
      scene.add(new THREE.Mesh(new THREE.BufferGeometry(), createPlanetMaterial(PLANET_LOOKS[b.id] ?? PLANET_LOOKS.barren, hashSeed(`warmup:${b.id}`, 'surface'))));
    }
    // A capital with its buildings, towers, traffic and props.
    const colony = { owner: 'own' as const, name: 'Warmup', capital: true, size: 4, pop: 3, buildings: ['shipyard', 'farm', 'mine', 'lab', 'trade-hub', 'manufactory', 'temple'] };
    const { look, layout } = planetLayout({ id: 'warmup:terran/1', biome: 'terran' }, colony);
    const terrain = new SurfaceTerrain(look, layout.settlements, quality, null);
    scene.add(new Settlements(layout, terrain, lite).group);
    const roads = new RoadMesh(layout.roads, terrain);
    if (roads.mesh) scene.add(roads.mesh);
    const flora = new Flora('jungle', terrain, lite, renderer);
    scene.add(flora.group);
    const materials = [...renderer.compile(scene, camera)];
    // The placement pass draws into a float target, which its program is keyed by too.
    const holders = flora.group.children.filter((o) => !o.visible) as THREE.Mesh[];
    if (holders.length) {
      const target = new THREE.WebGLRenderTarget(4, 4, { type: THREE.FloatType, depthBuffer: false });
      const before = renderer.getRenderTarget();
      renderer.setRenderTarget(target);
      const placeScene = new THREE.Scene();
      for (const h of holders) placeScene.add(new THREE.Mesh(h.geometry, h.material));
      materials.push(...renderer.compile(placeScene, camera));
      renderer.setRenderTarget(before);
      target.dispose();
    }
    // Programs do not need the geometry: free it, keep the materials.
    scene.traverse((o) => { if ((o as THREE.Mesh).geometry) (o as THREE.Mesh).geometry.dispose(); });
    const props = renderer.properties as unknown as { get(m: THREE.Material): { currentProgram?: { program: WebGLProgram } } };
    this.pending = [];
    for (const m of new Set(materials)) {
      this.keep.push(m);
      const p = props.get(m).currentProgram?.program;
      if (p) this.pending.push({ material: m, program: p });
    }
    this.total = this.pending.length;
    this.ready = 0;
    this.emit();
    const gl = renderer.getContext();
    const parallel = renderer.extensions.has('KHR_parallel_shader_compile');
    const COMPLETION_STATUS = 0x91b1;
    const step = () => {
      if (parallel) {
        // Count in what the driver has finished; never block.
        this.pending = this.pending.filter((x) => !gl.getProgramParameter(x.program, COMPLETION_STATUS));
      } else {
        // Finish one compile a frame (asking for the link status waits for it).
        const x = this.pending.shift();
        if (x) gl.getProgramParameter(x.program, gl.LINK_STATUS);
      }
      this.ready = this.total - this.pending.length;
      this.emit();
      if (this.pending.length) setTimeout(step, parallel ? 100 : 30);
    };
    setTimeout(step, 50);
  }

  private emit(): void {
    for (const fn of this.listeners) fn(this.ready, this.total);
  }
}
