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
 * Selection outline, one ring around the whole ship: the ship marks its pixels in the stencil
 * buffer, then a copy of every part, pushed outward from the ship's centre on screen (plus a
 * little along its normals), is drawn only where the ship is not. Inner edges between parts
 * stay hidden, and flat parts such as wings still grow a rim.
 */
const OUTLINE_STENCIL = 1;

function outlineMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color('#f3a833') }, uWidth: { value: 3 }, uRes: { value: new THREE.Vector2(1, 1) }, uCenter: { value: new THREE.Vector3() } },
    vertexShader: `
      uniform float uWidth;
      uniform vec2 uRes;
      uniform vec3 uCenter;
      void main() {
        vec4 clip = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        vec4 c = projectionMatrix * viewMatrix * vec4(uCenter, 1.0);
        vec2 radial = clip.xy / clip.w - c.xy / c.w;
        vec2 n = (projectionMatrix * vec4(normalize(normalMatrix * normal), 0.0)).xy;
        vec2 dir = (length(radial) > 1e-6 ? normalize(radial * uRes) : vec2(0.0)) + (length(n) > 1e-6 ? 0.5 * normalize(n * uRes) : vec2(0.0));
        if (length(dir) > 1e-6) clip.xy += normalize(dir) * uWidth * 2.0 / uRes * clip.w;
        gl_Position = clip;
      }`,
    fragmentShader: `
      uniform vec3 uColor;
      void main() { gl_FragColor = vec4(uColor, 1.0); }`,
    side: THREE.DoubleSide,
    depthWrite: false,
    stencilWrite: true,
    stencilRef: OUTLINE_STENCIL,
    stencilFunc: THREE.NotEqualStencilFunc,
    stencilFail: THREE.KeepStencilOp,
    stencilZFail: THREE.KeepStencilOp,
    stencilZPass: THREE.KeepStencilOp,
  });
}

type Point = { readonly x: number; readonly z: number };

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
  /** Station-keeping offset from the star (park orbit or the planet being surveyed), eased. */
  readonly station: THREE.Vector3;
  stationSet: boolean;
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
  /**
   * Where an auto-exploring fleet is surveying this year (absolute position of the planet, when
   * its system is drawn): up close the ship flies there instead of parking in orbit.
   */
  surveyPoint: ((fleetId: string) => { readonly x: number; readonly z: number } | null) | null = null;
  private lastTime = -1;
  /** Survey plans: a faint dashed route through each surveyor's next systems, with numbered stops. */
  private plans: Array<{ line: THREE.Line; stops: CSS2DObject[] }> = [];
  private plansKey = '';
  private readonly outline = outlineMaterial();
  private outlined: THREE.Mesh[] = [];
  /** Materials of the selected ship, marking its pixels in the stencil buffer. */
  private masked: THREE.Material[] = [];
  private outlinedRoot: THREE.Object3D | null = null;

  /** Highlight one fleet as selected: its label, and an outline around its ship. */
  setSelected(id: string | null): void {
    this.selectedId = id;
    this.applyOutline();
  }

  /** Outline the selected fleet's ship (again after its model is rebuilt) in its empire colour. */
  private applyOutline(): void {
    for (const o of this.outlined) o.removeFromParent();
    for (const m of this.masked) { m.stencilWrite = false; m.needsUpdate = true; }
    this.outlined = [];
    this.masked = [];
    this.outlinedRoot = null;
    const v = this.selectedId ? this.visuals.get(this.selectedId) : undefined;
    if (!v) return;
    this.outlinedRoot = v.root;
    this.outline.uniforms.uColor.value.set(v.fleet.color);
    const meshes: THREE.Mesh[] = [];
    v.model.group.traverse((o) => {
      // Solid hull parts only: additive glows and sprites would outline as blobs.
      if (o instanceof THREE.Mesh && o.geometry.getAttribute('normal') && !(o.material as THREE.Material).transparent) meshes.push(o);
    });
    for (const m of meshes) {
      const mat = m.material as THREE.Material;
      if (!this.masked.includes(mat)) {
        Object.assign(mat, { stencilWrite: true, stencilRef: OUTLINE_STENCIL, stencilFunc: THREE.AlwaysStencilFunc, stencilZPass: THREE.ReplaceStencilOp, needsUpdate: true });
        this.masked.push(mat);
      }
      const rim = new THREE.Mesh(m.geometry, this.outline);
      rim.renderOrder = 50; // after the ship has written its mask
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

  /**
   * Survey plans per fleet: a dashed route from where the fleet is headed (`from`, absolute)
   * through its next stops, each marked with its number. Rebuilt only when the plans change.
   */
  setPlans(plans: ReadonlyArray<{ readonly color: string; readonly from: Point; readonly stops: readonly Point[] }>): void {
    const key = JSON.stringify(plans);
    if (key === this.plansKey) return;
    this.plansKey = key;
    for (const p of this.plans) {
      this.object3d.remove(p.line);
      p.line.geometry.dispose();
      (p.line.material as THREE.Material).dispose();
      p.stops.forEach((st) => st.element.remove());
    }
    this.plans = plans.filter((p) => p.stops.length > 0).map((p) => {
      const o = p.from;
      const rel = (q: Point) => new THREE.Vector3(q.x - o.x, 0, q.z - o.z);
      // Relative to the start, like routes (float32 precision at galaxy coordinates).
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), ...p.stops.map(rel)]),
        new THREE.LineDashedMaterial({ color: p.color, dashSize: 0.3, gapSize: 0.5, transparent: true, opacity: 0.4 }),
      );
      line.position.set(o.x, LIFT, o.z);
      line.computeLineDistances();
      this.object3d.add(line);
      const stops = p.stops.map((q, i) => {
        const el = document.createElement('div');
        el.className = 'survey-stop';
        el.textContent = String(i + 1);
        el.title = 'Next systems this fleet will survey';
        el.style.borderColor = p.color;
        const tag = new CSS2DObject(el);
        tag.position.copy(rel(q));
        line.add(tag);
        return tag;
      });
      return { line, stops };
    });
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
    this.outlinedRoot?.getWorldPosition(this.outline.uniforms.uCenter.value);
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
    const dt = this.lastTime < 0 ? 0 : Math.min(0.1, Math.max(0, view.time - this.lastTime));
    this.lastTime = view.time;
    const glide = 1 - Math.exp(-1.2 * dt);
    for (const p of this.plans) {
      const m = p.line.material as THREE.LineDashedMaterial;
      if (m.dashSize !== dash * 0.5) { m.dashSize = dash * 0.5; m.gapSize = dash * 0.8; }
      m.opacity = routeOpacity * 0.5;
      p.line.visible = routeOpacity > 0.01;
      p.stops.forEach((st) => (st.visible = p.line.visible && view.visibleWidth < 4_000));
    }
    const target = new THREE.Vector3();
    for (const v of this.visuals.values()) {
      // Exactly where the ship is at this moment: no easing, so it glides at a steady speed
      // (easing toward a moving target and snapping when close made it judder up close).
      v.shown = progressAtTime(v.fleet.movement, this.time);
      v.root.position.lerpVectors(v.start, v.end, v.shown);
      // Up close, a fleet on station parks in a slow orbit outside the planets instead of
      // sitting inside the star, or flies to the planet it is surveying, gliding between them.
      if (v.shown >= 1 && park > 0) {
        const a = v.parkPhase + view.time * 0.04;
        const survey = this.surveyPoint?.(v.fleet.id);
        if (survey) target.set(survey.x - v.end.x + Math.cos(a * 6) * 0.006, 0, survey.z - v.end.z + Math.sin(a * 6) * 0.006);
        else target.set(Math.cos(a) * PARK_ORBIT, 0, Math.sin(a) * PARK_ORBIT);
        if (!v.stationSet) { v.station.copy(target); v.stationSet = true; } else v.station.lerp(target, glide);
        v.root.position.x += v.station.x * park;
        v.root.position.z += v.station.z * park;
        v.model.group.rotation.y = survey ? Math.atan2(target.x - v.station.x, target.z - v.station.z) || v.heading : v.heading + (-a - v.heading) * park;
      } else {
        v.stationSet = false;
        v.model.group.rotation.y = v.heading;
      }
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
    return { root, model, line, label, fleet, start, end, heading, modelLength, parkPhase: (h % 360) * (Math.PI / 180), shown: progressAtTime(fleet.movement, this.time), station: new THREE.Vector3(), stationSet: false };
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
    this.setPlans([]);
    for (const [id, v] of this.visuals) this.removeVisual(id, v);
    this.outline.dispose();
  }
}
