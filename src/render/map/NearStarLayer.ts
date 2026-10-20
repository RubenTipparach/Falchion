import * as THREE from 'three';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { worldToHex } from '../../core/hex/Hex';
import { STAR_KINDS } from '../../content/stars';
import { GalaxyModel, SPECTRAL_COLORS, SpectralClass, StarSystem, kindOf } from '../../core/galaxy/GalaxyModel';
import { ChunkCache } from './ChunkCache';
import type { MapLayer, ViewState } from './MapLayer';
import { createStarPointsMaterial, pointScale } from './StarPointsMaterial';
import { centralBlackHoleTexture } from '../stars/StarVisuals';
import { fade, fadeIn } from './ZoomModel';
import type { Sight, StarLens } from '../../core/visibility/Vision';

const CHUNK = 64;
const BUDGET_PER_FRAME = 6;
const LABEL_COUNT = 28;

const SPECTRAL_SIZE: Record<SpectralClass, number> = { O: 2.2, B: 1.8, A: 1.4, F: 1.2, G: 1.1, K: 1.0, M: 0.8 };
/** The central black hole's marker: world size (ly) and on-screen bounds (px). */
const MAW_SIZE = 3, MAW_MIN_PX = 56, MAW_MAX_PX = 120;
const MAW_POS = new THREE.Vector3();

/** A star's map dot: main-sequence stars by class, other kinds by their own colour and scale. */
export function starDot(s: StarSystem): { color: string; size: number } {
  const kind = kindOf(s);
  const def = STAR_KINDS[kind];
  if (kind === 'main') return { color: SPECTRAL_COLORS[s.spectral], size: SPECTRAL_SIZE[s.spectral] };
  if (kind === 'giant') return { color: def.color ?? SPECTRAL_COLORS[s.spectral], size: SPECTRAL_SIZE[s.spectral] * def.scale };
  return { color: def.color ?? SPECTRAL_COLORS[s.spectral], size: SPECTRAL_SIZE.G * def.scale };
}

interface StarChunk {
  readonly points: THREE.Points;
  readonly stars: readonly StarSystem[];
  /** The lens version its colours were last worked out for. */
  sight: number;
}

/** An uncharted star (fog of war): grey and dim, a little smaller. */
const UNCHARTED = new THREE.Color('#5d6a85');
const UNCHARTED_DIM = 0.75;
const UNCHARTED_SIZE = 0.75;

/** Exact per-hex stars, generated lazily in chunks around the focus. */
export class NearStarLayer implements MapLayer {
  readonly object3d = new THREE.Group();
  private readonly material = createStarPointsMaterial({ worldSize: 0.7, minPx: 2.5, maxPx: 48 });
  private readonly cache: ChunkCache<StarChunk>;
  private readonly active = new Map<string, StarChunk>();
  private readonly labels: CSS2DObject[] = [];
  /** The supermassive black hole at the centre: a dark core in a warm, tilted ring (drawn instead of a dot). */
  private readonly maw: THREE.Sprite;
  /** Percent of a star's planets surveyed, or null before any are (shown after its name). */
  surveyed: ((star: StarSystem) => number | null) | null = null;
  /**
   * What the player sees (change admin-snapshots-and-fog): uncharted stars are grey, dim and
   * unnamed, hidden ones are not drawn. Null: every star as charted. Call `refreshSight` when it changes.
   */
  lens: (() => StarLens) | null = null;

  constructor(private readonly galaxy: GalaxyModel) {
    this.cache = new ChunkCache<StarChunk>(900, (c) => c.points.geometry.dispose());
    for (let i = 0; i < LABEL_COUNT; i++) {
      const el = document.createElement('div');
      el.className = 'star-label';
      const obj = new CSS2DObject(el);
      obj.visible = false;
      this.labels.push(obj);
      this.object3d.add(obj);
    }
    const centre = galaxy.starAt({ q: 0, r: 0 });
    this.maw = new THREE.Sprite(new THREE.SpriteMaterial({ map: centralBlackHoleTexture(), transparent: true, depthWrite: false, depthTest: false }));
    this.maw.position.set(centre?.position.x ?? 0, 0, centre?.position.z ?? 0);
    // Over the map's grid and haze (it lies in their plane).
    this.maw.renderOrder = 5;
    this.maw.visible = !!centre && kindOf(centre) === 'smbh';
    this.object3d.add(this.maw);
  }

  update(view: ViewState): void {
    const opacity = fade(view.visibleWidth, 260, 520) * fadeIn(view.visibleWidth, 2.5, 6);
    this.object3d.visible = opacity > 0.01;
    if (!this.object3d.visible) {
      this.labels.forEach((l) => (l.visible = false));
      return;
    }
    this.material.uniforms.uOpacity.value = opacity;
    this.material.uniforms.uScale.value = pointScale(view.camera, view.viewportHeight);
    this.updateMaw(view, opacity);

    const center = worldToHex(view.focus.x, view.focus.z);
    const radius = Math.min(view.visibleWidth * 0.8, 420);
    const c0q = Math.floor((center.q - radius) / CHUNK), c1q = Math.floor((center.q + radius) / CHUNK);
    const c0r = Math.floor((center.r - radius) / CHUNK), c1r = Math.floor((center.r + radius) / CHUNK);

    const wanted: Array<{ key: string; cq: number; cr: number; d: number }> = [];
    for (let cq = c0q; cq <= c1q; cq++) {
      for (let cr = c0r; cr <= c1r; cr++) {
        const dq = (cq + 0.5) * CHUNK - center.q, dr = (cr + 0.5) * CHUNK - center.r;
        wanted.push({ key: `${cq},${cr}`, cq, cr, d: Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr) });
      }
    }
    wanted.sort((a, b) => a.d - b.d);

    const keep = new Set<string>();
    let budget = BUDGET_PER_FRAME;
    for (const w of wanted) {
      let chunk = this.cache.get(w.key);
      if (!chunk) {
        if (budget-- <= 0) continue;
        chunk = this.buildChunk(w.cq, w.cr);
        this.cache.set(w.key, chunk);
      }
      keep.add(w.key);
      this.colourFor(chunk);
      if (!this.active.has(w.key)) {
        this.active.set(w.key, chunk);
        this.object3d.add(chunk.points);
      }
    }
    for (const [key, chunk] of this.active) {
      if (!keep.has(key)) {
        this.object3d.remove(chunk.points);
        this.active.delete(key);
      }
    }
    this.updateLabels(view);
  }

  private updateMaw(view: ViewState, opacity: number): void {
    // Hand over to the system view's black hole when zoomed right in.
    const a = opacity * fadeIn(view.visibleWidth, 8, 14);
    this.maw.material.opacity = a;
    if (a <= 0.01) return;
    // World size of a pixel at the marker's distance.
    this.maw.getWorldPosition(MAW_POS);
    const perPx = (2 * MAW_POS.distanceTo(view.camera.position) * Math.tan(THREE.MathUtils.degToRad(view.camera.fov) / 2)) / Math.max(1, view.viewportHeight);
    this.maw.scale.setScalar(Math.min(Math.max(MAW_SIZE, MAW_MIN_PX * perPx), MAW_MAX_PX * perPx));
  }

  /** What the player sees changed: recolour the stars (drawn chunks now, the rest when next drawn). */
  refreshSight(): void {
    for (const chunk of this.active.values()) this.colourFor(chunk);
  }

  private sightOf(s: StarSystem): Sight {
    return this.lens?.().sight(s) ?? 'explored';
  }

  /** Colour and size each star of a chunk for how the player sees it (unchanged when already done). */
  private colourFor(chunk: StarChunk): void {
    const version = this.lens?.().version ?? 0;
    if (chunk.sight === version) return;
    chunk.sight = version;
    const geo = chunk.points.geometry;
    const col = geo.getAttribute('color') as THREE.BufferAttribute, size = geo.getAttribute('size') as THREE.BufferAttribute;
    const c = new THREE.Color();
    chunk.stars.forEach((s, i) => {
      const dot = starDot(s);
      const sight = this.sightOf(s);
      // The central black hole has its own marker (see updateMaw): no dot.
      c.set(kindOf(s) === 'smbh' ? '#000000' : dot.color);
      let n = dot.size;
      if (sight === 'fogged') {
        c.lerp(UNCHARTED, 0.7).multiplyScalar(UNCHARTED_DIM);
        n *= UNCHARTED_SIZE;
      }
      if (sight === 'hidden') n = 0;
      col.setXYZ(i, c.r, c.g, c.b);
      size.setX(i, n);
    });
    col.needsUpdate = true;
    size.needsUpdate = true;
  }

  /** Stars currently generated near the focus (for labels / UI lists). */
  activeStars(): StarSystem[] {
    return [...this.active.values()].flatMap((c) => c.stars);
  }

  private updateLabels(view: ViewState): void {
    const show = view.visibleWidth < 90 && view.visibleWidth > 6;
    const maxD = view.visibleWidth * 0.6;
    const near = show
      ? this.activeStars()
          .map((s) => ({ s, d: Math.hypot(s.position.x - view.focus.x, s.position.z - view.focus.z) }))
          // Only charted stars are named (explored or sighted); the black hole always is.
          .filter((e) => e.d < maxD && (kindOf(e.s) === 'smbh' || this.named(e.s)))
          .sort((a, b) => a.d - b.d)
          .slice(0, LABEL_COUNT)
      : [];
    this.labels.forEach((label, i) => {
      const e = near[i];
      label.visible = !!e;
      if (!e) return;
      // The central black hole's name sits under its marker.
      label.position.set(e.s.position.x, 0, e.s.position.z + (kindOf(e.s) === 'smbh' ? this.maw.scale.x * 0.32 : 0));
      const pct = this.surveyed?.(e.s) ?? null;
      const text = pct === null ? e.s.name : `${e.s.name} · ${pct}%`;
      if (label.element.textContent !== text) label.element.textContent = text;
    });
  }

  private named(s: StarSystem): boolean {
    const sight = this.sightOf(s);
    return sight === 'explored' || sight === 'sighted';
  }

  private buildChunk(cq: number, cr: number): StarChunk {
    const stars: StarSystem[] = [];
    for (let q = cq * CHUNK; q < (cq + 1) * CHUNK; q++) {
      for (let r = cr * CHUNK; r < (cr + 1) * CHUNK; r++) {
        const s = this.galaxy.starAt({ q, r });
        if (s) stars.push(s);
      }
    }
    const pos = new Float32Array(stars.length * 3);
    const col = new Float32Array(stars.length * 3);
    const size = new Float32Array(stars.length);
    const c = new THREE.Color();
    stars.forEach((s, i) => {
      pos.set([s.position.x, 0, s.position.z], i * 3);
      const dot = starDot(s);
      // The central black hole has its own marker (see updateMaw): no dot.
      c.set(kindOf(s) === 'smbh' ? '#000000' : dot.color);
      col.set([c.r, c.g, c.b], i * 3);
      size[i] = dot.size;
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('size', new THREE.BufferAttribute(size, 1));
    geo.computeBoundingSphere();
    const points = new THREE.Points(geo, this.material);
    points.renderOrder = -5;
    return { points, stars, sight: -1 };
  }

  dispose(): void {
    this.cache.clear();
    this.material.dispose();
    this.maw.material.dispose();
  }
}
