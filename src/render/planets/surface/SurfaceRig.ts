import * as THREE from 'three';
import { smoothstep } from '../../../core/surface/Noise';

/**
 * The surface camera, in the planet's frame (radius 1). It looks at a ground point `F` from
 * distance `d`, heading `T` (screen up), tilting toward the horizon as it comes down.
 *
 * One number drives the descent: u = 0 at the hand-over from planet view (camera 4.4 radii from
 * the centre) to 1 at the lowest altitude. The map's zoom altitude maps onto u (sOfU / uOfS), so the
 * wheel, pinch and zoom ladder keep working; u < 0 is the crossfade band above the hand-over.
 */

/** Map altitude, in planet radii, where the close-up starts to fade in over planet view. */
export const S_ENTER = 5.6;
/** ...where the rig takes over from the map's camera (u = 0). */
export const S_TOP = 4.4;
/** ...beyond which the close-up's GPU resources are released. */
export const S_LEAVE = 7;
/** Natural-log span of map altitude across the descent (14 wheel notches). */
const SPAN = 3;
/** Rig distance from the ground point at u = 0 and u = 1. */
const D_MAX = S_TOP - 1, D_MIN = 0.006;

export const sOfU = (u: number): number => S_TOP * Math.exp(-SPAN * u);
export const uOfS = (s: number): number => Math.log(S_TOP / s) / SPAN;
export const dOfU = (u: number): number => D_MAX * Math.pow(D_MIN / D_MAX, Math.min(Math.max(u, 0), 1));
export const uOfD = (d: number): number => Math.log(d / D_MAX) / Math.log(D_MIN / D_MAX);
/** Lowest map altitude (planet radii) with the surface view: u = 1. */
export const S_FLOOR = sOfU(1);

/** Tilt toward the horizon that comes with altitude. */
const baseTilt = (u: number): number => 1.2 * smoothstep(0.25, 0.85, u);

interface Fly {
  readonly F0: THREE.Vector3;
  readonly T0: THREE.Vector3;
  readonly q: THREE.Quaternion;
  readonly u0: number;
  readonly u1: number;
  readonly dur: number;
  readonly apex: number;
  readonly north: THREE.Vector3 | null;
  readonly tilt0: number;
  readonly tilt1: number;
  t: number;
}

export interface RigPose {
  readonly position: THREE.Vector3;
  readonly quaternion: THREE.Quaternion;
  /** Ground point looked at. */
  readonly focus: THREE.Vector3;
  readonly d: number;
  readonly tilt: number;
}

const M = new THREE.Matrix4(), Q = new THREE.Quaternion();

export class SurfaceRig {
  readonly F = new THREE.Vector3(0, 0, 1);
  readonly T = new THREE.Vector3(0, 1, 0);
  /** Tilt the player added (right-drag), on top of the altitude's own. */
  tiltU = 0;
  private fly: Fly | null = null;

  get flying(): boolean {
    return this.fly !== null;
  }

  /** Look at `dir` with screen-up as close to `up` as it allows (both in the planet frame). */
  sync(dir: THREE.Vector3, up: THREE.Vector3): void {
    this.F.copy(dir).normalize();
    this.T.copy(up).addScaledVector(this.F, -up.dot(this.F));
    if (this.T.lengthSq() < 1e-8) this.T.set(0, 1, 0).addScaledVector(this.F, -this.F.y);
    if (this.T.lengthSq() < 1e-8) this.T.set(1, 0, 0);
    this.T.normalize();
    this.tiltU = 0;
  }

  /** Glide to look at `dir` at descent `u1`, rising over long trips; `north` turns screen-up toward it. */
  flyTo(dir: THREE.Vector3, u0: number, u1: number, opts: { north?: THREE.Vector3; tilt?: number; reduceMotion?: boolean } = {}): void {
    const F0 = this.F.clone(), F1 = dir.clone().normalize();
    const ang = F0.angleTo(F1);
    this.fly = {
      F0, T0: this.T.clone(), q: new THREE.Quaternion().setFromUnitVectors(F0, F1), u0, u1, t: 0,
      dur: opts.reduceMotion ? 0.01 : 1.3 + Math.min(ang, 1.6) * 0.9, apex: Math.max(0.04, 0.5 - ang * 0.45),
      north: opts.north?.clone() ?? null, tilt0: this.tiltU, tilt1: opts.tilt ?? 0,
    };
  }

  cancelFly(): void {
    this.fly = null;
  }

  /** Advance a glide; returns the descent u it is at (null when not flying). */
  stepFly(dt: number): number | null {
    const f = this.fly;
    if (!f) return null;
    f.t = Math.min(f.t + dt / f.dur, 1);
    const e = f.t < 0.5 ? 4 * f.t * f.t * f.t : 1 - Math.pow(-2 * f.t + 2, 3) / 2;
    Q.identity().slerp(f.q, e);
    this.F.copy(f.F0).applyQuaternion(Q).normalize();
    this.T.copy(f.T0).applyQuaternion(Q);
    if (f.north) {
      const want = f.north.clone().addScaledVector(this.F, -f.north.dot(this.F)).normalize();
      this.T.lerp(want, smoothstep(0.15, 0.9, f.t));
    }
    this.T.addScaledVector(this.F, -this.T.dot(this.F)).normalize();
    const bump = Math.max(0, Math.min(f.u0, f.u1) - f.apex) * Math.sin(Math.PI * e);
    this.tiltU = f.tilt0 + (f.tilt1 - f.tilt0) * e;
    if (f.t >= 1) this.fly = null;
    return f.u0 + (f.u1 - f.u0) * e - bump;
  }

  tiltAt(u: number): number {
    return Math.min(Math.max(baseTilt(u) + this.tiltU, 0), 1.42);
  }

  /** The camera at descent u (>= 0); `ground(d)` is the ground radius under a unit direction. */
  pose(u: number, ground: (d: THREE.Vector3) => number): RigPose {
    const d = dOfU(u), tilt = this.tiltAt(u);
    const focus = this.F.clone().multiplyScalar(ground(this.F));
    const off = this.F.clone().multiplyScalar(Math.cos(tilt)).addScaledVector(this.T, -Math.sin(tilt));
    const position = focus.clone().addScaledVector(off, d);
    const cd = position.clone().normalize();
    const minR = ground(cd) + Math.max(0.0012, d * 0.08);
    if (position.length() < minR) position.copy(cd).multiplyScalar(minR);
    const up = this.F.clone().multiplyScalar(Math.sin(tilt)).addScaledVector(this.T, Math.cos(tilt));
    const quaternion = new THREE.Quaternion().setFromRotationMatrix(M.lookAt(position, focus, up));
    return { position, quaternion, focus, d, tilt };
  }

  /** Drag to move over the ground; `right` is the camera's screen-right in the planet frame. */
  pan(dx: number, dy: number, u: number, right: THREE.Vector3, viewHeight: number, fovDeg: number): void {
    this.fly = null;
    const d = dOfU(u), tilt = this.tiltAt(u);
    const px = (2 * d * Math.tan(THREE.MathUtils.degToRad(fovDeg / 2))) / Math.max(1, viewHeight);
    const r = right.clone().addScaledVector(this.F, -right.dot(this.F)).normalize();
    const k = Math.min(px, 0.02);
    this.F.addScaledVector(r, -dx * k).addScaledVector(this.T, (dy * k) / Math.max(Math.cos(tilt), 0.35)).normalize();
    this.T.addScaledVector(this.F, -this.T.dot(this.F)).normalize();
  }

  /** Right-drag: turn the heading and tilt the view. */
  turn(dHeading: number, dTilt: number): void {
    this.fly = null;
    this.T.applyAxisAngle(this.F, dHeading).normalize();
    this.tiltU = Math.min(Math.max(this.tiltU + dTilt, -1.2), 1.2);
  }
}
