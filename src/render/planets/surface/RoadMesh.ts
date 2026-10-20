import * as THREE from 'three';
import { Road, resample } from '../../../core/surface/Roads';
import { Vec3, isLand } from '../../../core/surface/Terrain';
import { ROAD_FRAG, ROAD_VERT } from './shaders';
import type { SurfaceTerrain } from './SurfaceTerrain';

/** Spacing of the drawn road's points (planet radii): close enough to follow the ground. */
const DRAW_STEP = 0.0012;
/** Road width on the ground (planet radii, a few kilometres); extra links are narrower. */
const WIDTH = 0.0009;

/**
 * The colony's roads as ribbons (one draw call). Points carry only where they are on the sphere;
 * the vertex shader (ROAD_VERT) lays them on the terrain as drawn this frame, so they neither
 * float nor sink as the detail patch moves. Flat decoration: double-sided, drawn over the terrain.
 */
export class RoadMesh {
  readonly mesh: THREE.Mesh | null;
  private readonly material: THREE.ShaderMaterial;

  constructor(roads: readonly Road[], terrain: SurfaceTerrain) {
    this.material = new THREE.ShaderMaterial({
      uniforms: { ...terrain.uniforms, uWidth: { value: WIDTH }, uPx: { value: 0.001 } },
      vertexShader: ROAD_VERT, fragmentShader: ROAD_FRAG,
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4,
    });
    const geo = roads.length ? ribbons(roads, terrain) : null;
    this.mesh = geo ? new THREE.Mesh(geo, this.material) : null;
    if (this.mesh) {
      this.mesh.frustumCulled = false;
      this.mesh.renderOrder = 1;
    }
  }

  /** World size of one screen pixel at distance 1 (sets the narrowest a road is drawn). */
  setPixelSize(px: number): void {
    this.material.uniforms.uPx.value = px;
  }

  dispose(): void {
    this.mesh?.geometry.dispose();
    this.material.dispose();
  }
}

function ribbons(roads: readonly Road[], terrain: SurfaceTerrain): THREE.BufferGeometry {
  const lines = roads.map((r) => ({ pts: resample(r.path, DRAW_STEP), trunk: r.trunk }));
  const V = lines.reduce((n, l) => n + l.pts.length * 2, 0);
  const pos = new Float32Array(V * 3), tan = new Float32Array(V * 3), side = new Float32Array(V);
  const along = new Float32Array(V), bridge = new Float32Array(V), trunk = new Float32Array(V);
  const idx: number[] = [];
  let v = 0;
  for (const { pts, trunk: isTrunk } of lines) {
    let dist = 0;
    for (let k = 0; k < pts.length; k++) {
      const p = pts[k], a = pts[Math.max(k - 1, 0)], b = pts[Math.min(k + 1, pts.length - 1)];
      const t: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      const tl = Math.hypot(...t) || 1;
      if (k > 0) dist += Math.hypot(p[0] - a[0], p[1] - a[1], p[2] - a[2]);
      const wet = !isLand(terrain.look, terrain.shapedHeight(p[0], p[1], p[2])) ? 1 : 0;
      for (const s of [-1, 1]) {
        pos.set(p, v * 3);
        tan.set([t[0] / tl, t[1] / tl, t[2] / tl], v * 3);
        side[v] = s;
        along[v] = dist;
        bridge[v] = wet;
        trunk[v] = isTrunk ? 1 : 0;
        v++;
      }
      if (k < pts.length - 1) {
        const i = v - 2;
        idx.push(i, i + 1, i + 3, i, i + 3, i + 2);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aTan', new THREE.BufferAttribute(tan, 3));
  g.setAttribute('aSide', new THREE.BufferAttribute(side, 1));
  g.setAttribute('aAlong', new THREE.BufferAttribute(along, 1));
  g.setAttribute('aBridge', new THREE.BufferAttribute(bridge, 1));
  g.setAttribute('aTrunk', new THREE.BufferAttribute(trunk, 1));
  g.setIndex(idx);
  return g;
}
