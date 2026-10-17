import * as THREE from 'three';
import { hexToWorld, worldToHex } from '../../core/hex/Hex';
import { ZoomModel } from './ZoomModel';

/** Where zooming in close pulls the view: a point, or a moving target to follow (a ship). */
export interface Magnet {
  readonly x: number;
  readonly z: number;
  readonly follow?: () => THREE.Vector3 | null;
}

/** Rebase once the focus drifts this far (ly) from the render origin. */
const REBASE_DISTANCE = 256;
/** A finger may wander this far (px) and still count as a tap or a long press. */
const TOUCH_SLOP = 10;
/** Hold a finger this long (ms) for the touch equivalent of a right-click: a move order. */
const LONG_PRESS_MS = 450;
/**
 * Pinch zoom goes further than the fingers spread (altitude scales by the spread to this
 * power): the map spans planets to the whole galaxy, and a 1:1 pinch made that a long trip.
 */
const PINCH_POWER = 1.8;

/**
 * Turns pointer/wheel input into camera focus, exponential zoom, yaw and tilt.
 *
 * Mouse: drag pans, right-drag (or shift-drag) turns and tilts, wheel zooms, right-click
 * orders. Touch: one finger pans, two fingers pinch to zoom (and pan); a long press is the
 * right-click. Touch never turns or tilts the view: on a phone it only got in the way.
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
  attractor: ((ground: THREE.Vector3, viewWidth: number, touch?: boolean) => Magnet | null) | null = null;
  /** Right-click without dragging: an RTS-style command at that ground point. Right-drag still rotates. */
  onRightClick: ((world: THREE.Vector3, ray: THREE.Raycaster) => void) | null = null;
  private follow: (() => THREE.Vector3 | null) | null = null;
  /**
   * Focus minus the followed target. It decays to zero, so the view glides onto a moving
   * ship and then sits exactly on it (a plain lerp trails a moving target forever, by an
   * amount that wobbles with frame time).
   */
  private followOffset: THREE.Vector2 | null = null;
  private drag: { button: number; x: number; y: number; moved: number; touch: boolean } | null = null;
  /** Fingers on the map (pointer id → position). */
  private readonly touches = new Map<number, { x: number; y: number }>();
  private longPress: ReturnType<typeof setTimeout> | null = null;
  /** The current touch was a long press or a pinch: lifting it is not a tap. */
  private consumed = false;
  /** Both fingers where the last two-finger step left them; each finger reports on its own, so steps run once a frame. */
  private pinchFrom: Array<{ x: number; y: number }> | null = null;
  private pinchFrame: number | null = null;
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
    window.addEventListener('pointercancel', this.handleCancel);
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
      if (magnet.follow) this.followTarget(magnet.follow);
      else this.flyTarget = new THREE.Vector2(magnet.x, magnet.z);
      return;
    }
    // Otherwise zoom toward the cursor, easing, with the point under it held fixed.
    this.flyTarget = null;
    if (!this.zoomAnchor || this.zoomAnchor.x !== e.clientX || this.zoomAnchor.y !== e.clientY) this.zoomAnchor = { x: e.clientX, y: e.clientY, world: ground };
  };

  private readonly handleDown = (e: PointerEvent): void => {
    this.flyTarget = null;
    this.flyAltitude = null;
    this.zoomAnchor = null;
    if (e.pointerType === 'touch') {
      this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.touches.size >= 2) {
        this.pinchFrom = null;
        // A second finger: pinch, twist and tilt from here on; no tap, no long press.
        this.cancelLongPress();
        this.consumed = true;
        this.drag = null;
        return;
      }
      this.consumed = false;
      this.cancelLongPress();
      this.longPress = setTimeout(() => this.firePress(), LONG_PRESS_MS);
    }
    this.drag = { button: e.button, x: e.clientX, y: e.clientY, moved: 0, touch: e.pointerType === 'touch' };
  };

  /** Long press: the touch right-click (a move order where the finger is). */
  private firePress(): void {
    this.longPress = null;
    const d = this.drag;
    if (!d || !d.touch || d.moved >= TOUCH_SLOP || this.touches.size !== 1) return;
    this.consumed = true;
    const p = this.groundAt(d.x, d.y);
    if (p) {
      navigator.vibrate?.(12);
      this.onRightClick?.(p, this.rayAt(d.x, d.y));
    }
  }

  private cancelLongPress(): void {
    if (this.longPress !== null) clearTimeout(this.longPress);
    this.longPress = null;
  }

  /** A finger of a two-finger gesture moved: apply the gesture once this frame, with both fingers' moves. */
  private pinchMove(id: number, x: number, y: number): void {
    this.pinchFrom ??= [...this.touches.values()].slice(0, 2).map((p) => ({ ...p }));
    this.touches.set(id, { x, y });
    this.pinchFrame ??= requestAnimationFrame(() => {
      this.pinchFrame = null;
      const from = this.pinchFrom;
      this.pinchFrom = null;
      const to = [...this.touches.values()];
      if (from && to.length >= 2) this.pinchStep(from[0], from[1], to[0], to[1]);
    });
  }

  /** Two fingers moved from a0, b0 to a1, b1: zoom and pan about their midpoint, keeping the ground under them. */
  private pinchStep(a0: { x: number; y: number }, b0: { x: number; y: number }, a1: { x: number; y: number }, b1: { x: number; y: number }): void {
    const d0 = Math.hypot(b0.x - a0.x, b0.y - a0.y), d1 = Math.hypot(b1.x - a1.x, b1.y - a1.y);
    if (d0 < 1 || d1 < 1) return;
    const m0 = { x: (a0.x + b0.x) / 2, y: (a0.y + b0.y) / 2 }, m1 = { x: (a1.x + b1.x) / 2, y: (a1.y + b1.y) / 2 };
    const before = this.groundAt(m0.x, m0.y);
    this.zoom.setAltitude(this.zoom.altitude * (d0 / d1) ** PINCH_POWER);
    this.place();
    // Pinching in close: glide onto the nearest star system or ship (and keep following a ship).
    if (d1 > d0 && before && !this.follow) {
      const magnet = this.attractor?.(before, this.visibleWidth(), true);
      if (magnet) {
        if (magnet.follow) this.followTarget(magnet.follow);
        else this.flyTarget = new THREE.Vector2(magnet.x, magnet.z);
        return;
      }
    }
    if (this.flyTarget) return; // already gliding onto a star: the fingers only zoom
    // Keep the ground that was under the fingers under them (unless following a ship: then just zoom).
    const after = this.groundAt(m1.x, m1.y);
    if (before && after && !this.follow) {
      this.focus.x += before.x - after.x;
      this.focus.y += before.z - after.z;
      this.clampFocus();
      this.place();
    }
  }

  private readonly handleMove = (e: PointerEvent): void => {
    if (e.pointerType === 'touch' && this.touches.has(e.pointerId)) {
      if (this.touches.size >= 2) { this.pinchMove(e.pointerId, e.clientX, e.clientY); return; }
      this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }
    if (!this.drag) {
      if (e.target === this.dom || this.dom.contains(e.target as Node)) {
        const g = this.groundAt(e.clientX, e.clientY);
        this.onHover(g, this.rayAt(e.clientX, e.clientY));
      }
      return;
    }
    const dx = e.clientX - this.drag.x, dy = e.clientY - this.drag.y;
    this.drag.moved += Math.abs(dx) + Math.abs(dy);
    if (this.drag.moved >= TOUCH_SLOP) this.cancelLongPress();
    if (this.drag.button === 0 && !e.shiftKey) {
      if (this.drag.moved > (this.drag.touch ? TOUCH_SLOP : 4)) this.follow = null;
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
    if (e.pointerType === 'touch' && this.touches.has(e.pointerId)) {
      this.touches.delete(e.pointerId);
      this.cancelLongPress();
      this.pinchFrom = null;
      if (this.touches.size === 1) {
        // One finger left after a pinch: it carries on panning from where it is.
        const [rest] = [...this.touches.values()];
        this.drag = { button: 0, x: rest.x, y: rest.y, moved: TOUCH_SLOP, touch: true };
        return;
      }
      if (this.touches.size > 1) return;
      if (this.consumed) { this.drag = null; return; }
    }
    const slop = this.drag?.touch ? TOUCH_SLOP : 5;
    if (this.drag && this.drag.moved < slop && (this.drag.button === 0 || this.drag.button === 2)) {
      const p = this.groundAt(e.clientX, e.clientY);
      if (p && this.drag.button === 0) this.onClick(p, this.rayAt(e.clientX, e.clientY));
      else if (p) this.onRightClick?.(p, this.rayAt(e.clientX, e.clientY));
    }
    this.drag = null;
  };

  /** The browser took the touch over (e.g. a system gesture): drop it without a tap. */
  private readonly handleCancel = (e: PointerEvent): void => {
    this.touches.delete(e.pointerId);
    this.cancelLongPress();
    if (!this.touches.size) this.drag = null;
  };

  private clampFocus(): void {
    const r = this.focus.length();
    if (r > this.maxRadius) this.focus.multiplyScalar(this.maxRadius / r);
  }
}
