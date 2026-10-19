import * as THREE from 'three';
import type { MegaGroundDef } from '../../../core/mega/MegaGround';
import { MEGA_GROUND_GLSL } from './megaGround.glsl';

/**
 * Everything beyond the land drawn round the camera (change mega-surfaces), worked out per pixel:
 * the view ray is cast against the structure's exact shape, so the far land is never a mesh that
 * could cut the sky near the camera.
 * - **Ringworld:** the Arch: the ring's inner face rising overhead, lit in bands by the shadow
 *   squares; the squares themselves; the star at the zenith.
 * - **Dyson sphere:** the shell's far side as a dome of land; the star overhead.
 * - **Alderson disk:** the disc to the horizon, scorched toward the star and frozen far out; the
 *   star low, rising and setting as it bobs.
 * - **Habitat (swarm):** space through the windows: the star, the stars and the swarm's other
 *   collectors, turning with the habitat's spin.
 * Far units: the structure's radius (ring, sphere) or 10^8 km (disk); the focus is the origin.
 */

export const SKY_MODE = { ringworld: 0, 'dyson-sphere': 1, 'alderson-disk': 2, 'dyson-swarm': 3 } as const;
/** Shadow squares round a ring, their orbit (ring radii) and how much of each gap they fill. */
export const SQUARES = { n: 10, radius: 0.35, cover: 0.4 } as const;
/** The disc's far unit (km) and its star's distance in it. */
export const DISK_UNIT_KM = 1e8;

const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
}`;

const SKY_FRAG = /* glsl */ `
${MEGA_GROUND_GLSL}
uniform float uMode;
uniform vec3 uFarCam;
uniform float uUnit;
uniform vec2 uFocus;
uniform float uRingZ;
uniform float uHalfW;
uniform float uWall;
uniform float uSquarePhase;
uniform vec3 uStarPos;
uniform float uStarRad;
uniform float uNearKm;
uniform float uSpin;
varying vec3 vDir;
const float PI = 3.14159265359;
float hash13(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float starField(vec3 d) {
  vec3 q = d * 260.0;
  vec3 c = floor(q), f = fract(q) - 0.5;
  float h = hash13(c);
  return step(0.988, h) * smoothstep(0.4, 0.0, length(f)) * (0.4 + (h - 0.988) * 50.0);
}
/** The smaller positive root of a t^2 + b t + c = 0, or -1 (stable for a tiny c). */
float rayRoot(float a, float b, float c, bool far) {
  float disc = b * b - 4.0 * a * c;
  if (disc < 0.0 || a < 1e-12) return -1.0;
  float q = -0.5 * (b + (b >= 0.0 ? 1.0 : -1.0) * sqrt(disc));
  float t1 = q / a, t2 = q != 0.0 ? c / q : -1.0;
  float lo = min(t1, t2), hi = max(t1, t2);
  if (far) return hi > 0.0 ? hi : -1.0;
  return lo > 0.0 ? lo : (hi > 0.0 ? hi : -1.0);
}
/** The shadow squares' day at angle a round the ring (0: under a square). */
float squaresDay(float a) {
  float x = fract((a - uSquarePhase) / (2.0 * PI / ${SQUARES.n}.0));
  float m = min(x, 1.0 - x);
  return smoothstep(${(SQUARES.cover / 2 - 0.03).toFixed(3)}, ${(SQUARES.cover / 2 + 0.03).toFixed(3)}, m);
}
vec3 lightLand(vec3 col, vec2 site, float day, float sunUp) {
  vec3 lit = col * (uSunCol * sunUp + vec3(0.3, 0.36, 0.46) * 0.35) * day;
  // Cities' lights on the night side, as far off as they can be told apart.
  float city = step(0.94, hash13(vec3(floor(site / 60.0), 3.0)));
  lit += vec3(1.0, 0.72, 0.4) * city * 0.35 * (1.0 - day);
  return lit + col * 0.01 * (1.0 - day);
}
void main() {
  vec3 d = normalize(vDir);
  vec3 o = uFarCam;
  vec3 col = skyColour(d);
  float skyLum = dot(col, vec3(0.3, 0.5, 0.2));
  float t = -1.0;
  vec3 hitCol = vec3(0.0);
  float sunVis = 1.0;
  if (uMode < 0.5) {
    // The ringworld: the land's cylinder (axis along z through (0, 1, 0)), the squares closer in.
    vec2 dd = d.xy;
    float a2 = dot(dd, dd), b2 = 2.0 * (o.x * dd.x + (o.y - 1.0) * dd.y);
    float tl = rayRoot(a2, b2, o.x * o.x + o.y * o.y - 2.0 * o.y, true);
    float rs = ${SQUARES.radius.toFixed(3)};
    float ts = rayRoot(a2, b2, o.x * o.x + (o.y - 1.0) * (o.y - 1.0) - rs * rs, false);
    if (ts > 0.0) {
      vec3 ps = o + ts * d;
      float as_ = atan(ps.x, 1.0 - ps.y);
      float x = fract((as_ - uSquarePhase) / (2.0 * PI / ${SQUARES.n}.0));
      if (min(x, 1.0 - x) < ${(SQUARES.cover / 2).toFixed(3)} && abs(ps.z - uRingZ) < uHalfW * 0.8) {
        // A shadow square: dark, its rim catching the light.
        float edge = smoothstep(${(SQUARES.cover / 2 - 0.01).toFixed(3)}, ${(SQUARES.cover / 2).toFixed(3)}, min(x, 1.0 - x));
        hitCol = vec3(0.02, 0.022, 0.03) + vec3(0.25, 0.22, 0.18) * edge;
        t = ts;
        sunVis = 0.0;
      }
    }
    if (t < 0.0 && tl > 0.0) {
      vec3 p = o + tl * d;
      float a = atan(p.x, 1.0 - p.y);
      if (abs(p.z - uRingZ) <= uHalfW) {
        t = tl;
        float dist = tl * uUnit;
        if (dist > uNearKm) {
          vec2 site = uFocus + vec2(a * uUnit, p.z * uUnit);
          float h = max(rawHeight(site, min(octavesAt(dist), 5.0)), -0.001);
          hitCol = airOver(lightLand(landColour(site, h, 0.0, 0.0), site, squaresDay(a), 1.0), d, dist);
        } else hitCol = col;
      } else {
        // Past the land's edge: the rim wall, or out to space.
        float zw = uRingZ + sign(p.z - uRingZ) * uHalfW;
        float tw = (zw - o.z) / d.z;
        vec3 pw = o + tw * d;
        float rr = length(pw.xy - vec2(0.0, 1.0));
        if (tw > 0.0 && rr > 1.0 - uWall && rr < 1.0) {
          t = tw;
          float dayW = squaresDay(atan(pw.x, 1.0 - pw.y));
          hitCol = airOver(vec3(0.34, 0.35, 0.38) * (0.25 + 0.75 * dayW) * (0.8 + 0.2 * step(0.5, fract(rr * 4000.0))), d, tw * uUnit);
        }
      }
    }
  } else if (uMode < 1.5) {
    // The Dyson sphere: its shell from inside (centre (0, 1, 0)).
    float tl = rayRoot(1.0, 2.0 * (o.x * d.x + (o.y - 1.0) * d.y + o.z * d.z), dot(o, o) - 2.0 * o.y, true);
    if (tl > 0.0) {
      t = tl;
      float dist = tl * uUnit;
      if (dist > uNearKm) {
        vec3 p = o + tl * d;
        vec3 dc = p - vec3(0.0, 1.0, 0.0);
        float ang = 2.0 * asin(clamp(length(dc - vec3(0.0, -1.0, 0.0)) * 0.5, 0.0, 1.0));
        vec2 u = length(dc.xz) > 1e-9 ? normalize(dc.xz) : vec2(1.0, 0.0);
        vec2 site = uFocus + u * ang * uUnit;
        float h = max(rawHeight(site, min(octavesAt(dist), 5.0)), -0.001);
        hitCol = airOver(lightLand(landColour(site, h, 0.0, 0.0), site, 1.0, 1.0), d, dist);
      } else hitCol = col;
    }
  } else if (uMode < 2.5) {
    // The Alderson disk: the plane y = 0 from its hole round the star out to its rim.
    if (d.y < -1e-7) {
      float tl = -o.y / d.y;
      vec3 p = o + tl * d;
      float rS = length(p.xz - uStarPos.xz);
      if (rS > 0.12 && rS < 3.2) {
        t = tl;
        float dist = tl * uUnit;
        if (dist > uNearKm) {
          vec2 site = uFocus + p.xz * uUnit;
          float h = max(rawHeight(site, min(octavesAt(dist), 5.0)), -0.001);
          vec3 c = landColour(site, h, 0.0, 0.0);
          // Scorched toward the star, frozen far out.
          c = mix(vec3(0.42, 0.24, 0.14), c, smoothstep(0.3, 0.65, rS));
          c = mix(c, vec3(0.86, 0.9, 0.95), smoothstep(1.7, 2.4, rS));
          float up = clamp((uStarPos.y - p.y) / rS, 0.0, 1.0);
          hitCol = airOver(lightLand(c, site, uDay, 0.6 + up * 4.0), d, dist);
        } else hitCol = col;
      }
    }
  }
  if (uMode > 2.5) {
    // A habitat: space through the windows, turning with the spin (the habitat's axis is z).
    float cs = cos(uSpin), sn = sin(uSpin);
    vec3 r = vec3(d.x * cs - d.y * sn, d.x * sn + d.y * cs, d.z);
    col = vec3(0.004, 0.006, 0.012) + vec3(0.85, 0.9, 1.0) * starField(r);
    // The swarm's other collectors: glints all round.
    vec3 q = r * 40.0;
    float g = hash13(floor(q));
    col += vec3(1.0, 0.85, 0.55) * step(0.992, g) * smoothstep(0.45, 0.1, length(fract(q) - 0.5)) * 1.4;
    vec3 s = normalize(uStarPos);
    float sd = dot(r, s);
    col += uSunCol * (smoothstep(cos(uStarRad), cos(uStarRad * 0.85), sd) * 4.0 + pow(max(sd, 0.0), 300.0) * 1.2);
    gl_FragColor = vec4(col, 1.0);
    return;
  }
  // The star (where nothing stands in front of it), and the stars where the sky is dark enough.
  if (t < 0.0) {
    vec3 s = normalize(uStarPos - o);
    float sd = dot(d, s);
    col += uSunCol * (smoothstep(cos(uStarRad), cos(uStarRad * 0.9), sd) * 6.0 + pow(max(sd, 0.0), 2000.0) * 2.0 + pow(max(sd, 0.0), 60.0) * 0.25) * sunVis;
    col += vec3(0.8, 0.85, 1.0) * starField(d) * clamp(1.0 - skyLum * 4.0, 0.0, 1.0);
  } else col = hitCol;
  gl_FragColor = vec4(col, 1.0);
}`;

export class MegaSky {
  readonly mesh: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>;
  readonly unitKm: number;

  constructor(readonly def: MegaGroundDef, uniforms: Record<string, THREE.IUniform>) {
    this.unitKm = def.type === 'alderson-disk' ? DISK_UNIT_KM : def.type === 'dyson-swarm' ? 1 : def.radiusKm;
    const mat = new THREE.ShaderMaterial({
      vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, side: THREE.BackSide, depthWrite: false, depthTest: false,
      uniforms: {
        ...uniforms,
        uMode: { value: SKY_MODE[def.type] }, uFarCam: { value: new THREE.Vector3() }, uUnit: { value: this.unitKm },
        uRingZ: { value: 0 }, uHalfW: { value: def.widthKm / 2 / this.unitKm }, uWall: { value: 6000 / this.unitKm },
        uSquarePhase: { value: 0 }, uStarPos: { value: new THREE.Vector3(0, 1, 0) }, uStarRad: { value: 0.012 },
        uNearKm: { value: 0 }, uSpin: { value: 0 },
      },
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -10;
  }

  get uniforms(): Record<string, THREE.IUniform> {
    return this.mesh.material.uniforms;
  }

  /** Centre the sky on the camera (km, focus frame), `radius` inside the camera's far plane. */
  place(cam: THREE.Vector3, radius: number, nearKm: number): void {
    this.mesh.position.copy(cam);
    this.mesh.scale.setScalar(radius);
    this.mesh.updateMatrixWorld();
    const u = this.uniforms;
    u.uFarCam.value.copy(cam).divideScalar(this.unitKm);
    u.uNearKm.value = nearKm;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}
