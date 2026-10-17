import * as THREE from 'three';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { FleetMovement, arrivalTurn, progressAtTime } from '../../core/fleet/Fleet';
import { Hex, hexToWorld } from '../../core/hex/Hex';
import type { ShipDesign } from '../../core/ships/ShipDesign';
import type { ShipFactory } from '../ships/ShipFactory';
import type { ShipModel } from '../ships/ShipKit';
import type { MapLayer, ViewState } from './MapLayer';
import { fade, fadeIn } from './ZoomModel';

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** Height of routes and ships above the galactic plane (ly): close to it, so they meet stars cleanly. */
const LIFT = 0.0004;
/** Radius (ly) of the parking orbit for fleets on station: close to the star, inside the first planet. */
const PARK_ORBIT = 0.046;
/** A ship's real length (ly): smaller than the smallest planet. */
const SHIP_LENGTH = 0.0025;

/**
 * Selection outline: the ship's own geometry drawn again behind it (back faces), pushed out
 * along its normals in screen space so the rim stays a few pixels wide at any zoom.
 */
function outlineMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color('#e6b450') }, uWidth: { value: 3 }, uRes: { value: new THREE.Vector2(1, 1) } },
    vertexShader: `
      uniform float uWidth;
      uniform vec2 uRes;
      void main() {
        vec4 clip = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        vec3 n = normalize(normalMatrix * normal);
        vec2 dir = (projectionMatrix * vec4(n, 0.0)).xy;
        float len = length(dir);
        if (len > 1e-5) clip.xy += dir / len * uWidth * 2.0 / uRes * clip.w;
        gl_Position = clip;
      }`,
    fragmentShader: `
      uniform vec3 uColor;
      void main() { gl_FragColor = vec4(uColor, 1.0); }`,
    side: THREE.BackSide,
  });
}

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

  constructor(
    private readonly ships: ShipFactory,
    private readonly formatEta: (turns: number) => string,
    /** Where a route hex is drawn: its star if it has one, else the hex centre. */
    private readonly pointAt: (h: Hex) => { readonly x: number; readonly z: number } = hexToWorld,
    /** Called when a fleet's map label is clicked. */
    private readonly onSelect: (fleetId: string) => void = () => {},
  ) {}

  private selectedId: string | null = null;
  private readonly outline = outlineMaterial();
  private outlined: THREE.Mesh[] = [];

  /** Highlight one fleet as selected: its label, and an outline around its ship. */
  setSelected(id: string | null): void {
    this.selectedId = id;
    this.applyOutline();
  }

  /** Outline the selected fleet's ship (again after its model is rebuilt) in its empire colour. */
  private applyOutline(): void {
    for (const o of this.outlined) o.removeFromParent();
    this.outlined = [];
    const v = this.selectedId ? this.visuals.get(this.selectedId) : undefined;
    if (!v) return;
    this.outline.uniforms.uColor.value.set(v.fleet.color);
    const meshes: THREE.Mesh[] = [];
    v.model.group.traverse((o) => {
      // Solid hull parts only: additive glows and sprites would outline as blobs.
      if (o instanceof THREE.Mesh && o.geometry.getAttribute('normal') && !(o.material as THREE.Material).transparent) meshes.push(o);
    });
    for (const m of meshes) {
      const rim = new THREE.Mesh(m.geometry, this.outline);
      rim.renderOrder = m.renderOrder;
      m.add(rim);
      this.outlined.push(rim);
    }
  }

  /** Absolute galaxy position of a fleet's ship right now (for the camera to follow). */
  positionOf(id: string): THREE.Vector3 | null {
    const v = this.visuals.get(id);
    if (!v) return null;
    // Ship roots hold absolute galaxy coordinates (this layer sits inside the origin-shifted world),
    // so no origin arithmetic: mixing in a stale origin made the camera chase a phantom after a rebase.
    return v.root.position.clone();
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
      if (existing && existing.fleet.movement === f.movement && existing.fleet.design === f.design && existing.fleet.color === f.color) { existing.fleet = f; continue; }
      if (existing) this.removeVisual(f.id, existing);
      this.visuals.set(f.id, this.createVisual(f));
      if (f.id === this.selectedId) this.applyOutline();
    }
  }

  update(view: ViewState): void {
    this.outline.uniforms.uRes.value.set(view.viewportHeight * view.camera.aspect, view.viewportHeight);
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
      // Exactly where the ship is at this moment: no easing, so it glides at a steady speed
      // (easing toward a moving target and snapping when close made it judder up close).
      v.shown = progressAtTime(v.fleet.movement, this.time);
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
      // Fleet names can come from other players: always escaped.
      const html = `<b>${escapeHtml(v.fleet.name)}</b><br>${remaining > 0 ? `ETA ${this.formatEta(remaining)}` : 'Arrived'}${v.fleet.status ? `<br><small>${escapeHtml(v.fleet.status)}</small>` : ''}`;
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
    el.title = `Select ${fleet.name}`; // title is an attribute: not parsed as HTML
    el.addEventListener('pointerdown', (e) => e.stopPropagation());
    el.addEventListener('click', (e) => { e.stopPropagation(); this.onSelect(fleet.id); });
    const label = new CSS2DObject(el);
    label.center.set(-0.15, 1.2);
    root.add(label);
    // Placed at once, so a rebuilt fleet (new orders) never reports the origin as its position.
    root.position.lerpVectors(start, end, progressAtTime(fleet.movement, this.time));
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
    this.outline.dispose();
  }
}
