import * as THREE from 'three';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { worldToHex } from '../../core/hex/Hex';
import { GalaxyModel, SPECTRAL_COLORS, SpectralClass, StarSystem } from '../../core/galaxy/GalaxyModel';
import { ChunkCache } from './ChunkCache';
import type { MapLayer, ViewState } from './MapLayer';
import { createStarPointsMaterial, pointScale } from './StarPointsMaterial';
import { fade, fadeIn } from './ZoomModel';

const CHUNK = 64;
const BUDGET_PER_FRAME = 6;
const LABEL_COUNT = 28;

const SPECTRAL_SIZE: Record<SpectralClass, number> = { O: 2.2, B: 1.8, A: 1.4, F: 1.2, G: 1.1, K: 1.0, M: 0.8 };

interface StarChunk {
  readonly points: THREE.Points;
  readonly stars: readonly StarSystem[];
}

/** Exact per-hex stars, generated lazily in chunks around the focus. */
export class NearStarLayer implements MapLayer {
  readonly object3d = new THREE.Group();
  private readonly material = createStarPointsMaterial({ worldSize: 0.7, minPx: 2.5, maxPx: 48 });
  private readonly cache: ChunkCache<StarChunk>;
  private readonly active = new Map<string, StarChunk>();
  private readonly labels: CSS2DObject[] = [];

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
          .filter((e) => e.d < maxD)
          .sort((a, b) => a.d - b.d)
          .slice(0, LABEL_COUNT)
      : [];
    this.labels.forEach((label, i) => {
      const e = near[i];
      label.visible = !!e;
      if (!e) return;
      label.position.set(e.s.position.x, 0, e.s.position.z);
      label.element.textContent = e.s.name;
    });
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
      c.set(SPECTRAL_COLORS[s.spectral]);
      col.set([c.r, c.g, c.b], i * 3);
      size[i] = SPECTRAL_SIZE[s.spectral];
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('size', new THREE.BufferAttribute(size, 1));
    geo.computeBoundingSphere();
    const points = new THREE.Points(geo, this.material);
    points.renderOrder = -5;
    return { points, stars };
  }

  dispose(): void {
    this.cache.clear();
    this.material.dispose();
  }
}
