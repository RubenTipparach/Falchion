import * as THREE from 'three';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { HEX_SIZE, Hex, hexKey, hexSpiral, hexToWorld } from '../../core/hex/Hex';
import type { MapLayer, ViewState } from './MapLayer';
import { fade, fadeIn } from './ZoomModel';

export interface TerritoryClaim {
  readonly name: string;
  readonly color: string;
  readonly kind: 'player' | 'other-player' | 'alien';
  readonly home: Hex;
  readonly colonies: ReadonlyArray<{ readonly hex: Hex; readonly radius: number }>;
}

/** One set of claims drawn as hex fills and name markers. */
interface ClaimSet {
  readonly group: THREE.Group;
  readonly fills: THREE.Group;
  readonly markers: CSS2DObject[];
  readonly materials: THREE.MeshBasicMaterial[];
}

const HEX_GEO = new THREE.CircleGeometry(HEX_SIZE * 0.96, 6).rotateX(-Math.PI / 2);

/**
 * Filled hex territory for each empire, plus an always-visible name marker.
 * Fixed claims (your empire, the generated neighbours) are drawn once; other
 * players' claims can be replaced at any time with setDynamic.
 */
export class TerritoryLayer implements MapLayer {
  readonly object3d = new THREE.Group();
  private readonly fixed: ClaimSet;
  private dynamic: ClaimSet | null = null;

  constructor(claims: readonly TerritoryClaim[]) {
    this.fixed = this.build(claims);
    this.object3d.add(this.fixed.group);
  }

  /** Replace the live claims (other players in the shared galaxy). */
  setDynamic(claims: readonly TerritoryClaim[]): void {
    if (this.dynamic) {
      this.object3d.remove(this.dynamic.group);
      this.release(this.dynamic);
    }
    this.dynamic = this.build(claims);
    this.object3d.add(this.dynamic.group);
  }

  private build(claims: readonly TerritoryClaim[]): ClaimSet {
    const set: ClaimSet = { group: new THREE.Group(), fills: new THREE.Group(), markers: [], materials: [] };
    const m = new THREE.Matrix4();
    for (const claim of claims) {
      const cells = new Map<string, Hex>();
      for (const c of claim.colonies) for (const h of hexSpiral(c.hex, c.radius)) cells.set(hexKey(h), h);
      const mat = new THREE.MeshBasicMaterial({ color: claim.color, transparent: true, opacity: 0.2, depthWrite: false });
      set.materials.push(mat);
      const mesh = new THREE.InstancedMesh(HEX_GEO, mat, cells.size);
      [...cells.values()].forEach((h, i) => {
        const p = hexToWorld(h);
        mesh.setMatrixAt(i, m.makeTranslation(p.x, -0.01, p.z));
      });
      mesh.renderOrder = 0;
      set.fills.add(mesh);

      const el = document.createElement('div');
      el.className = `empire-marker ${claim.kind}`;
      const dot = document.createElement('span');
      dot.className = 'dot';
      dot.style.background = claim.color;
      el.append(dot, document.createTextNode(claim.name)); // player names are untrusted: no innerHTML
      const marker = new CSS2DObject(el);
      const hp = hexToWorld(claim.home);
      marker.position.set(hp.x, 0, hp.z);
      set.markers.push(marker);
      set.group.add(marker);
    }
    set.group.add(set.fills);
    return set;
  }

  private release(set: ClaimSet): void {
    set.materials.forEach((mat) => mat.dispose());
    set.markers.forEach((mk) => mk.element.remove());
  }

  update(view: ViewState): void {
    const opacity = fade(view.visibleWidth, 600, 1_500) * fadeIn(view.visibleWidth, 4, 9);
    const showMarkers = view.visibleWidth > 80;
    for (const set of this.dynamic ? [this.fixed, this.dynamic] : [this.fixed]) {
      set.fills.visible = opacity > 0.01;
      set.materials.forEach((mat) => (mat.opacity = 0.2 * opacity));
      set.markers.forEach((mk) => (mk.visible = showMarkers));
    }
  }

  dispose(): void {
    this.release(this.fixed);
    if (this.dynamic) this.release(this.dynamic);
  }
}
