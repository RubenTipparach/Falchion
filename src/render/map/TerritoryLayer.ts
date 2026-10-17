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

/** Filled hex territory for each empire, plus an always-visible name marker. */
export class TerritoryLayer implements MapLayer {
  readonly object3d = new THREE.Group();
  private readonly fills = new THREE.Group();
  private readonly markers: CSS2DObject[] = [];
  private readonly materials: THREE.Material[] = [];

  constructor(claims: readonly TerritoryClaim[]) {
    const hexGeo = new THREE.CircleGeometry(HEX_SIZE * 0.96, 6).rotateX(-Math.PI / 2);
    const m = new THREE.Matrix4();
    for (const claim of claims) {
      const cells = new Map<string, Hex>();
      for (const c of claim.colonies) for (const h of hexSpiral(c.hex, c.radius)) cells.set(hexKey(h), h);
      const mat = new THREE.MeshBasicMaterial({ color: claim.color, transparent: true, opacity: 0.2, depthWrite: false });
      this.materials.push(mat);
      const mesh = new THREE.InstancedMesh(hexGeo, mat, cells.size);
      [...cells.values()].forEach((h, i) => {
        const p = hexToWorld(h);
        mesh.setMatrixAt(i, m.makeTranslation(p.x, -0.01, p.z));
      });
      mesh.renderOrder = 0;
      this.fills.add(mesh);

      const el = document.createElement('div');
      el.className = `empire-marker ${claim.kind}`;
      el.innerHTML = `<span class="dot" style="background:${claim.color}"></span>${claim.name}`;
      const marker = new CSS2DObject(el);
      const hp = hexToWorld(claim.home);
      marker.position.set(hp.x, 0, hp.z);
      this.markers.push(marker);
      this.object3d.add(marker);
    }
    this.object3d.add(this.fills);
  }

  update(view: ViewState): void {
    const opacity = fade(view.visibleWidth, 600, 1_500) * fadeIn(view.visibleWidth, 4, 9);
    this.fills.visible = opacity > 0.01;
    this.materials.forEach((m) => (m.opacity = 0.2 * opacity));
    const showMarkers = view.visibleWidth > 80;
    this.markers.forEach((mk) => (mk.visible = showMarkers));
  }

  dispose(): void {
    this.fills.children.forEach((c) => (c as THREE.InstancedMesh).geometry.dispose());
    this.materials.forEach((m) => m.dispose());
  }
}
