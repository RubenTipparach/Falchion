import * as THREE from 'three';
import type { CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { BUILDINGS } from '../../../content/buildings';
import { PLANET_LOOKS } from '../../../content/planetLooks';
import type { Planet } from '../../../core/galaxy/Planets';
import { Rng, hashSeed } from '../../../core/rng/Rng';
import { smoothstep } from '../../../core/surface/Noise';
import { SettlementInput, SurfaceLayout, surfaceLayout } from '../../../core/surface/SurfaceLayout';
import { SurfaceLook, frameAt, offsetDir, surfaceLookOf } from '../../../core/surface/Terrain';
import type { InputCapture } from '../../map/MapCameraController';
import type { MapLayer, ViewState } from '../../map/MapLayer';
import type { PlanetFrame } from '../../map/SystemLayer';
import type { ZoomModel } from '../../map/ZoomModel';
import { BACKDROP_FRAG, BACKDROP_VERT } from './shaders';
import { Settlements } from './Settlements';
import { S_ENTER, S_FLOOR, S_LEAVE, S_TOP, SurfaceRig, sOfU, uOfD, uOfS } from './SurfaceRig';
import { SurfaceLabels } from './SurfaceLabels';
import { FULL_QUALITY, LITE_QUALITY, SurfaceQuality, SurfaceTerrain } from './SurfaceTerrain';

/** The planet to show and what stands on it (from the game state). */
export interface SurfaceTarget {
  readonly planet: Planet;
  /** Drawn radius of the planet on the map, light years. */
  readonly radius: number;
  /** The colony on it (yours, or a generic city for another empire's), null when unsettled. */
  readonly colony: SettlementInput | null;
  /** Unsettled worlds: what the survey label says (e.g. "Explored · ruins"). */
  readonly survey: string;
}

/** What the surface layer needs from the map (Dependency Inversion: no reach into other layers). */
export interface SurfaceHost {
  readonly zoom: ZoomModel;
  /** The map camera controller: its input capture slot, and whether it follows a target (the planet). */
  readonly input: { capture: InputCapture | null; readonly following: boolean };
  /** Where the planet is drawn this frame (SystemLayer.planetFrame). */
  frame(planetId: string): PlanetFrame | null;
  /** The close-up covers the map's planet: hide it there and slow its spin (SystemLayer.holdPlanet); null releases. */
  hold(planetId: string | null): void;
  readonly canvas: HTMLCanvasElement;
  /** Touch-first device: lighter settings. */
  readonly lite: boolean;
}

/** Read-only state for the HUD. */
export interface SurfaceStatus {
  /** The close-up is drawn (crossfading in or below). */
  readonly active: boolean;
  /** Below the hand-over: the camera is the surface rig's. */
  readonly engaged: boolean;
  /** Camera altitude above the ground, km. */
  readonly altitudeKm: number;
}

/** Descent past which the close-up fills the screen: the map is not drawn. */
const U_COVER = 0.45;
/** Planet radius in km for the altitude readout: bigger worlds are bigger. */
const radiusKm = (size: number) => 2400 + 1300 * size;

interface Built {
  readonly key: string;
  readonly look: SurfaceLook;
  readonly layout: SurfaceLayout;
  readonly terrain: SurfaceTerrain;
  readonly settlements: Settlements;
  readonly labels: SurfaceLabels;
  readonly scene: THREE.Scene;
}

/**
 * The planet close-up: a zoom level below planet view (src/render/planets/surface). Registered in
 * the LayerStack like any layer. While the camera is near a focused rocky planet it draws the
 * planet's surface with a scene and camera of its own (planet radius = 1): first crossfading over
 * the map's planet from the very same viewpoint, then handing over to its own rig as the zoom
 * goes below the map's floor. Above that it costs nothing, and it frees its GPU resources once
 * the view leaves the planet.
 */
export class SurfaceLayer implements MapLayer {
  readonly object3d = new THREE.Group();
  private target: SurfaceTarget | null = null;
  private targetKey = '';
  private built: Built | null = null;
  /** A rebuild for a changed colony, swapped in once its globe is baked. */
  private next: Built | null = null;
  private building: { key: string; stage: number; data?: Built } | null = null;
  private readonly rig = new SurfaceRig();
  private readonly quality: SurfaceQuality;
  private readonly camera = new THREE.PerspectiveCamera(50, 1, 0.001, 20);
  private readonly starCam = new THREE.PerspectiveCamera(50, 1, 0.1, 200);
  private sky: { scene: THREE.Scene; stars: THREE.Points; backdrop: THREE.Mesh } | null = null;
  private frame: PlanetFrame | null = null;
  private s = Infinity;
  private u = -1;
  private active = false;
  private time = 0;
  private lastTime = 0;
  private pendingLand = false;
  /**
   * The rig keeps to the map camera's view until the player takes over (a drag or a glide) or the
   * descent passes the blend; it re-attaches above the hand-over.
   */
  private attached = true;
  /** Altitude this layer last set (a glide); anything else means the player zoomed. */
  private flySetAltitude: number | null = null;
  private camAlt = 1;
  private savedRatio: { renderer: THREE.WebGLRenderer; ratio: number } | null = null;
  private readonly capture: InputCapture;

  constructor(private readonly host: SurfaceHost) {
    this.quality = host.lite ? LITE_QUALITY : FULL_QUALITY;
    this.object3d.visible = false;
    this.capture = {
      drag: (dx, dy, turn) => {
        this.cancelFly();
        this.attached = false;
        if (turn) this.rig.turn(-dx * 0.006, -dy * 0.004);
        else this.rig.pan(dx, dy, Math.max(this.u, 0), new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 0), host.canvas.clientHeight, this.camera.fov);
      },
      click: (x, y, double) => { if (double) this.flyToPoint(x, y); },
    };
  }

  get status(): SurfaceStatus {
    const km = this.target ? this.camAlt * radiusKm(this.target.planet.size) : 0;
    return { active: this.active, engaged: this.active && this.u > 0, altitudeKm: km };
  }

  /** Show this planet's surface when the view comes close (null: none). Same planet and colony: no change. */
  setTarget(target: SurfaceTarget | null): void {
    const key = target ? JSON.stringify([target.planet.id, target.colony, target.survey]) : '';
    if (key === this.targetKey) return;
    const samePlanet = !!target && target.planet.id === this.target?.planet.id;
    this.target = target;
    this.targetKey = key;
    this.building = null;
    this.disposeBuilt('next');
    if (!samePlanet) {
      this.disposeBuilt('built');
      this.pendingLand = false;
      this.cancelFly();
      this.attached = true;
    }
    // The zoom goes below the map's floor only while a surface is there to land on.
    this.host.zoom.setFloor(target ? target.radius * S_FLOOR : null);
    if (!target) this.deactivate();
  }

  /** Fly down to the main city (or the best landing site); waits for the planet to be in view and baked. */
  land(): void {
    if (this.target) this.pendingLand = true;
  }

  /** Rise back to planet view. */
  leave(altitude: number): void {
    this.pendingLand = false;
    this.cancelFly();
    this.host.zoom.setTargetAltitude(altitude);
  }

  covers(): boolean {
    return this.active && this.u >= U_COVER;
  }

  update(view: ViewState): void {
    const dt = Math.min(0.1, Math.max(0, view.time - this.lastTime));
    this.lastTime = view.time;
    this.time = view.time;
    const t = this.target;
    if (!t) return;
    const zoom = this.host.zoom;
    if (this.flySetAltitude !== null && Math.abs(zoom.targetAltitude / this.flySetAltitude - 1) > 1e-6) this.cancelFly();
    this.s = zoom.altitude / t.radius;
    // Nothing to do far above the planet: release what was built and stop here.
    if (this.s > S_LEAVE && !this.pendingLand && !this.rig.flying) {
      if (this.built || this.building) { this.building = null; this.disposeBuilt('next'); this.disposeBuilt('built'); }
      this.deactivate();
      return;
    }
    this.frame = this.host.frame(t.planet.id);
    const f = this.frame;
    // The camera is on this planet: following it (the focused planet), or right over it.
    const near = !!f && (this.host.input.following || Math.hypot(f.position.x + view.origin.x - view.focus.x, f.position.z + view.origin.z - view.focus.z) < t.radius * 2);
    if (!f || !near || (this.s >= S_ENTER && !this.pendingLand && !this.rig.flying)) return this.deactivate();
    if (!this.advanceBuild()) return this.deactivate();
    this.u = uOfS(this.s);
    if (this.pendingLand) this.startLanding();
    const flying = this.rig.stepFly(dt);
    if (flying !== null) {
      this.flySetAltitude = t.radius * sOfU(flying);
      zoom.setAltitude(this.flySetAltitude);
      this.s = sOfU(flying);
      if (!this.rig.flying) this.flySetAltitude = null;
    }
    this.u = uOfS(this.s);
    this.active = true;
    this.host.input.capture = this.u > 0 ? this.capture : null;
    this.host.hold(this.s <= S_TOP ? t.planet.id : null);
    this.built!.settlements.update(this.time);
  }

  overlay(renderer: THREE.WebGLRenderer, labels: CSS2DRenderer, mapCamera: THREE.PerspectiveCamera): void {
    const b = this.built, f = this.frame, t = this.target;
    if (!this.active || !b || !f || !t) return;
    const R = f.radius;
    const inv = f.quaternion.clone().invert();
    // The map's camera, seen from the planet (radius 1, the planet's own frame).
    const mapPos = mapCamera.position.clone().sub(f.position).divideScalar(R).applyQuaternion(inv);
    const mapQuat = inv.clone().multiply(mapCamera.quaternion);
    const sun = f.star.clone().sub(f.position).normalize().applyQuaternion(inv);
    const u = this.u;
    const ground = (d: THREE.Vector3) => b.terrain.surfaceRadius(d);
    let fade = 1, d: number, focus: THREE.Vector3;
    if (u <= 0) this.attached = true;
    if (this.attached && !this.rig.flying) this.rig.sync(mapPos.clone().normalize(), new THREE.Vector3(0, 1, 0).applyQuaternion(mapQuat));
    if (u >= 0.2) this.attached = false;
    if (u <= 0) {
      // Above the hand-over: exactly the map's view, crossfading in; the rig follows it.
      fade = 1 - smoothstep(S_TOP, S_ENTER, this.s);
      this.camera.position.copy(mapPos);
      this.camera.quaternion.copy(mapQuat);
      d = Math.max(mapPos.length() - 1, 0.01);
      focus = mapPos.clone().normalize();
    } else {
      // Below: the rig, blended from the map's view over the first part of the descent.
      const pose = this.rig.pose(u, ground);
      const w = smoothstep(0, 0.2, u);
      const dir = mapPos.clone().normalize();
      const len = THREE.MathUtils.lerp(mapPos.length(), pose.position.length(), w);
      const q = new THREE.Quaternion().setFromUnitVectors(dir, pose.position.clone().normalize());
      dir.applyQuaternion(new THREE.Quaternion().slerp(q, w));
      this.camera.position.copy(dir.multiplyScalar(len));
      // Aim between what each camera looks at, so the planet stays in view however far apart they are.
      const mapTarget = mapPos.clone().add(new THREE.Vector3(0, 0, -mapPos.length()).applyQuaternion(mapQuat));
      const target = mapTarget.lerp(pose.focus, w);
      const up = new THREE.Vector3(0, 1, 0).applyQuaternion(mapQuat).lerp(new THREE.Vector3(0, 1, 0).applyQuaternion(pose.quaternion), w).normalize();
      this.camera.quaternion.setFromRotationMatrix(new THREE.Matrix4().lookAt(this.camera.position, target, up));
      d = pose.d;
      focus = pose.focus;
    }
    if (fade < 0.004) { b.labels.hide(); return; }
    // Same lens as the map (field of view, aspect, a phone's bottom-sheet offset), planet-scale clipping.
    const camAlt = this.camera.position.length() - ground(this.camera.position.clone().normalize());
    this.camAlt = Math.max(camAlt, 0);
    const L = this.camera.position.length();
    this.copyLens(this.camera, mapCamera, Math.max(0.00004, Math.min(camAlt * 0.2, 0.5)), Math.sqrt(Math.max(L * L - 1, 0)) + 1.3);
    this.camera.updateMatrixWorld();
    b.terrain.update({ cam: this.camera.position, focus, d, alt: camAlt, sun, time: this.time, fade });
    b.settlements.group.visible = u > -0.05;
    b.settlements.setPointScale(renderer.domElement.height / (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2)));
    b.labels.update(this.camera.position, d, u > 0);

    const covered = this.covers();
    this.setPixelRatio(renderer, covered && this.host.lite ? 1 : null);
    const autoClear = renderer.autoClear;
    renderer.autoClear = false;
    if (covered) renderer.clear(true, true, true);
    else renderer.clearDepth();
    // Space behind the close-up takes over from the map's sky as the planet fills the screen.
    const bg = covered ? 1 : smoothstep(0.2, U_COVER, u);
    if (bg > 0.001) {
      const sky = this.ensureSky();
      (sky.backdrop.material as THREE.ShaderMaterial).uniforms.uAlpha.value = bg;
      (sky.stars.material as THREE.PointsMaterial).opacity = bg;
      sky.stars.quaternion.copy(inv);
      this.starCam.quaternion.copy(this.camera.quaternion);
      this.copyLens(this.starCam, mapCamera, 0.1, 200);
      renderer.render(sky.scene, this.starCam);
      renderer.clearDepth();
    }
    renderer.render(b.scene, this.camera);
    renderer.autoClear = autoClear;
    labels.render(b.scene, this.camera);
  }

  dispose(): void {
    this.building = null;
    this.disposeBuilt('next');
    this.disposeBuilt('built');
    this.deactivate();
  }

  // ── Building ──────────────────────────────────────────────────────

  /**
   * Build (or rebuild) the close-up a slice per frame: the layout, then one cube face of the globe
   * per frame. True when there is something to draw.
   */
  private advanceBuild(): boolean {
    const t = this.target!;
    const want = this.targetKey;
    if (this.built?.key !== want && this.next?.key !== want) {
      if (this.building?.key !== want) this.building = { key: want, stage: 0 };
      const job = this.building;
      if (job.stage === 0) {
        job.data = this.create(t, want);
        job.stage = 1;
      } else if (job.data!.terrain.bakeStep()) {
        if (this.built) this.next = job.data!;
        else this.built = job.data!;
        this.building = null;
      }
    }
    if (this.next && this.next.terrain.ready) {
      this.disposeBuilt('built');
      this.built = this.next;
      this.next = null;
    }
    return !!this.built?.terrain.ready;
  }

  private create(t: SurfaceTarget, key: string): Built {
    const look = surfaceLookOf(PLANET_LOOKS[t.planet.biome] ?? PLANET_LOOKS.barren, hashSeed(t.planet.id, 'surface'));
    const layout = surfaceLayout(t.planet.id, look, t.colony);
    const terrain = new SurfaceTerrain(look, layout.settlements, this.quality);
    const mine = layout.buildings.find((x) => x.id === 'mine' && !x.orbital);
    if (mine) terrain.setPit(new THREE.Vector3(...mine.dir), 0.0068, 0.05);
    const settlements = new Settlements(layout, terrain, this.quality.lite);
    const labels = this.makeLabels(t, layout, terrain, settlements);
    const scene = new THREE.Scene();
    scene.add(terrain.group, settlements.group, labels.group);
    return { key, look, layout, terrain, settlements, labels, scene };
  }

  private makeLabels(t: SurfaceTarget, layout: SurfaceLayout, terrain: SurfaceTerrain, settlements: Settlements): SurfaceLabels {
    const labels = new SurfaceLabels();
    const fmtPop = (m: number) => (m >= 1 ? `${m.toFixed(1)}M` : `${Math.round(m * 1000)}k`);
    layout.settlements.forEach((c, i) => {
      const at = new THREE.Vector3(...c.dir).multiplyScalar(terrain.radiusOf(c.level) + (c.kind === 'capital' ? 0.018 : 0.004));
      const what = c.kind === 'capital' ? 'Capital' : c.kind === 'city' ? (t.colony?.owner === 'foreign' ? 'Foreign city' : 'City') : 'Town';
      if (c.kind === 'town') labels.add('town', c.name, fmtPop(c.pop), at, (d, _dist, engaged) => engaged && d < 2.5, () => this.goSettlement(i));
      else labels.add(c.kind === 'capital' ? 'capital' : 'city', c.name, `${what} · ${fmtPop(c.pop)}`, at, (_d, _dist, engaged) => engaged, () => this.goSettlement(i));
    });
    for (const s of settlements.buildings) {
      const name = BUILDINGS.find((x) => x.id === s.id)?.name ?? s.id;
      const at = s.dir.clone().multiplyScalar(s.top + 0.0006);
      labels.add('site', name, '', at, (d, dist, engaged) => engaged && (s.orbital ? d < 1.2 : d < 0.32 && dist < 0.42), () => this.goBuilding(s.id));
    }
    if (!layout.settlements.length) {
      labels.add('survey', t.planet.name, t.survey, new THREE.Vector3(...layout.landing).multiplyScalar(1.01), (_d, _dist, engaged) => engaged, null);
    }
    return labels;
  }

  // ── Camera trips ──────────────────────────────────────────────────

  private startLanding(): void {
    const b = this.built;
    if (!b || this.rig.flying) return;
    this.pendingLand = false;
    if (b.layout.settlements.length) this.goSettlement(0);
    else this.glide(new THREE.Vector3(...b.layout.landing), uOfD(0.25), { tilt: 0.2 });
  }

  private goSettlement(i: number): void {
    const c = this.built?.layout.settlements[i];
    if (!c) return;
    const capital = c.kind === 'capital';
    const d = capital ? 0.1 : 0.016 + c.radius * 1.6;
    const ahead = offsetDir(c.dir, 0, capital ? 0.012 : 0);
    this.glide(new THREE.Vector3(...ahead), uOfD(d), { north: new THREE.Vector3(...frameAt(c.dir).t2), tilt: capital ? 0.38 : 0.15 });
  }

  private goBuilding(id: string): void {
    const b = this.built;
    const s = b?.settlements.buildings.find((x) => x.id === id);
    const main = b?.layout.settlements[0];
    if (!s || !main) return;
    const c = new THREE.Vector3(...main.dir);
    if (s.orbital) this.glide(new THREE.Vector3(...offsetDir(main.dir, 0, 0.07)), uOfD(0.07), { north: new THREE.Vector3(...frameAt(main.dir).t2), tilt: 0.3 });
    else this.glide(s.dir, uOfD(0.034), { north: s.dir.clone().sub(c).normalize(), tilt: 0.05 });
  }

  /** Double-click the ground: fly there, a little lower. */
  private flyToPoint(clientX: number, clientY: number): void {
    const rect = this.host.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    const hit = ray.ray.intersectSphere(new THREE.Sphere(new THREE.Vector3(), 1), new THREE.Vector3());
    if (hit) this.glide(hit, Math.min(Math.max(this.u, 0) + 0.22, 0.97), {});
  }

  private glide(dir: THREE.Vector3, u1: number, opts: { north?: THREE.Vector3; tilt?: number }): void {
    const reduceMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.attached = false;
    this.rig.flyTo(dir, this.u, Math.min(Math.max(u1, 0), 1), { ...opts, reduceMotion });
  }

  private cancelFly(): void {
    this.rig.cancelFly();
    this.flySetAltitude = null;
  }

  // ── Plumbing ──────────────────────────────────────────────────────

  private copyLens(cam: THREE.PerspectiveCamera, from: THREE.PerspectiveCamera, near: number, far: number): void {
    cam.fov = from.fov;
    cam.aspect = from.aspect;
    cam.near = near;
    cam.far = far;
    if (from.view?.enabled) {
      const v = from.view;
      cam.setViewOffset(v.fullWidth, v.fullHeight, v.offsetX, v.offsetY, v.width, v.height);
    } else cam.clearViewOffset();
    cam.updateProjectionMatrix();
  }

  /** Phones draw the full-screen close-up at one device pixel per CSS pixel (null: back to the map's). */
  private setPixelRatio(renderer: THREE.WebGLRenderer, ratio: number | null): void {
    if (ratio === null) return this.restorePixelRatio();
    if (this.savedRatio) return;
    this.savedRatio = { renderer, ratio: renderer.getPixelRatio() };
    if (ratio < this.savedRatio.ratio) renderer.setPixelRatio(ratio);
  }

  private restorePixelRatio(): void {
    if (!this.savedRatio) return;
    if (this.savedRatio.renderer.getPixelRatio() !== this.savedRatio.ratio) this.savedRatio.renderer.setPixelRatio(this.savedRatio.ratio);
    this.savedRatio = null;
  }

  /** Stars (fixed to the galaxy, so they wheel as the planet turns) and a backdrop that hides the map's sky. */
  private ensureSky(): NonNullable<SurfaceLayer['sky']> {
    if (this.sky) return this.sky;
    const rng = new Rng(hashSeed('surface-stars'));
    const n = this.host.lite ? 1400 : 2600, pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const z = rng.range(-1, 1), a = rng.range(0, Math.PI * 2), r = Math.sqrt(1 - z * z);
      pos.set([r * Math.cos(a) * 100, z * 100, r * Math.sin(a) * 100], i * 3);
      const lum = 0.25 + Math.pow(rng.next(), 3) * 0.9, tint = rng.next();
      col.set([lum * (tint > 0.8 ? 1 : 0.85), lum * 0.9, lum * (tint < 0.3 ? 1 : 0.85)], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const stars = new THREE.Points(g, new THREE.PointsMaterial({ size: 1.6, sizeAttenuation: false, vertexColors: true, transparent: true, depthWrite: false }));
    stars.frustumCulled = false;
    const backdrop = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color('#03060d') }, uAlpha: { value: 1 } },
      vertexShader: BACKDROP_VERT, fragmentShader: BACKDROP_FRAG, transparent: true, depthTest: false, depthWrite: false,
    }));
    backdrop.frustumCulled = false;
    backdrop.renderOrder = -1;
    const scene = new THREE.Scene();
    scene.add(backdrop, stars);
    this.sky = { scene, stars, backdrop };
    return this.sky;
  }

  private deactivate(): void {
    if (this.active) this.built?.labels.hide();
    this.active = false;
    this.u = -1;
    if (this.host.input.capture === this.capture) this.host.input.capture = null;
    this.host.hold(null);
    this.restorePixelRatio();
  }

  private disposeBuilt(which: 'built' | 'next'): void {
    const b = this[which];
    if (!b) return;
    b.terrain.dispose();
    b.settlements.dispose();
    b.labels.dispose();
    this[which] = null;
    if (which === 'built' && this.sky && !this.next) {
      this.sky.stars.geometry.dispose();
      (this.sky.stars.material as THREE.Material).dispose();
      this.sky.backdrop.geometry.dispose();
      (this.sky.backdrop.material as THREE.Material).dispose();
      this.sky = null;
    }
  }
}
