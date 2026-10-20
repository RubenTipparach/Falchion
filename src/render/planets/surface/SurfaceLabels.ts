import * as THREE from 'three';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';

/** When a label shows: by the rig's distance to the ground `d` and the camera's distance to it. */
type Show = (d: number, dist: number, engaged: boolean) => boolean;

interface Label {
  readonly obj: CSS2DObject;
  readonly show: Show;
}

export type LabelKind = 'capital' | 'city' | 'town' | 'site' | 'survey';

/**
 * The surface's CSS2D labels (drawn by the map's label renderer, styled like the map's own):
 * settlements and special buildings. Each is a button; clicking flies the camera there. Labels on
 * the far side of the planet, or off the screen, are hidden.
 */
export class SurfaceLabels {
  readonly group = new THREE.Group();
  private readonly labels: Label[] = [];

  add(kind: LabelKind, name: string, detail: string, at: THREE.Vector3, show: Show, onClick: (() => void) | null): void {
    const el = document.createElement(onClick ? 'button' : 'div');
    el.className = `surface-label ${kind}`;
    const b = document.createElement('b');
    b.textContent = name;
    el.append(b);
    if (detail) {
      const s = document.createElement('small');
      s.textContent = detail;
      b.append(s);
    }
    if (onClick) {
      el.title = `Fly to ${name}`;
      el.addEventListener('click', (e) => { e.stopPropagation(); onClick(); });
      el.addEventListener('pointerdown', (e) => e.stopPropagation());
    }
    const obj = new CSS2DObject(el);
    obj.center.set(0, 0.5);
    obj.position.copy(at);
    this.group.add(obj);
    this.labels.push({ obj, show });
  }

  /** Per frame: which labels show from a camera at `cam` (planet frame). */
  update(cam: THREE.Vector3, d: number, engaged: boolean): void {
    const toCam = new THREE.Vector3();
    for (const l of this.labels) {
      const p = l.obj.position;
      toCam.subVectors(cam, p);
      const dist = toCam.length();
      // Hidden behind the planet's limb.
      const facing = toCam.dot(p) / Math.max(p.length(), 1e-6) > -0.002;
      l.obj.visible = facing && l.show(d, dist, engaged);
    }
  }

  /** Hide every label now (the view stopped drawing them, so the label renderer will not). */
  hide(): void {
    for (const l of this.labels) l.obj.element.style.display = 'none';
  }

  dispose(): void {
    for (const l of this.labels) {
      l.obj.removeFromParent();
      l.obj.element.remove();
    }
    this.labels.length = 0;
  }
}
