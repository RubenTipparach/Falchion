import * as THREE from 'three';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { FleetMovement, arrivalTurn, progressAtTime } from '../../core/fleet/Fleet';
import { hexToWorld } from '../../core/hex/Hex';
import type { ShipDesign } from '../../core/ships/ShipDesign';
import type { ShipFactory } from '../ships/ShipFactory';
import type { ShipModel } from '../ships/ShipKit';
import type { MapLayer, ViewState } from './MapLayer';

export interface FleetView {
  readonly id: string;
  readonly name: string;
  readonly owner: string;
  readonly color: string;
  readonly movement: FleetMovement;
  readonly design: ShipDesign;
  /** Extra label line, e.g. supply and ammunition. */
  readonly status?: string;
}

interface FleetVisual {
  readonly root: THREE.Group;
  readonly model: ShipModel;
  readonly line: THREE.Line;
  readonly label: CSS2DObject;
  fleet: FleetView;
  readonly start: THREE.Vector3;
  readonly end: THREE.Vector3;
  /** Displayed progress; follows the continuous journey, easing over reroutes. */
  shown: number;
}

/**
 * Moving fleets: route line, procedural ship and ETA label. The ship is drawn on
 * the straight line from origin to destination with a fixed heading; the core
 * route decides which hex it logically occupies each year.
 */
export class FleetLayer implements MapLayer {
  readonly object3d = new THREE.Group();
  private readonly visuals = new Map<string, FleetVisual>();
  private time = 0;
  private lastTime = 0;

  constructor(private readonly ships: ShipFactory, private readonly formatEta: (turns: number) => string) {}

  /** World time in years, fractional: ships glide between yearly ticks. */
  setTime(time: number): void {
    this.time = time;
  }

  setFleets(fleets: readonly FleetView[]): void {
    const ids = new Set(fleets.map((f) => f.id));
    for (const [id, v] of this.visuals) if (!ids.has(id)) this.removeVisual(id, v);
    for (const f of fleets) {
      const existing = this.visuals.get(f.id);
      if (existing && existing.fleet.movement === f.movement && existing.fleet.design === f.design) { existing.fleet = f; continue; }
      if (existing) this.removeVisual(f.id, existing);
      this.visuals.set(f.id, this.createVisual(f));
    }
  }

  update(view: ViewState): void {
    const dt = Math.min(0.1, Math.max(0, view.time - this.lastTime));
    this.lastTime = view.time;
    const ease = 1 - Math.exp(-4 * dt);
    const scale = Math.max(0.4, view.visibleWidth * 0.03);
    // Dashes rescale in power-of-two steps so routes read as dashed lines at any zoom.
    const dash = 2 ** Math.round(Math.log2(Math.max(1e-3, view.visibleWidth * 0.012)));
    for (const v of this.visuals.values()) {
      const target = progressAtTime(v.fleet.movement, this.time);
      v.shown += (target - v.shown) * ease;
      if (Math.abs(target - v.shown) < 1e-3) v.shown = target;
      v.root.position.lerpVectors(v.start, v.end, v.shown);
      v.model.group.scale.setScalar(scale / 4);
      v.model.animate(view.time);
      const remaining = arrivalTurn(v.fleet.movement) - this.time;
      const mat = v.line.material as THREE.LineDashedMaterial;
      if (mat.dashSize !== dash) { mat.dashSize = dash; mat.gapSize = dash * 0.7; }
      const html = `<b>${v.fleet.name}</b><br>${remaining > 0 ? `ETA ${this.formatEta(remaining)}` : 'Arrived'}${v.fleet.status ? `<br><small>${v.fleet.status}</small>` : ''}`;
      if (v.label.element.innerHTML !== html) v.label.element.innerHTML = html;
      v.label.visible = view.visibleWidth < 4_000;
    }
  }

  private createVisual(fleet: FleetView): FleetVisual {
    const { route } = fleet.movement;
    const a = hexToWorld(route[0]);
    const b = hexToWorld(route[route.length - 1]);
    const start = new THREE.Vector3(a.x, 0.05, a.z);
    const end = new THREE.Vector3(b.x, 0.05, b.z);

    const root = new THREE.Group();
    const model = this.ships.create(fleet.design);
    // Fixed heading: forward (+z) points from origin to destination.
    model.group.rotation.y = Math.atan2(end.x - start.x, end.z - start.z);
    root.add(model.group);

    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([start, end]),
      new THREE.LineDashedMaterial({ color: fleet.color, dashSize: 0.6, gapSize: 0.4, transparent: true, opacity: 0.8 }),
    );
    line.computeLineDistances();
    const el = document.createElement('div');
    el.className = 'fleet-label';
    el.style.borderColor = fleet.color;
    const label = new CSS2DObject(el);
    label.center.set(-0.15, 1.2);
    root.add(label);
    this.object3d.add(root, line);
    return { root, model, line, label, fleet, start, end, shown: progressAtTime(fleet.movement, this.time) };
  }

  private removeVisual(id: string, v: FleetVisual): void {
    this.object3d.remove(v.root, v.line);
    v.root.remove(v.label);
    v.label.element.remove();
    v.model.dispose();
    v.line.geometry.dispose();
    (v.line.material as THREE.Material).dispose();
    this.visuals.delete(id);
  }

  dispose(): void {
    for (const [id, v] of this.visuals) this.removeVisual(id, v);
  }
}
