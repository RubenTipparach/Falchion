import * as THREE from 'three';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { BIOMES } from '../../content/biomes';
import { PLANET_LOOKS } from '../../content/planetLooks';
import { RESOURCES } from '../../content/resources';
import { describeStar } from '../../content/stars';
import type { AsteroidField } from '../../core/galaxy/Asteroids';
import { GalaxyModel, StarSystem } from '../../core/galaxy/GalaxyModel';
import { planetsOf, Planet } from '../../core/galaxy/Planets';
import { worldToHex } from '../../core/hex/Hex';
import { Rng, hashSeed } from '../../core/rng/Rng';
import type { SettlementInput } from '../../core/surface/SurfaceLayout';
import { createPlanetMaterial, createRingMaterial, setPlanetLights } from '../planets/PlanetMaterial';
import { hasPlanetLightMap, planetLightMap } from '../planets/planetLayouts';
import { createStarVisual, StarVisual } from '../stars/StarVisuals';
import { AsteroidBelt, type BeltField } from './AsteroidBelts';
import { MEGA_BY_ID, isMegastructure } from '../../content/megastructures';
import { createMegaVisual, type MegaVisual } from '../megastructures/MegaVisuals';
import { placeBelts, type OrbitSlot } from './beltLayout';
import type { MapLayer, ViewState } from './MapLayer';
import { fade } from './ZoomModel';

/** Show the system below this visible width (ly). */
export const SYSTEM_VIEW_WIDTH = 9;
const LABELS_BELOW = 3;
/**
 * Planet spin (radians per second): a day of about seven minutes. A planet keeps this spin while
 * its close-up is shown, so day and night on the ground follow the planet seen from orbit.
 */
const SPIN = 0.015;
/** Orbital speed scale: radians per second for an orbit of 1/12 ly (further out is slower). */
const ORBIT_RATE = 0.01;
/** The innermost planet orbit (ly); companions or a disc that reach further push the planets out. */
const FIRST_ORBIT = 0.06;
/** Gap kept between the star's outermost part and the innermost planet orbit. */
const ORBIT_CLEARANCE = 0.025;
const TMP = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

interface OrbitingPlanet {
  readonly planet: Planet;
  readonly pivot: THREE.Object3D;
  readonly mesh: THREE.Mesh;
  readonly material: THREE.ShaderMaterial;
  readonly radius: number;
  readonly phase: number;
  readonly speed: number;
  readonly label: CSS2DObject;
  /** Turned so far (radians). */
  spin: number;
  /** Tidally locked: its sunward pole stays on the star (no spin). */
  readonly locked: boolean;
  /** Key of the night lights shown (what stands on the planet), null for none, undefined before the first check. */
  lightsKey?: string | null;
}

interface BuiltSystem {
  readonly star: StarSystem;
  readonly root: THREE.Group;
  readonly visual: StarVisual;
  readonly planets: OrbitingPlanet[];
  readonly starLabel: CSS2DObject;
  readonly belts: DrawnBelt[];
  /** A megastructure system's structure (change megastructures): its only world. */
  readonly mega: DrawnMega | null;
}

interface DrawnMega {
  readonly planet: Planet;
  readonly visual: MegaVisual;
  readonly label: CSS2DObject;
}

interface DrawnBelt {
  readonly belt: AsteroidBelt;
  readonly label: CSS2DObject;
  /** What the field had left when last drawn. */
  left: number;
}

/** A planet as drawn this frame (see SystemLayer.planetFrame). */
export interface PlanetFrame {
  readonly position: THREE.Vector3;
  readonly quaternion: THREE.Quaternion;
  /** Radius in light years. */
  readonly radius: number;
  readonly star: THREE.Vector3;
}

export interface SystemEvents {
  /** What stands on a planet (from the game state), for its night lights; null when nobody holds it. */
  colonyOf(planet: Planet): SettlementInput | null;
  onPlanetClick(star: StarSystem, planet: Planet): void;
  /** A system's planets as the game sees them (colonies keep their type; city worlds); default: as generated. */
  planets?(star: StarSystem): Planet[];
  /** A system's asteroid fields with what each holds now (drawn as belts); default: none. */
  fields?(star: StarSystem): BeltField[];
}

/**
 * Close-up of the star system nearest the camera focus: a shaded star, orbit
 * rings and procedurally shaded planets that can be picked and followed.
 */
export class SystemLayer implements MapLayer {
  readonly object3d = new THREE.Group();
  private current: BuiltSystem | null = null;
  private selectedId: string | null = null;
  private hoverId: string | null = null;
  /** A planet a close-up draws instead (the surface view): hidden here. */
  private heldId: string | null = null;
  /** Night lights need a check (a new system, or the colonies changed). */
  private lightsDirty = true;
  /** The asteroid fields need a re-read (the shared world or the year changed). */
  private fieldsDirty = false;
  private readonly starWorld = new THREE.Vector3();
  private lastTime = 0;
  private origin = { x: 0, z: 0 };

  constructor(private readonly galaxy: GalaxyModel, private readonly events: SystemEvents) {
  }

  get system(): StarSystem | null {
    return this.current?.star ?? null;
  }

  /** Planet under a ray, if the system view is showing (a megastructure anywhere across it). */
  pick(ray: THREE.Raycaster): Planet | null {
    if (!this.current || !this.object3d.visible) return null;
    const mega = this.current.mega;
    if (mega && ray.ray.distanceToPoint(this.current.root.getWorldPosition(TMP)) < mega.visual.extent) return mega.planet;
    // Generous hit target: planets are small on screen.
    let best: { p: OrbitingPlanet; d: number } | null = null;
    for (const p of this.current.planets) {
      p.mesh.getWorldPosition(TMP);
      const d = ray.ray.distanceToPoint(TMP);
      const dist = ray.ray.origin.distanceTo(TMP);
      const slack = Math.max(p.radius * 1.6, dist * 0.02);
      if (d < slack && (!best || d < best.d)) best = { p, d };
    }
    return best?.p.planet ?? null;
  }

  /**
   * The asteroid field under a ray, if the system view is showing: where the ray meets the system's
   * plane, within a belt's width (with some slack, since belts are thin on screen).
   */
  pickField(ray: THREE.Raycaster): AsteroidField | null {
    if (!this.current || !this.object3d.visible || !this.current.belts.length) return null;
    const root = this.current.root;
    root.updateWorldMatrix(true, false);
    const local = ray.ray.clone().applyMatrix4(new THREE.Matrix4().copy(root.matrixWorld).invert());
    if (Math.abs(local.direction.y) < 1e-6) return null;
    const t = -local.origin.y / local.direction.y;
    if (t <= 0) return null;
    const hit = local.origin.clone().addScaledVector(local.direction, t);
    const r = Math.hypot(hit.x, hit.z);
    const slack = t * local.direction.length() * 0.012;
    let best: { field: AsteroidField; d: number } | null = null;
    for (const { belt } of this.current.belts) {
      const d = Math.abs(r - belt.radius);
      if (d <= belt.halfWidth * 1.3 + slack && (!best || d < best.d)) best = { field: belt.field, d };
    }
    return best?.field ?? null;
  }

  /** The asteroid field under the pointer, and the one whose card is open (change asteroid-assign). */
  private fieldHover: string | null = null;
  private fieldSelected: string | null = null;

  setFieldHover(fieldId: string | null): void {
    this.fieldHover = fieldId;
  }

  setFieldSelected(fieldId: string | null): void {
    this.fieldSelected = fieldId;
  }

  setHover(planetId: string | null): void {
    this.hoverId = planetId;
  }

  setSelected(planetId: string | null): void {
    this.selectedId = planetId;
  }

  /** A close-up (the surface view) is drawing this planet from the same viewpoint: hide it here. null releases it. */
  holdPlanet(planetId: string | null): void {
    this.heldId = planetId;
  }

  /** The colonies changed: re-check every planet's night lights. */
  refreshLights(): void {
    this.lightsDirty = true;
  }

  /** The shared world changed (fields mined or refilled): re-read what each belt holds. */
  refreshFields(): void {
    this.fieldsDirty = true;
  }

  /** Absolute galaxy position of a planet (for the camera to follow). */
  planetPosition(planetId: string): THREE.Vector3 | null {
    // A megastructure is centred on its star.
    if (this.current?.mega?.planet.id === planetId) return this.current.root.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(this.origin.x, 0, this.origin.z));
    const p = this.current?.planets.find((x) => x.planet.id === planetId);
    if (!p) return null;
    return p.mesh.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(this.origin.x, 0, this.origin.z));
  }

  /**
   * Where a planet is drawn this frame, for a close-up that must line up with it: its centre and
   * its star's centre (render-relative, as the camera), its orientation and its radius (ly).
   */
  planetFrame(planetId: string): PlanetFrame | null {
    const sys = this.current;
    const p = sys?.planets.find((x) => x.planet.id === planetId);
    if (!sys || !p || !this.object3d.visible) return null;
    return {
      position: p.mesh.getWorldPosition(new THREE.Vector3()),
      quaternion: p.mesh.getWorldQuaternion(new THREE.Quaternion()),
      radius: p.radius,
      star: sys.root.getWorldPosition(new THREE.Vector3()),
    };
  }

  update(view: ViewState): void {
    this.origin = view.origin;
    const visible = view.visibleWidth < SYSTEM_VIEW_WIDTH;
    this.object3d.visible = visible;
    if (!visible) return;
    const star = this.galaxy.nearestStar(worldToHex(view.focus.x, view.focus.z), 1);
    if (!star) {
      this.clear();
      return;
    }
    if (this.current?.star.id !== star.id) {
      this.clear();
      this.current = this.build(star);
      this.object3d.add(this.current.root);
    }
    const sys = this.current!;
    const t = view.time;
    const dt = Math.min(1, Math.max(0, t - this.lastTime));
    this.lastTime = t;
    // Star position for planet shading (made camera-relative as each planet is drawn, see build).
    sys.root.getWorldPosition(this.starWorld);
    this.updateLights(sys);
    sys.visual.update(t);
    sys.mega?.visual.update(t);
    const showLabels = view.visibleWidth < LABELS_BELOW && view.visibleWidth > 0.2;
    const labelFade = String(fade(view.visibleWidth, LABELS_BELOW * 0.6, LABELS_BELOW));
    sys.starLabel.visible = showLabels;
    sys.starLabel.element.style.opacity = labelFade;
    if (sys.mega) {
      sys.mega.label.visible = showLabels;
      sys.mega.label.element.style.opacity = labelFade;
    }
    for (const p of sys.planets) {
      p.pivot.rotation.y = p.phase + t * p.speed;
      if (!p.locked) {
        p.spin += dt * SPIN;
        p.mesh.rotation.y = p.spin;
      }
      p.mesh.parent!.visible = p.planet.id !== this.heldId;
      p.material.uniforms.uTime.value = t;
      p.label.visible = showLabels;
      p.label.element.style.opacity = labelFade;
      p.label.element.classList.toggle('active', p.planet.id === this.selectedId);
      p.label.element.classList.toggle('hover', p.planet.id === this.hoverId);
    }
    this.updateBelts(sys, view.camera, t, showLabels, labelFade);
  }

  private updateBelts(sys: BuiltSystem, camera: THREE.Camera, t: number, showLabels: boolean, labelFade: string): void {
    if (this.fieldsDirty && sys.belts.length) {
      const now = new Map((this.events.fields?.(sys.star) ?? []).map((f) => [f.field.id, f.left]));
      for (const b of sys.belts) {
        const left = now.get(b.belt.field.id);
        if (left === undefined || left === b.left) continue;
        b.left = left;
        b.belt.setLeft(left);
        setBeltLabel(b.label, b.belt.field, left);
      }
    }
    this.fieldsDirty = false;
    if (!sys.belts.length) return;
    // Labels sit on each belt's near edge, a little to the right of the star (below it on screen),
    // so they stack tidily whatever the camera's heading.
    TMP.set(0, -1, 0).applyQuaternion(camera.quaternion).setY(0);
    if (TMP.lengthSq() < 1e-8) TMP.set(0, 0, 1);
    TMP.normalize().applyAxisAngle(UP, 0.5);
    for (const b of sys.belts) {
      b.belt.update(t);
      const id = b.belt.field.id;
      b.belt.setHighlight(id === this.fieldSelected ? 2 : id === this.fieldHover ? 1 : 0);
      b.belt.labelAt(TMP, b.label.position);
      b.label.visible = showLabels;
      b.label.element.style.opacity = labelFade;
    }
  }

  private build(star: StarSystem): BuiltSystem {
    const root = new THREE.Group();
    root.position.set(star.position.x, 0.002, star.position.z);
    const rng = new Rng(hashSeed(this.galaxy.params.seed, 'system', star.id));
    // The star by kind (dwarfs, giants, remnants, black holes) with any companions.
    const visual = createStarVisual(star);
    root.add(visual.object3d);
    const starLabel = label(`<b>${star.name}</b><small>${describeStar(star)}</small>`, 'system-label star');
    starLabel.position.set(0, 0, -visual.labelOffset);
    root.add(starLabel);
    const firstOrbit = Math.max(FIRST_ORBIT, visual.clearance + ORBIT_CLEARANCE);

    const orbitMat = new THREE.LineBasicMaterial({ color: '#7fd3e6', transparent: true, opacity: 0.2, depthWrite: false });
    const planets: OrbitingPlanet[] = [];
    const orbits: OrbitSlot[] = [];
    let mega: DrawnMega | null = null;
    for (const planet of this.events.planets?.(star) ?? planetsOf(star, this.galaxy.params.seed)) {
      if (isMegastructure(planet.biome)) {
        // The structure round the star, in place of any planet (change megastructures).
        const v = createMegaVisual(planet.biome, { seed: hashSeed(planet.id, 'mega'), light: visual.light, clearance: visual.clearance });
        root.add(v.object3d);
        const def = MEGA_BY_ID[planet.biome];
        const lbl = label(`<b>${planet.name}</b><small style="color:${def.color}">Megastructure · ${def.name}</small>`, 'system-label');
        lbl.position.set(0, 0, v.extent * 1.05);
        lbl.element.addEventListener('click', () => this.events.onPlanetClick(star, planet));
        root.add(lbl);
        mega = { planet, visual: v, label: lbl };
        continue;
      }
      const orbit = firstOrbit + planet.index * 0.04 + rng.range(-0.005, 0.005);
      const ring = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(
        Array.from({ length: 160 }, (_, i) => new THREE.Vector3(Math.cos((i / 160) * Math.PI * 2) * orbit, 0, Math.sin((i / 160) * Math.PI * 2) * orbit))), orbitMat);
      root.add(ring);

      const look = PLANET_LOOKS[planet.biome] ?? PLANET_LOOKS.barren;
      const radius = planetRadius(planet);
      const material = createPlanetMaterial(look, hashSeed(planet.id, 'surface'));
      material.uniforms.uStarColor.value.copy(visual.light);
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 64, 40), material);
      // Shading is camera-relative: the star in the view space of whichever camera draws the planet
      // (a close-up may move the map camera after the layers have updated).
      mesh.onBeforeRender = (_r, _s, camera) => {
        material.uniforms.uStarPos.value.copy(this.starWorld).applyMatrix4(camera.matrixWorldInverse);
      };
      // A tilted axis; a tidally locked world (change planet-audit) instead keeps its sunward pole
      // (+x, where its basin is) to the star: no tilt, no spin (the roll is still drawn, so the
      // planets after it keep their looks).
      const tilt = rng.range(-0.4, 0.4);
      const locked = look.locked !== undefined;
      if (locked) mesh.rotation.set(0, Math.PI, 0);
      else mesh.rotation.z = tilt;
      const pivot = new THREE.Object3D();
      const holder = new THREE.Object3D();
      holder.position.set(orbit, 0, 0);
      holder.add(mesh);
      const ringed = !!look.ringChance && new Rng(hashSeed(planet.id, 'ringroll')).chance(look.ringChance);
      if (ringed) {
        const ringMesh = new THREE.Mesh(new THREE.RingGeometry(1.35, 2.2, 96), createRingMaterial(look.palette[2], hashSeed(planet.id, 'ring')));
        ringMesh.scale.setScalar(radius);
        ringMesh.rotation.x = -Math.PI / 2 + rng.range(-0.5, 0.5);
        holder.add(ringMesh);
      }
      orbits.push({ radius: orbit, extent: radius * (ringed ? 2.3 : 1.2) });
      const biome = BIOMES.find((b) => b.id === planet.biome);
      const lbl = label(`<b>${planet.name}</b><small>${biome?.name ?? planet.biome} · size ${planet.size}</small>`, 'system-label');
      lbl.position.set(0, 0, radius * 3);
      lbl.element.addEventListener('click', () => this.events.onPlanetClick(star, planet));
      holder.add(lbl);
      pivot.add(holder);
      root.add(pivot);
      planets.push({ planet, pivot, mesh, material, radius, phase: rng.range(0, Math.PI * 2), speed: ORBIT_RATE / Math.pow(orbit * 12, 1.5), label: lbl, spin: this.lastTime * SPIN, locked });
    }
    this.lightsDirty = true;
    const belts = this.buildBelts(star, root, visual, orbits, firstOrbit);
    return { star, root, visual, planets, starLabel, belts, mega };
  }

  /** Each asteroid field as a belt in a gap between planet orbits (see beltLayout). */
  private buildBelts(star: StarSystem, root: THREE.Group, visual: StarVisual, orbits: OrbitSlot[], firstOrbit: number): DrawnBelt[] {
    const fields = this.events.fields?.(star) ?? [];
    if (!fields.length) return [];
    const places = placeBelts(orbits, visual.clearance + ORBIT_CLEARANCE * 0.6, firstOrbit, fields.map((f) => f.field.id));
    return fields.map(({ field, left }, i) => {
      const belt = new AsteroidBelt(field, places[i], visual.light);
      belt.setLeft(left);
      root.add(belt.object3d);
      const lbl = label('', 'system-label belt');
      lbl.element.style.pointerEvents = 'none';
      setBeltLabel(lbl, field, left);
      root.add(lbl);
      return { belt, label: lbl, left };
    });
  }

  /**
   * Night lights from what stands on each planet (the same layout the close-up draws). A layout
   * takes tens of milliseconds, so at most one new one is made per frame.
   */
  private updateLights(sys: BuiltSystem): void {
    if (!this.lightsDirty) return;
    let pending = false, made = false;
    for (const p of sys.planets) {
      if (p.planet.biome === 'gas') { p.lightsKey = null; continue; }
      const colony = this.events.colonyOf(p.planet);
      const key = colony ? JSON.stringify(colony) : null;
      if (key === p.lightsKey) continue;
      if (made && !hasPlanetLightMap(p.planet, colony)) { pending = true; continue; }
      made = made || !hasPlanetLightMap(p.planet, colony);
      setPlanetLights(p.material, planetLightMap(p.planet, colony));
      p.lightsKey = key;
    }
    this.lightsDirty = pending;
  }

  private clear(): void {
    if (!this.current) return;
    this.object3d.remove(this.current.root);
    this.current.visual.dispose();
    this.current.mega?.visual.dispose();
    for (const b of this.current.belts) b.belt.dispose();
    this.current.root.traverse((o) => {
      if (o instanceof THREE.Mesh || o instanceof THREE.Line) {
        o.geometry.dispose();
        (o.material as THREE.Material).dispose();
      }
      if (o instanceof CSS2DObject) o.element.remove();
    });
    this.current = null;
  }

  dispose(): void {
    this.clear();
  }
}

/** A planet's drawn radius in light years (bigger worlds, and gas giants, are larger). */
export function planetRadius(planet: Planet): number {
  const look = PLANET_LOOKS[planet.biome] ?? PLANET_LOOKS.barren;
  return (0.0028 + planet.size * 0.0013) * (look.kind === 'gas' ? 1.7 : 1);
}

function setBeltLabel(lbl: CSS2DObject, field: AsteroidField, left: number): void {
  const res = RESOURCES.find((r) => r.id === field.resource);
  lbl.element.innerHTML = `<small style="color:${res?.color ?? '#ccc'};opacity:0.75;font-size:9.5px">${res?.name ?? field.resource} field · ${left.toLocaleString('en-US')} / ${field.capacity.toLocaleString('en-US')}</small>`;
}

function label(html: string, cls: string): CSS2DObject {
  const el = document.createElement('div');
  el.className = cls;
  el.innerHTML = html;
  return new CSS2DObject(el);
}
