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
  /** Extra label line, e.g. supply and hull. */
  readonly status?: string;
}

interface FleetVisual {
  readonly root: THREE.Group;
  readonly model: ShipModel;
  readonly line: THREE.Line;
  readonly label: CSS2DObject;
  /** Fleets whose labels this one stands for this frame (itself first). */
  stack: string[];
  /** Years to arrival, as of the last frame. */
  eta: number;
  fleet: FleetView;
  readonly start: THREE.Vector3;
  readonly end: THREE.Vector3;
  /** Displayed progress; follows the continuous journey, easing over reroutes. */
  shown: number;
  /** Direction of travel (or, holding station, the way it last faced). */
  heading: number;
  readonly modelLength: number;
  readonly parkPhase: number;
  /** Station-keeping offset from the star (park orbit or the planet being surveyed), eased. */
  readonly station: THREE.Vector3;
  stationSet: boolean;
  /**
   * Where the ship was drawn when new orders replaced its old route, relative to where the
   * new route puts it (e.g. its parking orbit). Fades out, so the ship eases onto its new
   * course instead of jumping.
   */
  readonly carry: THREE.Vector3;
  /** The way the ship faces now; it turns toward where it wants to face at TURN_RATE. */
  yaw: number;
}

/** How fast a ship turns to a new heading, in radians per second. */
/** Labels closer than this on screen (CSS px) stack into one. */
const STACK_PX = 26;
const TURN_RATE = 1.4;

/** Step an angle toward a target by at most `max`, the short way round. */
function turnToward(from: number, to: number, max: number): number {
  const diff = Math.atan2(Math.sin(to - from), Math.cos(to - from));
  return Math.abs(diff) <= max ? to : from + Math.sign(diff) * max;
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
  ) {
    // A tap anywhere but on a fleet label closes an open stack list.
    if (typeof window !== 'undefined') {
      window.addEventListener('pointerdown', (e) => {
        if (this.openStack && !(e.target as Element | null)?.closest?.('.fleet-label')) this.openStack = null;
      }, true);
    }
  }

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

  /** The visible fleet nearest a galaxy point (x, z) within `maxDist` ly, and its distance. */
  nearest(x: number, z: number, maxDist: number): { id: string; dist: number } | null {
    let best: { id: string; dist: number } | null = null;
    for (const [id, v] of this.visuals) {
      if (!v.root.visible) continue;
      const d = Math.hypot(v.root.position.x - x, v.root.position.z - z);
      if (d <= maxDist && (!best || d < best.dist)) best = { id, dist: d };
    }
    return best;
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
      const was = existing?.root.position.clone();
      if (existing) this.removeVisual(f.id, existing);
      const v = this.createVisual(f);
      if (was) v.carry.subVectors(was, v.root.position);
      // New orders: the ship turns onto its new heading from the way it was facing.
      if (existing) {
        v.yaw = existing.yaw;
        v.model.group.rotation.y = v.yaw;
        // Orders to stay put keep the ship facing the way it was.
        if (v.start.distanceToSquared(v.end) < 1e-12) v.heading = existing.yaw;
      }
      this.visuals.set(f.id, v);
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
      let want = v.heading;
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
        want = survey ? Math.atan2(target.x - v.station.x, target.z - v.station.z) || v.heading : v.heading + (-a - v.heading) * park;
      } else {
        v.stationSet = false;
      }
      v.yaw = turnToward(v.yaw, want, TURN_RATE * dt);
      v.model.group.rotation.y = v.yaw;
      if (v.carry.lengthSq() > 0) {
        v.carry.multiplyScalar(Math.exp(-2.5 * dt));
        if (v.carry.lengthSq() < 1e-12) v.carry.set(0, 0, 0);
        v.root.position.add(v.carry);
      }
      v.model.group.scale.setScalar(length / v.modelLength);
      v.model.animate(view.time);
      const remaining = arrivalTurn(v.fleet.movement) - this.time;
      const mat = v.line.material as THREE.LineDashedMaterial;
      if (mat.dashSize !== dash) { mat.dashSize = dash; mat.gapSize = dash * 0.7; }
      mat.opacity = routeOpacity;
      // The nav line shows the way still to go: gone once the fleet has arrived.
      v.line.visible = routeOpacity > 0.01 && v.shown < 1;
      const near = !local || Math.hypot(v.root.position.x - fx, v.root.position.z - fz) < Math.max(1, view.visibleWidth * 1.5);
      v.root.visible = near;
      v.eta = remaining;
      v.label.visible = near && view.visibleWidth < 4_000;
    }
    this.declutter(view);
  }

  /** The fleet whose label the pointer is over (desktop): it shows in full. */
  private hoveredId: string | null = null;
  /** A stack of labels opened into a list (its first fleet's id). */
  private openStack: string | null = null;

  /**
   * Labels as icons until wanted: each fleet shows a small chip in its colour, and chips that
   * overlap on screen merge into one with a count. The selected fleet, the one under the
   * pointer, and every fleet when zoomed right in show their name, ETA and status. Clicking a
   * stack lists its fleets; clicking a fleet selects it.
   */
  private declutter(view: ViewState): void {
    const cssH = typeof window === 'undefined' ? 800 : window.innerHeight;
    const cssW = cssH * view.camera.aspect;
    const close = view.visibleWidth < 12;
    const shown = [...this.visuals.values()].filter((v) => v.label.visible);
    const p = new THREE.Vector3();
    const at = new Map<FleetVisual, { x: number; y: number }>();
    for (const v of shown) {
      v.root.getWorldPosition(p).project(view.camera);
      at.set(v, { x: (p.x * cssW) / 2, y: (-p.y * cssH) / 2 });
    }
    // The selected fleet first, then a stable order, so stacks do not flicker.
    shown.sort((a, b) => (a.fleet.id === this.selectedId ? -1 : b.fleet.id === this.selectedId ? 1 : a.fleet.id < b.fleet.id ? -1 : 1));
    // Hovering expands a lone icon only: a stack stays a stack (click it to list its fleets).
    const isFull = (v: FleetVisual) => close || v.fleet.id === this.selectedId || (v.fleet.id === this.hoveredId && v.stack.length === 1);
    const stacks: FleetVisual[][] = [];
    for (const v of shown) {
      const q = at.get(v)!;
      const home = isFull(v) ? undefined : stacks.find((st) => {
        const r = at.get(st[0])!;
        return !isFull(st[0]) && Math.hypot(r.x - q.x, r.y - q.y) < STACK_PX;
      });
      if (home) home.push(v);
      else stacks.push([v]);
    }
    if (this.openStack && !stacks.some((st) => st[0].fleet.id === this.openStack && st.length > 1)) this.openStack = null;
    for (const st of stacks) {
      const [lead, ...rest] = st;
      for (const v of rest) v.label.visible = false;
      lead.stack = st.map((v) => v.fleet.id);
      const full = isFull(lead) && st.length === 1;
      // Fleet names can come from other players: always escaped.
      const dot = (v: FleetVisual) => `<i style="background:${escapeHtml(v.fleet.color)}"></i>`;
      const html = st.length > 1
        ? `<span class="fl-chip">${st.slice(0, 4).map(dot).join('')}<b>${st.length}</b></span>${this.openStack === lead.fleet.id ? `<span class="fl-list">${st.map((v) => `<button data-fleet="${escapeHtml(v.fleet.id)}">${dot(v)}${escapeHtml(v.fleet.name)}<small>${this.etaText(v)}</small></button>`).join('')}</span>` : ''}`
        : full
          ? `<b>${escapeHtml(lead.fleet.name)}</b><br>${this.etaText(lead)}${lead.fleet.status ? `<br><small>${escapeHtml(lead.fleet.status)}</small>` : ''}`
          : `<span class="fl-chip">${dot(lead)}</span>`;
      const el = lead.label.element;
      if (el.innerHTML !== html) el.innerHTML = html;
      // An open list is centred on its stack so it fits on a narrow screen.
      if (this.openStack === lead.fleet.id) lead.label.center.set(0.5, 1.05);
      else lead.label.center.set(-0.15, 1.2);
      el.classList.toggle('selected', lead.fleet.id === this.selectedId);
      el.classList.toggle('compact', !full);
      el.title = st.length > 1 ? `${st.length} fleets: click to list them` : lead.fleet.name;
    }
  }

  private etaText(v: FleetVisual): string {
    return v.eta > 0 ? `ETA ${this.formatEta(v.eta)}` : 'Arrived';
  }

  private createVisual(fleet: FleetView): FleetVisual {
    const { route } = fleet.movement;
    // Routes run between the actual stars (which sit off-centre in their hexes), on the plane.
    // A fleet redirected mid-journey sets off from exactly where it was.
    const a = fleet.movement.from ?? this.pointAt(route[0]);
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
    el.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') this.hoveredId = fleet.id; });
    el.addEventListener('pointerleave', () => { if (this.hoveredId === fleet.id) this.hoveredId = null; });
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      const pick = (e.target as HTMLElement).closest('[data-fleet]') as HTMLElement | null;
      const v = this.visuals.get(fleet.id);
      if (pick?.dataset.fleet) { this.openStack = null; this.onSelect(pick.dataset.fleet); return; }
      if (v && v.stack.length > 1) { this.openStack = this.openStack === fleet.id ? null : fleet.id; return; }
      this.onSelect(fleet.id);
    });
    const label = new CSS2DObject(el);
    label.center.set(-0.15, 1.2);
    root.add(label);
    // Placed at once, so a rebuilt fleet (new orders) never reports the origin as its position.
    root.position.lerpVectors(start, end, progressAtTime(fleet.movement, this.time));
    this.object3d.add(root, line);
    // Spread fleets parked at the same star around the orbit (stable per fleet).
    let h = 0;
    for (const ch of fleet.id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return { stack: [fleet.id], eta: 0, root, model, line, label, fleet, start, end, heading, modelLength, parkPhase: (h % 360) * (Math.PI / 180), shown: progressAtTime(fleet.movement, this.time), station: new THREE.Vector3(), stationSet: false, carry: new THREE.Vector3(), yaw: heading };
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
