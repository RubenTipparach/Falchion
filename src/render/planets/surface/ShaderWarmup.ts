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

/** What decides a material's program, near enough (three.js's own key is longer). */
function shaderKey(m: THREE.Material): string {
  const common = [m.type, m.side, m.vertexColors, m.alphaTest > 0, m.toneMapped, m.premultipliedAlpha, m.dithering, m.customProgramCacheKey()];
  if (m instanceof THREE.ShaderMaterial) return [...common, m.vertexShader, m.fragmentShader, JSON.stringify(m.defines ?? {})].join('#');
  const maps = ['map', 'alphaMap', 'emissiveMap', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'envMap', 'bumpMap'].map((k) => !!(m as unknown as Record<string, unknown>)[k]);
  return [...common, ...maps, (m as THREE.MeshStandardMaterial).flatShading, (m as THREE.MeshBasicMaterial).fog, (m as THREE.SpriteMaterial).sizeAttenuation].join('#');
}

/** Which close-up terrain a look draws with: one program for each mix of these switches. */
export function terrainVariant(look: SurfaceLook): string {
  return JSON.stringify([look.pattern ?? '', !!look.seaGlow, !!look.glitter, atmosphereDefines(look), look.clouds > 0.01 || !!look.haze || !!look.lightning, !!look.aurora, look.atmosphereStrength > 0]);
}

/** One object to compile, and which part of the game it belongs to. */
interface Job {
  readonly object: THREE.Object3D;
  /** Compiled into a float target (the props' placement pass), which its program is keyed by. */
  readonly target: boolean;
  readonly lights: THREE.Scene;
  /** 'system', 'map', 'closeup' (what every close-up shares) or a terrain variant. */
  readonly group: string;
}

/**
 * Compiles every shader the system view and a planet's close-up can use, up front (change
 * surface-perf), so zooming in never stops to compile. The system view: its planets, stars,
 * megastructures and belts, against the map's lights. The close-up: one terrain for each mix of
 * shader switches the planet types use (city, machine, circuit and bone patterns, glowing seas,
 * glitter, auroras, storms, haze), the props, the towers, the city's traffic and the props'
 * placement pass.
 *
 * A couple of programs at a time: the next only once the last have finished, with a pause between.
 * Handing them all over at once (as this first did) had Chrome's GPU process compile 75 together on
 * Windows, which froze every tab, not just the game. A close-up asked for (readyFor) jumps the
 * queue. With KHR_parallel_shader_compile the wait is a poll that never blocks; without it, asking
 * for the link status finishes the one compile then and there, a short stall. The materials are
 * kept: three.js deletes a program once no material uses it.
 */
export class ShaderWarmup {
  total = 0;
  ready = 0;
  private readonly keep: THREE.Material[] = [];
  private listeners: Array<(ready: number, total: number) => void> = [];
  private jobs: Job[] = [];
  /** Jobs not yet compiled (queued or in flight), by group. */
  private readonly left = new Map<string, number>();
  private readonly size = new Map<string, number>();
  private urgentUntil = 0;

  get done(): boolean {
    return this.total > 0 && this.ready >= this.total;
  }

  onProgress(fn: (ready: number, total: number) => void): void {
    this.listeners.push(fn);
  }

  /**
   * Whether a planet with this look can open its close-up: what every close-up shares and its own
   * terrain are compiled. Asking moves them to the front of the queue.
   */
  readyFor(look: SurfaceLook): boolean {
    if (this.done) return true;
    if (!this.total) return false;
    const groups = ['closeup', terrainVariant(look)];
    const front = this.jobs.filter((j) => groups.includes(j.group));
    if (front.length && this.jobs[0] !== front[0]) this.jobs = [...front, ...this.jobs.filter((j) => !groups.includes(j.group))];
    const ready = groups.every((g) => !this.left.get(g));
    // Wanted now: keep compiling while the player moves the view.
    if (!ready) this.urgentUntil = performance.now() + 2000;
    return ready;
  }

  /** How far a look's close-up is: jobs compiled out of those it needs. */
  progressFor(look: SurfaceLook): { ready: number; total: number } {
    const groups = ['closeup', terrainVariant(look)];
    const total = groups.reduce((n, g) => n + (this.size.get(g) ?? 0), 0);
    return { ready: total - groups.reduce((n, g) => n + (this.left.get(g) ?? 0), 0), total };
  }

  /** `mapScene` is the scene the system view draws in: its lights are part of every program's key there. */
  start(renderer: THREE.WebGLRenderer, lite: boolean, mapScene: THREE.Scene): void {
    const quality = lite ? LITE_QUALITY : FULL_QUALITY;
    const camera = new THREE.PerspectiveCamera();
    const scene = new THREE.Scene();
    // One terrain for each mix of switches; the rest of a close-up's shaders are the same for all.
    const variants = new Map<string, THREE.Group>();
    for (const b of BIOMES) {
      if (b.id === 'gas' || b.megastructure) continue;
      const look: SurfaceLook = surfaceLookOf(PLANET_LOOKS[b.id] ?? PLANET_LOOKS.barren, hashSeed(`warmup:${b.id}`, 'surface'));
      const key = terrainVariant(look);
      if (variants.has(key)) continue;
      const terrain = new SurfaceTerrain(look, [], quality, null);
      const group = new THREE.Group();
      group.add(terrain.group);
      // The globe's material is only put in the scene once a globe is baked: a stand-in carries it.
      group.add(new THREE.Mesh(new THREE.BufferGeometry(), terrain.globeMaterial));
      variants.set(key, group);
      scene.add(group);
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
    const jobs: Job[] = [];
    const holders = new Set(flora.group.children.filter((o) => !o.visible));
    const props = renderer.properties as unknown as { get(m: THREE.Material): { currentProgram?: ThreeProgram } };
    const once = new Set<THREE.Material>();
    const sources = new Set<string>();
    const collect = (root: THREE.Object3D, inScene: THREE.Scene, group: string, oncePerMaterial = false) => root.traverse((o) => {
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
      jobs.push({ object: o, target: holders.has(o), lights: inScene, group });
    });
    // The system view first: it is where a zoom goes before any close-up. Then whatever the map
    // holds hidden until a zoom shows it (the nebula sky round a system).
    collect(system, mapScene, 'system');
    collect(mapScene, mapScene, 'map', true);
    // Then what every close-up shares (a capital's city, roads and props), then each terrain.
    for (const group of variants.values()) scene.remove(group);
    collect(scene, lights, 'closeup');
    for (const [key, group] of variants) collect(group, lights, key);
    this.jobs = jobs;
    for (const j of jobs) {
      this.left.set(j.group, (this.left.get(j.group) ?? 0) + 1);
      this.size.set(j.group, (this.size.get(j.group) ?? 0) + 1);
    }
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
    let inFlight: Job[] = [];
    // With parallel compile the driver works on its own threads: two at a time keeps them busy
    // without flooding them (75 at once froze Chrome). A batch that comes back at once was in the
    // browser's shader cache (a program compiled in an earlier visit): then more at a time, up to
    // eight, back to two as soon as one takes real work. Without parallel compile, one at a time.
    let width = parallel ? 2 : 1;
    let batchStart = 0;
    // Compile only while the tab is shown and the player is not in the middle of moving the view
    // (unless a close-up is waiting on it): zooming, dragging or a key, not the mouse just moving.
    let touched = 0;
    const touch = (e: Event) => { if (e.type !== 'pointermove' || (e as PointerEvent).buttons) touched = performance.now(); };
    for (const e of ['pointerdown', 'pointermove', 'wheel', 'keydown', 'touchmove']) window.addEventListener(e, touch, { passive: true });
    const later = (fn: () => void, ms: number) => setTimeout(() => {
      const now = performance.now();
      if (document.hidden || (now - touched < 1200 && now > this.urgentUntil)) later(fn, 400);
      else fn();
    }, ms);
    const step = () => {
      // Wait out the programs last handed over.
      if (parallel) waiting = waiting.filter((p) => !gl.getProgramParameter(p, COMPLETION_STATUS));
      else for (const p of waiting.splice(0)) gl.getProgramParameter(p, gl.LINK_STATUS);
      if (waiting.length) return later(step, 20);
      if (parallel && batchStart) width = performance.now() - batchStart < 60 ? Math.min(width * 2, 8) : 2;
      // Read back what three.js reads on a program's first use, now rather than mid-zoom.
      primePrograms(built.splice(0));
      for (const j of inFlight.splice(0)) this.left.set(j.group, this.left.get(j.group)! - 1);
      // Hand over the next new programs; objects whose program is already built count straight in.
      batchStart = performance.now();
      while (this.jobs.length && waiting.length < width) {
        const job = this.jobs.shift()!;
        const before = renderer.getRenderTarget();
        if (job.target) renderer.setRenderTarget(target);
        const materials = renderer.compile(job.object, camera, job.lights);
        renderer.setRenderTarget(before);
        let fresh = false;
        for (const m of materials) {
          const program = props.get(m).currentProgram;
          const p = program?.program;
          if (p && !finished.has(p)) { finished.add(p); waiting.push(p); built.push(program); fresh = true; }
        }
        if (fresh) inFlight.push(job);
        else this.left.set(job.group, this.left.get(job.group)! - 1);
      }
      // A job counts once its programs are built.
      this.ready = this.total - this.jobs.length - inFlight.length;
      this.emit();
      if (this.jobs.length || waiting.length) later(step, waiting.length ? 10 : 0);
      else {
        target.dispose();
        for (const e of ['pointerdown', 'pointermove', 'wheel', 'keydown', 'touchmove']) window.removeEventListener(e, touch);
        // Programs do not need the geometry: free it, keep the materials.
        for (const root of [scene, system, ...variants.values()]) root.traverse((o) => { if ((o as THREE.Mesh).geometry) (o as THREE.Mesh).geometry.dispose(); });
      }
    };
    later(step, 0);
  }

  private emit(): void {
    for (const fn of this.listeners) fn(this.ready, this.total);
  }
}
