import * as THREE from 'three';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { MEGA_BY_ID, type MegaType } from '../../content/megastructures';
import type { MapLayer, ViewState } from './MapLayer';
import { SYSTEM_VIEW_WIDTH } from './SystemLayer';

/** A megastructure as the galaxy map marks it. */
export interface MegaBeacon {
  readonly starId: string;
  readonly starName: string;
  readonly type: MegaType;
  /** Absolute galaxy coordinates. */
  readonly x: number;
  readonly z: number;
}

/** Wider than this, only the diamonds show (their names would crowd the map)... */
const NAMES_BELOW = 6_000;
/** ...and wider than this, small ones (the whole galaxy holds a few hundred). */
const SMALL_ABOVE = 20_000;

/**
 * Megastructures (change megastructures) are seen from across the galaxy: each is a glowing
 * diamond in its type's colour, named when zoomed in, from far out down to where its system view
 * takes over. Clicking one opens it.
 */
export class MegaBeaconLayer implements MapLayer {
  readonly object3d = new THREE.Group();
  private readonly labels: Array<{ label: CSS2DObject; name: HTMLElement }> = [];
  private small: boolean | null = null;

  constructor(beacons: readonly MegaBeacon[], onOpen: (starId: string) => void) {
    for (const b of beacons) {
      const def = MEGA_BY_ID[b.type];
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'mega-beacon';
      el.style.setProperty('--c', def.color);
      el.title = `${def.name} at ${b.starName}: open it`;
      el.setAttribute('aria-label', `${def.name} at ${b.starName}`);
      const name = document.createElement('span');
      name.textContent = def.name;
      el.append(document.createElement('i'), name);
      el.addEventListener('pointerdown', (e) => e.stopPropagation());
      el.addEventListener('click', (e) => { e.stopPropagation(); onOpen(b.starId); });
      const label = new CSS2DObject(el);
      label.position.set(b.x, 0, b.z);
      this.object3d.add(label);
      this.labels.push({ label, name });
    }
  }

  update(view: ViewState): void {
    const show = view.visibleWidth > SYSTEM_VIEW_WIDTH;
    const named = view.visibleWidth < NAMES_BELOW;
    const small = view.visibleWidth > SMALL_ABOVE;
    for (const { label, name } of this.labels) {
      label.visible = show;
      name.hidden = !named;
      if (small !== this.small) label.element.classList.toggle('far', small);
    }
    this.small = small;
  }

  dispose(): void {
    for (const { label } of this.labels) label.element.remove();
    this.labels.length = 0;
  }
}
