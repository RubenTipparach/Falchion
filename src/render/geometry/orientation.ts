import * as THREE from 'three';

/**
 * Face orientation checks for procedural meshes. A solid part must have its triangles wound
 * counter-clockwise seen from outside (three.js culls the back) and its vertex normals pointing
 * the same way; otherwise it renders inside-out: dark, see-through, or lit from the wrong side.
 */
export interface Orientation {
  /**
   * Signed volume over total unsigned volume, in [-1, 1]: the triangles' tetrahedra from the
   * part's centre (divergence theorem). Exact for closed parts, and still positive for open
   * tubes and curved pipes when they face outward.
   */
  readonly outward: number;
  /** Area-weighted agreement of the stored vertex normals with the face winding, in [-1, 1]. */
  readonly normals: number;
}

const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
const ab = new THREE.Vector3(), ac = new THREE.Vector3(), n = new THREE.Vector3(), mid = new THREE.Vector3(), vn = new THREE.Vector3();

function triangles(geo: THREE.BufferGeometry, visit: (i0: number, i1: number, i2: number) => void): void {
  const index = geo.index;
  const count = index ? index.count : geo.getAttribute('position').count;
  for (let t = 0; t + 2 < count; t += 3) {
    if (index) visit(index.getX(t), index.getX(t + 1), index.getX(t + 2));
    else visit(t, t + 1, t + 2);
  }
}

/** How a geometry's faces and normals are oriented (1 = all correct, -1 = all inverted). */
export function orientation(geo: THREE.BufferGeometry): Orientation {
  const pos = geo.getAttribute('position');
  const nor = geo.getAttribute('normal');
  geo.computeBoundingBox();
  const centre = geo.boundingBox!.getCenter(new THREE.Vector3());
  let signed = 0, unsigned = 0, norm = 0, total = 0;
  triangles(geo, (i0, i1, i2) => {
    a.fromBufferAttribute(pos, i0).sub(centre); b.fromBufferAttribute(pos, i1).sub(centre); c.fromBufferAttribute(pos, i2).sub(centre);
    const vol = a.dot(n.crossVectors(b, c)) / 6;
    signed += vol;
    unsigned += Math.abs(vol);
    n.crossVectors(ab.subVectors(b, a), ac.subVectors(c, a));
    const area = n.length();
    if (area < 1e-12) return;
    n.divideScalar(area);
    if (nor) {
      vn.fromBufferAttribute(nor, i0).add(mid.fromBufferAttribute(nor, i1)).add(mid.fromBufferAttribute(nor, i2));
      if (vn.lengthSq() > 1e-12) norm += area * Math.sign(vn.dot(n));
    }
    total += area;
  });
  const out = unsigned > 1e-15 ? signed / unsigned : 1;
  return total > 0 ? { outward: out, normals: nor ? norm / total : 1 } : { outward: 1, normals: 1 };
}

/** Reverse every triangle's winding, and its normals with it. */
export function flipFaces(geo: THREE.BufferGeometry): void {
  const index = geo.index;
  if (index) {
    for (let t = 0; t + 2 < index.count; t += 3) {
      const i1 = index.getX(t + 1);
      index.setX(t + 1, index.getX(t + 2));
      index.setX(t + 2, i1);
    }
    index.needsUpdate = true;
  } else {
    for (const attr of Object.values(geo.attributes)) {
      const item = attr.itemSize;
      for (let t = 0; t + 2 < attr.count; t += 3) {
        for (let k = 0; k < item; k++) {
          const v = attr.getComponent(t + 1, k);
          attr.setComponent(t + 1, k, attr.getComponent(t + 2, k));
          attr.setComponent(t + 2, k, v);
        }
      }
      attr.needsUpdate = true;
    }
  }
  const nor = geo.getAttribute('normal');
  if (nor) {
    for (let i = 0; i < nor.count; i++) nor.setXYZ(i, -nor.getX(i), -nor.getY(i), -nor.getZ(i));
    nor.needsUpdate = true;
  }
}

/** Flat or open shapes (glows, sails, discs) have no inside, so they are not checked. */
export function isSolid(mesh: THREE.Mesh): boolean {
  const mat = mesh.material as THREE.Material;
  const g = mesh.geometry;
  return !mat.transparent && mat.side !== THREE.DoubleSide
    && !(g instanceof THREE.PlaneGeometry) && !(g instanceof THREE.CircleGeometry) && !(g instanceof THREE.RingGeometry);
}

/**
 * Make a solid part face outward: flip its winding when it is mostly inside-out, then make its
 * vertex normals agree with the winding. Returns what was fixed (for tests and logging).
 */
export function makeOutward(geo: THREE.BufferGeometry): { flipped: boolean; renormalled: boolean } {
  let o = orientation(geo);
  const flipped = o.outward < 0;
  if (flipped) { flipFaces(geo); o = orientation(geo); }
  const renormalled = o.normals < 0;
  if (renormalled) geo.computeVertexNormals();
  return { flipped, renormalled };
}
