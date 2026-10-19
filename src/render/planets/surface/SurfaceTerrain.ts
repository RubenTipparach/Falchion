import * as THREE from 'three';
import type { Settlement } from '../../../core/surface/SurfaceLayout';
import { BASE_OCTAVES, SurfaceLook, frameAt } from '../../../core/surface/Terrain';
import { smoothstep } from '../../../core/surface/Noise';
import { CUBE_FACES, bakeFace, radiusOfHeight, shapedHeight, type BakeJob, type BakedFace, type Pit } from '../../../core/surface/GlobeBake';
import { bakePool } from './BakePool';
import { NO_LIGHTS } from '../NightLightMap';
import { atmosphereDefines } from '../atmosphere.glsl';
import { PATTERN_IDS } from '../patterns.glsl';
import { AMP, ATMO_FRAG, ATMO_VERT, AURORA_FRAG, BASE_OCT, BASE_VERT, CLOUD_FRAG, MAX_SITES, PATCH_VERT, SHELL_VERT, TERRAIN_FRAG } from './shaders';

/** Quality knobs: desktop full, touch-first devices lighter. */
export interface SurfaceQuality {
  /** Cells per cube face of the baked globe. */
  readonly baseCells: number;
  /** Cells across the GPU detail patch. */
  readonly patchCells: number;
  /** Most octaves the patch reaches at the lowest altitude. */
  readonly maxOctaves: number;
  /** Draw the raymarched atmosphere shell. */
  readonly atmosphere: boolean;
  readonly lite: boolean;
}

export const FULL_QUALITY: SurfaceQuality = { baseCells: 96, patchCells: 192, maxOctaves: 13.5, atmosphere: true, lite: false };
export const LITE_QUALITY: SurfaceQuality = { baseCells: 64, patchCells: 96, maxOctaves: 10.5, atmosphere: false, lite: true };

/** Radius of the cloud shell, above the highest ground (about 1.023), and of the aurora's, above it. */
const CLOUD_R = 1.034, AURORA_R = 1.04;

/**
 * A planet's terrain at surface scale (radius 1): a globe baked on the CPU from the same noise as
 * the planet-view shader, a high-detail patch displaced on the GPU near the camera, the planet-view
 * shader's weather (clouds, haze, storms and auroras, ATMOSPHERE_GLSL) on shells above it, and an
 * atmosphere shell. The globe's six faces bake in parallel in Web Workers (BakePool), or one a
 * `bakeStep` where there are none, so no frame stalls.
 */
export class SurfaceTerrain {
  readonly group = new THREE.Group();
  readonly uniforms: Record<string, THREE.IUniform>;
  private readonly baseMat: THREE.ShaderMaterial;
  private readonly patchMat: THREE.ShaderMaterial;
  private readonly patch: THREE.Mesh;
  private readonly clouds: THREE.Mesh | null;
  private readonly cloudMat: THREE.ShaderMaterial;
  private readonly aurora: THREE.Mesh | null;
  private readonly auroraMat: THREE.ShaderMaterial;
  private readonly atmo: THREE.Mesh | null;
  private readonly atmoMat: THREE.ShaderMaterial;
  private base: THREE.Mesh | null = null;
  private faces: BakedFace[] = [];
  /** Faces baking in workers (all six at once), once started. */
  private baking: Promise<BakedFace[]> | null = null;
  private baked: BakedFace[] | null = null;
  private pit: Pit | null = null;

  /**
   * `lights` is the planet's night-light map (shared with the system view), drawn from orbit; the
   * streets and roads take over closer in.
   */
  constructor(readonly look: SurfaceLook, private readonly sites: readonly Settlement[], private readonly quality: SurfaceQuality, lights: THREE.Texture | null) {
    const c = (hex: string) => new THREE.Color(hex);
    const cityA = Array.from({ length: MAX_SITES }, () => new THREE.Vector4());
    const cityB = Array.from({ length: MAX_SITES }, () => new THREE.Vector4(0, 0.0001, 1, 0));
    const cityC = Array.from({ length: MAX_SITES }, () => new THREE.Vector4());
    sites.slice(0, MAX_SITES).forEach((s, i) => {
      cityA[i].set(s.dir[0], s.dir[1], s.dir[2], s.level);
      cityB[i].set(s.flatIn, s.flatOut, s.cell, s.radius);
      cityC[i].set(s.kind === 'capital' ? 1 : 0, Math.min(0.3 + s.pop * 0.05, 0.75), 0, 0);
    });
    this.uniforms = {
      uSeed: { value: new THREE.Vector3(...look.seed) }, uDetail: { value: look.detail }, uSea: { value: look.sea },
      uCraters: { value: look.craters ? 1 : 0 }, uDry: { value: look.dry ? 1 : 0 },
      uCanyons: { value: look.canyons }, uVolcanoes: { value: look.volcanoes ? 1 : 0 }, uLocked: { value: look.locked ?? 0 },
      uGlitter: { value: c(look.glitter ?? '#000000') },
      uCityA: { value: cityA }, uCityB: { value: cityB }, uCityC: { value: cityC }, uCityN: { value: Math.min(sites.length, MAX_SITES) },
      uPit: { value: new THREE.Vector4(0, 1, 0, 0.001) }, uPitDepth: { value: 0 },
      uC0: { value: c(look.palette[0]) }, uC1: { value: c(look.palette[1]) }, uC2: { value: c(look.palette[2]) }, uC3: { value: c(look.palette[3]) },
      uAtmo: { value: c(look.atmosphere) }, uAtmoStrength: { value: look.atmosphereStrength }, uGlow: { value: c(look.glow) }, uCityGlow: { value: c(look.cityGlow) },
      uIce: { value: look.ice }, uSnow: { value: look.snow ? 1 : 0 }, uLava: { value: look.kind === 'lava' ? 1 : 0 },
      uSun: { value: new THREE.Vector3(1, 0, 0) }, uCam: { value: new THREE.Vector3() }, uTime: { value: 0 },
      uFine: { value: 40 }, uFar: { value: 1 }, uClose: { value: 0 }, uFade: { value: 0 },
      uPatchOn: { value: 0 }, uPC: { value: new THREE.Vector3(0, 0, 1) }, uPT1: { value: new THREE.Vector3(1, 0, 0) }, uPT2: { value: new THREE.Vector3(0, 1, 0) },
      uPSize: { value: 0.3 }, uOct: { value: BASE_OCT }, uEps: { value: 0.004 },
      uBaseN: { value: quality.baseCells }, uLightMap: { value: lights ?? NO_LIGHTS },
      uSeaGlow: { value: c(look.seaGlow ?? '#000000') },
    };
    const defines: Record<string, number> = {
      ...(quality.lite ? { LITE: 1 } : {}), ...(look.seaGlow ? { SEA_GLOW: 1 } : {}),
      ...(look.pattern ? { PATTERN: PATTERN_IDS[look.pattern] } : {}), ...(look.glitter ? { GLITTER: 1 } : {}),
    };
    // Transparent only so the globe can crossfade over planet view; it writes depth as an opaque mesh would.
    this.baseMat = new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: BASE_VERT, fragmentShader: TERRAIN_FRAG, defines: { ...defines, IS_BASE: 1 }, transparent: true });
    this.patchMat = new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: PATCH_VERT, fragmentShader: TERRAIN_FRAG, defines, transparent: true, side: THREE.DoubleSide });
    this.patch = new THREE.Mesh(patchGeometry(quality.patchCells), this.patchMat);
    this.patch.frustumCulled = false;
    this.patch.visible = false;
    this.group.add(this.patch);

    // The weather, as the system view draws it: the same functions, look, seed and clock (uTime).
    const weather = atmosphereDefines(look);
    const U = this.uniforms;
    this.cloudMat = new THREE.ShaderMaterial({
      // Both sides: from the ground the deck is an overcast sky.
      transparent: true, depthWrite: false, premultipliedAlpha: true, defines: weather, side: THREE.DoubleSide,
      uniforms: {
        uSeed: U.uSeed, uDetail: U.uDetail, uSun: U.uSun, uCam: U.uCam, uTime: U.uTime, uC3: U.uC3, uAtmo: U.uAtmo, uAtmoStrength: U.uAtmoStrength,
        uCloud: { value: c(look.cloudColor) },
        uAmount: { value: look.clouds }, uHaze: { value: look.haze ?? 0 }, uLightning: { value: look.lightning ?? 0 }, uFade: { value: 1 },
      },
      vertexShader: SHELL_VERT, fragmentShader: CLOUD_FRAG,
    });
    const cloudy = look.clouds > 0.01 || !!look.haze || !!look.lightning;
    this.clouds = cloudy ? new THREE.Mesh(new THREE.SphereGeometry(CLOUD_R, quality.lite ? 72 : 128, quality.lite ? 36 : 64), this.cloudMat) : null;
    if (this.clouds) { this.clouds.renderOrder = 3; this.group.add(this.clouds); }

    // Seen from inside too (the ground), so both sides.
    this.auroraMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, premultipliedAlpha: true, side: THREE.DoubleSide, defines: weather,
      uniforms: { uSeed: U.uSeed, uSun: U.uSun, uCam: U.uCam, uTime: U.uTime, uAurora: { value: c(look.aurora ?? '#000000') }, uFade: { value: 1 }, uDim: { value: 1 } },
      vertexShader: SHELL_VERT, fragmentShader: AURORA_FRAG,
    });
    this.aurora = look.aurora ? new THREE.Mesh(new THREE.SphereGeometry(AURORA_R, quality.lite ? 72 : 128, quality.lite ? 36 : 64), this.auroraMat) : null;
    if (this.aurora) { this.aurora.renderOrder = 4; this.group.add(this.aurora); }

    this.atmoMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.BackSide, blending: THREE.AdditiveBlending,
      uniforms: { uCam: this.uniforms.uCam, uSun: this.uniforms.uSun, uAtmo: this.uniforms.uAtmo, uStrength: this.uniforms.uAtmoStrength, uFade: this.uniforms.uFade },
      vertexShader: ATMO_VERT, fragmentShader: ATMO_FRAG,
    });
    this.atmo = quality.atmosphere && look.atmosphereStrength > 0 ? new THREE.Mesh(new THREE.SphereGeometry(1.08, 96, 48), this.atmoMat) : null;
    if (this.atmo) { this.atmo.renderOrder = 5; this.group.add(this.atmo); }
  }

  /** The Deep Mine's pit, dug into the terrain (call before baking). */
  setPit(dir: THREE.Vector3, radius: number, depth: number): void {
    this.pit = { dir: [dir.x, dir.y, dir.z], radius, depth };
    this.uniforms.uPit.value.set(dir.x, dir.y, dir.z, radius);
    this.uniforms.uPitDepth.value = depth;
  }

  /** Terrain height under the settlements' plateaus and the pit (the GPU's shapedH). */
  shapedHeight(x: number, y: number, z: number, octaves = BASE_OCTAVES): number {
    return shapedHeight(this.look, this.sites, this.pit, x, y, z, octaves);
  }

  radiusOf(h: number): number {
    return radiusOfHeight(this.look, h, AMP);
  }

  /** Ground radius under a unit direction. */
  surfaceRadius(d: THREE.Vector3): number {
    return this.radiusOf(this.shapedHeight(d.x, d.y, d.z));
  }

  get ready(): boolean {
    return this.base !== null;
  }

  /** The baked globe's material (in the scene only once the globe is baked; ShaderWarmup compiles it earlier). */
  get globeMaterial(): THREE.Material {
    return this.baseMat;
  }

  /**
   * Bake the globe; true once it is complete. With workers, the first call sends all six faces off
   * and later calls only check whether they are back; without, each call bakes one face here.
   */
  bakeStep(): boolean {
    if (this.base) return true;
    const pool = bakePool();
    if (pool) {
      this.baking ??= Promise.all(CUBE_FACES.map((_, f) => pool.bake(this.job(f)))).then((faces) => (this.baked = faces));
      if (!this.baked) return false;
      this.faces = this.baked;
    } else {
      this.faces.push(bakeFace(this.job(this.faces.length)));
      if (this.faces.length < CUBE_FACES.length) return false;
    }
    this.base = new THREE.Mesh(mergeFaces(this.faces), this.baseMat);
    this.faces = [];
    this.baked = null;
    this.base.frustumCulled = false;
    this.group.add(this.base);
    return true;
  }

  private job(face: number): BakeJob {
    const plateaus = this.sites.map((s) => ({ dir: s.dir, flatIn: s.flatIn, flatOut: s.flatOut, level: s.level }));
    return { look: this.look, plateaus, pit: this.pit, cells: this.quality.baseCells, face, amp: AMP };
  }

  /**
   * Per frame: lighting, crossfade and level of detail. `cam` is the camera in the planet frame,
   * `focus` the ground point it looks at, `d` its distance from it, `alt` its height above ground.
   */
  update(o: { cam: THREE.Vector3; focus: THREE.Vector3; d: number; alt: number; sun: THREE.Vector3; time: number; fade: number }): void {
    const U = this.uniforms;
    U.uSun.value.copy(o.sun);
    U.uCam.value.copy(o.cam);
    U.uTime.value = o.time;
    U.uFade.value = o.fade;
    const patchOn = o.d < 0.5 && o.fade > 0.999;
    U.uPatchOn.value = patchOn ? 1 : 0;
    this.patch.visible = patchOn;
    if (patchOn) {
      const k = Math.round(Math.log2(Math.min(Math.max(o.d * 3.2, 0.03), 0.45) / 0.45) * 4) / 4;
      const size = 0.45 * Math.pow(2, k);
      const ground = o.cam.clone().normalize();
      const center = o.focus.clone().normalize().lerp(ground, 0.35).normalize();
      // Snap the centre to a lattice so vertices do not swim while panning.
      const step = size * 0.04;
      const lat = Math.asin(THREE.MathUtils.clamp(center.y, -1, 1)), lon = Math.atan2(center.z, center.x);
      const sl = Math.round(lat / step) * step, so = (Math.round((lon * Math.cos(sl)) / step) * step) / Math.max(Math.cos(sl), 0.05);
      center.set(Math.cos(sl) * Math.cos(so), Math.sin(sl), Math.cos(sl) * Math.sin(so));
      const fr = frameAt([center.x, center.y, center.z]);
      U.uPC.value.copy(center);
      U.uPT1.value.set(...fr.t1);
      U.uPT2.value.set(...fr.t2);
      U.uPSize.value = size;
      // Octaves the patch's grid can hold: the finest wavelength spans at least four cells where
      // the grid is densest (its centre). More would alias, and every resample of the grid (a size
      // step, a centre snap) would make the ground jump. Taken from the unquantised size, so the
      // count, and the detail with it, changes smoothly with the zoom.
      const cell = (Math.min(Math.max(o.d * 3.2, 0.03), 0.45) * 2 * 0.35) / this.quality.patchCells;
      const resolvable = 1 + Math.log2(1 / (4 * cell * this.look.detail)) / Math.log2(2.02);
      U.uOct.value = Math.min(Math.max(resolvable, BASE_OCT), this.quality.maxOctaves);
      U.uEps.value = 0.7 / this.quality.patchCells;
    }
    U.uFine.value = Math.min(Math.max(36 / o.d, 30), 9000);
    U.uFar.value = smoothstep(0.06, 0.6, o.d);
    U.uClose.value = 1 - smoothstep(0.02, 0.35, o.alt);
    // The clouds thin out below low orbit, so the ground shows; the aurora stays to the ground. A
    // world under a thick deck (a storm world, a hazy one) keeps it overhead: an overcast sky.
    const above = smoothstep(0.06, 0.4, o.alt);
    if (this.clouds) {
      const f = Math.max(above, (this.look.haze ?? 0) > 0.5 ? 0.8 : 0) * o.fade;
      this.cloudMat.uniforms.uFade.value = f;
      this.clouds.visible = f > 0.01;
    }
    if (this.aurora) {
      this.auroraMat.uniforms.uFade.value = o.fade;
      this.auroraMat.uniforms.uDim.value = above;
    }
  }

  dispose(): void {
    this.group.traverse((o) => { if (o instanceof THREE.Mesh) o.geometry.dispose(); });
    this.baseMat.dispose();
    this.patchMat.dispose();
    this.cloudMat.dispose();
    this.auroraMat.dispose();
    this.atmoMat.dispose();
  }
}

/** The detail patch: a grid warped denser at the centre, with a skirt ring that hides seams. */
function patchGeometry(cells: number): THREE.BufferGeometry {
  const n = cells + 3, uv = new Float32Array(n * n * 2), sk = new Float32Array(n * n), idx: number[] = [];
  const warp = (s: number) => s * (0.35 + 0.65 * s * s);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const k = j * n + i;
    const si = (Math.min(Math.max(i - 1, 0), cells) / cells) * 2 - 1, sj = (Math.min(Math.max(j - 1, 0), cells) / cells) * 2 - 1;
    uv[k * 2] = warp(si);
    uv[k * 2 + 1] = warp(sj);
    sk[k] = i === 0 || j === 0 || i === n - 1 || j === n - 1 ? 1 : 0;
  }
  for (let j = 0; j < n - 1; j++) for (let i = 0; i < n - 1; i++) {
    const a = j * n + i, b = a + 1, c = a + n, d = c + 1;
    idx.push(a, b, d, a, d, c);
  }
  const g = new THREE.BufferGeometry();
  // Positions come from the vertex shader; the attribute only sets the vertex count.
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * n * 3), 3));
  g.setAttribute('aUV', new THREE.BufferAttribute(uv, 2));
  g.setAttribute('aSkirt', new THREE.BufferAttribute(sk, 1));
  g.setIndex(idx);
  return g;
}

function mergeFaces(faces: readonly BakedFace[]): THREE.BufferGeometry {
  const V = faces.reduce((n, f) => n + f.height.length, 0);
  const I = faces.reduce((n, f) => n + f.index.length, 0);
  const pos = new Float32Array(V * 3), nor = new Float32Array(V * 3), hh = new Float32Array(V), idx = new Uint32Array(I);
  let v = 0, i = 0;
  for (const f of faces) {
    pos.set(f.position, v * 3);
    nor.set(f.normal, v * 3);
    hh.set(f.height, v);
    for (let k = 0; k < f.index.length; k++) idx[i + k] = f.index[k] + v;
    v += f.height.length;
    i += f.index.length;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('aH', new THREE.BufferAttribute(hh, 1));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1.1);
  return g;
}
