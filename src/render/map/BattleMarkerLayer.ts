import * as THREE from 'three';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { HEX_SIZE } from '../../core/hex/Hex';
import type { MapLayer, ViewState } from './MapLayer';

/** A battle at sea that can be watched, where the map draws it. */
export interface BattleMarker {
  /** Stable id of the battle (both fleets). */
  readonly key: string;
  /** Centre of its hex (absolute galaxy coordinates). */
  readonly x: number;
  readonly z: number;
  readonly round: number;
  /** Who fights whom, for the tooltip. */
  readonly title: string;
}

interface MarkerVisual {
  readonly root: THREE.Group;
  readonly fill: THREE.Mesh;
  readonly rim: THREE.LineLoop;
  readonly label: CSS2DObject;
  marker: BattleMarker;
}

const SWORDS = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 19L19 5M14 5h5v5"/><path d="M19 19L5 5M5 10V5h5"/></svg>';

/** A flat-topped hex the size of a map hex, on the galactic plane. */
function hexShape(): THREE.Vector3[] {
  return Array.from({ length: 6 }, (_, i) => new THREE.Vector3(Math.cos((Math.PI / 3) * i) * HEX_SIZE, 0, Math.sin((Math.PI / 3) * i) * HEX_SIZE));
}

/**
 * Every battle at sea you can see: a pulsing red hex where it is fought and a crossed-swords
 * marker with its round. Clicking the marker opens the battle view.
 */
export class BattleMarkerLayer implements MapLayer {
  readonly object3d = new THREE.Group();
  private readonly visuals = new Map<string, MarkerVisual>();
  private readonly fillGeo: THREE.BufferGeometry;
  private readonly rimGeo: THREE.BufferGeometry;

  constructor(private readonly onOpen: (key: string) => void) {
    const pts = hexShape();
    this.rimGeo = new THREE.BufferGeometry().setFromPoints(pts);
    const fill = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), ...pts]);
    fill.setIndex([0, 2, 1, 0, 3, 2, 0, 4, 3, 0, 5, 4, 0, 6, 5, 0, 1, 6]);
    this.fillGeo = fill;
  }

  setBattles(markers: readonly BattleMarker[]): void {
    const keep = new Set(markers.map((m) => m.key));
    for (const [key, v] of this.visuals) if (!keep.has(key)) this.remove(key, v);
    for (const m of markers) {
      const v = this.visuals.get(m.key) ?? this.create(m);
      v.marker = m;
      v.root.position.set(m.x, 0.0006, m.z);
      const html = `${SWORDS}<span>Round ${m.round}</span>`;
      if (v.label.element.innerHTML !== html) v.label.element.innerHTML = html;
      v.label.element.title = `${m.title}: watch the battle`;
      v.label.element.setAttribute('aria-label', `Battle, round ${m.round}: ${m.title}. Watch it`);
    }
  }

  private create(m: BattleMarker): MarkerVisual {
    const root = new THREE.Group();
    const fill = new THREE.Mesh(this.fillGeo, new THREE.MeshBasicMaterial({ color: '#ff3b3b', transparent: true, opacity: 0.2, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
    const rim = new THREE.LineLoop(this.rimGeo, new THREE.LineBasicMaterial({ color: '#ff5d5d', transparent: true, opacity: 0.9, depthWrite: false }));
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'battle-marker';
    el.addEventListener('pointerdown', (e) => e.stopPropagation());
    el.addEventListener('click', (e) => { e.stopPropagation(); this.onOpen(this.visuals.get(m.key)?.marker.key ?? m.key); });
    const label = new CSS2DObject(el);
    label.center.set(0.5, 1.4);
    root.add(fill, rim, label);
    this.object3d.add(root);
    const v = { root, fill, rim, label, marker: m };
    this.visuals.set(m.key, v);
    return v;
  }

  update(view: ViewState): void {
    const pulse = 0.5 + 0.5 * Math.sin(view.time * 4);
    // Far out, a hex is a speck: the marker keeps the battle findable; the hex grows a little.
    const grow = Math.max(1, view.visibleWidth / 60);
    for (const v of this.visuals.values()) {
      (v.fill.material as THREE.MeshBasicMaterial).opacity = 0.12 + 0.22 * pulse;
      (v.rim.material as THREE.LineBasicMaterial).opacity = 0.5 + 0.5 * pulse;
      v.fill.scale.setScalar(Math.min(grow, 40) * (1 + 0.08 * pulse));
      v.rim.scale.copy(v.fill.scale);
      v.label.visible = view.visibleWidth < 9_000;
    }
  }

  private remove(key: string, v: MarkerVisual): void {
    this.object3d.remove(v.root);
    v.root.remove(v.label);
    v.label.element.remove();
    (v.fill.material as THREE.Material).dispose();
    (v.rim.material as THREE.Material).dispose();
    this.visuals.delete(key);
  }

  dispose(): void {
    for (const [key, v] of this.visuals) this.remove(key, v);
    this.fillGeo.dispose();
    this.rimGeo.dispose();
  }
}
