import * as THREE from 'three';

/** Soft round star sprites with a minimum on-screen size so stars never vanish. */
export function createStarPointsMaterial(opts: { worldSize: number; minPx: number; maxPx: number }): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    // Additive glow drawn in the opaque pass ahead of planets (negative renderOrder), so planets occlude it.
    transparent: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uOpacity: { value: 1 },
      uScale: { value: 800 },
      uWorldSize: { value: opts.worldSize },
      uMinPx: { value: opts.minPx },
      uMaxPx: { value: opts.maxPx },
    },
    vertexShader: /* glsl */ `
      attribute vec3 color; attribute float size;
      uniform float uScale; uniform float uWorldSize; uniform float uMinPx; uniform float uMaxPx;
      varying vec3 vColor; varying float vBoost;
      void main() {
        // Size 0: not drawn (a star hidden from the player, change admin-snapshots-and-fog).
        if (size <= 0.0) { gl_PointSize = 0.0; gl_Position = vec4(2.0, 2.0, 2.0, 1.0); vColor = vec3(0.0); vBoost = 0.0; return; }
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        float px = uWorldSize * size * uScale / -mv.z;
        vBoost = clamp(px / uMinPx, 0.25, 1.0);
        gl_PointSize = clamp(px, uMinPx, uMaxPx);
        vColor = color;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uOpacity; varying vec3 vColor; varying float vBoost;
      void main() {
        vec2 c = gl_PointCoord - 0.5;
        float d = length(c) * 2.0;
        float core = smoothstep(0.35, 0.0, d);
        float glow = pow(max(0.0, 1.0 - d), 2.2) * 0.6;
        float a = (core + glow) * uOpacity * vBoost;
        if (a < 0.01) discard;
        gl_FragColor = vec4(vColor * (0.6 + core), a);
      }`,
  });
}

/** Pixels-per-world-unit scale for a perspective camera at unit distance. */
export function pointScale(camera: THREE.PerspectiveCamera, viewportHeight: number): number {
  return viewportHeight / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
}
