import * as THREE from 'three';
import { GalaxyModel } from '../../core/galaxy/GalaxyModel';
import { Rng, hashSeed } from '../../core/rng/Rng';
import type { MapLayer, ViewState } from './MapLayer';
import { createStarPointsMaterial, pointScale } from './StarPointsMaterial';
import { fadeIn } from './ZoomModel';

/** Resolved stars across the whole galaxy (~200k sampled points) for the far view. */
export class GalaxyCloudLayer implements MapLayer {
  readonly object3d = new THREE.Group();
  private readonly material = createStarPointsMaterial({ worldSize: 70, minPx: 1, maxPx: 7 });

  constructor(galaxy: GalaxyModel, count = 200_000) {
    const rng = new Rng(hashSeed(galaxy.params.seed, 'cloud'));
    const samples = galaxy.sampleDensity(count, rng);
    const pos = new Float32Array(samples.length * 3);
    const col = new Float32Array(samples.length * 3);
    const size = new Float32Array(samples.length);
    const core = new THREE.Color('#ffd9a0'), arm = new THREE.Color('#a9c8ff'), hii = new THREE.Color('#ff7aa8');
    const c = new THREE.Color();
    const R = galaxy.params.radius, B = galaxy.params.bulgeRadius;
    samples.forEach((s, i) => {
      pos.set([s.x, 0, s.z], i * 3);
      const r = Math.hypot(s.x, s.z);
      const t = Math.min(1, r / (R * 0.35));
      c.copy(core).lerp(arm, t);
      if (t > 0.5 && s.d > 0.35 && rng.next() < 0.04) c.copy(hii);
      // So many stars crowd the core that full-bright points add up to flat white: dim and
      // shrink them there, letting the disc shader's golden glow carry the core.
      const crowd = 0.3 + 0.7 * smoothstep(B * 0.5, B * 2.2, r);
      c.multiplyScalar(crowd);
      col.set([c.r, c.g, c.b], i * 3);
      size[i] = (0.5 + rng.next() * (0.6 + s.d)) * (0.55 + 0.45 * crowd);
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('size', new THREE.BufferAttribute(size, 1));
    const points = new THREE.Points(geo, this.material);
    points.frustumCulled = false;
    points.renderOrder = -7;

    this.object3d.add(points);
  }

  update(view: ViewState): void {
    const opacity = fadeIn(view.visibleWidth, 5_000, 22_000);
    this.object3d.visible = opacity > 0.01;
    this.material.uniforms.uOpacity.value = opacity * 0.7;
    this.material.uniforms.uScale.value = pointScale(view.camera, view.viewportHeight);
  }

  dispose(): void {
    this.object3d.traverse((o) => {
      if (o instanceof THREE.Mesh || o instanceof THREE.Points) o.geometry.dispose();
    });
    this.material.dispose();
  }
}

function smoothstep(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}
