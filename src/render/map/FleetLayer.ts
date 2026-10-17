import * as THREE from 'three';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { FleetMovement, arrivalTurn, progressAtTime } from '../../core/fleet/Fleet';
import { Hex, hexToWorld } from '../../core/hex/Hex';
import type { ShipDesign } from '../../core/ships/ShipDesign';
import type { ShipFactory } from '../ships/ShipFactory';
import type { ShipModel } from '../ships/ShipKit';
import type { MapLayer, ViewState } from './MapLayer';
import { fade, fadeIn } from './ZoomModel';

/** Height of routes and ships above the galactic plane (ly): close to it, so they meet stars cleanly. */
const LIFT = 0.0004;
/** Radius (ly) of the parking orbit for fleets on station: close to the star, inside the first planet. */
const PARK_ORBIT = 0.046;
/** A ship's real length (ly): smaller than the smallest planet. */
const SHIP_LENGTH = 0.0025;

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
  readonly heading: number;
  readonly modelLength: number;
  readonly parkPhase: number;
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

  constructor(
    private readonly ships: ShipFactory,
    private readonly formatEta: (turns: number) => string,
    /** Where a route hex is drawn: its star if it has one, else the hex centre. */
    private readonly pointAt: (h: Hex) => { readonly x: number; readonly z: number } = hexToWorld,
    /** Called when a fleet's map label is clicked. */
    private readonly onSelect: (fleetId: string) => void = () => {},
  ) {}

  private origin = { x: 0, z: 0 };
  private selectedId: string | null = null;

  /** Highlight one fleet (its label) as selected. */
  setSelected(id: string | null): void {
    this.selectedId = id;
  }

  /** Absolute galaxy position of a fleet's ship right now (for the camera to follow). */
  positionOf(id: string): THREE.Vector3 | null {
    const v = this.visuals.get(id);
    if (!v) return null;
    return v.root.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(this.origin.x, 0, this.origin.z));
  }

  /** Fleet whose ship lies within `maxAngle` (radians) of a pointer ray, closest in angle. */
  pick(ray: THREE.Raycaster, maxAngle = 0.02): string | null {
    let best: string | null = null, bestA = maxAngle;
    const p = new THREE.Vector3();
    for (const [id, v] of this.visuals) {
      if (!v.root.visible) continue;
      v.root.getWorldPosition(p).sub(ray.ray.origin);
      const a = p.angleTo(ray.ray.direction);
      if (a < bestA) { bestA = a; best = id; }
    }
    return best;
  }

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
    this.origin = view.origin;
    const dt = Math.min(0.1, Math.max(0, view.time - this.lastTime));
    this.lastTime = view.time;
    const ease = 1 - Math.exp(-4 * dt);
    // Ships have a real length (smaller than a planet) and only grow on screen as a
    // marker when zoomed out: never bigger than about 1% of the view.
    const length = Math.max(SHIP_LENGTH, view.visibleWidth * 0.01);
    // Dashes rescale in power-of-two steps so routes read as dashed lines at any zoom.
    const dash = 2 ** Math.round(Math.log2(Math.max(1e-3, view.visibleWidth * 0.012)));
    const park = fade(view.visibleWidth, 4, 12);
    // Inside a star system routes are clutter: they fade out as the system fills the view,
    // and only fleets actually in (or near) the system stay drawn.
    const routeOpacity = 0.8 * fadeIn(view.visibleWidth, 4, 12);
    const local = view.visibleWidth < 9;
    const fx = view.focus.x, fz = view.focus.z; // ship roots are in absolute galaxy coordinates
    for (const v of this.visuals.values()) {
      const target = progressAtTime(v.fleet.movement, this.time);
      v.shown += (target - v.shown) * ease;
      if (Math.abs(target - v.shown) < 1e-3) v.shown = target;
      v.root.position.lerpVectors(v.start, v.end, v.shown);
      // Up close, a fleet on station parks in a slow orbit outside the planets instead of
      // sitting inside the star, and turns to fly along that orbit.
      if (v.shown >= 1 && park > 0) {
        const a = v.parkPhase + view.time * 0.04;
        v.root.position.x += Math.cos(a) * PARK_ORBIT * park;
        v.root.position.z += Math.sin(a) * PARK_ORBIT * park;
        v.model.group.rotation.y = v.heading + (-a - v.heading) * park;
      } else v.model.group.rotation.y = v.heading;
      v.model.group.scale.setScalar(length / v.modelLength);
      v.model.animate(view.time);
      const remaining = arrivalTurn(v.fleet.movement) - this.time;
      const mat = v.line.material as THREE.LineDashedMaterial;
      if (mat.dashSize !== dash) { mat.dashSize = dash; mat.gapSize = dash * 0.7; }
      mat.opacity = routeOpacity;
      v.line.visible = routeOpacity > 0.01;
      const near = !local || Math.hypot(v.root.position.x - fx, v.root.position.z - fz) < Math.max(1, view.visibleWidth * 1.5);
      v.root.visible = near;
      const html = `<b>${v.fleet.name}</b><br>${remaining > 0 ? `ETA ${this.formatEta(remaining)}` : 'Arrived'}${v.fleet.status ? `<br><small>${v.fleet.status}</small>` : ''}`;
      if (v.label.element.innerHTML !== html) v.label.element.innerHTML = html;
      v.label.element.classList.toggle('selected', v.fleet.id === this.selectedId);
      v.label.visible = near && view.visibleWidth < 4_000;
    }
  }

  private createVisual(fleet: FleetView): FleetVisual {
    const { route } = fleet.movement;
    // Routes run between the actual stars (which sit off-centre in their hexes), on the plane.
    const a = this.pointAt(route[0]);
    const b = this.pointAt(route[route.length - 1]);
    const start = new THREE.Vector3(a.x, LIFT, a.z);
    const end = new THREE.Vector3(b.x, LIFT, b.z);

    const root = new THREE.Group();
    const model = this.ships.create(fleet.design);
    // Fixed heading: forward (+z) points from origin to destination.
    // Measure the hull once so every design is drawn at the same length.
    const size = new THREE.Box3().setFromObject(model.group).getSize(new THREE.Vector3());
    const modelLength = Math.max(size.x, size.y, size.z, 1e-6);
    const heading = Math.atan2(end.x - start.x, end.z - start.z);
    model.group.rotation.y = heading;
    root.add(model.group);

    // Vertices relative to the line's own start: absolute coordinates (~20,000 ly) lose
    // float32 precision at system scale. The offset lives in the (double precision) matrix.
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), end.clone().sub(start)]),
      new THREE.LineDashedMaterial({ color: fleet.color, dashSize: 0.6, gapSize: 0.4, transparent: true, opacity: 0.8 }),
    );
    line.position.copy(start);
    line.computeLineDistances();
    const el = document.createElement('div');
    el.className = 'fleet-label';
    el.style.borderColor = fleet.color;
    el.title = `Select ${fleet.name}`;
    el.addEventListener('pointerdown', (e) => e.stopPropagation());
    el.addEventListener('click', (e) => { e.stopPropagation(); this.onSelect(fleet.id); });
    const label = new CSS2DObject(el);
    label.center.set(-0.15, 1.2);
    root.add(label);
    this.object3d.add(root, line);
    // Spread fleets parked at the same star around the orbit (stable per fleet).
    let h = 0;
    for (const ch of fleet.id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return { root, model, line, label, fleet, start, end, heading, modelLength, parkPhase: (h % 360) * (Math.PI / 180), shown: progressAtTime(fleet.movement, this.time) };
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
