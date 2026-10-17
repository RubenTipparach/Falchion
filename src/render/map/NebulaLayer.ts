import * as THREE from 'three';
import type { MapLayer, ViewState } from './MapLayer';
import { fade } from './ZoomModel';

/**
 * Drifting, multi-hued nebula on the galactic plane, drawn as a full-screen pass:
 * each pixel casts a ray from the camera and samples the plane where it lands, so
 * there is no finite plane to clip at the horizon. Rays that run toward the
 * horizon fade out into the starfield. Two noise scales (~220 ly and ~3,200 ly)
 * blend with zoom, and the clouds drift very slowly.
 *
 * Inside a star system the nebula becomes a sky that surrounds the camera: each
 * pixel samples the clouds by view direction (triplanar, so there are no seams),
 * centred on the system's place in the galaxy. Looking straight down matches the
 * plane, so zooming in blends from one to the other without a jump.
 */
export class NebulaLayer implements MapLayer {
  readonly object3d: THREE.Mesh;
  private readonly material: THREE.ShaderMaterial;

  constructor(seed: number) {
    this.material = new THREE.ShaderMaterial({
      transparent: false, // additive background, drawn in the opaque pass before planets
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uOpacity: { value: 1 }, uSeed: { value: (seed % 1000) / 10 }, uTime: { value: 0 }, uRegional: { value: 0 },
        uInvProj: { value: new THREE.Matrix4() }, uCamWorld: { value: new THREE.Matrix4() }, uCamPos: { value: new THREE.Vector3() },
        uOrigin: { value: new THREE.Vector2() }, uAlt: { value: 1 }, uSky: { value: 0 },
      },
      vertexShader: /* glsl */ `
        varying vec2 vNdc;
        void main() { vNdc = position.xy; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform float uOpacity; uniform float uSeed; uniform float uTime; uniform float uRegional;
        uniform mat4 uInvProj; uniform mat4 uCamWorld; uniform vec3 uCamPos; uniform vec2 uOrigin; uniform float uAlt; uniform float uSky;
        varying vec2 vNdc;
        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7)) + uSeed) * 43758.5453); }
        float noise(vec2 p) { vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y); }
        float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 6; i++) { v += a * noise(p); p = p * 2.03 + 17.0; a *= 0.5; } return v; }
        vec4 cloud(vec2 p, float t) {
          vec2 q = vec2(fbm(p + vec2(0.0, t)), fbm(p + vec2(5.2, 1.3) - t));
          vec2 r = vec2(fbm(p + 3.0 * q + vec2(1.7, 9.2) + 0.5 * t), fbm(p + 3.0 * q + vec2(8.3, 2.8) - 0.4 * t));
          float n = fbm(p + 3.5 * r);
          vec3 teal = vec3(0.06, 0.45, 0.55), blue = vec3(0.12, 0.22, 0.75), violet = vec3(0.45, 0.16, 0.70), rose = vec3(0.85, 0.20, 0.42), amber = vec3(0.95, 0.55, 0.20);
          vec3 col = mix(blue, teal, smoothstep(0.2, 0.8, q.x));
          col = mix(col, violet, smoothstep(0.35, 0.85, r.y));
          col = mix(col, rose, smoothstep(0.55, 0.95, n * r.x * 1.8));
          col = mix(col, amber, smoothstep(0.78, 1.0, n * q.y * 2.0) * 0.6);
          float dens = smoothstep(0.30, 0.85, n);
          float dust = smoothstep(0.55, 0.75, fbm(p * 2.7 + 40.0)) * 0.55;
          return vec4(col, dens * (1.0 - dust));
        }
        // Clouds around the camera by view direction: three planar samples blended by facing.
        vec4 skyCloud(vec3 d, vec2 base, float t) {
          vec3 w = pow(abs(d), vec3(4.0)); w /= (w.x + w.y + w.z);
          vec4 cx = cloud(base + d.zy * 1.6 + 5.0, t);
          vec4 cy = cloud(base + d.xz * 1.6, t);
          vec4 cz = cloud(base + d.xy * 1.6 + 9.0, t);
          return cx * w.x + cy * w.y + cz * w.z;
        }
        void main() {
          vec4 v = uInvProj * vec4(vNdc, 1.0, 1.0);
          v /= v.w;
          vec3 dir = normalize((uCamWorld * vec4(v.xyz, 0.0)).xyz);
          float tt = uTime * 0.0012; // very slow drift
          vec3 rgbP = vec3(0.0); float alphaP = 0.0;
          if (uSky < 0.999 && dir.y < -1e-4) {
            float t = -uCamPos.y / dir.y;
            vec2 hit = uCamPos.xz + dir.xz * t + uOrigin;   // absolute galaxy coords
            float horizon = smoothstep(0.0, 0.12, -dir.y) * (1.0 - smoothstep(uAlt * 30.0, uAlt * 90.0, t));
            vec4 a = cloud(hit / 220.0, tt);
            vec4 b = cloud(hit / 3200.0 + 11.0, tt * 0.5);
            vec4 c = mix(a, b, uRegional);
            // Faint ambient haze so the sky is never empty between clouds.
            float hazeN = fbm(hit / 1800.0 + 3.0);
            vec3 haze = mix(vec3(0.10, 0.16, 0.42), vec3(0.32, 0.12, 0.40), hazeN);
            alphaP = (c.a * mix(0.85, 0.42, uRegional) + 0.16 * smoothstep(0.25, 0.75, hazeN)) * horizon;
            rgbP = mix(haze, c.rgb, clamp(c.a * 1.6, 0.0, 1.0));
          }
          vec3 rgbS = vec3(0.0); float alphaS = 0.0;
          if (uSky > 0.001) {
            vec2 here = uCamPos.xz + uOrigin;               // the system's place in the galaxy
            vec4 s = skyCloud(dir, here / 220.0, tt);
            float hazeN = fbm(here / 1800.0 + 3.0 + dir.xz * 0.8 + dir.y * 1.3);
            vec3 haze = mix(vec3(0.10, 0.16, 0.42), vec3(0.32, 0.12, 0.40), hazeN);
            alphaS = s.a * 0.7 + 0.18 * smoothstep(0.2, 0.8, hazeN);
            rgbS = mix(haze, s.rgb, clamp(s.a * 1.6, 0.0, 1.0));
          }
          float alpha = mix(alphaP, alphaS, uSky) * uOpacity;
          vec3 rgb = mix(rgbP, rgbS, uSky);
          if (alpha < 0.002) discard;
          gl_FragColor = vec4(rgb * alpha * 1.3, alpha);
        }`,
    });
    this.object3d = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
    this.object3d.renderOrder = -9;
    this.object3d.frustumCulled = false;
  }

  update(view: ViewState): void {
    const opacity = fade(view.visibleWidth, 9_000, 30_000);
    this.object3d.visible = opacity > 0.01;
    if (!this.object3d.visible) return;
    const u = this.material.uniforms;
    const cam = view.camera;
    u.uOpacity.value = opacity;
    u.uTime.value = view.time;
    u.uInvProj.value.copy(cam.projectionMatrixInverse);
    u.uCamWorld.value.copy(cam.matrixWorld);
    u.uCamPos.value.copy(cam.position);
    u.uOrigin.value.set(view.origin.x, view.origin.z);
    u.uAlt.value = view.altitude;
    // Inside a star system the nebula surrounds the camera instead of lying on the plane.
    u.uSky.value = fade(view.visibleWidth, 2, 12);
    // Blend from local to regional clouds between 300 and 2,500 ly of view.
    const t = Math.min(1, Math.max(0, (Math.log(view.visibleWidth) - Math.log(300)) / (Math.log(2500) - Math.log(300))));
    u.uRegional.value = t * t * (3 - 2 * t);
  }

  dispose(): void {
    this.object3d.geometry.dispose();
    this.material.dispose();
  }
}
