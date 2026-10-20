import * as THREE from 'three';
import type { CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { citiesNear, groundHeight, isTube, megaGround, octavesAt, wrapX, type MegaCity, type MegaGroundDef, type MegaSurfaceType } from '../../../core/mega/MegaGround';
import { smoothstep } from '../../../core/surface/Noise';
import type { InputCapture } from '../../map/MapCameraController';
import type { MapLayer, ViewState } from '../../map/MapLayer';
import type { ZoomModel } from '../../map/ZoomModel';
import { MegaHabitat } from './MegaHabitat';
import { DISK_RANGE, MegaSky, SQUARES } from './MegaSky';
import { TOWER_REACH_KM, MegaTowers } from './MegaTowers';
import { MegaTrees } from './MegaTrees';
import { MegaTerrain, landUniforms, setCities } from './MegaTerrain';

/** The megastructure to land on (from the game state). */
export interface MegaSurfaceTarget {
  readonly id: string;
  readonly type: MegaSurfaceType;
  /** The structure's seed (as the system view builds it). */
  readonly seed: number;
  /** The star's light. */
  readonly light: THREE.Color;
}

export interface MegaSurfaceHost {
  readonly zoom: ZoomModel;
  /**
   * The structure as the system view draws it (render-relative): the close-up's frame on its land
   * and how many ly one close-up unit is. Null while it is not drawn (and for habitats).
   */
  frame(id: string): { readonly world: THREE.Matrix4; readonly unitLy: number } | null;
  readonly input: { capture: InputCapture | null; cancelFlight(): void };
  readonly canvas: HTMLCanvasElement;
  readonly lite: boolean;
}

export interface MegaSurfaceStatus {
  /** Landed (or landing, or leaving): the close-up is drawn. */
  readonly active: boolean;
  /** The close-up fills the screen and is in charge of the camera. */
  readonly engaged: boolean;
  readonly altitudeKm: number;
}

/**
 * The map's zoom altitude (ly) at the close-up's top: below it the close-up fills the screen; over
 * HAND_BAND times it the system view does; between, one dissolves into the other as you scroll.
 */
const HAND_ALT = 0.05;
const HAND_BAND = 2.2;
/**
 * A ring, shell or disc is flown down to with one camera: from FLY_START (ly) the close-up draws
 * the structure from the map's own camera, carried into its frame at true scale, over the system
 * view's drawing of it; by FLY_FULL it has the screen. On down, that camera eases into the
 * close-up's own, reaching it at the close-up's top (maxKm).
 */
const FLY_START = 0.3;
const FLY_FULL = 0.22;
/** Tilt (from straight down) past which the camera stops circling the focus and just looks up. */
const ORBIT_PITCH = 1.5;
/** The ground detail's coarsest octave (MEGA_GROUND_GLSL groundDetail), km: its origin snaps to it. */
const DETAIL_TILE = 0.004 * 4 ** 5;

/** Per structure: how high the close-up reaches (at HAND_ALT), how low, where Land takes you, which way it looks. */
const TRIP: Readonly<Record<MegaSurfaceType, { maxKm: number; minKm: number; landKm: number; yaw: number }>> = {
  ringworld: { maxKm: 3000, minKm: 0.004, landKm: 2.4, yaw: 0 },
  'dyson-sphere': { maxKm: 3000, minKm: 0.004, landKm: 2.8, yaw: 0.6 },
  'alderson-disk': { maxKm: 3000, minKm: 0.004, landKm: 1.6, yaw: Math.PI },
  'dyson-swarm': { maxKm: 3.4, minKm: 0.004, landKm: 0.3, yaw: Math.PI / 2 },
  topopolis: { maxKm: 36, minKm: 0.004, landKm: 1.4, yaw: Math.PI / 2 },
};

interface Built {
  readonly key: string;
  readonly def: MegaGroundDef;
  readonly uniforms: Record<string, THREE.IUniform>;
  readonly scene: THREE.Scene;
  readonly sky: MegaSky;
  readonly terrain: MegaTerrain;
  readonly towers: MegaTowers;
  readonly trees: MegaTrees;
  readonly habitat: MegaHabitat | null;
  /** Its shaders compiled (in the background, as the structure is chosen). */
  ready: boolean;
}

/**
 * A megastructure's ground (change mega-surfaces): a close-up of its own, separate from the planet
 * close-up because none of these is a sphere seen from outside. With a structure chosen, the map's
 * zoom runs on past the system view: from HAND_ALT × HAND_BAND down to HAND_ALT the system view
 * dissolves into the structure's ground seen from its top altitude, and on down to the ground;
 * scrolling out dissolves back. Land and leave just glide the zoom. While the close-up fills the
 * screen, drags pan and turn its camera and the map is not drawn.
 */
export class MegaSurfaceLayer implements MapLayer {
  readonly object3d = new THREE.Group();
  private target: MegaSurfaceTarget | null = null;
  private built: Built | null = null;
  /** How much of the screen is the close-up: 0 the system view, 1 the ground. */
  private mix = 0;
  private time = 0;
  private lastTime = 0;
  private readonly camera = new THREE.PerspectiveCamera(50, 1, 0.001, 1000);
  private focus: [number, number] = [0, 0];
  private yaw = 0;
  private pitchOffset = 0;
  private altKm = 1;
  private kmPerZoom = 1;
  /** This frame's structure frame (ring, shell, disc): its world matrix inverted, and its rotation. */
  private mapFrame: { inv: THREE.Matrix4; q: THREE.Quaternion; kmPerLy: number } | null = null;
  /** How far the camera has gone over from the map's (0) to the close-up's own (1). */
  private rigShare = 1;
  private fly: { from: [number, number]; to: [number, number]; t: number } | null = null;
  private citiesKey = '';
  private cities: MegaCity[] = [];
  /** The close-up drawn off screen while it dissolves in, and the quad that lays it over the map. */
  private blendTarget: THREE.WebGLRenderTarget | null = null;
  private readonly overlayScene = new THREE.Scene();
  private readonly overlayCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly blendMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthTest: false, depthWrite: false, toneMapped: false });
  private readonly capture: InputCapture;
  /** Hold the clock (seconds) for screenshots and tests; null runs it. */
  timeOverride: number | null = null;

  constructor(private readonly host: MegaSurfaceHost) {
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.blendMat);
    quad.frustumCulled = false;
    this.overlayScene.add(quad);
    this.capture = {
      drag: (dx, dy, turn) => {
        this.fly = null;
        if (turn) {
          // Right-drag circles the point looked at and tilts the view, as on the map: a new drag
          // first makes the ground under the middle of the screen the point it circles.
          const now = performance.now();
          if (now - this.lastTurn > 250) this.anchorOrbit();
          this.lastTurn = now;
          const yaw0 = this.yaw;
          this.yaw += dx * 0.005;
          // Looking out past the ground the camera can circle: turn where it stands instead (the
          // point it would circle is far off on the horizon).
          if (this.built && this.pitch() > ORBIT_PITCH && !isTube(this.built.def)) {
            const reach = this.viewDistance() * Math.sin(ORBIT_PITCH);
            this.moveFocus(reach * (Math.cos(this.yaw) - Math.cos(yaw0)), reach * (Math.sin(this.yaw) - Math.sin(yaw0)));
          }
          this.pitchOffset = THREE.MathUtils.clamp(this.pitchOffset - dy * 0.004, -1.2, 1.2);
          return;
        }
        const k = (this.viewDistance() * 2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2)) / Math.max(1, host.canvas.clientHeight);
        const f = [Math.cos(this.yaw), Math.sin(this.yaw)], r = [-Math.sin(this.yaw), Math.cos(this.yaw)];
        this.moveFocus(-r[0] * dx * k + f[0] * dy * k, -r[1] * dx * k + f[1] * dy * k);
      },
      click: (x, y, double) => { if (double) this.flyToPoint(x, y); },
    };
  }

  get status(): MegaSurfaceStatus {
    return { active: this.mix > 0, engaged: this.mix >= 1, altitudeKm: this.altKm };
  }

  /** The megastructure chosen (null: none): its ground is built and compiled now, so a zoom can go on down to it. */
  setTarget(target: MegaSurfaceTarget | null): void {
    if (target?.id === this.target?.id) return;
    this.release();
    this.target = target;
    this.disposeBuilt();
    if (!target) return;
    const trip = TRIP[target.type];
    this.kmPerZoom = trip.maxKm / HAND_ALT;
    this.focus = [0, 0];
    this.yaw = trip.yaw;
    this.pitchOffset = 0;
    this.fly = null;
    this.ensureBuilt(target);
  }

  /** Glide down through the dissolve to the ground. */
  land(): void {
    if (!this.target) return;
    this.host.input.cancelFlight();
    this.host.zoom.setTargetAltitude(TRIP[this.target.type].landKm / this.kmPerZoom);
  }

  /** Glide back up to the system view. */
  leave(): void {
    if (this.mix > 0) this.host.zoom.setTargetAltitude(this.mapFrame ? FLY_START * 1.5 : HAND_ALT * HAND_BAND * 2);
  }

  covers(): boolean {
    return this.mix >= 1 && !!this.built?.ready;
  }

  update(view: ViewState): void {
    const dt = Math.min(0.1, Math.max(0, view.time - this.lastTime));
    this.lastTime = view.time;
    this.time = this.timeOverride ?? view.time;
    const b = this.built;
    const zoom = this.host.zoom;
    if (!this.target || !b) { this.mix = 0; return; }
    const trip = TRIP[b.def.type];
    const frame = isTube(b.def) ? null : this.host.frame(this.target.id);
    if (frame) {
      // One camera all the way down, at the structure's true scale.
      const inv = frame.world.clone().invert();
      const q = new THREE.Quaternion();
      frame.world.decompose(new THREE.Vector3(), q, new THREE.Vector3());
      this.mapFrame = { inv, q, kmPerLy: b.sky.unitKm / frame.unitLy };
      this.kmPerZoom = this.mapFrame.kmPerLy;
      // The close-up's own camera reaches out to most of the way across (a ring's or shell's axis,
      // high over a disc), looking down at the land: the flight is over in good time, the land in view.
      const full = this.rigTopKm(b) * 0.25 / this.kmPerZoom, alt = Math.max(zoom.altitude, 1e-12);
      this.rigShare = 1 - smoothstep(Math.log(full), Math.log(FLY_FULL * 0.9), Math.log(alt));
      if (this.rigShare < 1) { this.focus = [0, 0]; this.fly = null; }
    } else {
      this.mapFrame = null;
      this.rigShare = 1;
      if (!isTube(b.def)) { this.mix = 0; return; }
    }
    // The zoom goes on below the system view once the ground is ready to show.
    zoom.setFloor(b.ready ? trip.minKm / this.kmPerZoom : null);
    this.mix = !b.ready ? 0 : frame ? 1 - smoothstep(FLY_FULL, FLY_START, zoom.altitude) : 1 - smoothstep(HAND_ALT, HAND_ALT * HAND_BAND, zoom.altitude);
    // Panning and turning are the close-up's once its own camera has it.
    if (this.rigShare < 1 && this.mix >= 1) this.host.input.capture = this.host.input.capture === this.capture ? null : this.host.input.capture;
    else this.host.input.capture = this.mix >= 1 ? this.capture : this.host.input.capture === this.capture ? null : this.host.input.capture;
    if (this.mix <= 0) return;
    this.altKm = THREE.MathUtils.clamp(zoom.altitude * this.kmPerZoom, trip.minKm, this.mapFrame ? this.rigTopKm(b) : trip.maxKm);
    if (this.fly) {
      this.fly.t = Math.min(1, this.fly.t + dt / 0.9);
      const e = smoothstep(0, 1, this.fly.t);
      this.focus = [THREE.MathUtils.lerp(this.fly.from[0], this.fly.to[0], e), THREE.MathUtils.lerp(this.fly.from[1], this.fly.to[1], e)];
      if (this.fly.t >= 1) this.fly = null;
    }
  }

  overlay(renderer: THREE.WebGLRenderer, _labels: CSS2DRenderer, mapCamera: THREE.PerspectiveCamera): void {
    const b = this.built;
    if (b && !b.ready && b.key !== this.compiling) {
      this.compiling = b.key;
      const done = () => { if (this.built === b) b.ready = true; };
      try { renderer.compileAsync(b.scene, this.camera).then(done, done); } catch { done(); }
    }
    if (!b || this.mix <= 0) return;
    if (this.mix >= 1) return this.draw(renderer, b, mapCamera, null);
    // Dissolving: the ground drawn off screen, laid over the system view.
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    if (!this.blendTarget || this.blendTarget.width !== size.x || this.blendTarget.height !== size.y) {
      this.blendTarget?.dispose();
      this.blendTarget = new THREE.WebGLRenderTarget(size.x, size.y, { depthBuffer: true });
      this.blendTarget.texture.colorSpace = renderer.outputColorSpace;
    }
    this.draw(renderer, b, mapCamera, this.blendTarget);
    this.blendMat.map = this.blendTarget.texture;
    this.blendMat.opacity = this.mix;
    const autoClear = renderer.autoClear;
    renderer.autoClear = false;
    renderer.render(this.overlayScene, this.overlayCam);
    renderer.autoClear = autoClear;
  }

  dispose(): void {
    this.release();
    this.disposeBuilt();
    this.blendTarget?.dispose();
    this.blendMat.dispose();
  }

  // ── Trips ─────────────────────────────────────────────────────────

  private compiling = '';

  private ensureBuilt(t: MegaSurfaceTarget): void {
    const key = `${t.id}:${t.type}`;
    if (this.built?.key !== key) { this.disposeBuilt(); this.built = this.create(t, key); }
  }

  /** Hand the zoom and the input back to the map. */
  private release(): void {
    if (this.target) {
      this.host.zoom.setFloor(null);
      if (this.mix > 0) {
        this.host.zoom.setAltitude(HAND_ALT * HAND_BAND * 1.2);
        this.host.zoom.setTargetAltitude(HAND_ALT * HAND_BAND * 2);
      }
    }
    if (this.host.input.capture === this.capture) this.host.input.capture = null;
    this.mix = 0;
  }

  private moveFocus(dx: number, dz: number): void {
    const def = this.built?.def;
    if (!def) return;
    const roam = def.roamKm;
    let x = THREE.MathUtils.clamp(this.focus[0] + dx, -roam, roam);
    const zMax = def.widthKm > 0 ? Math.min(roam, def.widthKm / 2 - (isTube(def) ? 1.2 : 2000)) : roam;
    const z = THREE.MathUtils.clamp(this.focus[1] + dz, -zMax, zMax);
    if (isTube(def)) x = wrapX(def, this.focus[0] + dx);
    this.focus = [x, z];
  }

  private lastTurn = 0;

  /**
   * Make the ground under the middle of the screen the focus, the camera staying where it is: its
   * heading, tilt and height re-read from there. Without it a drag circled the focus, which is not
   * under the middle of the screen once the view tilts past ORBIT_PITCH (or the camera is held off
   * the ground), so the land swung round a point off to one side.
   */
  private anchorOrbit(): void {
    const b = this.built;
    if (!b || this.mix < 1 || this.rigShare < 1 || isTube(b.def)) return;
    const cam = this.camera.position.clone();
    const ray = new THREE.Ray(cam, this.camera.getWorldDirection(new THREE.Vector3()));
    const hit = ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -this.groundAtFocus()), new THREE.Vector3());
    if (!hit || hit.distanceTo(cam) > this.altKm * 40) return;
    const def = b.def;
    const to: [number, number] = [this.focus[0] + hit.x, this.focus[1] + hit.z];
    if (Math.abs(to[0]) > def.roamKm || Math.abs(to[1]) > def.roamKm) return;
    const focus0 = this.focus;
    this.focus = to;
    const hF = this.groundAtFocus();
    const rel = cam.clone().sub(new THREE.Vector3(hit.x, hF, hit.z));
    const drop = rel.y, across = Math.hypot(rel.x, rel.z);
    const orbit = Math.atan2(across, drop);
    if (drop <= 0 || orbit > ORBIT_PITCH) { this.focus = focus0; return; }
    const alt = THREE.MathUtils.clamp(drop, TRIP[def.type].minKm, this.mapFrame ? this.rigTopKm(b) : TRIP[def.type].maxKm);
    this.altKm = alt;
    this.host.zoom.setAltitude(alt / this.kmPerZoom);
    this.host.zoom.setTargetAltitude(alt / this.kmPerZoom);
    this.yaw = Math.atan2(-rel.z, -rel.x);
    this.pitchOffset = 0;
    this.pitchOffset = THREE.MathUtils.clamp(orbit - this.pitch(), -1.2, 1.2);
    this.citiesKey = '';
  }

  /** Double-click the ground: glide there, a little lower. */
  private flyToPoint(clientX: number, clientY: number): void {
    const rect = this.host.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    const hit = ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -this.groundAtFocus()), new THREE.Vector3());
    if (!hit) return;
    const def = this.built!.def;
    const to: [number, number] = [this.focus[0] + hit.x, this.focus[1] + hit.z];
    if (!isTube(def)) { to[0] = THREE.MathUtils.clamp(to[0], -def.roamKm, def.roamKm); to[1] = THREE.MathUtils.clamp(to[1], -def.roamKm, def.roamKm); }
    this.fly = { from: [...this.focus], to, t: 0 };
    this.host.zoom.setTargetAltitude(Math.max(this.host.zoom.targetAltitude * 0.6, this.host.zoom.floor));
  }

  // ── Drawing ───────────────────────────────────────────────────────

  private groundAtFocus(): number {
    const def = this.built!.def;
    return Math.max(groundHeight(def, this.focus[0], this.focus[1], octavesAt(def, this.altKm), this.cities), 0);
  }

  /** How far the camera sits from the point it looks at, km. */
  private viewDistance(): number {
    return this.altKm / Math.cos(Math.min(this.pitch(), ORBIT_PITCH));
  }

  /** Tilt from straight down: toward the horizon near the ground, looking down from high up. */
  private pitch(): number {
    const def = this.built!.def, trip = TRIP[def.type];
    const s = Math.log(this.altKm / trip.minKm) / Math.log(trip.maxKm / trip.minKm);
    const base = isTube(def) ? 1.25 : THREE.MathUtils.lerp(1.38, 0.25, Math.pow(THREE.MathUtils.clamp(s, 0, 1), 1.6));
    return THREE.MathUtils.clamp(base + this.pitchOffset, 0.02, Math.PI - 0.35);
  }

  private draw(renderer: THREE.WebGLRenderer, b: Built, mapCamera: THREE.PerspectiveCamera, into: THREE.WebGLRenderTarget | null): void {
    const def = b.def, u = b.uniforms;
    this.refreshCities(b);
    // The camera, in the focus frame (km): back from the focus point along the view, up by the altitude.
    const hF = this.groundAtFocus();
    // The camera circles the focus point as it tilts toward the horizon; past that it stays put
    // and only looks up (at the Arch, the dome, the habitat's far side).
    const pitch = this.pitch(), orbit = Math.min(pitch, ORBIT_PITCH);
    const dir = (p: number) => new THREE.Vector3(Math.sin(p) * Math.cos(this.yaw), -Math.cos(p), Math.sin(p) * Math.sin(this.yaw));
    const target = new THREE.Vector3(0, hF, 0);
    const cam = target.clone().addScaledVector(dir(orbit), -this.viewDistance());
    cam.y = Math.max(cam.y, hF + this.altKm * 0.98);
    // Never under the ground (or, in a habitat, outside its hull).
    const hC = groundHeight(def, this.focus[0] + cam.x, this.focus[1] + cam.z, octavesAt(def, this.altKm), this.cities);
    if (isTube(def)) {
      const R = def.radiusKm;
      const r = Math.hypot(cam.x, cam.y - R);
      const maxR = R - Math.max(hC, 0) - 0.004;
      if (r > maxR) { cam.x *= maxR / r; cam.y = R + (cam.y - R) * (maxR / r); }
    } else cam.y = Math.max(cam.y, Math.max(hC, 0) + 0.0015);
    this.camera.position.copy(cam);
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(cam.clone().add(dir(pitch)));
    let alt = Math.max(cam.y - Math.max(hC, 0), 0.0005);
    // Flying down from the system view: the map's own camera, carried into the structure's frame
    // at its true scale, easing into the close-up's as it nears the top.
    let nearField = true;
    if (this.mapFrame && this.rigShare < 1) {
      const f = this.mapFrame, w = this.rigShare;
      const from = mapCamera.getWorldPosition(new THREE.Vector3()).applyMatrix4(f.inv).multiplyScalar(f.kmPerLy);
      const fromQ = f.q.clone().invert().multiply(mapCamera.getWorldQuaternion(new THREE.Quaternion()));
      cam.copy(from.lerp(cam, w));
      this.camera.position.copy(cam);
      this.camera.quaternion.copy(fromQ.slerp(this.camera.quaternion, w));
      alt = Math.max(this.heightOver(b, cam), 0.0005);
    }
    // High over a ring, shell or disc the land is all the sky's (cast per pixel), none of it near.
    if (this.mapFrame) nearField = alt < TRIP[def.type].maxKm * 2;
    // Lens as the map's; clipping to the land round the camera (the sky is inside it).
    b.uniforms.uCamGround.value = nearField ? Math.max(hC, 0) : 0;
    b.terrain.group.visible = nearField;
    if (nearField) b.terrain.update({ focus: this.focus, cam, alt });
    const far = Math.max(b.terrain.extent * 2.2, alt * 8, def.type === 'dyson-swarm' ? 60 : def.type === 'topopolis' ? 500 : 0);
    this.camera.fov = mapCamera.fov;
    this.camera.aspect = mapCamera.aspect;
    this.camera.near = Math.max(alt * 0.25, 0.0002);
    this.camera.far = far;
    if (mapCamera.view?.enabled) {
      const v = mapCamera.view;
      this.camera.setViewOffset(v.fullWidth, v.fullHeight, v.offsetX, v.offsetY, v.width, v.height);
    } else this.camera.clearViewOffset();
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld();
    // Light and time of day.
    this.light(b, cam);
    u.uFocus.value.set(this.focus[0], this.focus[1]);
    // The detail's origin: on the coarsest detail octave's grid, near the camera.
    u.uDetailOrigin.value.set(Math.round(this.focus[0] / DETAIL_TILE) * DETAIL_TILE, Math.round(this.focus[1] / DETAIL_TILE) * DETAIL_TILE);
    u.uCam.value.copy(cam);
    u.uCamAlt.value = alt;
    u.uTime.value = this.time;
    b.sky.place(cam, far * 0.8, nearField ? b.terrain.extent * 0.92 : 0, (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2)) / Math.max(1, renderer.domElement.height));
    // Towers near cities close by; trees right round the camera.
    const nearCities = this.cities.filter((c) => Math.hypot(c.x - this.focus[0], c.z - this.focus[1]) < TOWER_REACH_KM + c.r);
    b.towers.setCities(this.altKm < 80 && nearField ? nearCities : []);
    b.towers.mesh.visible = this.altKm < 80 && nearField;
    b.trees.update(renderer, this.focus, nearField ? alt : 1e9);
    b.habitat?.update(this.focus, b.uniforms.uDay.value as number);

    const autoClear = renderer.autoClear;
    const before = renderer.getRenderTarget();
    renderer.setRenderTarget(into);
    renderer.autoClear = false;
    renderer.clear(true, true, true);
    renderer.render(b.scene, this.camera);
    renderer.autoClear = autoClear;
    renderer.setRenderTarget(before);
  }

  /** The highest the close-up's own camera goes over the land, km: the land fills the view from there. */
  private rigTopKm(b: Built): number {
    return b.def.type === 'alderson-disk' ? b.sky.unitKm * 0.5 : b.sky.unitKm * 0.85;
  }

  /** How far (km) a point in the focus frame is from the structure's land (or, outside, its hull). */
  private heightOver(b: Built, p: THREE.Vector3): number {
    const unit = b.sky.unitKm, o = p.clone().divideScalar(unit);
    if (b.def.type === 'ringworld') {
      const off = Math.max(Math.abs(o.z) - b.def.widthKm / 2 / unit, 0);
      return Math.hypot(Math.abs(1 - Math.hypot(o.x, o.y - 1)), off) * unit;
    }
    if (b.def.type === 'dyson-sphere') return Math.abs(1 - Math.hypot(o.x, o.y - 1, o.z)) * unit;
    const rS = Math.hypot(o.x + 1, o.z);
    const out = Math.max(DISK_RANGE[0] - rS, rS - DISK_RANGE[1], 0);
    return Math.hypot(o.y, out) * unit;
  }

  /** Where the star is and how much daylight the focus has (and the sky's uniforms for both). */
  private light(b: Built, cam: THREE.Vector3): void {
    const def = b.def, u = b.uniforms, su = b.sky.uniforms, t = this.time;
    const col = this.target!.light.clone();
    let day = 1, dawn = 0;
    // Overhead stars light the land a little off the vertical, so relief still reads.
    const sun = new THREE.Vector3(0.22, 1, 0.12).normalize();
    if (def.type === 'ringworld') {
      // Shadow squares orbit faster than the ring turns: a day and a night every 90 s or so.
      const step = (2 * Math.PI) / SQUARES.n;
      const phase = ((((2 * Math.PI) / (SQUARES.n * 90)) * t - this.focus[0] / def.radiusKm) % step + step) % step;
      su.uSquarePhase.value = phase;
      su.uRingZ.value = -this.focus[1] / b.sky.unitKm;
      const x = (((0 - phase) / step) % 1 + 1) % 1;
      day = smoothstep(SQUARES.cover / 2 - 0.03, SQUARES.cover / 2 + 0.03, Math.min(x, 1 - x));
      su.uStarPos.value.set(0, 1, 0);
      su.uStarRad.value = 0.014;
    } else if (def.type === 'dyson-sphere') {
      su.uStarPos.value.set(0, 1, 0);
      su.uStarRad.value = 0.024;
    } else if (def.type === 'alderson-disk') {
      // The star bobs through the hole: it rises and sets over the disc.
      const bob = Math.sin((2 * Math.PI * t) / 160) * 0.13 + 0.06;
      su.uStarPos.value.set(-1, bob, 0);
      su.uStarRad.value = 0.006;
      sun.set(-1, bob, 0).normalize();
      day = smoothstep(-0.015, 0.03, bob);
      dawn = 1 - smoothstep(0.02, 0.12, bob);
      col.multiplyScalar(1.6);
    } else if (def.type === 'topopolis') {
      // A topopolis turns once in five minutes: a window faces the star for a day, then turns away.
      const spin = (2 * Math.PI * t) / 300 + this.focus[0] / def.radiusKm;
      su.uSpin.value = spin;
      su.uStarPos.value.set(1, 0, 0.15);
      su.uStarRad.value = 0.012;
      day = smoothstep(-0.3, 0.3, Math.cos(spin) + 0.35);
    } else {
      // A habitat: its mirrors open and close on a day; the habitat spins once in two minutes.
      day = smoothstep(-0.35, 0.25, Math.sin((2 * Math.PI * t) / 180) + 0.25);
      su.uSpin.value = (2 * Math.PI * t) / 120 + this.focus[0] / def.radiusKm;
      // The star is down the axis (the mirrors throw its light in through the windows).
      su.uStarPos.value.set(0, 0, -1);
      su.uStarRad.value = 0.03;
    }
    if (!isTube(def)) {
      // The star's size as seen from where the camera is (from the land it is about one unit off).
      const o = cam.clone().divideScalar(b.sky.unitKm);
      su.uStarRad.value = Math.atan((su.uStarRad.value as number) / Math.max(o.distanceTo(su.uStarPos.value as THREE.Vector3), 1e-6));
    }
    u.uSun.value.copy(sun);
    u.uSunCol.value.copy(col);
    u.uDay.value = day;
    u.uDawn.value = dawn;
  }

  /** The cities the ground flattens and draws: the nearest few to the focus. */
  private refreshCities(b: Built): void {
    const def = b.def;
    const reach = THREE.MathUtils.clamp(this.altKm * 25, def.cityCellKm * 2.5, def.cityCellKm * 12);
    const key = `${Math.round(this.focus[0] / (def.cityCellKm / 4))}:${Math.round(this.focus[1] / (def.cityCellKm / 4))}:${Math.round(Math.log2(reach))}`;
    if (key === this.citiesKey) return;
    this.citiesKey = key;
    const found = citiesNear(def, this.focus[0], this.focus[1], reach);
    found.sort((p, q) => Math.hypot(p.x - this.focus[0], p.z - this.focus[1]) - Math.hypot(q.x - this.focus[0], q.z - this.focus[1]));
    this.cities = found.slice(0, (b.uniforms.uCityA.value as unknown[]).length);
    setCities(b.uniforms, this.cities);
  }

  private create(t: MegaSurfaceTarget, key: string): Built {
    const def = megaGround(t.type, t.seed);
    const uniforms = landUniforms(def);
    const scene = new THREE.Scene();
    const sky = new MegaSky(def, uniforms);
    const terrain = new MegaTerrain(uniforms, this.host.lite ? 12 : 15);
    const towers = new MegaTowers(uniforms, this.host.lite);
    const trees = new MegaTrees(uniforms, this.host.lite);
    const habitat = isTube(def) ? new MegaHabitat(def, uniforms) : null;
    scene.add(sky.mesh, terrain.group, towers.mesh, trees.group);
    if (habitat) scene.add(habitat.group);
    this.citiesKey = '';
    return { key, def, uniforms, scene, sky, terrain, towers, trees, habitat, ready: false };
  }

  private disposeBuilt(): void {
    const b = this.built;
    if (!b) return;
    this.compiling = '';
    b.sky.dispose();
    b.terrain.dispose();
    b.towers.dispose();
    b.trees.dispose();
    b.habitat?.dispose();
    this.built = null;
  }
}

