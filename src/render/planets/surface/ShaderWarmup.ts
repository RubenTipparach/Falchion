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
 * One program at a time: the next is handed to the driver only once the last has finished, with
 * a pause between. Handing them all over at once (as this first did) had Chrome's GPU process
 * compile 75 at a time on Windows, which froze every tab, not just the game. With
 * KHR_parallel_shader_compile the wait is a poll that never blocks; without it, asking for the
 * link status finishes the one compile then and there, a short stall. The materials are kept:
 * three.js deletes a program once no material uses it.
 */
export class ShaderWarmup {
  total = 0;
  ready = 0;
  private readonly keep: THREE.Material[] = [];
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
    // Every object that draws (its program can depend on the object as well as the material).
    const jobs: Array<{ object: THREE.Object3D; target: boolean }> = [];
    const holders = new Set(flora.group.children.filter((o) => !o.visible));
    scene.traverse((o) => {
      const m = (o as THREE.Mesh).material;
      if (!m) return;
      this.keep.push(...(Array.isArray(m) ? m : [m]));
      // The placement pass draws into a float target, which its program is keyed by too.
      jobs.push({ object: o, target: holders.has(o) });
    });
    this.total = jobs.length;
    this.ready = 0;
    this.emit();
    const gl = renderer.getContext();
    const parallel = renderer.extensions.has('KHR_parallel_shader_compile');
    const COMPLETION_STATUS = 0x91b1;
    const props = renderer.properties as unknown as { get(m: THREE.Material): { currentProgram?: { program: WebGLProgram } } };
    const lights = new THREE.Scene();
    const target = new THREE.WebGLRenderTarget(4, 4, { type: THREE.FloatType, depthBuffer: false });
    const finished = new Set<WebGLProgram>();
    let waiting: WebGLProgram[] = [];
    let handed = 0;
    // Compile only while the tab is shown and the player is not in the middle of moving the view.
    let touched = 0;
    const touch = () => { touched = performance.now(); };
    for (const e of ['pointerdown', 'pointermove', 'wheel', 'keydown', 'touchmove']) window.addEventListener(e, touch, { passive: true });
    const later = (fn: () => void, ms: number) => setTimeout(() => (document.hidden || performance.now() - touched < 1200 ? later(fn, 400) : fn()), ms);
    const step = () => {
      // Wait out the programs last handed over.
      if (parallel) waiting = waiting.filter((p) => !gl.getProgramParameter(p, COMPLETION_STATUS));
      else for (const p of waiting.splice(0)) gl.getProgramParameter(p, gl.LINK_STATUS);
      if (waiting.length) return later(step, 100);
      // Hand over the next new program; materials whose program is already built count straight in.
      while (jobs.length && !waiting.length) {
        const job = jobs.shift()!;
        const before = renderer.getRenderTarget();
        if (job.target) renderer.setRenderTarget(target);
        const materials = renderer.compile(job.object, camera, lights);
        renderer.setRenderTarget(before);
        for (const m of materials) {
          const p = props.get(m).currentProgram?.program;
          if (p && !finished.has(p)) { finished.add(p); waiting.push(p); }
        }
        handed++;
      }
      // A job counts once its program is built.
      this.ready = waiting.length ? handed - 1 : handed;
      this.emit();
      if (jobs.length || waiting.length) later(step, waiting.length ? 150 : 0);
      else {
        target.dispose();
        for (const e of ['pointerdown', 'pointermove', 'wheel', 'keydown', 'touchmove']) window.removeEventListener(e, touch);
        // Programs do not need the geometry: free it, keep the materials.
        scene.traverse((o) => { if ((o as THREE.Mesh).geometry) (o as THREE.Mesh).geometry.dispose(); });
      }
    };
    later(step, 50);
  }

  private emit(): void {
    for (const fn of this.listeners) fn(this.ready, this.total);
  }
}
