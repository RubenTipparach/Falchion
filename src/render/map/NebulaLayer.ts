import * as THREE from 'three';
import type { MapLayer, ViewState } from './MapLayer';
import { DRIFT_RATE, NEBULA_GLSL, nebulaDetail, nebulaSeed } from './nebulaField';
import { SKY_FULL, SKY_ZERO } from './NebulaSkyboxLayer';
import { fade, fadeIn } from './ZoomModel';

/**
 * Drifting, multi-hued nebula on the galactic plane, drawn as a full-screen pass:
 * each pixel casts a ray from the camera and samples the plane where it lands, so
 * there is no finite plane to clip at the horizon. Rays that run toward the
 * horizon fade out into the starfield. Large clouds mask and colour fine, slowly drifting
 * clouds (see `nebulaField`, which the CPU samples too).
 *
 * Inside a star system the plane fades out: NebulaSkyboxLayer surrounds the
 * camera with this field's colours instead.
 */
export class NebulaLayer implements MapLayer {
  readonly object3d: THREE.Mesh;
  private readonly material: THREE.ShaderMaterial;

  /** `lite` (phones): fewer noise octaves; see LowResBackground for the rest. */
  constructor(seed: number, lite = false) {
    this.material = new THREE.ShaderMaterial({
      defines: lite ? { NEB_OCTAVES: 4 } : {},
      transparent: false, // additive background, drawn in the opaque pass before planets
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uOpacity: { value: 1 }, uSeed: { value: nebulaSeed(seed) }, uTime: { value: 0 }, uDetail: { value: 1 },
        uInvProj: { value: new THREE.Matrix4() }, uCamWorld: { value: new THREE.Matrix4() }, uCamPos: { value: new THREE.Vector3() },
        uOrigin: { value: new THREE.Vector2() }, uAlt: { value: 1 },
      },
      vertexShader: /* glsl */ `
        varying vec2 vNdc;
        void main() { vNdc = position.xy; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform float uOpacity; uniform float uSeed; uniform float uTime; uniform float uDetail;
        uniform mat4 uInvProj; uniform mat4 uCamWorld; uniform vec3 uCamPos; uniform vec2 uOrigin; uniform float uAlt;
        varying vec2 vNdc;
        ${NEBULA_GLSL}
        void main() {
          vec4 v = uInvProj * vec4(vNdc, 1.0, 1.0);
          v /= v.w;
          vec3 dir = normalize((uCamWorld * vec4(v.xyz, 0.0)).xyz);
          if (dir.y > -1e-4) discard;
          float t = -uCamPos.y / dir.y;
          vec2 hit = uCamPos.xz + dir.xz * t + uOrigin;   // absolute galaxy coords
          float horizon = smoothstep(0.0, 0.12, -dir.y) * (1.0 - smoothstep(uAlt * 30.0, uAlt * 90.0, t));
          vec4 c = nebulaSample(hit, uTime * ${DRIFT_RATE}, uDetail);
          float alpha = c.a * horizon * uOpacity;
          if (alpha < 0.002) discard;
          vec3 rgb = c.rgb;
          gl_FragColor = vec4(rgb * alpha * 1.3, alpha);
        }`,
    });
    this.object3d = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
    this.object3d.renderOrder = -9;
    this.object3d.frustumCulled = false;
  }

  update(view: ViewState): void {
    // Inside a star system the skybox takes over from the plane.
    const opacity = fade(view.visibleWidth, 9_000, 30_000) * fadeIn(view.visibleWidth, SKY_FULL, SKY_ZERO);
    this.object3d.visible = opacity > 0.01;
    if (!this.object3d.visible) return;
    const u = this.material.uniforms;
    const cam = view.camera;
    u.uOpacity.value = opacity;
    // Zoomed out the fine texture would only alias into speckle: it fades into a smooth fill.
    u.uDetail.value = nebulaDetail(view.visibleWidth);
    u.uTime.value = view.time;
    u.uInvProj.value.copy(cam.projectionMatrixInverse);
    u.uCamWorld.value.copy(cam.matrixWorld);
    u.uCamPos.value.copy(cam.position);
    u.uOrigin.value.set(view.origin.x, view.origin.z);
    u.uAlt.value = view.altitude;
  }

  dispose(): void {
    this.object3d.geometry.dispose();
    this.material.dispose();
  }
}
