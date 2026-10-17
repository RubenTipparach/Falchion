import * as THREE from 'three';
import { GalaxyModel } from '../../core/galaxy/GalaxyModel';
import { Rng, hashSeed } from '../../core/rng/Rng';
import { ChunkCache } from './ChunkCache';
import type { MapLayer, ViewState } from './MapLayer';
import { createStarPointsMaterial, pointScale } from './StarPointsMaterial';
import { fade, fadeIn } from './ZoomModel';

const CHUNK_LY = 2_000;
const CANDIDATES = 3_000;
const BUDGET_PER_FRAME = 8;
const PALETTE = ['#9bb0ff', '#cad7ff', '#fff4ea', '#ffd2a1', '#ffad6b', '#ffad6b'];

/**
 * Sector-scale stars: a representative sample per 2,000 ly chunk following the
 * density field. Bridges the exact per-hex stars and the far galaxy cloud.
 */
export class MidStarLayer implements MapLayer {
  readonly object3d = new THREE.Group();
  private readonly material = createStarPointsMaterial({ worldSize: 9, minPx: 1.6, maxPx: 5 });
  private readonly cache: ChunkCache<THREE.Points>;
  private readonly active = new Map<string, THREE.Points>();

  constructor(private readonly galaxy: GalaxyModel) {
    this.cache = new ChunkCache<THREE.Points>(400, (p) => p.geometry.dispose());
  }

  update(view: ViewState): void {
    const opacity = fadeIn(view.visibleWidth, 200, 520) * fade(view.visibleWidth, 14_000, 30_000);
    this.object3d.visible = opacity > 0.01;
    if (!this.object3d.visible) return;
    this.material.uniforms.uOpacity.value = opacity;
    this.material.uniforms.uScale.value = pointScale(view.camera, view.viewportHeight);

    const radius = Math.min(view.visibleWidth * 1.1, 26_000);
    const cx0 = Math.floor((view.focus.x - radius) / CHUNK_LY), cx1 = Math.floor((view.focus.x + radius) / CHUNK_LY);
    const cz0 = Math.floor((view.focus.z - radius) / CHUNK_LY), cz1 = Math.floor((view.focus.z + radius) / CHUNK_LY);
    const keep = new Set<string>();
    let budget = BUDGET_PER_FRAME;
    for (let cx = cx0; cx <= cx1; cx++) {
      for (let cz = cz0; cz <= cz1; cz++) {
        const key = `${cx},${cz}`;
        let pts = this.cache.get(key);
        if (!pts) {
          if (budget-- <= 0) continue;
          pts = this.buildChunk(cx, cz);
          this.cache.set(key, pts);
        }
        keep.add(key);
        if (!this.active.has(key)) {
          this.active.set(key, pts);
          this.object3d.add(pts);
        }
      }
    }
    for (const [key, pts] of this.active) {
      if (!keep.has(key)) {
        this.object3d.remove(pts);
        this.active.delete(key);
      }
    }
  }

  private buildChunk(cx: number, cz: number): THREE.Points {
    const rng = new Rng(hashSeed(this.galaxy.params.seed, 'mid', cx, cz));
    const pos: number[] = [], col: number[] = [], size: number[] = [];
    const c = new THREE.Color();
    for (let i = 0; i < CANDIDATES; i++) {
      const x = (cx + rng.next()) * CHUNK_LY;
      const z = (cz + rng.next()) * CHUNK_LY;
      const d = this.galaxy.density(x, z);
      // sqrt keeps sparse outer arms readable at sector scale.
      if (rng.next() > Math.sqrt(d)) continue;
      pos.push(x, 0, z);
      c.set(rng.pick(PALETTE));
      col.push(c.r, c.g, c.b);
      size.push(0.6 + rng.next() * 1.2);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.setAttribute('size', new THREE.Float32BufferAttribute(size, 1));
    geo.computeBoundingSphere();
    const p = new THREE.Points(geo, this.material);
    p.renderOrder = -6;
    return p;
  }

  dispose(): void {
    this.cache.clear();
    this.material.dispose();
  }
}
