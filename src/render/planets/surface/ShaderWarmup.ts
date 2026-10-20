import * as THREE from 'three';
import { BIOMES } from '../../../content/biomes';
import { PLANET_LOOKS } from '../../../content/planetLooks';
import { hashSeed } from '../../../core/rng/Rng';
import { surfaceLookOf, type SurfaceLook } from '../../../core/surface/Terrain';
import { atmosphereDefines } from '../atmosphere.glsl';
import { MEGASTRUCTURES } from '../../../content/megastructures';
import type { StarKind, StarSystem } from '../../../core/galaxy/GalaxyModel';
import { AsteroidBelt } from '../../map/AsteroidBelts';
import { createMegaVisual } from '../../megastructures/MegaVisuals';
import { createStarVisual } from '../../stars/StarVisuals';
import { createPlanetMaterial, createRingMaterial } from '../PlanetMaterial';
import { primePrograms, type ThreeProgram } from '../../programs';
import { planetLayout } from '../planetLayouts';
import { Flora } from './Flora';
import { Settlements } from './Settlements';
import { RoadMesh } from './RoadMesh';
import { FULL_QUALITY, LITE_QUALITY, SurfaceTerrain } from './SurfaceTerrain';

/**
 * Compiles every shader the system view and a planet's close-up can use, up front (change
 * surface-perf), so zooming in never stops to compile. The system view: its planets, stars,
 * megastructures and belts, against the map's lights. The close-up: one terrain for each mix of
 * shader switches the planet types use (city, machine, circuit and bone patterns, glowing seas,
 * glitter, auroras, storms, haze), the props, the towers, the city's traffic and the props'
 * placement pass.
 *
 * One program at a time: the next is handed to the driver only once the last has finished, with
 * a pause between. Handing them all over at once (as this first did) had Chrome's GPU process
 * compile 75 at a time on Windows, which froze every tab, not just the game. With
 * KHR_parallel_shader_compile the wait is a poll that never blocks; without it, asking for the
 * link status finishes the one compile then and there, a short stall. The materials are kept:
 * three.js deletes a program once no material uses it.
 */
/** What decides a material's program, near enough (three.js's own key is longer). */
function shaderKey(m: THREE.Material): string {
  const common = [m.type, m.side, m.vertexColors, m.alphaTest > 0, m.toneMapped, m.premultipliedAlpha, m.dithering, m.customProgramCacheKey()];
  if (m instanceof THREE.ShaderMaterial) return [...common, m.vertexShader, m.fragmentShader, JSON.stringify(m.defines ?? {})].join('#');
  const maps = ['map', 'alphaMap', 'emissiveMap', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'envMap', 'bumpMap'].map((k) => !!(m as unknown as Record<string, unknown>)[k]);
  return [...common, ...maps, (m as THREE.MeshStandardMaterial).flatShading, (m as THREE.MeshBasicMaterial).fog, (m as THREE.SpriteMaterial).sizeAttenuation].join('#');
}

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

  /** `mapScene` is the scene the system view draws in: its lights are part of every program's key there. */
  start(renderer: THREE.WebGLRenderer, lite: boolean, mapScene: THREE.Scene): void {
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
    // The system view, compiled with the map's lights: the planets, one of each type (a few
    // defines between them), a ring, an orbit, every kind of star, each megastructure, each belt.
    const system = new THREE.Group();
    for (const b of BIOMES) {
      if (b.megastructure) continue;
      system.add(new THREE.Mesh(new THREE.BufferGeometry(), createPlanetMaterial(PLANET_LOOKS[b.id] ?? PLANET_LOOKS.barren, hashSeed(`warmup:${b.id}`, 'surface'))));
    }
    system.add(new THREE.Mesh(new THREE.BufferGeometry(), createRingMaterial('#c8b89a', 1)));
    system.add(new THREE.LineLoop(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: '#7fd3e6', transparent: true, opacity: 0.2, depthWrite: false })));
    const kinds: StarKind[] = ['main', 'giant', 'white-dwarf', 'brown-dwarf', 'neutron', 'pulsar', 'black-hole', 'smbh'];
    const stars = kinds.map((kind): StarSystem => ({ id: `warmup:${kind}`, hex: { q: 0, r: 0 }, name: '', spectral: 'G', planetCount: 0, kind, position: { x: 0, y: 0, z: 0 } }));
    stars.push({ ...stars[0], id: 'warmup:binary', companions: ['K'] });
    const light = new THREE.Color('#ffffff');
    for (const star of stars) system.add(createStarVisual(star).object3d);
    for (const m of MEGASTRUCTURES) system.add(createMegaVisual(m.id, { seed: 1, light, clearance: 0.01 }).object3d);
    for (const resource of ['metals', 'gases', 'crystals'] as const) {
      system.add(new AsteroidBelt({ id: `warmup#${resource}`, starId: 'warmup', resource, capacity: 600 }, { radius: 0.1, halfWidth: 0.009 }, light).object3d);
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
    // Every object that draws (its program can depend on the object as well as the material, and
    // on the lights of the scene it is drawn in, even for a material that ignores them).
    const lights = new THREE.Scene();
    const jobs: Array<{ object: THREE.Object3D; target: boolean; lights: THREE.Scene }> = [];
    const holders = new Set(flora.group.children.filter((o) => !o.visible));
    const props = renderer.properties as unknown as { get(m: THREE.Material): { currentProgram?: ThreeProgram } };
    const once = new Set<THREE.Material>();
    const sources = new Set<string>();
    const collect = (root: THREE.Object3D, inScene: THREE.Scene, oncePerMaterial = false) => root.traverse((o) => {
      const m = (o as THREE.Mesh).material;
      if (!m) return;
      const mats = Array.isArray(m) ? m : [m];
      // The map's own objects: only those not drawn yet (their programs not built).
      if (oncePerMaterial && mats.every((x) => once.has(x) || props.get(x).currentProgram)) return;
      for (const x of mats) once.add(x);
      // Many objects share a shader (every glow, every hull of a kind): one of each is enough.
      // A variant missed here is no stall: the system view and the close-up compile anything new
      // in the background before they show it.
      const key = [o.type, inScene.uuid, holders.has(o), !!(o as THREE.InstancedMesh).instanceColor, ...mats.map(shaderKey)].join('|');
      if (sources.has(key)) return;
      sources.add(key);
      this.keep.push(...mats);
      // The placement pass draws into a float target, which its program is keyed by too.
      jobs.push({ object: o, target: holders.has(o), lights: inScene });
    });
    // The system view first: it is where a zoom goes before any close-up. Then whatever the map
    // holds hidden until a zoom shows it (the nebula sky round a system).
    collect(system, mapScene);
    collect(mapScene, mapScene, true);
    collect(scene, lights);
    this.total = jobs.length;
    this.ready = 0;
    this.emit();
    const gl = renderer.getContext();
    const parallel = renderer.extensions.has('KHR_parallel_shader_compile');
    const COMPLETION_STATUS = 0x91b1;
    const target = new THREE.WebGLRenderTarget(4, 4, { type: THREE.FloatType, depthBuffer: false });
    const finished = new Set<WebGLProgram>();
    let waiting: WebGLProgram[] = [];
    let built: ThreeProgram[] = [];
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
      // Read back what three.js reads on a program's first use, now rather than mid-zoom.
      primePrograms(built.splice(0));
      // Hand over the next new program; materials whose program is already built count straight in.
      while (jobs.length && !waiting.length) {
        const job = jobs.shift()!;
        const before = renderer.getRenderTarget();
        if (job.target) renderer.setRenderTarget(target);
        const materials = renderer.compile(job.object, camera, job.lights);
        renderer.setRenderTarget(before);
        for (const m of materials) {
          const program = props.get(m).currentProgram;
          const p = program?.program;
          if (p && !finished.has(p)) { finished.add(p); waiting.push(p); built.push(program); }
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
        for (const root of [scene, system]) root.traverse((o) => { if ((o as THREE.Mesh).geometry) (o as THREE.Mesh).geometry.dispose(); });
      }
    };
    later(step, 50);
  }

  private emit(): void {
    for (const fn of this.listeners) fn(this.ready, this.total);
  }
}
