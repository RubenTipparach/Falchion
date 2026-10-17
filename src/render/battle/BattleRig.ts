import * as THREE from 'three';

const clamp = (x: number, a: number, b: number) => (x < a ? a : x > b ? b : x);

/**
 * The battle view's camera: it orbits the fleets' centroid and pulls back as they stand apart.
 * Drag turns it, the wheel or a pinch zooms, a right-drag (or two fingers) pans; left alone for a
 * few seconds it drifts slowly round the battle.
 */
export class BattleRig {
  theta = -1.18;
  phi = 1.12;
  radius = 200;
  /** Distance the battle asks for (from the fleets' separation); the player's zoom scales it. */
  base = 200;
  zoom = 1;
  readonly minR = 30;
  readonly maxR = 520;
  readonly target = new THREE.Vector3();
  readonly pan = new THREE.Vector3();
  readonly follow = new THREE.Vector3();
  private idleFor = 0;
  private readonly _v = new THREE.Vector3();
  private readonly _w = new THREE.Vector3();

  /** Back to the opening view, on the fleets. */
  reset(): void {
    this.theta = -1.18; this.phi = 1.12; this.zoom = 1; this.radius = this.base;
    this.pan.set(0, 0, 0);
    this.target.copy(this.follow);
    this.idleFor = 0;
  }

  /** A drag of (dx, dy) pixels: turn (or pan) the view. */
  drag(dx: number, dy: number, pan: boolean, camera: THREE.Camera): void {
    this.idleFor = 0;
    if (pan) return this.panBy(dx, dy, camera);
    this.theta -= dx * 0.0055;
    this.phi = clamp(this.phi - dy * 0.0045, 0.12, 1.62);
  }

  /** Zoom by a factor (above 1: out). */
  zoomBy(k: number): void {
    this.idleFor = 0;
    this.zoom = clamp(this.zoom * k, this.minR / this.base, this.maxR / this.base);
  }

  panBy(dx: number, dy: number, camera: THREE.Camera): void {
    this.idleFor = 0;
    const k = this.radius * 0.0016;
    this._v.setFromMatrixColumn(camera.matrixWorld, 0).multiplyScalar(-dx * k);
    this._w.setFromMatrixColumn(camera.matrixWorld, 1).multiplyScalar(dy * k);
    this.pan.add(this._v).add(this._w);
  }

  /** Ease toward the fleets and place the camera. `spin`: drift round when left alone. */
  place(camera: THREE.PerspectiveCamera, dt: number, spin: boolean): void {
    this.idleFor += dt;
    if (spin && this.idleFor > 5) this.theta += dt * 0.025;
    this.target.lerp(this._v.copy(this.follow).add(this.pan), 1 - Math.exp(-dt * 2.2));
    this.radius += (clamp(this.base * this.zoom, this.minR, this.maxR) - this.radius) * (1 - Math.exp(-dt * 2));
    const s = Math.sin(this.phi);
    camera.position.set(this.target.x + this.radius * s * Math.sin(this.theta), this.target.y + this.radius * Math.cos(this.phi), this.target.z + this.radius * s * Math.cos(this.theta));
    camera.lookAt(this.target);
    camera.updateMatrixWorld();
  }
}
