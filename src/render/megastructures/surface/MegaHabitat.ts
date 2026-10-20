import * as THREE from 'three';
import type { MegaGroundDef } from '../../../core/mega/MegaGround';
import { Rng, hashSeed } from '../../../core/rng/Rng';
import { habitatArt } from './habitatArt';
import { MEGA_GROUND_GLSL } from './megaGround.glsl';

/**
 * A swarm habitat's own structure (change mega-surfaces), after the O'Neill cylinder of Star Crew
 * Bridge Simulator (its spacedock mockup: the mirrors, the clouds, the dome machinery, the light
 * down the axis):
 * - glass in a frame over the window strips between the land, space beyond;
 * - a closed habitat (the swarm's): the two end caps, machinery and rings of lit windows (Star
 *   Crew's dome map), and three mirrors outside the windows, hinged at the end away from the
 *   star, open by day to throw its light in and nearly shut at night;
 * - an endless tube (a topopolis): no caps and no mirrors, its windows turning to the star and
 *   away as it spins; its glass, clouds and axis light follow the camera along it, repeating;
 * - cloud puffs over the land where Star Crew's cloud map gathers them;
 * - a thin line of light down the axis.
 * The mirrors, clouds and axis are built round the habitat's axis and turned to the camera's
 * frame each frame (the land is bent there by MEGA_GROUND_GLSL's bend()).
 */

const PART_VERT = /* glsl */ `
${MEGA_GROUND_GLSL}
uniform vec2 uFocus;
uniform float uLength;
uniform float uPart;
uniform float uFollow;
varying vec2 vSite;
varying float vH;
varying vec3 vPos;
void main() {
  float circ = 6.28318530718 * uRadius;
  vec2 site; float h;
  if (uPart < 0.5) {
    // Glass: round the whole habitat, its full length, a little below the land.
    site = vec2(uFocus.x + position.x * circ * 0.5, uFollow * uFocus.y + position.z * uLength * 0.5);
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
uniform sampler2D uDome;
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
  // The cap: Star Crew's dome machinery, projected flat over the disc; its windows light up.
  float a = wrapSite(vSite).x / uRadius, rr = 1.0 - vH / uRadius;
  vec4 dome = texture2D(uDome, 0.5 + 0.5 * rr * vec2(cos(a), sin(a)));
  float ring = lineW(rr * 14.0, 0.05, fwidth(rr * 14.0));
  vec3 lit = dome.rgb * (0.38 + 0.54 * uDay) * (0.75 + 0.25 * rr) * (1.0 - ring * 0.25);
  lit += vec3(1.0, 0.8, 0.5) * dome.a * (0.35 + 0.65 * (1.0 - uDay));
  gl_FragColor = vec4(airOver(lit, -toCam / dist, dist), 1.0);
}`;

// ── Mirrors, clouds and the axis light, built round the habitat's axis ──────────

const MIRROR_VERT = /* glsl */ `
varying vec3 vW;
varying vec3 vN;
varying vec2 vUv;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  vN = normalize(mat3(modelMatrix) * normal);
  vUv = uv;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const MIRROR_FRAG = /* glsl */ `
uniform vec3 uStarDir;
uniform vec3 uSunCol;
uniform float uDay;
uniform sampler2D uPanels;
uniform vec2 uTile;
varying vec3 vW;
varying vec3 vN;
varying vec2 vUv;
void main() {
  vec3 V = normalize(vW - cameraPosition);
  vec3 N = normalize(vN);
  if (!gl_FrontFacing) N = -N;
  vec3 panels = texture2D(uPanels, vUv * uTile).rgb;
  // The silvered face (toward the habitat): the star in it, as Star Crew draws its mirrors.
  float rs = max(dot(reflect(V, N), uStarDir), 0.0);
  vec3 env = uSunCol * (pow(rs, 900.0) * 80.0 + pow(rs, 40.0) * 2.5 + pow(rs, 6.0) * 0.12);
  // Off the star, the panels catch the habitat's own light.
  vec3 col = panels * 0.22 + env * (0.75 + 0.25 * panels.r);
  // Shut for the night, they turn their silvering away: only a glint is left.
  gl_FragColor = vec4(col * mix(0.35, 1.0, uDay), 1.0);
}`;

const PUFF_VERT = /* glsl */ `
attribute vec4 aPuff; // angle round the axis, z, height above the floor, size
attribute float aSeed;
uniform float uRadius;
varying vec3 vN;
varying vec3 vUp;
varying vec3 vW;
varying float vLump;
void main() {
  float c = cos(aPuff.x), s = sin(aPuff.x);
  // The puff's frame: up toward the axis, flat base.
  vec3 up = vec3(-s, c, 0.0), side = vec3(c, s, 0.0);
  vec3 lp = position * vec3(aPuff.w, aPuff.w * 0.55, aPuff.w * 0.8);
  vec3 centre = vec3(s, -c, 0.0) * (uRadius - aPuff.z) + vec3(0.0, 0.0, aPuff.y);
  vec3 p = centre + side * lp.x + up * lp.y + vec3(0.0, 0.0, lp.z);
  vec4 w = modelMatrix * vec4(p, 1.0);
  vW = w.xyz;
  vN = normalize(mat3(modelMatrix) * (side * normal.x + up * normal.y + vec3(0.0, 0.0, normal.z)));
  vUp = normalize(mat3(modelMatrix) * up);
  vLump = 0.85 + 0.15 * fract(aSeed * 7.31 + position.y * 3.0);
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const PUFF_FRAG = /* glsl */ `
uniform float uDay;
uniform vec3 uSunCol;
varying vec3 vN;
varying vec3 vUp;
varying vec3 vW;
varying float vLump;
void main() {
  // Lit from the mirrors' side: brighter on top, a soft dark belly (Star Crew's E_PUFF).
  float k = dot(normalize(vN), vUp);
  vec3 white = mix(vec3(1.0), uSunCol, 0.25);
  // At night the axis light catches them from below, so they are pale shapes, not holes in the land.
  vec3 night = vec3(0.34, 0.33, 0.36) * (0.7 + 0.3 * smoothstep(0.9, -0.7, k));
  vec3 col = white * (uDay * (0.42 + 0.5 * smoothstep(-0.7, 0.9, k) + 0.08 * (1.0 - abs(k))) * vLump + 0.03) + night * vLump * (1.0 - uDay);
  float dist = length(vW - cameraPosition);
  col = mix(col, uSunCol * 0.55 * uDay + vec3(0.08, 0.09, 0.12) * (1.0 - uDay) + vec3(0.01, 0.012, 0.02), smoothstep(3.0, 30.0, dist) * 0.55);
  gl_FragColor = vec4(col, 1.0);
}`;

const AXIS_FRAG = /* glsl */ `
uniform float uDay;
varying vec2 vUv;
void main() { gl_FragColor = vec4(vec3(1.0, 0.92, 0.78) * (0.6 + 0.4 * (1.0 - uDay)), 1.0); }`;

/** Mirror open angle (from the hull) by day and at night, degrees (Star Crew's spacedock). */
const OPEN_DAY = 35, OPEN_NIGHT = 80;
/** Cloud puffs, and their height above the floor and size (km): Star Crew's, scaled to this habitat. */
const PUFFS = 240;

export class MegaHabitat {
  readonly group = new THREE.Group();
  /** Built round the habitat's axis (z), turned to the camera's frame each frame. */
  private readonly hull = new THREE.Group();
  private readonly mats: THREE.ShaderMaterial[] = [];
  private readonly geos: THREE.BufferGeometry[] = [];
  private readonly mirrors: THREE.Mesh[] = [];
  private readonly mirrorMat: THREE.ShaderMaterial;
  private readonly puffMat: THREE.ShaderMaterial;
  private readonly axisMat: THREE.ShaderMaterial;
  private disposed = false;

  /** Closed at both ends (a swarm's habitat), or a tube without end (a topopolis). */
  private readonly closed: boolean;
  /** An endless tube's repeat along its length, km (its clouds, as its land, repeat with it). */
  private readonly tile: number;

  constructor(private readonly def: MegaGroundDef, uniforms: Record<string, THREE.IUniform>) {
    const art = habitatArt();
    this.closed = def.widthKm > 0;
    this.tile = (4 * 2 * Math.PI * def.radiusKm) / 6;
    const span = this.closed ? def.widthKm : this.tile * 3;
    const make = (part: number, geo: THREE.BufferGeometry, transparent: boolean): void => {
      const mat = new THREE.ShaderMaterial({
        vertexShader: PART_VERT, fragmentShader: PART_FRAG, side: THREE.DoubleSide, transparent, depthWrite: !transparent,
        uniforms: { ...uniforms, uLength: { value: span }, uPart: { value: part }, uDome: { value: art.dome }, uFollow: { value: this.closed ? 0 : 1 } },
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.frustumCulled = false;
      if (transparent) mesh.renderOrder = 5;
      this.group.add(mesh);
      this.mats.push(mat);
      this.geos.push(geo);
    };
    // Glass: x round the habitat (-1..1), z along it (-1..1).
    make(0, new THREE.PlaneGeometry(2, 2, 192, 64).rotateX(-Math.PI / 2), true);
    // Caps: x round (-1..1), y from the rim to the axis (0..1).
    if (this.closed) for (const part of [1, 2]) make(part, new THREE.PlaneGeometry(2, 1, 192, 24).translate(0, 0.5, 0), false);

    this.group.add(this.hull);
    const R = def.radiusKm, L = def.widthKm;
    // Mirrors: one a window, as wide as it, nearly as long as the habitat.
    this.mirrorMat = new THREE.ShaderMaterial({
      vertexShader: MIRROR_VERT, fragmentShader: MIRROR_FRAG, side: THREE.DoubleSide,
      uniforms: { uStarDir: { value: new THREE.Vector3(0, 0, -1) }, uSunCol: uniforms.uSunCol, uDay: uniforms.uDay, uPanels: { value: art.mirror }, uTile: { value: new THREE.Vector2(R / 0.5, (L * 0.96) / 0.5) } },
    });
    this.mats.push(this.mirrorMat);
    const plate = new THREE.PlaneGeometry(R, L * 0.96, 1, 1);
    this.geos.push(plate);
    for (let k = 0; k < (this.closed ? 3 : 0); k++) {
      const m = new THREE.Mesh(plate, this.mirrorMat);
      m.frustumCulled = false;
      this.mirrors.push(m);
      this.hull.add(m);
    }
    // The light down the axis.
    this.axisMat = new THREE.ShaderMaterial({ vertexShader: MIRROR_VERT, fragmentShader: AXIS_FRAG, uniforms: { uDay: uniforms.uDay } });
    this.mats.push(this.axisMat);
    const axis = new THREE.CylinderGeometry(0.008 * Math.max(1, R / 8), 0.008 * Math.max(1, R / 8), span, 8, 1, true).rotateX(Math.PI / 2);
    this.geos.push(axis);
    this.hull.add(new THREE.Mesh(axis, this.axisMat));
    // Clouds: placed once the cloud map has loaded.
    this.puffMat = new THREE.ShaderMaterial({ vertexShader: PUFF_VERT, fragmentShader: PUFF_FRAG, uniforms: { uRadius: { value: R }, uDay: uniforms.uDay, uSunCol: uniforms.uSunCol } });
    this.mats.push(this.puffMat);
    void art.clouds.then((cover) => { if (!this.disposed) this.addClouds(cover); });
  }

  /** Cloud puffs over the land strips where the cloud map gathers them (Star Crew: alpha at least 150). */
  private addClouds(cover: (u: number, v: number) => number): void {
    const R = this.def.radiusKm, L = this.def.widthKm;
    const rng = new Rng(hashSeed('habitat-clouds', this.def.offset[2]));
    const puff = puffGeometry(rng);
    const geo = new THREE.InstancedBufferGeometry().copy(puff as THREE.InstancedBufferGeometry);
    puff.dispose();
    const data: number[] = [], seeds: number[] = [];
    // Star Crew's clouds sit 150 to 260 m up in a habitat 0.9 km round: here, in proportion (a
    // little lower in a wide tube, where the air is no deeper).
    const k = Math.min(R / 0.9, 12);
    const along = this.closed ? L * 0.92 : this.tile;
    const count = this.closed ? PUFFS : PUFFS * 4;
    for (let tries = 0; tries < count * 30 && data.length / 4 < count; tries++) {
      const u = rng.next(), v = rng.next();
      // Over a land strip (centred on 0, 120 and 240 degrees), clear of its edges.
      const deg = u * 360, off = ((deg % 120) + 120) % 120;
      if (off > 24 && off < 96) continue;
      if (cover(u, v) < 150 / 255) continue;
      // A puff spans about 2.6 of its size across.
      data.push((deg * Math.PI) / 180, (v - 0.5) * along, 0.15 * k * rng.range(1, 1.7), 0.035 * k * rng.range(1, 2));
      seeds.push(rng.next());
    }
    // An endless tube repeats its tile of clouds before and after.
    if (!this.closed) {
      const one = data.length;
      for (const shift of [-this.tile, this.tile]) for (let i = 0; i < one; i += 4) { data.push(data[i], data[i + 1] + shift, data[i + 2], data[i + 3]); seeds.push(seeds[i / 4]); }
    }
    geo.setAttribute('aPuff', new THREE.InstancedBufferAttribute(new Float32Array(data), 4));
    geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(new Float32Array(seeds), 1));
    geo.instanceCount = data.length / 4;
    this.geos.push(geo);
    const mesh = new THREE.Mesh(geo, this.puffMat);
    mesh.frustumCulled = false;
    this.hull.add(mesh);
    void R;
  }

  /** Turn the hull's parts to the camera's frame (the focus floor at the origin, up the axis) and set the mirrors for the time of day. */
  update(focus: readonly [number, number], day: number): void {
    const R = this.def.radiusKm, L = this.def.widthKm;
    // An endless tube's parts repeat: keep the copy round the camera.
    const z = this.closed ? focus[1] : focus[1] - Math.round(focus[1] / this.tile) * this.tile;
    this.hull.position.set(0, R, -z);
    this.hull.rotation.set(0, 0, -focus[0] / R);
    const open = THREE.MathUtils.degToRad(THREE.MathUtils.lerp(OPEN_NIGHT, OPEN_DAY, day));
    this.mirrors.forEach((m, k) => {
      // Window k is centred 60 + 120k degrees round from the landing strip (whose floor is straight down).
      const th = THREE.MathUtils.degToRad(60 + 120 * k);
      const out = new THREE.Vector3(Math.sin(th), -Math.cos(th), 0), across = new THREE.Vector3(Math.cos(th), Math.sin(th), 0);
      // Hinged on the hull at the end away from the star (+z), opening outward toward it.
      const along = new THREE.Vector3(0, 0, -1).multiplyScalar(Math.cos(open)).addScaledVector(out, Math.sin(open));
      const hinge = out.clone().multiplyScalar(R + 0.004).add(new THREE.Vector3(0, 0, L / 2));
      const centre = hinge.clone().addScaledVector(along, (L * 0.96) / 2);
      const normal = new THREE.Vector3().crossVectors(across, along).normalize();
      m.matrix.makeBasis(across, along, normal).setPosition(centre);
      m.matrixAutoUpdate = false;
      m.matrixWorldNeedsUpdate = true;
    });
  }

  dispose(): void {
    this.disposed = true;
    for (const g of this.geos) g.dispose();
    for (const m of this.mats) m.dispose();
  }
}

/** A cloud puff: three or four lumpy blobs merged, flat underneath (Star Crew's cumulus). */
function puffGeometry(rng: Rng): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const n = 3 + (rng.chance(0.5) ? 1 : 0);
  for (let i = 0; i < n; i++) {
    const g = new THREE.IcosahedronGeometry(1, 1);
    const s = rng.range(0.45, 0.75);
    g.scale(s, s, s).translate(rng.range(-0.55, 0.55), rng.range(0.1, 0.45), rng.range(-0.35, 0.35));
    parts.push(g.index ? g.toNonIndexed() : g);
  }
  const pos: number[] = [];
  for (const g of parts) { pos.push(...(g.getAttribute('position').array as Float32Array)); g.dispose(); }
  // Flatten the base.
  for (let i = 1; i < pos.length; i += 3) pos[i] = Math.max(pos[i], 0);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.computeVertexNormals();
  return geo;
}
