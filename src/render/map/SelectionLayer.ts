import * as THREE from 'three';
import type { MapLayer, ViewState } from './MapLayer';

/** Pulsing ring around the selected star, sized to stay visible at any zoom. */
export class SelectionLayer implements MapLayer {
  readonly object3d: THREE.Mesh;
  private readonly material = new THREE.MeshBasicMaterial({ color: '#e6b450', transparent: true, depthWrite: false, side: THREE.DoubleSide });
  private target: { x: number; z: number } | null = null;

  constructor() {
    this.object3d = new THREE.Mesh(new THREE.RingGeometry(0.8, 1, 48).rotateX(-Math.PI / 2), this.material);
    this.object3d.renderOrder = 7;
    this.object3d.visible = false;
  }

  select(pos: { x: number; z: number } | null): void {
    this.target = pos;
  }

  update(view: ViewState): void {
    this.object3d.visible = !!this.target && view.visibleWidth > 9;
    if (!this.target) return;
    const s = Math.max(0.47, view.visibleWidth * 0.012) * (1 + 0.08 * Math.sin(view.time * 4));
    this.object3d.position.set(this.target.x, 0.01, this.target.z);
    this.object3d.scale.setScalar(s);
    this.material.opacity = 0.85;
  }

  dispose(): void {
    this.object3d.geometry.dispose();
    this.material.dispose();
  }
}
