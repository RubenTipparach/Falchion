import * as THREE from 'three';
import { fade, fadeIn } from './ZoomModel';
import { worldToHex } from '../../core/hex/Hex';
import type { MapLayer, ViewState } from './MapLayer';

/**
 * Infinite hex grid drawn procedurally in a fragment shader on one quad that
 * follows the camera: zero per-hex geometry, so it works at any galaxy size.
 */
export class HexGridLayer implements MapLayer {
  readonly object3d: THREE.Mesh;
  private readonly material: THREE.ShaderMaterial;

  constructor(galaxyRadius: number) {
    this.material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: {
        uOpacity: { value: 1 },
        uHover: { value: new THREE.Vector2(1e9, 1e9) },
        uSelected: { value: new THREE.Vector2(1e9, 1e9) },
        uHome: { value: new THREE.Vector2(1e9, 1e9) },
        uFocus: { value: new THREE.Vector2() },
        uFadeRadius: { value: 100 },
        uGalaxyRadius: { value: galaxyRadius },
        uOrigin: { value: new THREE.Vector2() },
        uOriginHex: { value: new THREE.Vector2() },
        uColor: { value: new THREE.Color('#2f7d93') },
      },
      vertexShader: /* glsl */ `
        varying vec2 vWorld;
        void main() {
          vec4 w = modelMatrix * vec4(position, 1.0);
          vWorld = w.xz;
          gl_Position = projectionMatrix * viewMatrix * w;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uOpacity; uniform vec2 uHover; uniform vec2 uSelected; uniform vec2 uHome;
        uniform vec2 uFocus; uniform float uFadeRadius; uniform float uGalaxyRadius; uniform vec3 uColor; uniform vec2 uOrigin; uniform vec2 uOriginHex;
        varying vec2 vWorld;
        const float S = 0.57735026919; // hex size: centre spacing = 1 ly
        vec2 hexRound(vec2 qr) {
          vec3 c = vec3(qr.x, qr.y, -qr.x - qr.y);
          vec3 r = floor(c + 0.5);
          vec3 d = abs(r - c);
          if (d.x > d.y && d.x > d.z) r.x = -r.y - r.z; else if (d.y > d.z) r.y = -r.x - r.z;
          return r.xy;
        }
        vec2 hexCenter(vec2 h) { return vec2(S * 1.5 * h.x, S * 1.7320508 * (h.y + h.x * 0.5)); }
        void main() {
          vec2 p = vWorld;
          vec2 qr = vec2((2.0/3.0) * p.x / S, (-p.x / 3.0 + 0.57735026919 * p.y) / S);
          vec2 h = hexRound(qr);
          vec2 ha = h + uOriginHex; // absolute axial coords
          vec2 local = p - hexCenter(h);
          float sdf = max(abs(local.y), abs(local.x) * 0.8660254 + abs(local.y) * 0.5);
          float edge = 0.5 - sdf;
          float w = fwidth(edge);
          float line = 1.0 - smoothstep(0.0, w * 1.5, edge);
          float dist = length(vWorld - uFocus);
          float radial = 1.0 - smoothstep(uFadeRadius * 0.55, uFadeRadius, dist);
          float inGalaxy = 1.0 - step(uGalaxyRadius, length(vWorld + uOrigin));
          vec3 col = uColor;
          float fill = 0.0;
          if (ha == uHover) { col = vec3(0.50, 0.83, 0.90); fill = 0.10; }
          if (ha == uSelected) { col = vec3(0.90, 0.71, 0.31); fill = 0.18; }
          if (ha == uHome) { col = vec3(0.95, 0.78, 0.40); fill = 0.16; }
          float a = (line * 0.55 + fill) * radial * uOpacity * inGalaxy;
          if (a < 0.003) discard;
          gl_FragColor = vec4(col, a);
        }`,
      extensions: { derivatives: true } as never,
    });
    const geo = new THREE.PlaneGeometry(1, 1);
    geo.rotateX(-Math.PI / 2);
    this.object3d = new THREE.Mesh(geo, this.material);
    this.object3d.renderOrder = 1;
    this.object3d.frustumCulled = false;
  }

  setHover(q: number, r: number): void { this.material.uniforms.uHover.value.set(q, r); }
  setSelected(q: number, r: number): void { this.material.uniforms.uSelected.value.set(q, r); }
  setHome(q: number, r: number): void { this.material.uniforms.uHome.value.set(q, r); }

  update(view: ViewState): void {
    const opacity = fade(view.visibleWidth, 120, 420) * fadeIn(view.visibleWidth, 2.5, 6);
    this.object3d.visible = opacity > 0.01;
    if (!this.object3d.visible) return;
    const size = view.visibleWidth * 4;
    this.object3d.position.set(view.focus.x, 0, view.focus.z);
    this.object3d.scale.set(size, 1, size);
    const u = this.material.uniforms;
    u.uOpacity.value = opacity;
    u.uFocus.value.set(view.focus.x - view.origin.x, view.focus.z - view.origin.z);
    u.uOrigin.value.set(view.origin.x, view.origin.z);
    const oh = worldToHex(view.origin.x, view.origin.z);
    u.uOriginHex.value.set(oh.q, oh.r);
    u.uFadeRadius.value = view.visibleWidth * 1.4;
  }

  dispose(): void {
    this.object3d.geometry.dispose();
    this.material.dispose();
  }
}
