import * as THREE from 'three';
import type { GalaxyParams } from '../../core/galaxy/GalaxyModel';
import type { MapLayer, ViewState } from './MapLayer';
import { fadeIn } from './ZoomModel';

/**
 * The galaxy as one continuous shader: the same logarithmic-spiral density the
 * star generator uses, with turbulence, dark dust lanes trailing each arm,
 * pink star-forming knots along the arms, and arms that dissolve into a warm
 * oval core (see coreShape in GalaxyModel) instead of winding into the centre.
 */
export class GalaxyDiscLayer implements MapLayer {
  readonly object3d: THREE.Mesh;
  private readonly material: THREE.ShaderMaterial;

  constructor(p: GalaxyParams) {
    this.material = new THREE.ShaderMaterial({
      transparent: false, // additive background, drawn in the opaque pass before planets
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uOpacity: { value: 1 }, uTime: { value: 0 },
        uRadius: { value: p.radius }, uArms: { value: p.arms }, uPitch: { value: p.pitch }, uBulge: { value: p.bulgeRadius },
        uSeed: { value: (p.seed % 997) * 0.37 }, uOrigin: { value: new THREE.Vector2() },
        // Long axis of the oval core: where the arms reach it (matches coreShape).
        uAxis: { value: Math.log((p.bulgeRadius * 1.15) / 1500) / Math.tan(p.pitch) },
      },
      vertexShader: /* glsl */ `
        varying vec2 vWorld;
        void main() { vec4 w = modelMatrix * vec4(position, 1.0); vWorld = w.xz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: /* glsl */ `
        uniform vec2 uOrigin; uniform float uOpacity; uniform float uTime; uniform float uRadius; uniform float uArms; uniform float uPitch; uniform float uBulge; uniform float uSeed; uniform float uAxis;
        varying vec2 vWorld;
        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7)) + uSeed) * 43758.5453); }
        float noise(vec2 p) { vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y); }
        float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 6; i++) { v += a * noise(p); p = p * 2.07 + 13.1; a *= 0.5; } return v; }

        void main() {
          vec2 p = vWorld + uOrigin;
          float r = length(p);
          if (r > uRadius * 1.15) discard;
          float drift = uTime * 0.0004;
          // Turbulence bends the arms so they read as gas, not geometry.
          float warp = (fbm(p / 5200.0 + drift) - 0.5) * 0.9 + (fbm(p / 1400.0 - drift) - 0.5) * 0.25;
          float theta = atan(p.y, p.x) + warp;
          float phase = uArms * (theta - log(max(r, 1.0) / 1500.0) / tan(uPitch));
          // Arms lose their contrast toward the core and merge into its glow.
          float armFade = smoothstep(uBulge * 0.55, uBulge * 1.6, r);
          float arm = mix(0.45, pow(0.5 + 0.5 * cos(phase), 1.5), armFade);
          float armCore = pow(0.5 + 0.5 * cos(phase), 5.0) * armFade;
          // Dust lanes trail the inner (leading) edge of each arm and thin out into the core.
          float lane = pow(0.5 + 0.5 * cos(phase + 0.85), 10.0) * mix(0.35, 1.0, armFade);

          float disk = exp(-r / 13000.0);
          // Oval core: long axis on the arms' roots, a round nucleus inside, blending to the plain bulge outside.
          vec2 ax = vec2(cos(uAxis), sin(uAxis));
          float cu = dot(p, ax) / (uBulge * 1.15), cv = dot(p, vec2(-ax.y, ax.x)) / (uBulge * 0.72);
          float oval = exp(-cu * cu - cv * cv) * 1.05 + exp(-pow(r / (uBulge * 0.45), 2.0)) * 0.4;
          float bulge = mix(exp(-pow(r / uBulge, 2.0)), oval, 1.0 - smoothstep(uBulge * 1.8, uBulge * 2.5, r));
          float halo = exp(-r / 5200.0);
          float edge = 1.0 - smoothstep(uRadius * 0.72, uRadius * 1.1, r);

          float detail = fbm(p / 900.0 + 3.0);
          float wisps = fbm(p / 300.0 - 7.0);
          float knots = smoothstep(0.58, 0.82, fbm(p / 420.0 + 21.0)) * armCore;

          vec3 bulgeCol = vec3(1.0, 0.82, 0.55);
          vec3 armCol = mix(vec3(0.38, 0.58, 1.0), vec3(0.78, 0.86, 1.0), detail);
          vec3 interArm = vec3(0.28, 0.34, 0.55);
          vec3 hii = vec3(1.0, 0.36, 0.62);
          vec3 teal = vec3(0.30, 0.85, 0.85);

          vec3 col = bulgeCol * (bulge * 0.95 + halo * 0.3);
          col += armCol * disk * arm * (0.8 + 1.2 * detail) * (0.7 + 0.6 * wisps);
          col += interArm * disk * 0.18 * (0.5 + wisps);
          col += hii * knots * disk * 3.2;
          col += teal * smoothstep(0.66, 0.9, wisps) * arm * disk * 0.6;
          col *= 1.0 - lane * (0.75 * smoothstep(0.35, 0.65, detail) + 0.15) * (1.0 - 0.6 * min(bulge, 1.0));
          col *= edge;
          col = 1.0 - exp(-col * 1.6); // filmic-ish tone map keeps the core golden
          float lum = max(col.r, max(col.g, col.b));
          gl_FragColor = vec4(col * uOpacity * 0.85, clamp(lum, 0.0, 1.0) * uOpacity);
        }`,
    });
    const size = p.radius * 2.4;
    this.object3d = new THREE.Mesh(new THREE.PlaneGeometry(size, size).rotateX(-Math.PI / 2), this.material);
    this.object3d.position.y = -1;
    this.object3d.renderOrder = -8;
    this.object3d.frustumCulled = false;
  }

  update(view: ViewState): void {
    const opacity = fadeIn(view.visibleWidth, 2_500, 14_000);
    this.object3d.visible = opacity > 0.01;
    this.material.uniforms.uOpacity.value = opacity;
    this.material.uniforms.uTime.value = view.time;
    this.material.uniforms.uOrigin.value.set(view.origin.x, view.origin.z);
  }

  dispose(): void {
    this.object3d.geometry.dispose();
    this.material.dispose();
  }
}
