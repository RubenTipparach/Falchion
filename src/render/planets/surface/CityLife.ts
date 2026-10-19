import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Rng } from '../../../core/rng/Rng';
import type { Settlement, SurfaceLayout } from '../../../core/surface/SurfaceLayout';
import { frameAt } from '../../../core/surface/Terrain';
import { paint } from './BuildingModels';
import { LIFE_VERT, STRUCT_FRAG } from './shaders';
import type { SurfaceTerrain } from './SurfaceTerrain';

/**
 * City life (change city-life): traffic on every street, flying cars in sky lanes over the
 * avenues, shuttles climbing from the city to the orbital shipyard, freighters crossing the sky,
 * people on the pavements and lamps along every street. Each kind is one instanced draw moved on
 * the GPU (LIFE_VERT); here the paths are laid out once, from the same street grid the ground
 * shader draws (the city's cell, the capital's avenues and ring road). Sizes are in planet radii,
 * on the towers' scale (a storey is 0.0002).
 */

/** Emit codes, as STRUCT_FRAG reads them: lit always, blinking, lit at night. */
const GLOW = 2, BLINK = 3, NIGHT = 4;

/** Ground speeds (planet radii a second). */
const CAR_SPEED = 0.0011, WALK_SPEED = 0.00007, FLYER_SPEED = 0.0028;

const box = (w: number, h: number, d: number, x: number, y: number, z: number, color: string, emit = 0) =>
  paint(new THREE.BoxGeometry(w, h, d), color, emit).translate(x, y, z);
const merge = (parts: THREE.BufferGeometry[]) => {
  const g = mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p)), false)!;
  g.computeVertexNormals();
  return g;
};

/** Unit models, a unit long along x (forward), y up, z to the side; white parts take the instance colour. */
const MODELS = {
  car: () => merge([
    box(1, 0.28, 0.46, 0, 0.16, 0, '#ffffff'),
    box(0.5, 0.2, 0.4, -0.04, 0.4, 0, '#1c2633'),
    box(0.04, 0.07, 0.1, 0.5, 0.2, 0.15, '#fff4d0', NIGHT), box(0.04, 0.07, 0.1, 0.5, 0.2, -0.15, '#fff4d0', NIGHT),
    box(0.04, 0.07, 0.1, -0.5, 0.2, 0.15, '#ff2a1a', NIGHT), box(0.04, 0.07, 0.1, -0.5, 0.2, -0.15, '#ff2a1a', NIGHT),
  ]),
  flyer: () => merge([
    box(1, 0.16, 0.42, 0, 0, 0, '#ffffff'),
    box(0.42, 0.13, 0.32, 0.12, 0.13, 0, '#1a2a3c'),
    box(0.28, 0.05, 0.9, -0.2, 0.02, 0, '#ffffff'),
    box(0.7, 0.03, 0.3, 0, -0.09, 0, '#5fd0ff', GLOW),
    box(0.05, 0.06, 0.12, -0.52, 0.04, 0, '#ff3a2a', NIGHT),
    box(0.04, 0.04, 0.04, -0.2, 0.06, 0.46, '#ff3030', BLINK), box(0.04, 0.04, 0.04, -0.2, 0.06, -0.46, '#30ff60', BLINK),
  ]),
  shuttle: () => merge([
    paint(new THREE.CylinderGeometry(0.09, 0.14, 1, 8).rotateZ(-Math.PI / 2), '#ffffff'),
    paint(new THREE.ConeGeometry(0.09, 0.22, 8).rotateZ(-Math.PI / 2).translate(0.61, 0, 0), '#ffffff'),
    box(0.4, 0.03, 0.9, -0.15, -0.04, 0, '#ffffff'),
    box(0.22, 0.28, 0.03, -0.38, 0.14, 0, '#ffffff'),
    box(0.06, 0.18, 0.22, -0.53, 0, 0, '#8fe0ff', GLOW),
    box(0.03, 0.03, 0.03, -0.12, -0.03, 0.46, '#ff3030', BLINK),
  ]),
  person: () => merge([
    box(0.22, 0.42, 0.34, 0, 0.62, 0, '#ffffff'),
    box(0.18, 0.4, 0.26, 0, 0.2, 0, '#2a2f3a'),
    box(0.16, 0.16, 0.16, 0, 0.92, 0, '#d8a87c'),
  ]),
  lamp: () => merge([
    box(0.05, 1, 0.05, 0, 0.5, 0, '#5a6068'),
    box(0.06, 0.04, 0.3, 0, 0.98, -0.12, '#5a6068'),
    box(0.12, 0.05, 0.16, 0, 0.95, -0.22, '#ffe6a8', NIGHT),
  ]),
} as const;
type Kind = keyof typeof MODELS;

/** One instance's path and motion (see LIFE_VERT). */
interface Inst {
  city: THREE.Vector4;
  t1: THREE.Vector3;
  path: [number, number, number, number];
  move: [number, number, number, number];
  aux: [number, number, number, number];
  tint: THREE.Color;
}

const CAR_COLORS = ['#c8ccd2', '#2b2f36', '#8e1c1c', '#1f3f6e', '#d8d2c0', '#5a6a40', '#e0a020', '#f0f0f0', '#3a3f48'];
const FLYER_COLORS = ['#e8eef4', '#a0b8d0', '#d06030', '#303848', '#f0d080', '#60a0c0'];
const CLOTHES = ['#b03030', '#3060a0', '#d0b040', '#40804a', '#e8e8e8', '#7040a0', '#d07030', '#303030', '#40a0a0'];

export class CityLife {
  readonly group = new THREE.Group();
  /** Instances of each kind (for the test and the bench). */
  readonly counts: Record<Kind, number>;
  private readonly material: THREE.ShaderMaterial;

  constructor(layout: SurfaceLayout, terrain: SurfaceTerrain, lite: boolean) {
    const U = terrain.uniforms;
    this.material = new THREE.ShaderMaterial({
      uniforms: { uSun: U.uSun, uTime: U.uTime, uCam: U.uCam, uAtmo: U.uAtmo, uClose: U.uClose, uAtmoStrength: U.uAtmoStrength, uPxScale: { value: 800 } },
      vertexShader: LIFE_VERT, fragmentShader: STRUCT_FRAG, vertexColors: true, side: THREE.DoubleSide,
    });
    const all: Record<Kind, Inst[]> = { car: [], flyer: [], shuttle: [], person: [], lamp: [] };
    const orbital = layout.buildings.find((b) => b.orbital);
    layout.settlements.forEach((city) => this.lay(city, terrain.radiusOf(city.level), lite, all, orbital ? new THREE.Vector3(...orbital.dir) : null));
    this.counts = Object.fromEntries((Object.keys(all) as Kind[]).map((k) => [k, all[k].length])) as Record<Kind, number>;
    for (const kind of Object.keys(all) as Kind[]) {
      const list = all[kind];
      if (!list.length) continue;
      const geo = new THREE.InstancedBufferGeometry().copy(MODELS[kind]() as THREE.InstancedBufferGeometry);
      const n = list.length;
      const attr = (size: number, f: (x: Inst) => ArrayLike<number>) => {
        const a = new Float32Array(n * size);
        list.forEach((x, i) => a.set(f(x), i * size));
        return new THREE.InstancedBufferAttribute(a, size);
      };
      geo.setAttribute('aCity', attr(4, (x) => x.city.toArray()));
      geo.setAttribute('aT1', attr(3, (x) => x.t1.toArray()));
      geo.setAttribute('aPath', attr(4, (x) => x.path));
      geo.setAttribute('aMove', attr(4, (x) => x.move));
      geo.setAttribute('aAux', attr(4, (x) => x.aux));
      geo.setAttribute('aTint', attr(3, (x) => [x.tint.r, x.tint.g, x.tint.b]));
      geo.instanceCount = n;
      const mesh = new THREE.Mesh(geo, this.material);
      mesh.frustumCulled = false;
      this.group.add(mesh);
    }
  }

  /** Pixels per unit at distance 1, from the screen height and field of view (what is too small to draw). */
  setPointScale(scale: number): void {
    this.material.uniforms.uPxScale.value = scale;
  }

  /** Every street, avenue and lane of one city, and what moves on it. */
  private lay(city: Settlement, rC: number, lite: boolean, out: Record<Kind, Inst[]>, orbital: THREE.Vector3 | null): void {
    const rng = new Rng(city.seed ^ 0x51f3);
    const c = new THREE.Vector3(...city.dir);
    const t1 = new THREE.Vector3(...frameAt(city.dir).t1);
    const cityV = new THREE.Vector4(c.x, c.y, c.z, rC);
    const { radius: R, cell } = city;
    const capital = city.kind === 'capital';
    const plaza = capital ? cell * 1.6 : 0;
    const thin = lite ? 0.45 : 1;
    const add = (kind: Kind, path: Inst['path'], move: Inst['move'], aux: Inst['aux'], tint: string | THREE.Color) =>
      out[kind].push({ city: cityV, t1, path, move, aux, tint: typeof tint === 'string' ? new THREE.Color(tint) : tint });
    // A straight stretch from u0 to u1 along angle a, offset sideways by o: what drives, walks and lights it.
    const street = (a: number, o: number, u0: number, u1: number, wide: number) => {
      const L = (u1 - u0) / 2, mid = (u0 + u1) / 2;
      if (L < cell * 0.5) return;
      const lanes = wide > 0.2 ? 2 : 1;
      for (const dirn of [1, -1]) for (let lane = 0; lane < lanes; lane++) {
        const off = o - dirn * cell * (0.04 + lane * 0.06);
        const cars = Math.floor(((2 * L) / (cell * 1.3)) * (0.5 + rng.next()) * thin);
        for (let k = 0; k < cars; k++) add('car', [0, a, off, L], [dirn * CAR_SPEED * (0.7 + 0.6 * rng.next()), rng.next() * 2 * L, 0, 0.00032], [mid, 0, 0, 0], rng.pick(CAR_COLORS));
      }
      // On the pavement, just outside the carriageway (as the ground shader draws them).
      const pave = (wide > 0.2 ? 0.14 : 0.1) + 0.012;
      for (const sideW of [1, -1]) {
        const off = o + sideW * cell * pave;
        const people = Math.floor(((2 * L) / (cell * 0.55)) * (0.4 + rng.next()) * thin);
        for (let k = 0; k < people; k++) add('person', [0, a, off + (rng.next() - 0.5) * cell * 0.012, L], [(rng.next() < 0.5 ? 1 : -1) * WALK_SPEED * (0.6 + 0.8 * rng.next()), rng.next() * 2 * L, 0, 0.00013], [mid, 0, 0, 0], rng.pick(CLOTHES));
        // Lamps every half block, between the crossings.
        for (let u = u0 + cell * 0.25; u < u1 - cell * 0.1; u += cell * 0.5) add('lamp', [0, a, off, 1], [0, u - mid, 0, 0.0004], [mid, 0, 0, 0], '#ffffff');
      }
    };
    // The grid: every street line inside the city, both ways, round the capital's plaza.
    const n = Math.ceil(R / cell);
    for (let k = -n; k <= n; k++) {
      const o = k * cell;
      if (Math.abs(o) > R * 0.86) continue;
      const half = Math.sqrt((R * 0.88) ** 2 - o * o);
      const wide = k % 4 === 0 ? 0.3 : 0.1;
      for (const a of [0, Math.PI / 2]) {
        if (Math.abs(o) < plaza) {
          const cut = Math.sqrt(plaza * plaza - o * o);
          street(a, o, -half, -cut, wide);
          street(a, o, cut, half, wide);
        } else street(a, o, -half, half, wide);
      }
    }
    if (capital) {
      // Eight avenues out from the plaza, and the ring road.
      for (let k = 0; k < 8; k++) street((k * Math.PI) / 4, 0, plaza, R * 0.9, 0.3);
      const ring = R * 0.55;
      for (const dirn of [1, -1]) for (let k = 0; k < Math.floor(30 * thin); k++) {
        add('car', [1, 0, ring - dirn * cell * 0.08, 0], [dirn * CAR_SPEED, rng.next() * Math.PI * 2 * ring, 0, 0.00032], [0, 0, 0, 0], rng.pick(CAR_COLORS));
      }
    }
    // Sky lanes over the main streets and avenues, a layer each way at its own height.
    const skyLanes = capital ? 10 : city.kind === 'city' ? 5 : 2;
    for (let k = 0; k < skyLanes; k++) {
      const a = capital && k % 2 ? (Math.floor(rng.next() * 8) * Math.PI) / 4 : rng.next() < 0.5 ? 0 : Math.PI / 2;
      const o = capital && k % 2 ? 0 : Math.round((rng.next() * 2 - 1) * (R * 0.6) / (cell * 4)) * cell * 4;
      const h = 0.0014 + rng.next() * 0.0032;
      for (const dirn of [1, -1]) {
        const L = R * 1.05;
        const count = Math.floor((capital ? 18 : 9) * thin);
        for (let i = 0; i < count; i++) add('flyer', [0, a, o + dirn * cell * 0.12, L], [dirn * FLYER_SPEED * (0.8 + 0.4 * rng.next()), rng.next() * 2 * L, h + (dirn > 0 ? 0 : 0.0005), 0.0003], [0, 0, 0, 0], rng.pick(FLYER_COLORS));
      }
    }
    if (city.kind === 'town') return;
    // Shuttles from pads round the city up to the orbital shipyard (or to orbit), and freighters crossing high.
    const top = orbital
      ? (() => { const q = orbital.clone().divideScalar(orbital.dot(c)).sub(c); const t2 = c.clone().cross(t1); return [q.dot(t1), q.dot(t2)] as const; })()
      : [R * 1.5, R * 0.4] as const;
    const pads = capital ? 6 : 2;
    for (let k = 0; k < pads; k++) {
      const ang = rng.next() * Math.PI * 2, r = R * (0.3 + 0.5 * rng.next());
      add('shuttle', [2, Math.cos(ang) * r, Math.sin(ang) * r, 0], [1 / (40 + 30 * rng.next()), rng.next(), 0.0004, 0.0016], [top[0], top[1], 0.024, 0], rng.pick(['#e8ecf0', '#c8d0dc', '#f0e0c0']));
    }
    for (let k = 0; k < (capital ? 4 : 1); k++) {
      const L = R * 3;
      add('shuttle', [0, rng.next() * Math.PI, (rng.next() - 0.5) * R, L], [(rng.next() < 0.5 ? 1 : -1) * 0.004, rng.next() * 2 * L, 0.008 + rng.next() * 0.01, 0.004], [0, 0, 0, 0], rng.pick(['#9aa4b0', '#b8b0a0']));
    }
  }

  dispose(): void {
    this.group.traverse((o) => { if (o instanceof THREE.Mesh) o.geometry.dispose(); });
    this.material.dispose();
  }
}
