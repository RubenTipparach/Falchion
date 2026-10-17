import * as THREE from 'three';
import type { ShipDesign } from '../../core/ships/ShipDesign';
import type { ShipFactory } from '../ships/ShipFactory';
import type { ShipModel } from '../ships/ShipKit';

/** A class of ship in one empire's colours, as the battle draws it. */
interface Batch {
  readonly model: ShipModel;
  /** One instanced mesh per material of the model (its parts merged). */
  readonly meshes: THREE.InstancedMesh[];
  readonly geos: THREE.BufferGeometry[];
  /** Bounding radius and length of the hull, at scale 1. */
  readonly radius: number;
  readonly length: number;
  n: number;
}

const _m = new THREE.Matrix4(), _s = new THREE.Vector3();

/**
 * Ships of the battle: each class and empire is built once with the game's own ShipFactory, its
 * parts merged by material, and drawn as instances (a few draw calls per class, whatever the
 * fleet's size). Forward is +z, as the factory builds them.
 */
export class ShipBatches {
  readonly group = new THREE.Group();
  private readonly batches = new Map<string, Batch>();

  constructor(private readonly factory: ShipFactory) {}

  /** Make room for `max` ships of this design under `key` (call before drawing). */
  ensure(key: string, design: ShipDesign, max: number): { radius: number; length: number } {
    let b = this.batches.get(key);
    if (!b) {
      b = this.build(design, max);
      this.batches.set(key, b);
      for (const m of b.meshes) this.group.add(m);
    }
    return { radius: b.radius, length: b.length };
  }

  begin(): void {
    for (const b of this.batches.values()) b.n = 0;
  }

  add(key: string, pos: THREE.Vector3, quat: THREE.Quaternion, scale: number): void {
    const b = this.batches.get(key);
    if (!b || b.n >= b.meshes[0]?.instanceMatrix.count) return;
    _m.compose(pos, quat, _s.setScalar(scale));
    for (const m of b.meshes) m.setMatrixAt(b.n, _m);
    b.n++;
  }

  end(): void {
    for (const b of this.batches.values()) {
      for (const m of b.meshes) { m.count = b.n; m.instanceMatrix.needsUpdate = true; }
    }
  }

  private build(design: ShipDesign, max: number): Batch {
    const model = this.factory.create(design);
    model.group.updateMatrixWorld(true);
    const byMat = new Map<THREE.Material, THREE.BufferGeometry[]>();
    model.group.traverse((o) => {
      if (!(o instanceof THREE.Mesh) || Array.isArray(o.material) || !o.visible) return;
      const src = o.geometry as THREE.BufferGeometry;
      if (!src.getAttribute('position')) return;
      const g = src.index ? src.toNonIndexed() : src.clone();
      for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
      if (!g.getAttribute('normal')) g.computeVertexNormals();
      g.applyMatrix4(o.matrixWorld);
      // Mirrored parts (negative scale): keep their faces facing out once the scale is baked in.
      if (o.matrixWorld.determinant() < 0) flipWinding(g);
      const list = byMat.get(o.material) ?? [];
      list.push(g);
      byMat.set(o.material, list);
    });
    const meshes: THREE.InstancedMesh[] = [];
    const geos: THREE.BufferGeometry[] = [];
    let radius = 1, length = 4;
    for (const [mat, list] of byMat) {
      const geo = merge(list);
      geos.push(geo);
      const mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, max));
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      mesh.count = 0;
      if ((mat as THREE.Material).transparent) mesh.renderOrder = 2;
      meshes.push(mesh);
    }
    const box = new THREE.Box3().setFromObject(model.group);
    const size = box.getSize(new THREE.Vector3());
    radius = Math.max(0.5, size.length() / 2);
    length = Math.max(0.5, size.z);
    return { model, meshes, geos, radius, length, n: 0 };
  }

  dispose(): void {
    for (const b of this.batches.values()) {
      for (const m of b.meshes) { this.group.remove(m); m.dispose(); }
      for (const g of b.geos) g.dispose();
      b.model.dispose();
    }
    this.batches.clear();
  }
}

function flipWinding(g: THREE.BufferGeometry): void {
  for (const name of ['position', 'normal']) {
    const arr = (g.getAttribute(name) as THREE.BufferAttribute).array as Float32Array;
    for (let i = 0; i < arr.length; i += 9) for (let k = 0; k < 3; k++) { const t = arr[i + 3 + k]; arr[i + 3 + k] = arr[i + 6 + k]; arr[i + 6 + k] = t; }
  }
}

function merge(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  let n = 0;
  for (const g of list) n += g.getAttribute('position').count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3);
  let o = 0;
  for (const g of list) {
    const p = g.getAttribute('position') as THREE.BufferAttribute, q = g.getAttribute('normal') as THREE.BufferAttribute;
    pos.set(p.array as Float32Array, o * 3);
    nor.set(q.array as Float32Array, o * 3);
    o += p.count;
    g.dispose();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.computeBoundingSphere();
  return geo;
}
