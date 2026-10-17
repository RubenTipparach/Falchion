import * as THREE from 'three';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { FleetMovement, arrivalDay, progressAt } from '../../core/fleet/Fleet';
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
}

interface FleetVisual {
  readonly root: THREE.Group;
  readonly model: ShipModel;
  readonly line: THREE.Line;
  readonly label: CSS2DObject;
  readonly fleet: FleetView;
}

/** Moving fleets: route line, procedural ship model and ETA label, positioned from game time. */
export class FleetLayer implements MapLayer {
  readonly object3d = new THREE.Group();
  private readonly visuals = new Map<string, FleetVisual>();
  private day = 0;

  constructor(private readonly ships: ShipFactory, private readonly formatEta: (days: number) => string) {}

  setDay(day: number): void {
    this.day = day;
  }

  setFleets(fleets: readonly FleetView[]): void {
    const ids = new Set(fleets.map((f) => f.id));
    for (const [id, v] of this.visuals) if (!ids.has(id)) this.removeVisual(id, v);
    for (const f of fleets) {
      const existing = this.visuals.get(f.id);
      if (existing && existing.fleet === f) continue;
      if (existing) this.removeVisual(f.id, existing);
      this.visuals.set(f.id, this.createVisual(f));
    }
  }

  update(view: ViewState): void {
    const scale = Math.max(0.4, view.visibleWidth * 0.03);
    for (const v of this.visuals.values()) {
      const { route } = v.fleet.movement;
      const t = progressAt(v.fleet.movement, this.day) * (route.length - 1);
      const i = Math.min(route.length - 2, Math.floor(t));
      const a = hexToWorld(route[Math.max(0, i)]);
      const b = hexToWorld(route[Math.min(route.length - 1, i + 1)]);
      const f = route.length > 1 ? t - i : 0;
      const x = a.x + (b.x - a.x) * f, z = a.z + (b.z - a.z) * f;
      v.root.position.set(x, 0.05, z);
      const end = hexToWorld(route[route.length - 1]);
      v.model.group.rotation.y = Math.atan2(end.x - x, end.z - z);
      v.model.group.scale.setScalar(scale / 4);
      v.model.animate(view.time);
      const remaining = arrivalDay(v.fleet.movement) - this.day;
      v.label.element.innerHTML = `<b>${v.fleet.name}</b><br>${remaining > 0 ? `ETA ${this.formatEta(remaining)}` : 'Arrived'}`;
      v.label.visible = view.visibleWidth < 4_000;
      v.label.position.set(0, 0, 0);
    }
  }

  private createVisual(fleet: FleetView): FleetVisual {
    const root = new THREE.Group();
    const model = this.ships.create(fleet.design);
    root.add(model.group);
    const pts = fleet.movement.route.map((h) => {
      const p = hexToWorld(h);
      return new THREE.Vector3(p.x, 0.02, p.z);
    });
    const ends = [pts[0], pts[pts.length - 1]];
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(ends),
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
    return { root, model, line, label, fleet };
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
