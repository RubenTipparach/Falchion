import * as THREE from 'three';
import { ConvexGeometry } from 'three/examples/jsm/geometries/ConvexGeometry.js';
import { makeOutward } from '../geometry/orientation';

/**
 * Primitives for the thumbnail props, the hard-surface way (the `thumbnails` skill): bodies from
 * one extruded profile, curves from a lathe, tapered blocks from a convex hull, pieces unioned by
 * overlapping. Low poly and flat shaded; every solid faces outward.
 */

/** Colour roles shared by every prop, plus the subject's own colour where a prop asks for it. */
export const ROLES = {
  hull: '#9aa6b8',
  trim: '#5d6878',
  dark: '#2a313d',
  gold: '#e6b450',
  rust: '#7a5a46',
} as const;

export type Finish = 'metal' | 'matte' | 'glass' | 'glow' | 'emissive';

/** A material in one of the studio's finishes. Each prop gets its own (the studio disposes them). */
export function mat(color: string, finish: Finish = 'metal'): THREE.Material {
  switch (finish) {
    case 'glow': return new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
    case 'glass': return new THREE.MeshStandardMaterial({ color, metalness: 0.1, roughness: 0.15, transparent: true, opacity: 0.55, flatShading: true });
    case 'emissive': return new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.9, roughness: 0.35, flatShading: true });
    case 'matte': return new THREE.MeshStandardMaterial({ color, metalness: 0.05, roughness: 0.85, flatShading: true });
    default: return new THREE.MeshStandardMaterial({ color, metalness: 0.55, roughness: 0.42, flatShading: true });
  }
}

/** A prop under construction: solid parts are made outward-facing as they are added. */
export class Prop {
  readonly group = new THREE.Group();

  add(geo: THREE.BufferGeometry, material: THREE.Material, at: Partial<{ x: number; y: number; z: number; rx: number; ry: number; rz: number; s: number }> = {}): THREE.Mesh {
    // Solids only: glows, glass and double-sided sheets have no inside.
    if (!(material instanceof THREE.MeshBasicMaterial) && !material.transparent && material.side !== THREE.DoubleSide) makeOutward(geo);
    const m = new THREE.Mesh(geo, material);
    m.position.set(at.x ?? 0, at.y ?? 0, at.z ?? 0);
    m.rotation.set(at.rx ?? 0, at.ry ?? 0, at.rz ?? 0);
    if (at.s) m.scale.setScalar(at.s);
    this.group.add(m);
    return m;
  }
}

/**
 * An extruded profile: `profile` is the side view in (x, y), extruded `depth` along z and centred.
 * Chamfers belong in the profile (one more vertex), never a blanket bevel.
 */
export function prism(profile: ReadonlyArray<readonly [number, number]>, depth: number): THREE.BufferGeometry {
  const shape = new THREE.Shape(profile.map(([x, y]) => new THREE.Vector2(x, y)));
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 1 });
  return g.translate(0, 0, -depth / 2);
}

/** A box with its top edges chamfered by `c` (the edges that catch the key light). */
export function obox(w: number, h: number, d: number, c = 0): THREE.BufferGeometry {
  if (!c) return new THREE.BoxGeometry(w, h, d);
  const x = w / 2;
  return prism([[-x, 0], [x, 0], [x, h - c], [x - c, h], [-x + c, h], [-x, h - c]], d).translate(0, -h / 2, 0);
}

/** The convex hull of some points: planar faces by construction (crystals, shards, rubble). */
export function hull(points: ReadonlyArray<readonly [number, number, number]>): THREE.BufferGeometry {
  return new ConvexGeometry(points.map(([x, y, z]) => new THREE.Vector3(x, y, z)));
}

/** A profile (radius, height) swept round y in `n` facets. */
export function lathe(profile: ReadonlyArray<readonly [number, number]>, n = 12): THREE.BufferGeometry {
  return new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), n);
}

/** A hexagonal crystal: a prism of radius r with a pointed tip, standing on its base at the origin. */
export function crystal(r: number, h: number, tip = r * 1.6): THREE.BufferGeometry {
  const pts: [number, number, number][] = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    pts.push([Math.cos(a) * r, 0, Math.sin(a) * r], [Math.cos(a) * r, h, Math.sin(a) * r]);
  }
  pts.push([0, h + tip, 0]);
  return hull(pts);
}

/** A ring (torus) in the xz plane. */
export function ring(r: number, tube: number, n = 24): THREE.BufferGeometry {
  return new THREE.TorusGeometry(r, tube, 6, n).rotateX(Math.PI / 2);
}

export function cyl(rTop: number, rBottom: number, h: number, n = 12): THREE.BufferGeometry {
  return new THREE.CylinderGeometry(rTop, rBottom, h, n);
}

export function ball(r: number, detail = 1): THREE.BufferGeometry {
  return new THREE.IcosahedronGeometry(r, detail);
}
