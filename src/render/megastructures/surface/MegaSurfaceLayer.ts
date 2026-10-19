import * as THREE from 'three';
import type { CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { citiesNear, groundHeight, megaGround, octavesAt, wrapX, type MegaCity, type MegaGroundDef, type MegaSurfaceType } from '../../../core/mega/MegaGround';
import { smoothstep } from '../../../core/surface/Noise';
import type { InputCapture } from '../../map/MapCameraController';
import type { MapLayer, ViewState } from '../../map/MapLayer';
import type { ZoomModel } from '../../map/ZoomModel';
import { MegaHabitat } from './MegaHabitat';
import { MegaSky, SQUARES } from './MegaSky';
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

/** Zoom altitude (ly) past which the close-up gives way to the system view. */
const LEAVE_ZOOM = 0.1;
/** Tilt (from straight down) past which the camera stops circling the focus and just looks up. */
const ORBIT_PITCH = 1.33;
/** The ground detail's coarsest octave (MEGA_GROUND_GLSL groundDetail), km: its origin snaps to it. */
const DETAIL_TILE = 0.004 * 4 ** 5;
/** Fades, seconds. */
const FADE_OUT = 0.35, FADE_IN = 0.7;

/** Per structure: how high the close-up reaches, where a landing starts and ends, and which way it looks. */
const TRIP: Readonly<Record<MegaSurfaceType, { maxKm: number; minKm: number; startKm: number; landKm: number; yaw: number }>> = {
  ringworld: { maxKm: 4e5, minKm: 0.004, startKm: 9000, landKm: 2.4, yaw: 0 },
  'dyson-sphere': { maxKm: 6e5, minKm: 0.004, startKm: 9000, landKm: 2.8, yaw: 0.6 },
  'alderson-disk': { maxKm: 3e5, minKm: 0.004, startKm: 8000, landKm: 1.6, yaw: Math.PI },
  'dyson-swarm': { maxKm: 3.4, minKm: 0.004, startKm: 3, landKm: 0.3, yaw: Math.PI / 2 },
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
}

/**
 * Landing on a megastructure (change mega-surfaces): a close-up of its own, separate from the
 * planet close-up because none of these is a sphere seen from outside. Land fades the map out
 * and the structure's ground in, then glides down; zooming out past the top (or leave) fades back.
 * While it is engaged the map's zoom drives its altitude (exponentially, as everywhere), drags pan
 * and turn its camera, and the map is not drawn.
 */
export class MegaSurfaceLayer implements MapLayer {
  readonly object3d = new THREE.Group();
  private target: MegaSurfaceTarget | null = null;
  private built: Built | null = null;
  private state: 'off' | 'enter' | 'on' | 'exit' = 'off';
  /** Black over the screen: 0 clear, 1 black. */
  private black = 0;
  private time = 0;
  private lastTime = 0;
  private readonly camera = new THREE.PerspectiveCamera(50, 1, 0.001, 1000);
  /** The map's renderer (from overlay): compiles the close-up's shaders as a landing starts. */
  private renderer: THREE.WebGLRenderer | null = null;
  private focus: [number, number] = [0, 0];
  private yaw = 0;
  private pitchOffset = 0;
  private altKm = 1;
  private kmPerZoom = 1;
  private fly: { from: [number, number]; to: [number, number]; t: number } | null = null;
  private citiesKey = '';
  private cities: MegaCity[] = [];
  private readonly overlayScene = new THREE.Scene();
  private readonly overlayCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly blackMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0, depthTest: false, depthWrite: false });
  private readonly capture: InputCapture;
  /** Hold the clock (seconds) for screenshots and tests; null runs it. */
  timeOverride: number | null = null;

  constructor(private readonly host: MegaSurfaceHost) {
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.blackMat);
    quad.frustumCulled = false;
    this.overlayScene.add(quad);
    this.capture = {
      drag: (dx, dy, turn) => {
        this.fly = null;
        if (turn) {
          this.yaw += dx * 0.005;
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
    return { active: this.state !== 'off', engaged: this.state === 'on' || this.state === 'exit', altitudeKm: this.altKm };
  }

  /** The megastructure in view (null: none). Landing waits for land(). */
  setTarget(target: MegaSurfaceTarget | null): void {
    if (target?.id === this.target?.id) return;
    if (this.state !== 'off') this.finishLeaving();
    this.target = target;
    this.disposeBuilt();
  }

  /** Fade from the system view to the structure's ground and glide down. */
  land(): void {
    if (!this.target || this.state === 'enter' || this.state === 'on') return;
    this.state = 'enter';
    // Build now and compile in the background while the map fades out (nothing waits on it).
    this.ensureBuilt(this.target);
    try { this.renderer?.compileAsync(this.built!.scene, this.camera).catch(() => undefined); } catch { /* compiled on first draw instead */ }
  }

  /** Fade back to the system view. */
  leave(): void {
    if (this.state === 'on' || this.state === 'enter') this.state = 'exit';
  }

  covers(): boolean {
    return (this.state === 'on' || this.state === 'exit') && !!this.built;
  }

  update(view: ViewState): void {
    const dt = Math.min(0.1, Math.max(0, view.time - this.lastTime));
    this.lastTime = view.time;
    this.time = this.timeOverride ?? view.time;
    const zoom = this.host.zoom;
    switch (this.state) {
      case 'off':
        this.black = Math.max(0, this.black - dt / FADE_IN);
        return;
      case 'enter':
        this.black = Math.min(1, this.black + dt / FADE_OUT);
        if (this.black >= 1) this.arrive();
        return;
      case 'exit':
        this.black = Math.min(1, this.black + dt / FADE_OUT);
        if (this.black >= 1) this.finishLeaving();
        break;
      case 'on':
        this.black = Math.max(0, this.black - dt / FADE_IN);
        if (zoom.targetAltitude > LEAVE_ZOOM) { this.state = 'exit'; zoom.setTargetAltitude(LEAVE_ZOOM); }
        break;
    }
    // (finishLeaving may have just turned it off.)
    if ((this.state as string) === 'off' || !this.built) return;
    this.host.input.capture = this.state === 'on' ? this.capture : null;
    const trip = TRIP[this.built.def.type];
    this.altKm = THREE.MathUtils.clamp(zoom.altitude * this.kmPerZoom, trip.minKm, trip.maxKm);
    if (this.fly) {
      this.fly.t = Math.min(1, this.fly.t + dt / 0.9);
      const e = smoothstep(0, 1, this.fly.t);
      this.focus = [THREE.MathUtils.lerp(this.fly.from[0], this.fly.to[0], e), THREE.MathUtils.lerp(this.fly.from[1], this.fly.to[1], e)];
      if (this.fly.t >= 1) this.fly = null;
    }
  }

  overlay(renderer: THREE.WebGLRenderer, _labels: CSS2DRenderer, mapCamera: THREE.PerspectiveCamera): void {
    this.renderer = renderer;
    const b = this.built;
    if (b && (this.state === 'on' || this.state === 'exit')) this.draw(renderer, b, mapCamera);
    if (this.black > 0.001) {
      this.blackMat.opacity = this.black;
      const autoClear = renderer.autoClear;
      renderer.autoClear = false;
      renderer.render(this.overlayScene, this.overlayCam);
      renderer.autoClear = autoClear;
    }
  }

  dispose(): void {
    this.finishLeaving();
    this.disposeBuilt();
    this.blackMat.dispose();
  }

  // ── Trips ─────────────────────────────────────────────────────────

  /** The screen is black: build the ground, hand the zoom over and start the glide down. */
  private arrive(): void {
    const t = this.target;
    if (!t) { this.state = 'off'; return; }
    this.ensureBuilt(t);
    const trip = TRIP[t.type];
    this.kmPerZoom = trip.maxKm / LEAVE_ZOOM;
    const zoom = this.host.zoom;
    this.host.input.cancelFlight();
    zoom.setFloor(trip.minKm / this.kmPerZoom);
    zoom.setAltitude(trip.startKm / this.kmPerZoom);
    zoom.setTargetAltitude(trip.landKm / this.kmPerZoom);
    this.altKm = trip.startKm;
    this.focus = [0, 0];
    this.yaw = trip.yaw;
    this.pitchOffset = 0;
    this.fly = null;
    this.state = 'on';
  }

  private ensureBuilt(t: MegaSurfaceTarget): void {
    const key = `${t.id}:${t.type}`;
    if (this.built?.key !== key) { this.disposeBuilt(); this.built = this.create(t, key); }
  }

  private finishLeaving(): void {
    const zoom = this.host.zoom;
    if (this.state === 'on' || this.state === 'exit' || this.state === 'enter') {
      zoom.setFloor(null);
      if (this.state !== 'enter') {
        zoom.setAltitude(LEAVE_ZOOM * 1.2);
        zoom.setTargetAltitude(LEAVE_ZOOM * 3);
      }
    }
    if (this.host.input.capture === this.capture) this.host.input.capture = null;
    this.state = 'off';
  }

  private moveFocus(dx: number, dz: number): void {
    const def = this.built?.def;
    if (!def) return;
    const roam = def.roamKm;
    let x = THREE.MathUtils.clamp(this.focus[0] + dx, -roam, roam);
    const zMax = def.widthKm > 0 ? Math.min(roam, def.widthKm / 2 - (def.type === 'dyson-swarm' ? 1.2 : 2000)) : roam;
    const z = THREE.MathUtils.clamp(this.focus[1] + dz, -zMax, zMax);
    if (def.type === 'dyson-swarm') x = wrapX(def, this.focus[0] + dx);
    this.focus = [x, z];
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
    if (def.type !== 'dyson-swarm') { to[0] = THREE.MathUtils.clamp(to[0], -def.roamKm, def.roamKm); to[1] = THREE.MathUtils.clamp(to[1], -def.roamKm, def.roamKm); }
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
    const base = def.type === 'dyson-swarm' ? 1.25 : THREE.MathUtils.lerp(1.38, 0.25, Math.pow(THREE.MathUtils.clamp(s, 0, 1), 1.6));
    return THREE.MathUtils.clamp(base + this.pitchOffset, 0.02, Math.PI - 0.35);
  }

  private draw(renderer: THREE.WebGLRenderer, b: Built, mapCamera: THREE.PerspectiveCamera): void {
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
    if (def.type === 'dyson-swarm') {
      const R = def.radiusKm;
      const r = Math.hypot(cam.x, cam.y - R);
      const maxR = R - Math.max(hC, 0) - 0.004;
      if (r > maxR) { cam.x *= maxR / r; cam.y = R + (cam.y - R) * (maxR / r); }
    } else cam.y = Math.max(cam.y, Math.max(hC, 0) + 0.0015);
    this.camera.position.copy(cam);
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(cam.clone().add(dir(pitch)));
    const alt = Math.max(cam.y - Math.max(hC, 0), 0.0005);
    // Lens as the map's; clipping to the land round the camera (the sky is inside it).
    b.uniforms.uCamGround.value = Math.max(hC, 0);
    b.terrain.update({ focus: this.focus, cam, alt });
    const far = Math.max(b.terrain.extent * 2.2, alt * 8, def.type === 'dyson-swarm' ? 60 : 0);
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
    this.light(b);
    u.uFocus.value.set(this.focus[0], this.focus[1]);
    // The detail's origin: on the coarsest detail octave's grid, near the camera.
    u.uDetailOrigin.value.set(Math.round(this.focus[0] / DETAIL_TILE) * DETAIL_TILE, Math.round(this.focus[1] / DETAIL_TILE) * DETAIL_TILE);
    u.uCam.value.copy(cam);
    u.uCamAlt.value = alt;
    u.uTime.value = this.time;
    b.sky.place(cam, far * 0.8, b.terrain.extent * 0.92, (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2)) / Math.max(1, renderer.domElement.height));
    // Towers near cities close by; trees right round the camera.
    const nearCities = this.cities.filter((c) => Math.hypot(c.x - this.focus[0], c.z - this.focus[1]) < TOWER_REACH_KM + c.r);
    b.towers.setCities(this.altKm < 80 ? nearCities : []);
    b.towers.mesh.visible = this.altKm < 80;
    b.trees.update(renderer, this.focus, alt);
    b.habitat?.update(this.focus, b.uniforms.uDay.value as number);

    const autoClear = renderer.autoClear;
    renderer.autoClear = false;
    renderer.clear(true, true, true);
    renderer.render(b.scene, this.camera);
    renderer.autoClear = autoClear;
  }

  /** Where the star is and how much daylight the focus has (and the sky's uniforms for both). */
  private light(b: Built): void {
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
      const bob = Math.sin((2 * Math.PI * t) / 160) * 0.13 + 0.02;
      su.uStarPos.value.set(-1, bob, 0);
      su.uStarRad.value = 0.006;
      sun.set(-1, bob, 0).normalize();
      day = smoothstep(-0.015, 0.03, bob);
      dawn = 1 - smoothstep(0.02, 0.12, bob);
      col.multiplyScalar(1.6);
    } else {
      // A habitat: its mirrors open and close on a day; the habitat spins once in two minutes.
      day = smoothstep(-0.35, 0.25, Math.sin((2 * Math.PI * t) / 180) + 0.25);
      su.uSpin.value = (2 * Math.PI * t) / 120 + this.focus[0] / def.radiusKm;
      // The star is down the axis (the mirrors throw its light in through the windows).
      su.uStarPos.value.set(0, 0, -1);
      su.uStarRad.value = 0.03;
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
    const habitat = t.type === 'dyson-swarm' ? new MegaHabitat(def, uniforms) : null;
    scene.add(sky.mesh, terrain.group, towers.mesh, trees.group);
    if (habitat) scene.add(habitat.group);
    this.citiesKey = '';
    return { key, def, uniforms, scene, sky, terrain, towers, trees, habitat };
  }

  private disposeBuilt(): void {
    const b = this.built;
    if (!b) return;
    b.sky.dispose();
    b.terrain.dispose();
    b.towers.dispose();
    b.trees.dispose();
    b.habitat?.dispose();
    this.built = null;
  }
}

