import * as THREE from 'three';
import { hexToWorld, worldToHex } from '../../core/hex/Hex';
import { ZoomModel } from './ZoomModel';

/** Rebase once the focus drifts this far (ly) from the render origin. */
const REBASE_DISTANCE = 256;

/**
 * Turns pointer/wheel input into camera focus, exponential zoom, yaw and tilt.
 *
 * Floating origin: the galaxy spans 70,000 ly but a planet is ~0.005 ly, far
 * below float32 resolution at that range. The camera therefore lives near (0,0,0)
 * and the world is drawn offset by `origin`, which is re-snapped to the hex centre
 * under the focus whenever the focus wanders. All public coordinates (focus,
 * groundAt, flyTo, follow) are absolute galaxy coordinates.
 */
export class MapCameraController {
  readonly focus = new THREE.Vector2();
  /** Absolute galaxy position the scene is rendered relative to (a hex centre). */
  readonly origin = new THREE.Vector3();
  /** π: camera looks toward -z, so +x is right and -z is up (matches galactic angles). */
  yaw = Math.PI;
  tilt = 0.75;
  private flyTarget: THREE.Vector2 | null = null;
  /** Altitude a fly-to descends to once the pan is nearly done (pan first, then dive). */
  private flyAltitude: number | null = null;
  /** Wheel zoom eases; this keeps the ground point under the cursor fixed while it does. */
  private zoomAnchor: { x: number; y: number; world: THREE.Vector3 } | null = null;
  /**
   * Optional magnet for zooming in close: returns a point (e.g. the nearest star) to
   * centre on instead of the cursor, given the ground point and the target view width.
   */
  attractor: ((ground: THREE.Vector3, viewWidth: number) => { x: number; z: number } | null) | null = null;
  /** Right-click without dragging: an RTS-style command at that ground point. Right-drag still rotates. */
  onRightClick: ((world: THREE.Vector3, ray: THREE.Raycaster) => void) | null = null;
  private follow: (() => THREE.Vector3 | null) | null = null;
  /**
   * Focus minus the followed target. It decays to zero, so the view glides onto a moving
   * ship and then sits exactly on it (a plain lerp trails a moving target forever, by an
   * amount that wobbles with frame time).
   */
  private followOffset: THREE.Vector2 | null = null;
  private drag: { button: number; x: number; y: number; moved: number } | null = null;
  private readonly raycaster = new THREE.Raycaster();
  private readonly plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private readonly euler = new THREE.Euler();

  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    private readonly dom: HTMLElement,
    readonly zoom: ZoomModel,
    private readonly maxRadius: number,
    private readonly onClick: (world: THREE.Vector3, ray: THREE.Raycaster) => void,
    private readonly onHover: (world: THREE.Vector3 | null, ray: THREE.Raycaster) => void,
    private readonly onRebase: (origin: THREE.Vector3) => void,
  ) {
    dom.addEventListener('wheel', this.handleWheel, { passive: false });
    dom.addEventListener('pointerdown', this.handleDown);
    window.addEventListener('pointermove', this.handleMove);
    window.addEventListener('pointerup', this.handleUp);
    dom.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  flyTo(x: number, z: number, altitude?: number): void {
    this.follow = null;
    this.zoomAnchor = null;
    this.flyTarget = new THREE.Vector2(x, z);
    this.flyAltitude = null;
    if (altitude === undefined) return;
    // Zoom out at once if needed, but only dive in once the target is nearly in view.
    if (altitude >= this.zoom.targetAltitude) this.zoom.setTargetAltitude(altitude);
    else this.flyAltitude = altitude;
  }

  /** Keep the camera centred on a moving target (absolute coords) until the user pans. */
  followTarget(get: (() => THREE.Vector3 | null) | null, altitude?: number): void {
    this.follow = get;
    this.followOffset = null;
    this.flyTarget = null;
    this.flyAltitude = null;
    this.zoomAnchor = null;
    if (altitude === undefined) return;
    // Same as fly-to: pan onto the target first, dive once it is in view.
    if (altitude >= this.zoom.targetAltitude) this.zoom.setTargetAltitude(altitude);
    else this.flyAltitude = altitude;
  }

  get following(): boolean {
    return this.follow !== null;
  }

  /** Advance easing and place the camera. */
  update(dt: number): void {
    const zooming = this.zoom.step(dt);
    if (this.zoomAnchor) {
      // Keep the anchored ground point under the cursor as the zoom eases.
      this.place();
      const after = this.groundAt(this.zoomAnchor.x, this.zoomAnchor.y);
      if (after) {
        this.focus.x += this.zoomAnchor.world.x - after.x;
        this.focus.y += this.zoomAnchor.world.z - after.z;
        this.clampFocus();
      }
      if (!zooming) this.zoomAnchor = null;
    }
    if (this.flyAltitude !== null) {
      const p = this.follow?.();
      const goal = p ? new THREE.Vector2(p.x, p.z) : this.flyTarget;
      if (goal && this.focus.distanceTo(goal) < this.visibleWidth() * 0.35) {
        this.zoom.setTargetAltitude(this.flyAltitude);
        this.flyAltitude = null;
      }
    }
    if (this.follow) {
      const p = this.follow();
      if (!p) this.follow = null;
      else {
        this.followOffset ??= new THREE.Vector2(this.focus.x - p.x, this.focus.y - p.z);
        this.followOffset.multiplyScalar(Math.exp(-8 * dt));
        this.focus.set(p.x + this.followOffset.x, p.z + this.followOffset.y);
      }
    } else if (this.flyTarget) {
      this.focus.lerp(this.flyTarget, 1 - Math.exp(-6 * dt));
      if (this.focus.distanceTo(this.flyTarget) < this.zoom.altitude * 0.001 && this.flyAltitude === null) this.flyTarget = null;
    }
    this.place();
  }

  /**
   * Re-centre on the followed target after the layers have moved it this frame, so the
   * camera and the ship use the same position (otherwise the camera trails by a frame).
   */
  refollow(): void {
    if (!this.follow || !this.followOffset) return;
    const p = this.follow();
    if (!p) return;
    this.focus.set(p.x + this.followOffset.x, p.z + this.followOffset.y);
    this.place();
  }

  place(): void {
    this.maybeRebase();
    const d = this.zoom.altitude;
    // Flatten toward top-down as we zoom out so the galaxy reads as a map.
    const tilt = this.tilt * (1 - 0.55 * Math.min(1, Math.log10(Math.max(1, d / 200)) / 2.5));
    // Orientation comes straight from heading + tilt (no lookAt): lookAt is
    // degenerate when looking straight down and would snap the heading.
    const heading = this.yaw - Math.PI;
    const back = Math.sin(tilt) * d;
    const fx = this.focus.x - this.origin.x, fz = this.focus.y - this.origin.z;
    this.camera.position.set(fx + Math.sin(heading) * back, Math.cos(tilt) * d, fz + Math.cos(heading) * back);
    this.euler.set(tilt - Math.PI / 2, heading, 0, 'YXZ');
    this.camera.quaternion.setFromEuler(this.euler);
    this.camera.near = Math.max(0.0005, d * 0.01);
    this.camera.far = Math.max(d * 60, 50);
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld();
  }

  private maybeRebase(): void {
    const dx = this.focus.x - this.origin.x, dz = this.focus.y - this.origin.z;
    if (dx * dx + dz * dz < REBASE_DISTANCE * REBASE_DISTANCE) return;
    const c = hexToWorld(worldToHex(this.focus.x, this.focus.y));
    this.origin.set(c.x, 0, c.z);
    this.onRebase(this.origin);
  }

  /** Raycaster through a client-space pixel (render-relative coordinates). */
  rayAt(clientX: number, clientY: number): THREE.Raycaster {
    const rect = this.dom.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    return this.raycaster;
  }

  /** Absolute galaxy point on the galactic plane under a client-space pixel. */
  groundAt(clientX: number, clientY: number): THREE.Vector3 | null {
    const out = new THREE.Vector3();
    return this.rayAt(clientX, clientY).ray.intersectPlane(this.plane, out) ? out.add(this.origin) : null;
  }

  visibleWidth(): number {
    return 2 * this.zoom.altitude * Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2) * this.camera.aspect;
  }

  private readonly handleWheel = (e: WheelEvent): void => {
    e.preventDefault();
    this.flyAltitude = null;
    const delta = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY;
    this.zoom.wheel(delta);
    if (this.follow) return; // Keep the followed planet centred; just zoom.
    const ground = this.groundAt(e.clientX, e.clientY);
    if (!ground) return;
    // Zooming in close: let a nearby star pull the view to centre on it, so you land in its system.
    const targetWidth = this.visibleWidth() * (this.zoom.targetAltitude / this.zoom.altitude);
    const magnet = delta < 0 ? this.attractor?.(ground, targetWidth) : null;
    if (magnet) {
      this.zoomAnchor = null;
      this.flyTarget = new THREE.Vector2(magnet.x, magnet.z);
      return;
    }
    // Otherwise zoom toward the cursor, easing, with the point under it held fixed.
    this.flyTarget = null;
    if (!this.zoomAnchor || this.zoomAnchor.x !== e.clientX || this.zoomAnchor.y !== e.clientY) this.zoomAnchor = { x: e.clientX, y: e.clientY, world: ground };
  };

  private readonly handleDown = (e: PointerEvent): void => {
    this.drag = { button: e.button, x: e.clientX, y: e.clientY, moved: 0 };
    this.flyTarget = null;
    this.flyAltitude = null;
    this.zoomAnchor = null;
  };

  private readonly handleMove = (e: PointerEvent): void => {
    if (!this.drag) {
      if (e.target === this.dom || this.dom.contains(e.target as Node)) {
        const g = this.groundAt(e.clientX, e.clientY);
        this.onHover(g, this.rayAt(e.clientX, e.clientY));
      }
      return;
    }
    const dx = e.clientX - this.drag.x, dy = e.clientY - this.drag.y;
    this.drag.moved += Math.abs(dx) + Math.abs(dy);
    if (this.drag.button === 0 && !e.shiftKey) {
      if (this.drag.moved > 4) this.follow = null;
      const a = this.groundAt(this.drag.x, this.drag.y);
      const b = this.groundAt(e.clientX, e.clientY);
      if (a && b && !this.follow) {
        this.focus.x += a.x - b.x;
        this.focus.y += a.z - b.z;
        this.clampFocus();
      }
    } else {
      this.yaw -= dx * 0.005;
      this.tilt = THREE.MathUtils.clamp(this.tilt - dy * 0.004, 0, 1.4);
    }
    this.drag.x = e.clientX;
    this.drag.y = e.clientY;
    this.place();
  };

  private readonly handleUp = (e: PointerEvent): void => {
    if (this.drag && this.drag.moved < 5 && (this.drag.button === 0 || this.drag.button === 2)) {
      const p = this.groundAt(e.clientX, e.clientY);
      if (p && this.drag.button === 0) this.onClick(p, this.rayAt(e.clientX, e.clientY));
      else if (p) this.onRightClick?.(p, this.rayAt(e.clientX, e.clientY));
    }
    this.drag = null;
  };

  private clampFocus(): void {
    const r = this.focus.length();
    if (r > this.maxRadius) this.focus.multiplyScalar(this.maxRadius / r);
  }
}
