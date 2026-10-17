import * as THREE from 'three';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { BIOMES } from '../../content/biomes';
import { PLANET_LOOKS } from '../../content/planetLooks';
import { GalaxyModel, SPECTRAL_COLORS, SpectralClass, StarSystem } from '../../core/galaxy/GalaxyModel';
import { planetsOf, Planet } from '../../core/galaxy/Planets';
import { worldToHex } from '../../core/hex/Hex';
import { Rng, hashSeed } from '../../core/rng/Rng';
import { createPlanetMaterial, createRingMaterial, createStarMaterial } from '../planets/PlanetMaterial';
import type { MapLayer, ViewState } from './MapLayer';
import { fade } from './ZoomModel';

const STAR_SCALE: Record<SpectralClass, number> = { O: 1.8, B: 1.5, A: 1.25, F: 1.1, G: 1, K: 0.9, M: 0.75 };
/** Show the system below this visible width (ly). */
export const SYSTEM_VIEW_WIDTH = 9;
const LABELS_BELOW = 3;
const STAR_V = new THREE.Vector3();
const TMP = new THREE.Vector3();

interface OrbitingPlanet {
  readonly planet: Planet;
  readonly pivot: THREE.Object3D;
  readonly mesh: THREE.Mesh;
  readonly material: THREE.ShaderMaterial;
  readonly radius: number;
  readonly phase: number;
  readonly speed: number;
  readonly label: CSS2DObject;
}

interface BuiltSystem {
  readonly star: StarSystem;
  readonly root: THREE.Group;
  readonly starMaterial: THREE.ShaderMaterial;
  readonly corona: THREE.Sprite;
  readonly planets: OrbitingPlanet[];
  readonly starLabel: CSS2DObject;
}

export interface SystemEvents {
  isHome(star: StarSystem): boolean;
  onPlanetClick(star: StarSystem, planet: Planet): void;
}

/**
 * Close-up of the star system nearest the camera focus: a shaded star, orbit
 * rings and procedurally shaded planets that can be picked and followed.
 */
export class SystemLayer implements MapLayer {
  readonly object3d = new THREE.Group();
  private current: BuiltSystem | null = null;
  private readonly coronaTexture = radialTexture();
  private selectedId: string | null = null;
  private hoverId: string | null = null;
  private origin = { x: 0, z: 0 };

  constructor(private readonly galaxy: GalaxyModel, private readonly events: SystemEvents) {
  }

  get system(): StarSystem | null {
    return this.current?.star ?? null;
  }

  /** Planet under a ray, if the system view is showing. */
  pick(ray: THREE.Raycaster): Planet | null {
    if (!this.current || !this.object3d.visible) return null;
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

  setHover(planetId: string | null): void {
    this.hoverId = planetId;
  }

  setSelected(planetId: string | null): void {
    this.selectedId = planetId;
  }

  /** Absolute galaxy position of a planet (for the camera to follow). */
  planetPosition(planetId: string): THREE.Vector3 | null {
    const p = this.current?.planets.find((x) => x.planet.id === planetId);
    if (!p) return null;
    return p.mesh.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(this.origin.x, 0, this.origin.z));
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
    // Star position in view space: planet shading is camera-relative.
    const starPos = sys.root.getWorldPosition(STAR_V).applyMatrix4(view.camera.matrixWorldInverse);
    sys.starMaterial.uniforms.uTime.value = t;
    sys.corona.material.opacity = 0.75 + 0.08 * Math.sin(t * 1.3);
    const showLabels = view.visibleWidth < LABELS_BELOW && view.visibleWidth > 0.2;
    const labelFade = String(fade(view.visibleWidth, LABELS_BELOW * 0.6, LABELS_BELOW));
    sys.starLabel.visible = showLabels;
    sys.starLabel.element.style.opacity = labelFade;
    for (const p of sys.planets) {
      p.pivot.rotation.y = p.phase + t * p.speed;
      p.mesh.rotation.y = t * 0.15;
      p.material.uniforms.uTime.value = t;
      p.material.uniforms.uStarPos.value.copy(starPos);
      p.label.visible = showLabels;
      p.label.element.style.opacity = labelFade;
      p.label.element.classList.toggle('active', p.planet.id === this.selectedId);
      p.label.element.classList.toggle('hover', p.planet.id === this.hoverId);
    }
  }

  private build(star: StarSystem): BuiltSystem {
    const root = new THREE.Group();
    root.position.set(star.position.x, 0.002, star.position.z);
    const rng = new Rng(hashSeed(this.galaxy.params.seed, 'system', star.id));
    const color = SPECTRAL_COLORS[star.spectral];
    const starR = 0.014 * STAR_SCALE[star.spectral];

    const starMaterial = createStarMaterial(color, hashSeed(star.id, 'star'));
    root.add(new THREE.Mesh(new THREE.SphereGeometry(starR, 48, 32), starMaterial));
    const corona = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.coronaTexture, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    corona.scale.setScalar(starR * 9);
    root.add(corona);
    const starLabel = label(`<b>${star.name}</b><small>Class ${star.spectral} star</small>`, 'system-label star');
    starLabel.position.set(0, 0, -starR * 2.4);
    root.add(starLabel);

    const orbitMat = new THREE.LineBasicMaterial({ color: '#7fd3e6', transparent: true, opacity: 0.2, depthWrite: false });
    const planets: OrbitingPlanet[] = [];
    for (const planet of planetsOf(star, this.galaxy.params.seed)) {
      const orbit = 0.06 + planet.index * 0.04 + rng.range(-0.005, 0.005);
      const ring = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(
        Array.from({ length: 160 }, (_, i) => new THREE.Vector3(Math.cos((i / 160) * Math.PI * 2) * orbit, 0, Math.sin((i / 160) * Math.PI * 2) * orbit))), orbitMat);
      root.add(ring);

      const look = PLANET_LOOKS[planet.biome] ?? PLANET_LOOKS.barren;
      const radius = (0.0028 + planet.size * 0.0013) * (look.kind === 'gas' ? 1.7 : 1);
      const material = createPlanetMaterial(look, hashSeed(planet.id, 'surface'), { lights: this.events.isHome(star) && planet.index === 0 });
      material.uniforms.uStarColor.value.set(color).lerp(new THREE.Color('#ffffff'), 0.6);
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 64, 40), material);
      mesh.rotation.z = rng.range(-0.4, 0.4);
      const pivot = new THREE.Object3D();
      const holder = new THREE.Object3D();
      holder.position.set(orbit, 0, 0);
      holder.add(mesh);
      if (look.ringChance && new Rng(hashSeed(planet.id, 'ringroll')).chance(look.ringChance)) {
        const ringMesh = new THREE.Mesh(new THREE.RingGeometry(1.35, 2.2, 96), createRingMaterial(look.palette[2], hashSeed(planet.id, 'ring')));
        ringMesh.scale.setScalar(radius);
        ringMesh.rotation.x = -Math.PI / 2 + rng.range(-0.5, 0.5);
        holder.add(ringMesh);
      }
      const biome = BIOMES.find((b) => b.id === planet.biome);
      const lbl = label(`<b>${planet.name}</b><small>${biome?.name ?? planet.biome} · size ${planet.size}</small>`, 'system-label');
      lbl.position.set(0, 0, radius * 3);
      lbl.element.addEventListener('click', () => this.events.onPlanetClick(star, planet));
      holder.add(lbl);
      pivot.add(holder);
      root.add(pivot);
      planets.push({ planet, pivot, mesh, material, radius, phase: rng.range(0, Math.PI * 2), speed: 0.1 / Math.pow(orbit * 12, 1.5), label: lbl });
    }
    return { star, root, starMaterial, corona, planets, starLabel };
  }

  private clear(): void {
    if (!this.current) return;
    this.object3d.remove(this.current.root);
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
    this.coronaTexture.dispose();
  }
}

function label(html: string, cls: string): CSS2DObject {
  const el = document.createElement('div');
  el.className = cls;
  el.innerHTML = html;
  return new CSS2DObject(el);
}

function radialTexture(): THREE.Texture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.12, 'rgba(255,255,255,0.8)');
  g.addColorStop(0.3, 'rgba(255,255,255,0.25)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
}
