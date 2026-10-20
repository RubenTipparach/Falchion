import * as THREE from 'three';
import type { MegaCity } from '../../../core/mega/MegaGround';
import { Rng, hashSeed } from '../../../core/rng/Rng';
import { MEGA_GROUND_GLSL } from './megaGround.glsl';

/**
 * The towers of a megastructure's cities near the camera (change mega-surfaces): one box per block
 * of the street grid the ground draws (block 0.11 km, from the city's centre), tallest in the core,
 * thinning to mid-rise further out. One instanced draw; windows light up at night.
 */

/** The block the ground's streets are drawn on (MegaTerrain), km. */
export const BLOCK_KM = 0.11;
/** Towers are drawn for cities this close to the camera, km. */
export const TOWER_REACH_KM = 30;
const MAX_TOWERS = 24000;

const TOWER_VERT = /* glsl */ `
${MEGA_GROUND_GLSL}
attribute vec4 aTower;  // x, z (site km), footprint, height (km)
attribute vec2 aBase;   // ground level (km), seed
uniform vec2 uFocus;
varying vec3 vLocal;
varying vec3 vNrm;
varying vec3 vPos;
varying float vSeed;
varying float vHeight;
varying float vRoof;
varying vec3 vLN;
varying vec2 vRel;
void main() {
  vRel = aTower.xy - uFocus;
  vRoof = step(0.5, normal.y);
  vLN = normal;
  vec3 l = vec3(position.x * aTower.z, position.y * aTower.w, position.z * aTower.z);
  vec2 rel = aTower.xy + l.xz - uFocus;
  vec3 p = bend(rel, aBase.x + l.y);
  vLocal = l;
  vNrm = bendDir(rel, normal);
  vPos = p;
  vSeed = aBase.y;
  vHeight = aTower.w;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`;

const TOWER_FRAG = /* glsl */ `
${MEGA_GROUND_GLSL}
varying float vRoof;
varying vec3 vLN;
varying vec2 vRel;
varying vec3 vLocal;
varying vec3 vNrm;
varying vec3 vPos;
varying float vSeed;
varying float vHeight;
float hash13(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
void main() {
  vec3 n = normalize(vNrm);
  vec3 toCam = uCam - vPos;
  float dist = length(toCam);
  vec3 view = -toCam / dist;
  // Which face: the roof, or a wall (and along which side of it the windows run).
  float roof = vRoof;
  float across = abs(vLN.x) > abs(vLN.z) ? vLocal.z : vLocal.x;
  // Windows: 4 m wide, a floor every 3.6 m (sized from outside any loop).
  vec2 w = vec2(across / 0.004, vLocal.y / 0.0036);
  vec2 fw = fwidth(w);
  vec2 cell = fract(w);
  float pane = smoothstep(0.12 - fw.x, 0.12 + fw.x, cell.x) * smoothstep(0.88 + fw.x, 0.88 - fw.x, cell.x)
             * smoothstep(0.2 - fw.y, 0.2 + fw.y, cell.y) * smoothstep(0.85 + fw.y, 0.85 - fw.y, cell.y);
  float tiny = smoothstep(0.6, 1.4, max(fw.x, fw.y));
  pane = mix(pane, 0.55, tiny);
  vec3 wall = mix(vec3(0.42, 0.43, 0.46), vec3(0.62, 0.6, 0.56), fract(vSeed * 7.13));
  vec3 glass = mix(vec3(0.14, 0.2, 0.28), skyColour(reflect(view, n)) * 0.8, 0.5);
  vec3 col = roof > 0.5 ? wall * 0.6 : mix(wall, glass, pane * 0.85);
  float ndl = max(dot(n, sunAt(vRel)), 0.0);
  vec3 lit = col * (uSunCol * ndl + vec3(0.34, 0.38, 0.46) * (0.45 + 0.2 * n.y)) * uDay;
  lit += col * vec3(0.16, 0.19, 0.27) * (1.0 - uDay);
  // Lit windows at night, room by room.
  float on = step(0.55, hash13(vec3(floor(w), vSeed * 97.0)));
  lit += vec3(1.0, 0.8, 0.52) * pane * mix(on, 0.45, tiny) * (1.0 - roof) * (1.0 - uDay) * 0.9;
  // An aircraft beacon, a small blinking point, on some of the tallest roofs at night.
  float beacon = roof * step(0.3, vHeight) * step(fract(vSeed * 13.7), 0.35) * (1.0 - smoothstep(0.002, 0.003, length(vLocal.xz)));
  lit += vec3(1.0, 0.25, 0.18) * beacon * step(0.6, fract(uTime * 0.7 + vSeed * 5.0)) * 3.0 * (1.0 - uDay);
  gl_FragColor = vec4(airOver(lit, view, dist), 1.0);
}`;

export class MegaTowers {
  readonly mesh: THREE.InstancedMesh;
  private readonly tower: THREE.InstancedBufferAttribute;
  private readonly base: THREE.InstancedBufferAttribute;
  private key = '';

  constructor(uniforms: Record<string, THREE.IUniform>, lite: boolean) {
    const box = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
    const cap = lite ? MAX_TOWERS / 3 : MAX_TOWERS;
    this.tower = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4);
    this.base = new THREE.InstancedBufferAttribute(new Float32Array(cap * 2), 2);
    box.setAttribute('aTower', this.tower);
    box.setAttribute('aBase', this.base);
    const mat = new THREE.ShaderMaterial({ vertexShader: TOWER_VERT, fragmentShader: TOWER_FRAG, uniforms });
    this.mesh = new THREE.InstancedMesh(box, mat, cap);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
  }

  /** Lay out the towers of the cities near the camera (only when that set changes). */
  setCities(cities: readonly MegaCity[]): void {
    const key = cities.map((c) => `${c.x.toFixed(2)},${c.z.toFixed(2)}`).join(';');
    if (key === this.key) return;
    this.key = key;
    const t = this.tower.array as Float32Array, b = this.base.array as Float32Array;
    const cap = t.length / 4;
    let n = 0;
    for (const c of cities) {
      const rng = new Rng(hashSeed('mega-towers', Math.round(c.x * 1000), Math.round(c.z * 1000)));
      const reach = Math.min(c.r * 0.8, 3 + 5 * c.size);
      const core = Math.min(c.r * 0.35, 1 + 2.5 * c.size);
      const tall = 0.12 + 0.9 * c.size;
      const m = Math.ceil(reach / BLOCK_KM);
      for (let j = -m; j < m && n < cap; j++) {
        for (let i = -m; i < m && n < cap; i++) {
          const x = (i + 0.5) * BLOCK_KM, z = (j + 0.5) * BLOCK_KM;
          const d = Math.hypot(x, z);
          if (d > reach) continue;
          const r = rng.next(), q = rng.next();
          // Every eighth block line is an avenue's (the ground draws it wider): leave it be.
          if (((i % 8) + 8) % 8 === 0 || ((j % 8) + 8) % 8 === 0) continue;
          const inCore = d < core;
          if (!inCore && r > 0.55 * (1 - d / reach) + 0.15) continue;
          const h = inCore ? tall * (0.25 + 0.75 * Math.pow(1 - d / core, 1.5)) * (0.4 + 0.6 * q) : 0.012 + 0.05 * q * (1 - d / reach);
          t.set([c.x + x, c.z + z, BLOCK_KM * (0.55 + 0.25 * rng.next()), h], n * 4);
          b.set([c.level, rng.next()], n * 2);
          n++;
        }
      }
    }
    this.mesh.count = n;
    this.tower.needsUpdate = true;
    this.base.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}
