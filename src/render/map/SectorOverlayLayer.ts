import * as THREE from 'three';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { AddressScheme, GalacticAddress, QUADRANTS, cellsInRing } from '../../core/galaxy/GalacticAddress';
import type { MapLayer, ViewState } from './MapLayer';
import { fadeIn } from './ZoomModel';

/** Quadrant axes, radial rings and radial cells with labels for galactic addressing. */
export class SectorOverlayLayer implements MapLayer {
  readonly object3d = new THREE.Group();
  private readonly lineMaterial = new THREE.LineBasicMaterial({ color: '#2c6a80', transparent: true, depthWrite: false });
  private readonly axisMaterial = new THREE.LineBasicMaterial({ color: '#7fd3e6', transparent: true, depthWrite: false });
  private readonly highlightMaterial = new THREE.LineBasicMaterial({ color: '#e6b450', transparent: true, depthWrite: false });
  private readonly labels: CSS2DObject[] = [];
  private highlight: THREE.LineLoop | null = null;

  constructor(private readonly radius: number, private readonly scheme: AddressScheme) {
    const rings = Math.ceil(radius / scheme.ringWidth);
    const seg: number[] = [];
    // Ring boundaries sit between ring centres (ring n spans (n-½)w .. (n+½)w).
    for (let n = 0; n <= rings; n++) {
      const r = Math.min(radius, (n + 0.5) * scheme.ringWidth);
      circle(seg, r, 256);
    }
    // Radial cell spokes inside each ring.
    for (let n = 1; n <= rings; n++) {
      const r0 = (n - 0.5) * scheme.ringWidth;
      const r1 = Math.min(radius, (n + 0.5) * scheme.ringWidth);
      const cells = cellsInRing(n, scheme);
      for (let c = 0; c < cells; c++) {
        const a = (c / cells) * Math.PI * 2;
        seg.push(r0 * Math.cos(a), 0, -r0 * Math.sin(a), r1 * Math.cos(a), 0, -r1 * Math.sin(a));
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(seg, 3));
    const grid = new THREE.LineSegments(geo, this.lineMaterial);
    grid.renderOrder = 4;

    const ax = new THREE.BufferGeometry();
    ax.setAttribute('position', new THREE.Float32BufferAttribute([-radius, 0, 0, radius, 0, 0, 0, 0, -radius, 0, 0, radius], 3));
    const axes = new THREE.LineSegments(ax, this.axisMaterial);
    axes.renderOrder = 5;
    this.object3d.add(grid, axes);

    QUADRANTS.forEach((q, i) => {
      const a = (i + 0.5) * (Math.PI / 2);
      this.addLabel(`${q} Quadrant`, 'quadrant-label', radius * 0.78 * Math.cos(a), -radius * 0.78 * Math.sin(a));
    });
    this.addLabel('Galactic Core', 'ring-label', 0, 0);
    for (let n = 1; n <= rings; n++) {
      const a = Math.PI + 0.06;
      this.addLabel(`Ring ${n}`, 'ring-label', n * scheme.ringWidth * Math.cos(a), -n * scheme.ringWidth * Math.sin(a));
    }
  }

  /** Outline the radial cell containing an address (or clear with null). */
  highlightCell(address: GalacticAddress | null): void {
    if (this.highlight) {
      this.object3d.remove(this.highlight);
      this.highlight.geometry.dispose();
      this.highlight = null;
    }
    if (!address) return;
    const w = this.scheme.ringWidth;
    const pts: number[] = [];
    if (address.ring === 0) {
      circle(pts, w / 2, 64, true);
    } else {
      const r0 = (address.ring - 0.5) * w, r1 = Math.min(this.radius, (address.ring + 0.5) * w);
      const a0 = (address.cell / address.cellsInRing) * Math.PI * 2;
      const a1 = ((address.cell + 1) / address.cellsInRing) * Math.PI * 2;
      const steps = 24;
      for (let i = 0; i <= steps; i++) { const a = a0 + ((a1 - a0) * i) / steps; pts.push(r1 * Math.cos(a), 0, -r1 * Math.sin(a)); }
      for (let i = steps; i >= 0; i--) { const a = a0 + ((a1 - a0) * i) / steps; pts.push(r0 * Math.cos(a), 0, -r0 * Math.sin(a)); }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    this.highlight = new THREE.LineLoop(geo, this.highlightMaterial);
    this.highlight.renderOrder = 6;
    this.object3d.add(this.highlight);
  }

  update(view: ViewState): void {
    const opacity = fadeIn(view.visibleWidth, 1_800, 7_000);
    this.object3d.visible = opacity > 0.01;
    this.lineMaterial.opacity = opacity * 0.45;
    this.axisMaterial.opacity = opacity * 0.8;
    this.highlightMaterial.opacity = opacity;
    for (const l of this.labels) {
      l.visible = this.object3d.visible;
      l.element.style.opacity = String(opacity);
    }
  }

  private addLabel(text: string, cls: string, x: number, z: number): void {
    const el = document.createElement('div');
    el.className = cls;
    el.textContent = text;
    const obj = new CSS2DObject(el);
    obj.position.set(x, 0, z);
    this.labels.push(obj);
    this.object3d.add(obj);
  }

  dispose(): void {
    this.object3d.traverse((o) => {
      if (o instanceof THREE.LineSegments || o instanceof THREE.LineLoop) o.geometry.dispose();
    });
    this.lineMaterial.dispose();
    this.axisMaterial.dispose();
    this.highlightMaterial.dispose();
  }
}

function circle(out: number[], r: number, steps: number, asLoop = false): void {
  for (let i = 0; i < steps; i++) {
    const a0 = (i / steps) * Math.PI * 2, a1 = ((i + 1) / steps) * Math.PI * 2;
    if (asLoop) out.push(r * Math.cos(a0), 0, r * Math.sin(a0));
    else out.push(r * Math.cos(a0), 0, r * Math.sin(a0), r * Math.cos(a1), 0, r * Math.sin(a1));
  }
}
