import * as THREE from 'three';
import { Rng } from '../../../core/rng/Rng';
import type { Settlement, SurfaceLayout } from '../../../core/surface/SurfaceLayout';
import { Vec3, frameAt } from '../../../core/surface/Terrain';
import { BUILDING_MODELS, BuildingModel, capitolModel, paint } from './BuildingModels';
import { SMOKE_FRAG, SMOKE_VERT, STRUCT_FRAG, STRUCT_VERT } from './shaders';
import type { SurfaceTerrain } from './SurfaceTerrain';

const v3 = (d: Vec3) => new THREE.Vector3(d[0], d[1], d[2]);

/** Where a label or the camera goes for a building. */
export interface BuildingAnchor {
  readonly id: string;
  readonly dir: THREE.Vector3;
  /** Radius of its top (labels) and of its base. */
  readonly top: number;
  readonly ground: number;
  readonly orbital: boolean;
}

/** Model frame on the sphere: x along `t1` turned by `yaw` about the local up, y up, at `radius`. */
function orientAt(dir: THREE.Vector3, t1: THREE.Vector3, radius: number, yaw = 0, out = new THREE.Matrix4()): THREE.Matrix4 {
  const up = dir.clone().normalize();
  const x = t1.clone().addScaledVector(up, -t1.dot(up)).normalize();
  if (yaw) x.applyAxisAngle(up, yaw);
  const z = new THREE.Vector3().crossVectors(x, up);
  out.makeBasis(x, up, z);
  out.setPosition(up.multiplyScalar(radius));
  return out;
}

const GREYS = ['#9aa3ad', '#7d8792', '#b9b2a2', '#6f7a86', '#a59a85', '#c8ccd0', '#8a8f96'];

/**
 * Everything built on a planet: instanced towers for every settlement (lit windows at night), the
 * capitol, one model per special building round the main city, smoke from the Manufactory and the
 * Orbital Shipyard in low orbit. One shader (STRUCT_*) lights it all.
 */
export class Settlements {
  readonly group = new THREE.Group();
  readonly buildings: BuildingAnchor[] = [];
  /** Towers drawn (instances). */
  readonly towers: number;
  private readonly material: THREE.ShaderMaterial;
  private readonly smokeMaterial: THREE.ShaderMaterial;
  private readonly rings: THREE.Mesh[] = [];

  constructor(layout: SurfaceLayout, private readonly terrain: SurfaceTerrain, lite: boolean) {
    const U = terrain.uniforms;
    this.material = new THREE.ShaderMaterial({
      uniforms: { uSun: U.uSun, uTime: U.uTime, uCam: U.uCam, uAtmo: U.uAtmo, uClose: U.uClose, uAtmoStrength: U.uAtmoStrength },
      vertexShader: STRUCT_VERT, fragmentShader: STRUCT_FRAG, vertexColors: true, side: THREE.DoubleSide,
    });
    this.smokeMaterial = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { uTime: U.uTime, uSun: U.uSun, uScale: { value: 800 } },
      vertexShader: SMOKE_VERT, fragmentShader: SMOKE_FRAG,
    });
    this.towers = this.buildTowers(layout.settlements, lite);
    const main = layout.settlements[0];
    if (main) this.buildSpecials(layout, main);
  }

  /** Pixels per unit at distance 1 (smoke particle size), from the screen height and field of view. */
  setPointScale(scale: number): void {
    this.smokeMaterial.uniforms.uScale.value = scale;
  }

  update(time: number): void {
    for (const r of this.rings) r.rotation.x = time * 0.25;
  }

  private buildTowers(sites: readonly Settlement[], lite: boolean): number {
    type Item = { m: THREE.Matrix4; c: THREE.Color };
    const boxes: Item[] = [], cyls: Item[] = [], beacons: Item[] = [];
    for (const city of sites) {
      const rng = new Rng(city.seed);
      const { radius: R, cell } = city;
      const capital = city.kind === 'capital';
      const dir = v3(city.dir);
      const { t1: a1, t2: a2 } = frameAt(city.dir);
      const t1 = v3(a1), t2 = v3(a2);
      const rC = this.terrain.radiusOf(city.level);
      const n = Math.ceil(R / cell) + 1;
      const big = city.kind !== 'town';
      for (let i = -n; i < n; i++) for (let j = -n; j < n; j++) {
        const bx = (i + 0.5) * cell, by = (j + 0.5) * cell, rr = Math.hypot(bx, by);
        const fall = rr / R;
        if (fall > 0.93 + rng.next() * 0.08) continue;
        if (capital) {
          // Keep the plaza, the four avenues and the ring road clear.
          if (rr < cell * 2.1) continue;
          const ang = Math.atan2(by, bx);
          if (rr * Math.abs(Math.sin(4 * ang)) * 0.25 < cell * 0.6) continue;
          if (Math.abs(rr - R * 0.55) < cell * 0.6) continue;
        }
        if (rng.next() < Math.pow(fall, 3) * 0.6) continue;
        // Phones: fewer, larger lots.
        const lots = capital ? (fall < 0.4 ? (lite ? 2 : 3) : 2) : rng.next() < (lite ? 0.3 : 0.55) ? 2 : 1;
        const lot = (cell * 0.78) / lots;
        for (let a = 0; a < lots; a++) for (let b = 0; b < lots; b++) {
          if (rng.next() < 0.06) continue;
          const lx = bx - cell * 0.39 + (a + 0.5) * lot, ly = by - cell * 0.39 + (b + 0.5) * lot;
          const w = lot * (0.64 + 0.28 * rng.next()), d = lot * (0.64 + 0.28 * rng.next());
          const hmax = capital ? 0.0013 + 0.0085 * Math.exp(-Math.pow(fall / 0.38, 2)) : (0.0005 + 0.0016 * Math.sqrt(city.pop) * Math.exp(-Math.pow(fall / 0.45, 2))) * (big ? 1.2 : 1);
          const h = hmax * (0.28 + 0.72 * Math.pow(rng.next(), 1.4));
          const at = dir.clone().addScaledVector(t1, lx).addScaledVector(t2, ly).normalize();
          const tint = new THREE.Color(rng.pick(GREYS));
          if (capital && fall < 0.35 && rng.next() < 0.45) tint.lerp(new THREE.Color('#5f7d99'), 0.6);
          const m = orientAt(at, t1, rC - 0.0003);
          const round = h > 0.0022 && rng.next() < 0.14;
          (round ? cyls : boxes).push({ m: m.clone().multiply(new THREE.Matrix4().makeScale(w, h + 0.0003, d)), c: tint });
          let top = h;
          if (!round && h > 0.0034 && rng.next() < 0.55) {
            const sm = orientAt(at, t1, rC + h - 0.0001);
            boxes.push({ m: sm.multiply(new THREE.Matrix4().makeScale(w * 0.6, h * 0.32, d * 0.6)), c: tint.clone().multiplyScalar(1.08) });
            top = h - 0.0001 + h * 0.32;
          }
          if (h > 0.0042) beacons.push({ m: orientAt(at, t1, rC + top + 0.00008).multiply(new THREE.Matrix4().makeScale(0.00016, 0.00016, 0.00016)), c: new THREE.Color('#ff5040') });
        }
      }
    }
    const kinds: Array<[THREE.BufferGeometry, Item[]]> = [
      [paint(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), '#ffffff', 1), boxes],
      [paint(new THREE.CylinderGeometry(0.5, 0.5, 1, 10).translate(0, 0.5, 0), '#ffffff', 1), cyls],
      [paint(new THREE.BoxGeometry(1, 1, 1), '#ffffff', 3), beacons],
    ];
    for (const [geo, list] of kinds) {
      if (!list.length) { geo.dispose(); continue; }
      const im = new THREE.InstancedMesh(geo, this.material, list.length);
      list.forEach((b, k) => { im.setMatrixAt(k, b.m); im.setColorAt(k, b.c); });
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
      im.frustumCulled = false;
      this.group.add(im);
    }
    return boxes.length + cyls.length + beacons.length;
  }

  private buildSpecials(layout: SurfaceLayout, main: Settlement): void {
    const center = v3(main.dir);
    const t1 = v3(frameAt(main.dir).t1);
    const rC = this.terrain.radiusOf(main.level);
    if (main.kind === 'capital') this.add(capitolModel(), orientAt(center, t1, rC - 0.0002, 0.3));
    for (const site of layout.buildings) {
      const build = BUILDING_MODELS[site.id];
      if (!build) continue;
      const model = build();
      const dir = v3(site.dir);
      if (site.orbital) {
        // Parked in low orbit over the city.
        const alt = 0.024;
        const g = this.add(model, orientAt(dir, t1, rC + alt, site.heading));
        if (model.ring) {
          const ring = new THREE.Mesh(model.ring, this.material);
          this.rings.push(ring);
          g.add(ring);
        }
        this.buildings.push({ id: site.id, dir, top: rC + alt + 0.008, ground: rC + alt, orbital: true });
        continue;
      }
      const base = orientAt(dir, t1, rC - 0.0002, site.heading);
      this.add(model, base);
      this.buildings.push({ id: site.id, dir, top: rC + model.top, ground: rC, orbital: false });
      if (model.stacks) this.addSmoke(model.stacks, base);
    }
  }

  private add(model: BuildingModel, frame: THREE.Matrix4): THREE.Group {
    const g = new THREE.Group();
    g.matrixAutoUpdate = false;
    g.matrix.copy(frame);
    g.add(new THREE.Mesh(model.geo, this.material));
    this.group.add(g);
    return g;
  }

  private addSmoke(stacks: readonly THREE.Vector3[], base: THREE.Matrix4): void {
    const per = 26, pos = new Float32Array(stacks.length * per * 3), seeds = new Float32Array(stacks.length * per);
    stacks.forEach((s, si) => {
      const w = s.clone().applyMatrix4(base);
      for (let k = 0; k < per; k++) {
        pos.set([w.x, w.y, w.z], (si * per + k) * 3);
        seeds[si * per + k] = k / per + si * 0.137;
      }
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
    const smoke = new THREE.Points(g, this.smokeMaterial);
    smoke.frustumCulled = false;
    smoke.renderOrder = 4;
    this.group.add(smoke);
  }

  dispose(): void {
    this.group.traverse((o) => { if (o instanceof THREE.Mesh || o instanceof THREE.Points) o.geometry.dispose(); });
    this.material.dispose();
    this.smokeMaterial.dispose();
  }
}
