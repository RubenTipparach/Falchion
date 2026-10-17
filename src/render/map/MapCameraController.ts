import * as THREE from 'three';
import { ZoomModel } from './ZoomModel';

/**
 * Turns pointer/wheel input into camera focus, exponential zoom, yaw and tilt.
 * Knows nothing about layers or game state.
 */
export class MapCameraController {
  readonly focus = new THREE.Vector2();
  /** π: camera looks toward -z, so +x is right and -z is up (matches galactic angles). */
  yaw = Math.PI;
  tilt = 0.75;
  private flyTarget: THREE.Vector2 | null = null;
  private drag: { button: number; x: number; y: number; moved: number } | null = null;
  private readonly raycaster = new THREE.Raycaster();
  private readonly plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    private readonly dom: HTMLElement,
    readonly zoom: ZoomModel,
    private readonly maxRadius: number,
    private readonly onClick: (world: THREE.Vector3) => void,
    private readonly onHover: (world: THREE.Vector3 | null) => void,
  ) {
    dom.addEventListener('wheel', this.handleWheel, { passive: false });
    dom.addEventListener('pointerdown', this.handleDown);
    window.addEventListener('pointermove', this.handleMove);
    window.addEventListener('pointerup', this.handleUp);
    dom.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  flyTo(x: number, z: number, altitude?: number): void {
    this.flyTarget = new THREE.Vector2(x, z);
    if (altitude !== undefined) this.zoom.setTargetAltitude(altitude);
  }

  /** Advance easing and place the camera. */
  update(dt: number): void {
    this.zoom.step(dt);
    if (this.flyTarget) {
      this.focus.lerp(this.flyTarget, 1 - Math.exp(-6 * dt));
      if (this.focus.distanceTo(this.flyTarget) < this.zoom.altitude * 0.001) this.flyTarget = null;
    }
    this.place();
  }

  place(): void {
    const d = this.zoom.altitude;
    // Flatten toward top-down as we zoom out so the galaxy reads as a map.
    const tilt = this.tilt * (1 - 0.55 * Math.min(1, Math.log10(Math.max(1, d / 200)) / 2.5));
    const h = Math.cos(tilt) * d, back = Math.sin(tilt) * d;
    this.camera.position.set(this.focus.x - Math.sin(this.yaw) * back, h, this.focus.y - Math.cos(this.yaw) * back);
    this.camera.near = Math.max(0.01, d * 0.01);
    this.camera.far = d * 60;
    this.camera.lookAt(this.focus.x, 0, this.focus.y);
    this.camera.updateProjectionMatrix();
  }

  /** World point on the galactic plane under a client-space pixel. */
  groundAt(clientX: number, clientY: number): THREE.Vector3 | null {
    const rect = this.dom.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const out = new THREE.Vector3();
    return this.raycaster.ray.intersectPlane(this.plane, out) ? out : null;
  }

  visibleWidth(): number {
    return 2 * this.zoom.altitude * Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2) * this.camera.aspect;
  }

  private readonly handleWheel = (e: WheelEvent): void => {
    e.preventDefault();
    this.flyTarget = null;
    // Zoom toward the cursor: keep the ground point under it fixed.
    const before = this.groundAt(e.clientX, e.clientY);
    const delta = e.deltaMode === 1 ? e.deltaY * 33 : e.deltaY;
    this.zoom.wheel(delta);
    this.zoom.snap();
    this.place();
    const after = this.groundAt(e.clientX, e.clientY);
    if (before && after) {
      this.focus.x += before.x - after.x;
      this.focus.y += before.z - after.z;
      this.clampFocus();
    }
  };

  private readonly handleDown = (e: PointerEvent): void => {
    this.drag = { button: e.button, x: e.clientX, y: e.clientY, moved: 0 };
    this.flyTarget = null;
  };

  private readonly handleMove = (e: PointerEvent): void => {
    if (!this.drag) {
      if (e.target === this.dom || this.dom.contains(e.target as Node)) this.onHover(this.groundAt(e.clientX, e.clientY));
      return;
    }
    const dx = e.clientX - this.drag.x, dy = e.clientY - this.drag.y;
    this.drag.moved += Math.abs(dx) + Math.abs(dy);
    if (this.drag.button === 0 && !e.shiftKey) {
      const a = this.groundAt(this.drag.x, this.drag.y);
      const b = this.groundAt(e.clientX, e.clientY);
      if (a && b) {
        this.focus.x += a.x - b.x;
        this.focus.y += a.z - b.z;
        this.clampFocus();
      }
    } else {
      this.yaw -= dx * 0.005;
      this.tilt = THREE.MathUtils.clamp(this.tilt - dy * 0.004, 0, 1.25);
    }
    this.drag.x = e.clientX;
    this.drag.y = e.clientY;
    this.place();
  };

  private readonly handleUp = (e: PointerEvent): void => {
    if (this.drag && this.drag.moved < 5 && this.drag.button === 0) {
      const p = this.groundAt(e.clientX, e.clientY);
      if (p) this.onClick(p);
    }
    this.drag = null;
  };

  private clampFocus(): void {
    const r = this.focus.length();
    if (r > this.maxRadius) this.focus.multiplyScalar(this.maxRadius / r);
  }
}
