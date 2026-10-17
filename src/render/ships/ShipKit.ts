import * as THREE from 'three';
import { Rng, hashSeed } from '../../core/rng/Rng';
import type { ShipDesign } from '../../core/ships/ShipDesign';

export type PartType = 'hull' | 'engine' | 'weapon' | 'wing' | 'detail' | 'trait';

export interface PartRecord {
  readonly type: PartType;
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface ShipModel {
  readonly group: THREE.Group;
  readonly parts: readonly PartRecord[];
  /** Advance idle animations (drones, pulses). */
  animate(time: number): void;
  dispose(): void;
}

type Animator = (time: number) => void;

/**
 * Shared toolkit every ship style and trait builds with: materials from the
 * design palette, oriented primitives, mirroring and part bookkeeping.
 * Forward is +z; the ship is centred on the origin, about 4 units long at length=1.
 */
export class ShipKit {
  readonly group = new THREE.Group();
  readonly rng: Rng;
  readonly L: number;
  readonly B: number;
  readonly mat: {
    readonly hull: THREE.MeshStandardMaterial;
    readonly detail: THREE.MeshStandardMaterial;
    readonly accent: THREE.MeshStandardMaterial;
    readonly glow: THREE.MeshBasicMaterial;
    readonly gold: THREE.MeshStandardMaterial;
  };
  private readonly parts: PartRecord[] = [];
  private hull: { size: THREE.Vector3; center: THREE.Vector3 } | null = null;
  private readonly animators: Animator[] = [];
  private readonly ownedMaterials: THREE.Material[] = [];

  constructor(readonly design: ShipDesign, opts: { flat?: boolean } = {}) {
    this.rng = new Rng(hashSeed(design.seed, design.style));
    this.L = 4 * design.length;
    this.B = design.bulk;
    const flatShading = opts.flat ?? false;
    this.mat = {
      hull: this.own(new THREE.MeshStandardMaterial({ color: design.colors.primary, metalness: 0.55, roughness: 0.45, flatShading })),
      detail: this.own(new THREE.MeshStandardMaterial({ color: design.colors.secondary, metalness: 0.4, roughness: 0.6, flatShading })),
      accent: this.own(new THREE.MeshStandardMaterial({ color: design.colors.accent, emissive: design.colors.accent, emissiveIntensity: 0.8, roughness: 0.3 })),
      glow: this.own(new THREE.MeshBasicMaterial({ color: design.colors.accent, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false })),
      gold: this.own(new THREE.MeshStandardMaterial({ color: '#d4af37', metalness: 0.9, roughness: 0.25 })),
    };
  }

  own<M extends THREE.Material>(m: M): M {
    this.ownedMaterials.push(m);
    return m;
  }

  /** Add a mesh at a position and record it as a part. */
  add<T extends THREE.Object3D>(obj: T, type: PartType, x = 0, y = 0, z = 0, parent: THREE.Object3D = this.group): T {
    obj.position.set(x, y, z);
    parent.add(obj);
    this.parts.push({ type, x: round(x), y: round(y), z: round(z) });
    return obj;
  }

  /** Add the object and a copy mirrored across x = 0 (skipped when on the centreline). */
  addMirrored(make: () => THREE.Object3D, type: PartType, x: number, y: number, z: number): void {
    const a = this.add(make(), type, x, y, z);
    if (Math.abs(x) < 1e-6) return;
    const b = this.add(make(), type, -x, y, z);
    b.rotation.set(a.rotation.x, -a.rotation.y, -a.rotation.z);
    b.scale.copy(a.scale);
  }

  onAnimate(fn: Animator): void {
    this.animators.push(fn);
  }

  // ── Primitives (all oriented along z) ───────────────────────────────

  /** Revolve a profile of [radius, z] pairs around the z axis. */
  lathe(profile: ReadonlyArray<readonly [number, number]>, material: THREE.Material, segments = 24): THREE.Mesh {
    const pts = profile.map(([r, z]) => new THREE.Vector2(Math.max(0.0001, r), z));
    const geo = new THREE.LatheGeometry(pts, segments).rotateX(Math.PI / 2);
    return new THREE.Mesh(geo, material);
  }

  box(w: number, h: number, d: number, material: THREE.Material): THREE.Mesh {
    return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  }

  /** Cylinder along z; `rFront` at +z. */
  cyl(rFront: number, rBack: number, len: number, material: THREE.Material, segments = 16): THREE.Mesh {
    return new THREE.Mesh(new THREE.CylinderGeometry(rFront, rBack, len, segments).rotateX(Math.PI / 2), material);
  }

  sphere(r: number, material: THREE.Material, sx = 1, sy = 1, sz = 1, segments = 16): THREE.Mesh {
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, segments, Math.max(8, segments / 2 + 2)), material);
    m.scale.set(sx, sy, sz);
    return m;
  }

  tube(points: THREE.Vector3[], radius: number, material: THREE.Material): THREE.Mesh {
    const curve = new THREE.CatmullRomCurve3(points);
    return new THREE.Mesh(new THREE.TubeGeometry(curve, 24, radius, 6, false), material);
  }

  // ── Standard parts ─────────────────────────────────────────────────

  /** Engine nozzle facing -z with an additive glow. */
  engine(x: number, y: number, z: number, r: number, shape: 'round' | 'square' = 'round'): void {
    const g = new THREE.Group();
    const nozzle = shape === 'round' ? this.cyl(r * 0.8, r, r * 1.2, this.mat.detail, 14) : this.box(r * 1.8, r * 1.8, r * 1.2, this.mat.detail);
    g.add(nozzle);
    const glowGeo = shape === 'round' ? new THREE.CircleGeometry(r * 0.85, 16) : new THREE.PlaneGeometry(r * 1.5, r * 1.5);
    const glow = new THREE.Mesh(glowGeo, this.mat.glow);
    glow.rotation.y = Math.PI;
    glow.position.z = -r * 0.61;
    g.add(glow);
    const plume = new THREE.Mesh(new THREE.ConeGeometry(r * 0.7, r * 3, 12, 1, true).rotateX(-Math.PI / 2), this.mat.glow);
    plume.position.z = -r * 2;
    g.add(plume);
    this.add(g, 'engine', x, y, z);
    const phase = this.rng.next() * 6;
    this.onAnimate((t) => plume.scale.set(1, 1, 0.85 + 0.15 * Math.sin(t * 18 + phase)));
  }

  /** Turret with a barrel pointing +z. `up` = 1 for top, -1 for underside. */
  turret(x: number, y: number, z: number, size: number, up = 1): void {
    const g = new THREE.Group();
    const base = new THREE.Mesh(new THREE.CylinderGeometry(size, size * 1.2, size * 0.7, 10), this.mat.detail);
    g.add(base);
    const barrel = this.cyl(size * 0.18, size * 0.22, size * 2.2, this.mat.hull, 8);
    barrel.position.set(0, size * 0.25, size * 1.1);
    g.add(barrel);
    g.scale.y = up;
    this.add(g, 'weapon', x, y, z);
  }

  /** Evenly spread `count` positions symmetric about x=0 for engines etc. */
  symmetricSlots(count: number, spread: number): number[] {
    if (count === 1) return [0];
    return Array.from({ length: count }, (_, i) => -spread + (2 * spread * i) / (count - 1));
  }

  /** Points on a circle (for radial engine clusters). */
  ringSlots(count: number, radius: number): Array<[number, number]> {
    if (count === 1) return [[0, 0]];
    return Array.from({ length: count }, (_, i) => {
      const a = (i / count) * Math.PI * 2 + Math.PI / 2;
      return [Math.cos(a) * radius, Math.sin(a) * radius];
    });
  }

  bounds(): THREE.Box3 {
    this.group.updateMatrixWorld(true);
    return new THREE.Box3().setFromObject(this.group);
  }

  /** Snapshot the style's hull size so trait decorators don't size off each other. */
  freezeHull(): void {
    const box = this.bounds();
    this.hull = { size: box.getSize(new THREE.Vector3()), center: box.getCenter(new THREE.Vector3()) };
  }

  /** Hull size/centre as built by the style (before traits). */
  hullBox(): { size: THREE.Vector3; center: THREE.Vector3 } {
    if (!this.hull) this.freezeHull();
    return { size: this.hull!.size.clone(), center: this.hull!.center.clone() };
  }

  finish(): ShipModel {
    const { group, parts, animators, ownedMaterials } = this;
    return {
      group,
      parts: [...parts],
      animate: (t) => animators.forEach((a) => a(t)),
      dispose: () => {
        group.traverse((o) => {
          if (o instanceof THREE.Mesh || o instanceof THREE.Line) o.geometry.dispose();
        });
        ownedMaterials.forEach((m) => m.dispose());
      },
    };
  }
}

const round = (v: number) => Math.round(v * 1000) / 1000;
