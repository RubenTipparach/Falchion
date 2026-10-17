import * as THREE from 'three';
import { Rng } from '../../core/rng/Rng';
import type { MapLayer, ViewState } from './MapLayer';

/** Distant twinkling background stars on a sphere that travels with the camera. */
export class StarfieldLayer implements MapLayer {
  readonly object3d: THREE.Points;
  private readonly material: THREE.ShaderMaterial;

  constructor(seed: number, count = 6_000) {
    const rng = new Rng(seed);
    const pos = new Float32Array(count * 3), col = new Float32Array(count * 3), rnd = new Float32Array(count);
    const c = new THREE.Color();
    const tints = ['#ffffff', '#cfe0ff', '#fff1d6', '#ffd2a1', '#a9c8ff'];
    for (let i = 0; i < count; i++) {
      const u = rng.range(-1, 1), th = rng.range(0, Math.PI * 2), r = Math.sqrt(1 - u * u);
      pos.set([r * Math.cos(th), u, r * Math.sin(th)], i * 3);
      c.set(rng.pick(tints));
      col.set([c.r, c.g, c.b], i * 3);
      rnd[i] = rng.next();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('rnd', new THREE.BufferAttribute(rnd, 1));
    this.material = new THREE.ShaderMaterial({
      transparent: false, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 }, uScale: { value: 1 } },
      vertexShader: /* glsl */ `
        attribute vec3 color; attribute float rnd; uniform float uTime; varying vec3 vColor; varying float vA;
        void main() {
          vColor = color;
          vA = (0.25 + 0.75 * rnd * rnd) * (0.65 + 0.35 * sin(uTime * (0.6 + rnd * 2.5) + rnd * 40.0));
          gl_PointSize = 0.8 + rnd * rnd * 2.4;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        varying vec3 vColor; varying float vA;
        void main() { float d = length(gl_PointCoord - 0.5) * 2.0; float a = smoothstep(1.0, 0.0, d) * vA; gl_FragColor = vec4(vColor * a, a); }`,
    });
    this.object3d = new THREE.Points(geo, this.material);
    this.object3d.renderOrder = -10;
    this.object3d.frustumCulled = false;
  }

  update(view: ViewState): void {
    this.object3d.position.set(view.camera.position.x + view.origin.x, view.camera.position.y, view.camera.position.z + view.origin.z);
    this.object3d.scale.setScalar(view.camera.far * 0.9);
    this.material.uniforms.uTime.value = view.time;
  }

  dispose(): void {
    this.object3d.geometry.dispose();
    this.material.dispose();
  }
}
