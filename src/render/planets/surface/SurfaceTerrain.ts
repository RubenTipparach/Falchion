import * as THREE from 'three';
import type { Settlement } from '../../../core/surface/SurfaceLayout';
import { BASE_OCTAVES, SurfaceLook, frameAt, rawHeight } from '../../../core/surface/Terrain';
import { smoothstep } from '../../../core/surface/Noise';
import { AMP, ATMO_FRAG, ATMO_VERT, BASE_OCT, BASE_VERT, CLOUD_FRAG, CLOUD_VERT, MAX_SITES, PATCH_VERT, TERRAIN_FRAG } from './shaders';

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

/** The cube's faces: normal, then the two axes across it. */
const FACES: ReadonlyArray<readonly [readonly number[], readonly number[], readonly number[]]> = [
  [[1, 0, 0], [0, 0, -1], [0, 1, 0]], [[-1, 0, 0], [0, 0, 1], [0, 1, 0]],
  [[0, 1, 0], [1, 0, 0], [0, 0, -1]], [[0, -1, 0], [1, 0, 0], [0, 0, 1]],
  [[0, 0, 1], [1, 0, 0], [0, 1, 0]], [[0, 0, -1], [-1, 0, 0], [0, 1, 0]],
];

/**
 * A planet's terrain at surface scale (radius 1): a globe baked on the CPU from the same noise as
 * the planet-view shader, a high-detail patch displaced on the GPU near the camera, clouds and an
 * atmosphere shell. The globe bakes one cube face per `bakeStep` so no frame stalls.
 */
export class SurfaceTerrain {
  readonly group = new THREE.Group();
  readonly uniforms: Record<string, THREE.IUniform>;
  private readonly baseMat: THREE.ShaderMaterial;
  private readonly patchMat: THREE.ShaderMaterial;
  private readonly patch: THREE.Mesh;
  private readonly clouds: THREE.Mesh | null;
  private readonly cloudMat: THREE.ShaderMaterial;
  private readonly atmo: THREE.Mesh | null;
  private readonly atmoMat: THREE.ShaderMaterial;
  private base: THREE.Mesh | null = null;
  private faces: THREE.BufferGeometry[] = [];
  private pit: { dir: THREE.Vector3; radius: number; depth: number } | null = null;

  constructor(private readonly look: SurfaceLook, private readonly sites: readonly Settlement[], private readonly quality: SurfaceQuality) {
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
      uCityA: { value: cityA }, uCityB: { value: cityB }, uCityC: { value: cityC }, uCityN: { value: Math.min(sites.length, MAX_SITES) },
      uPit: { value: new THREE.Vector4(0, 1, 0, 0.001) }, uPitDepth: { value: 0 },
      uC0: { value: c(look.palette[0]) }, uC1: { value: c(look.palette[1]) }, uC2: { value: c(look.palette[2]) }, uC3: { value: c(look.palette[3]) },
      uAtmo: { value: c(look.atmosphere) }, uAtmoStrength: { value: look.atmosphereStrength }, uGlow: { value: c(look.glow) }, uCityGlow: { value: c(look.cityGlow) },
      uIce: { value: look.ice }, uSnow: { value: look.snow ? 1 : 0 }, uLava: { value: look.kind === 'lava' ? 1 : 0 },
      uSun: { value: new THREE.Vector3(1, 0, 0) }, uCam: { value: new THREE.Vector3() }, uTime: { value: 0 },
      uFine: { value: 40 }, uFar: { value: 1 }, uClose: { value: 0 }, uFade: { value: 0 },
      uPatchOn: { value: 0 }, uPC: { value: new THREE.Vector3(0, 0, 1) }, uPT1: { value: new THREE.Vector3(1, 0, 0) }, uPT2: { value: new THREE.Vector3(0, 1, 0) },
      uPSize: { value: 0.3 }, uOct: { value: BASE_OCT }, uEps: { value: 0.004 },
    };
    const defines = quality.lite ? { LITE: 1 } : {};
    // Transparent only so the globe can crossfade over planet view; it writes depth as an opaque mesh would.
    this.baseMat = new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: BASE_VERT, fragmentShader: TERRAIN_FRAG, defines: { ...defines, IS_BASE: 1 }, transparent: true });
    this.patchMat = new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: PATCH_VERT, fragmentShader: TERRAIN_FRAG, defines, transparent: true, side: THREE.DoubleSide });
    this.patch = new THREE.Mesh(patchGeometry(quality.patchCells), this.patchMat);
    this.patch.frustumCulled = false;
    this.patch.visible = false;
    this.group.add(this.patch);

    this.cloudMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { uSeed: this.uniforms.uSeed, uDetail: this.uniforms.uDetail, uSun: this.uniforms.uSun, uTime: this.uniforms.uTime, uCloud: { value: c(look.cloudColor) }, uAmount: { value: look.clouds }, uFade: { value: 1 } },
      vertexShader: CLOUD_VERT, fragmentShader: CLOUD_FRAG,
    });
    this.clouds = look.clouds > 0.01 ? new THREE.Mesh(new THREE.SphereGeometry(1.034, quality.lite ? 72 : 128, quality.lite ? 36 : 64), this.cloudMat) : null;
    if (this.clouds) { this.clouds.renderOrder = 3; this.group.add(this.clouds); }

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
    this.pit = { dir: dir.clone(), radius, depth };
    this.uniforms.uPit.value.set(dir.x, dir.y, dir.z, radius);
    this.uniforms.uPitDepth.value = depth;
  }

  /** Terrain height under the settlements' plateaus and the pit (the GPU's shapedH). */
  shapedHeight(x: number, y: number, z: number, octaves = BASE_OCTAVES): number {
    let h = rawHeight(this.look, x, y, z, octaves);
    for (const c of this.sites) {
      const ch = Math.hypot(x - c.dir[0], y - c.dir[1], z - c.dir[2]);
      const f = 1 - smoothstep(c.flatIn, c.flatOut, ch);
      if (f > 0) h += (c.level - h) * f;
    }
    if (this.pit) {
      const pc = Math.hypot(x - this.pit.dir.x, y - this.pit.dir.y, z - this.pit.dir.z) / this.pit.radius;
      if (pc < 1) {
        const t = 1 - pc;
        h -= (this.pit.depth * (Math.floor(t * 5) + smoothstep(0.65, 1, t * 5 - Math.floor(t * 5)))) / 5;
      }
    }
    return h;
  }

  radiusOf(h: number): number {
    const e = this.look.dry ? Math.max((h + 0.6) * 0.5, 0) : Math.max(h - this.look.sea, 0);
    return 1 + AMP * e;
  }

  /** Ground radius under a unit direction. */
  surfaceRadius(d: THREE.Vector3): number {
    return this.radiusOf(this.shapedHeight(d.x, d.y, d.z));
  }

  get ready(): boolean {
    return this.base !== null;
  }

  /** Bake the next cube face; true once the globe is complete. */
  bakeStep(): boolean {
    if (this.base) return true;
    this.faces.push(this.bakeFace(this.faces.length));
    if (this.faces.length < FACES.length) return false;
    const geo = mergeFaces(this.faces);
    this.faces.forEach((f) => f.dispose());
    this.faces = [];
    this.base = new THREE.Mesh(geo, this.baseMat);
    this.base.frustumCulled = false;
    this.group.add(this.base);
    return true;
  }

  /**
   * One face of the cube-sphere. Heights come from a grid one cell wider on every side, so normals
   * are central differences of neighbours (no extra noise per vertex) and agree across face edges.
   */
  private bakeFace(f: number): THREE.BufferGeometry {
    const N = this.quality.baseCells, M = N + 3;
    const [n, u, v] = FACES[f];
    const P = new Float32Array(M * M * 3), H = new Float32Array(M * M);
    for (let j = 0; j < M; j++) for (let i = 0; i < M; i++) {
      const s = Math.tan((((i - 1) / N) * 2 - 1) * (Math.PI / 4)), t = Math.tan((((j - 1) / N) * 2 - 1) * (Math.PI / 4));
      let x = n[0] + u[0] * s + v[0] * t, y = n[1] + u[1] * s + v[1] * t, z = n[2] + u[2] * s + v[2] * t;
      const l = Math.hypot(x, y, z);
      x /= l; y /= l; z /= l;
      const h = this.shapedHeight(x, y, z), r = this.radiusOf(h);
      const k = j * M + i;
      P[k * 3] = x * r; P[k * 3 + 1] = y * r; P[k * 3 + 2] = z * r;
      H[k] = h;
    }
    const V = (N + 1) * (N + 1);
    const pos = new Float32Array(V * 3), nor = new Float32Array(V * 3), hh = new Float32Array(V);
    const a = new THREE.Vector3(), b = new THREE.Vector3(), nn = new THREE.Vector3(), d = new THREE.Vector3();
    for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) {
      const k = (j + 1) * M + (i + 1), o = j * (N + 1) + i;
      a.set(P[(k + 1) * 3] - P[(k - 1) * 3], P[(k + 1) * 3 + 1] - P[(k - 1) * 3 + 1], P[(k + 1) * 3 + 2] - P[(k - 1) * 3 + 2]);
      b.set(P[(k + M) * 3] - P[(k - M) * 3], P[(k + M) * 3 + 1] - P[(k - M) * 3 + 1], P[(k + M) * 3 + 2] - P[(k - M) * 3 + 2]);
      nn.crossVectors(a, b).normalize();
      d.set(P[k * 3], P[k * 3 + 1], P[k * 3 + 2]);
      if (nn.dot(d) < 0) nn.negate();
      pos.set([P[k * 3], P[k * 3 + 1], P[k * 3 + 2]], o * 3);
      nor.set([nn.x, nn.y, nn.z], o * 3);
      hh[o] = H[k];
    }
    // Wind each face counter-clockwise seen from outside.
    const outward = new THREE.Vector3(...u).cross(new THREE.Vector3(...v)).dot(new THREE.Vector3(...n)) > 0;
    const idx = new Uint32Array(N * N * 6);
    let ii = 0;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const A = j * (N + 1) + i, B = A + 1, C = A + N + 1, D = C + 1;
      idx.set(outward ? [A, B, D, A, D, C] : [A, D, B, A, C, D], ii);
      ii += 6;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setAttribute('aH', new THREE.BufferAttribute(hh, 1));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    return g;
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
      U.uOct.value = Math.min(Math.max(BASE_OCT + Math.log2(0.6 / Math.max(o.d * 2.5, 0.012)) * 1.25, BASE_OCT), this.quality.maxOctaves);
      U.uEps.value = 0.7 / this.quality.patchCells;
    }
    U.uFine.value = Math.min(Math.max(36 / o.d, 30), 9000);
    U.uFar.value = smoothstep(0.06, 0.6, o.d);
    U.uClose.value = 1 - smoothstep(0.02, 0.35, o.alt);
    if (this.clouds) {
      const f = smoothstep(0.06, 0.4, o.alt) * o.fade;
      this.cloudMat.uniforms.uFade.value = f;
      this.clouds.visible = f > 0.01;
    }
  }

  dispose(): void {
    this.group.traverse((o) => { if (o instanceof THREE.Mesh) o.geometry.dispose(); });
    this.faces.forEach((f) => f.dispose());
    this.baseMat.dispose();
    this.patchMat.dispose();
    this.cloudMat.dispose();
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

function mergeFaces(faces: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const V = faces.reduce((n, f) => n + f.getAttribute('position').count, 0);
  const I = faces.reduce((n, f) => n + f.index!.count, 0);
  const pos = new Float32Array(V * 3), nor = new Float32Array(V * 3), hh = new Float32Array(V), idx = new Uint32Array(I);
  let v = 0, i = 0;
  for (const f of faces) {
    pos.set(f.getAttribute('position').array as Float32Array, v * 3);
    nor.set(f.getAttribute('normal').array as Float32Array, v * 3);
    hh.set(f.getAttribute('aH').array as Float32Array, v);
    const src = f.index!.array;
    for (let k = 0; k < src.length; k++) idx[i + k] = src[k] + v;
    v += f.getAttribute('position').count;
    i += src.length;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('aH', new THREE.BufferAttribute(hh, 1));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1.1);
  return g;
}
