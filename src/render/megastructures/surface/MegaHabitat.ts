import * as THREE from 'three';
import type { MegaGroundDef } from '../../../core/mega/MegaGround';
import { MEGA_GROUND_GLSL } from './megaGround.glsl';

/**
 * A swarm habitat's own structure (change mega-surfaces): the window strips between its land,
 * glass in a frame you see space through, and the two end caps, lit with rings of windows.
 */

const PART_VERT = /* glsl */ `
${MEGA_GROUND_GLSL}
uniform vec2 uFocus;
uniform float uLength;
uniform float uPart;
varying vec2 vSite;
varying float vH;
varying vec3 vPos;
void main() {
  float circ = 6.28318530718 * uRadius;
  vec2 site; float h;
  if (uPart < 0.5) {
    // Glass: round the whole habitat, its full length, a little below the land.
    site = vec2(uFocus.x + position.x * circ * 0.5, position.z * uLength * 0.5);
    h = -0.004;
  } else {
    // An end cap: from the rim (h = 0) to the axis.
    site = vec2(uFocus.x + position.x * circ * 0.5, sign(uPart - 1.5) * uLength * 0.5);
    h = position.y * uRadius * 0.999;
  }
  vec3 p = bend(site - uFocus, h);
  vSite = site;
  vH = h;
  vPos = p;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`;

const PART_FRAG = /* glsl */ `
${MEGA_GROUND_GLSL}
uniform float uPart;
varying vec2 vSite;
varying float vH;
varying vec3 vPos;
float lineW(float g, float halfW, float fw) { float d = abs(g - floor(g + 0.5)); return 1.0 - smoothstep(halfW - fw, halfW + fw, d); }
void main() {
  float circ = 6.28318530718 * uRadius;
  vec3 toCam = uCam - vPos;
  float dist = length(toCam);
  vec2 fw = fwidth(vSite);
  if (uPart < 0.5) {
    float t = fract(vSite.x / circ + 1.0 / 12.0);
    if (mod(floor(t * 6.0), 2.0) < 0.5) discard;
    // Mullions every 150 m along, 300 m across; the panes between, a faint blue glass.
    float frame = max(lineW(vSite.y / 0.15, 0.04, fw.y / 0.15), lineW(vSite.x / 0.3, 0.025, fw.x / 0.3));
    vec3 col = mix(vec3(0.5, 0.7, 0.9) * 0.08, vec3(0.32, 0.34, 0.38) * (0.2 + 0.8 * uDay), frame);
    gl_FragColor = vec4(col, mix(0.16, 0.95, frame));
    return;
  }
  // The cap: plating in rings and spokes, lit rings of windows at night.
  float r = vH / uRadius;
  float ring = lineW(r * 14.0, 0.06, fwidth(r * 14.0));
  float spoke = lineW(vSite.x / circ * 24.0, 0.03, fw.x / circ * 24.0);
  vec3 plate = mix(vec3(0.42, 0.43, 0.46), vec3(0.3, 0.31, 0.34), max(ring, spoke));
  float win = step(0.5, fract(r * 14.0 + 0.5)) * lineW(vSite.x / circ * 240.0, 0.18, fw.x / circ * 240.0) * (1.0 - smoothstep(0.85, 0.95, r));
  vec3 lit = plate * (0.25 + 0.75 * uDay) * (0.6 + 0.4 * r);
  lit += vec3(1.0, 0.8, 0.5) * win * (0.3 + 0.7 * (1.0 - uDay)) * 0.8;
  gl_FragColor = vec4(airOver(lit, -toCam / dist, dist), 1.0);
}`;

export class MegaHabitat {
  readonly group = new THREE.Group();
  private readonly mats: THREE.ShaderMaterial[] = [];
  private readonly geos: THREE.BufferGeometry[] = [];

  constructor(def: MegaGroundDef, uniforms: Record<string, THREE.IUniform>) {
    const make = (part: number, geo: THREE.BufferGeometry, transparent: boolean): void => {
      const mat = new THREE.ShaderMaterial({
        vertexShader: PART_VERT, fragmentShader: PART_FRAG, side: THREE.DoubleSide, transparent, depthWrite: !transparent,
        uniforms: { ...uniforms, uLength: { value: def.widthKm }, uPart: { value: part } },
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.frustumCulled = false;
      if (transparent) mesh.renderOrder = 5;
      this.group.add(mesh);
      this.mats.push(mat);
      this.geos.push(geo);
    };
    // Glass: x round the habitat (-1..1), z along it (-1..1).
    const glass = new THREE.PlaneGeometry(2, 2, 192, 64).rotateX(-Math.PI / 2);
    make(0, glass, true);
    // Caps: x round (-1..1), y from the rim to the axis (0..1).
    for (const part of [1, 2]) make(part, new THREE.PlaneGeometry(2, 1, 192, 24).translate(0, 0.5, 0), false);
  }

  dispose(): void {
    for (const g of this.geos) g.dispose();
    for (const m of this.mats) m.dispose();
  }
}
