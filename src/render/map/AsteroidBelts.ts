import * as THREE from 'three';
import type { Mineral } from '../../content/resources';
import type { AsteroidField } from '../../core/galaxy/Asteroids';
import { Rng, hashSeed } from '../../core/rng/Rng';
import { makeOutward } from '../geometry/orientation';
import { fullness, maxRocks, visibleRocks, type BeltPlace } from './beltLayout';

/**
 * An asteroid field drawn in the system view as a belt round the star: an InstancedMesh of rocks
 * (each tumbling and orbiting on the GPU, nothing per frame on the CPU), a faint dust band so the
 * belt reads from far out, and for gas fields the comets' tails. Its look follows the resource:
 * - metals: irregular grey-brown low-poly rocks;
 * - gases: icy blue-white bodies with faint additive tails pointing away from the star;
 * - crystals: violet faceted shards that glint.
 * How many rocks show follows what the field has left, so a mined field thins and fills back.
 * The belt lives in the star's frame (the star at its origin); nothing in it is pickable.
 */

/** Orbital speed scale, as the planets': radians per second for an orbit of 1/12 ly. */
const ORBIT_RATE = 0.01;

interface BeltLook {
  /** Base colours the rocks are tinted between. */
  readonly tints: readonly [string, string];
  /** Rock size range (ly) before stretching. */
  readonly size: readonly [number, number];
  /** Per-axis stretch: [min, max] for the long axis, others vary less. */
  readonly stretch: number;
  /** Dust band colour and strength. */
  readonly dust: string;
  readonly dustAlpha: number;
  /** Emissive glow added to the rock colour (crystals glint, ice shines a little). */
  readonly glow: string;
  readonly glowAmount: number;
  /** Specular sharpness and strength (0 for dull rock). */
  readonly shine: number;
  readonly specular: number;
  readonly twinkle: number;
}

const LOOKS: Readonly<Record<Mineral, BeltLook>> = {
  metals: { tints: ['#a89684', '#7f7870'], size: [0.0005, 0.0016], stretch: 1.6, dust: '#b09a80', dustAlpha: 0.13, glow: '#000000', glowAmount: 0, shine: 12, specular: 0.15, twinkle: 0 },
  gases: { tints: ['#e8f4ff', '#a9d4f0'], size: [0.0005, 0.0011], stretch: 1.3, dust: '#8fd0ff', dustAlpha: 0.12, glow: '#9fdcff', glowAmount: 0.25, shine: 30, specular: 0.6, twinkle: 0 },
  crystals: { tints: ['#b98cff', '#7f52d8'], size: [0.0006, 0.0015], stretch: 2.4, dust: '#b48aff', dustAlpha: 0.09, glow: '#a874ff', glowAmount: 0.45, shine: 60, specular: 1.6, twinkle: 1.6 },
};

const ROCK_VERT = /* glsl */ `
  attribute vec4 aOrbit;   // radius, start angle, height, phase
  attribute vec4 aSpin;    // tumble axis (xyz), tumble rate (w)
  attribute vec3 aTint;
  uniform float uTime;
  uniform float uRate;
  uniform vec3 uCam;
  varying vec3 vN;
  varying vec3 vL;
  varying vec3 vV;
  varying vec3 vTint;
  varying float vPhase;
  vec3 rotateAxis(vec3 v, vec3 k, float a) {
    float c = cos(a), s = sin(a);
    return v * c + cross(k, v) * s + k * dot(k, v) * (1.0 - c);
  }
  void main() {
    mat3 m = mat3(instanceMatrix);
    vec3 p = m * position;
    vec3 n = transpose(inverse(m)) * normal;
    float tumble = uTime * aSpin.w + aOrbit.w * 6.2831;
    p = rotateAxis(p, aSpin.xyz, tumble);
    n = rotateAxis(n, aSpin.xyz, tumble);
    float r = aOrbit.x;
    float a = aOrbit.y + uTime * uRate / pow(r * 12.0, 1.5);
    vec3 centre = vec3(cos(a) * r, aOrbit.z, -sin(a) * r);
    vec3 world = centre + p;
    vN = n;
    vL = -centre;
    vV = uCam - world;
    vTint = aTint;
    vPhase = aOrbit.w;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(world, 1.0);
  }
`;

const ROCK_FRAG = /* glsl */ `
  uniform vec3 uStar;
  uniform vec3 uGlow;
  uniform float uGlowAmount;
  uniform float uShine;
  uniform float uSpecular;
  uniform float uTwinkle;
  uniform float uTime;
  varying vec3 vN;
  varying vec3 vL;
  varying vec3 vV;
  varying vec3 vTint;
  varying float vPhase;
  void main() {
    vec3 n = normalize(vN);
    vec3 l = normalize(vL);
    vec3 v = normalize(vV);
    float diff = max(dot(n, l), 0.0);
    // Dim stars (brown dwarfs, black holes) still light their rocks enough to see.
    vec3 col = vTint * (0.22 + 1.3 * diff * max(uStar, vec3(0.55)));
    vec3 h = normalize(l + v);
    float spec = pow(max(dot(n, h), 0.0), uShine) * uSpecular * step(0.0, dot(n, l));
    col += spec * uStar;
    // A slow glint: each shard flares now and then.
    float tw = pow(0.5 + 0.5 * sin(uTime * 1.7 + vPhase * 97.0), 24.0) * uTwinkle;
    col += uGlow * (uGlowAmount + tw);
    gl_FragColor = vec4(col, 1.0);
  }
`;

const TAIL_VERT = /* glsl */ `
  attribute vec4 aOrbit;
  uniform float uTime;
  uniform float uRate;
  uniform float uLength;
  varying vec2 vUv;
  void main() {
    float r = aOrbit.x;
    float a = aOrbit.y + uTime * uRate / pow(r * 12.0, 1.5);
    vec3 centre = vec3(cos(a) * r, aOrbit.z, -sin(a) * r);
    vec3 dir = normalize(vec3(centre.x, 0.0, centre.z));
    vec3 side = vec3(-dir.z, 0.0, dir.x);
    float u = position.x + 0.5;           // 0 at the head, 1 at the tip
    float len = uLength * (0.6 + 0.8 * fract(aOrbit.w * 13.7));
    float wide = uLength * 0.09 * (1.0 - 0.7 * u);
    vec3 world = centre + dir * (u * len) + side * (position.y * 2.0 * wide);
    vUv = vec2(u, position.y + 0.5);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(world, 1.0);
  }
`;

const TAIL_FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  varying vec2 vUv;
  void main() {
    float along = pow(1.0 - vUv.x, 2.0) * smoothstep(0.0, 0.06, vUv.x);
    float across = 1.0 - abs(vUv.y * 2.0 - 1.0);
    float a = along * across * across * uOpacity;
    gl_FragColor = vec4(uColor * a, a);
  }
`;

const DUST_VERT = /* glsl */ `
  varying vec2 vPos;
  void main() {
    vPos = position.xy;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const DUST_FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform float uRadius;
  uniform float uHalf;
  uniform float uAlpha;
  uniform float uSeed;
  uniform float uTime;
  varying vec2 vPos;
  void main() {
    float d = (length(vPos) - uRadius) / uHalf;
    float profile = exp(-d * d * 1.6);
    float ang = atan(vPos.y, vPos.x) + uTime * 0.004;
    // Clumps along the belt: a few slow waves so the band is not a flat ring.
    float clump = 0.55 + 0.25 * sin(ang * 7.0 + uSeed) + 0.2 * sin(ang * 19.0 + uSeed * 2.3 + d * 2.0);
    float a = profile * clump * uAlpha;
    gl_FragColor = vec4(uColor * a, a);
  }
`;

/** A rock template per resource: a low-poly body, irregular for metals, faceted shards for crystals. */
export function rockGeometry(resource: Mineral, seed: number): THREE.BufferGeometry {
  let geo: THREE.BufferGeometry;
  if (resource === 'crystals') {
    // A double-ended shard: an octahedron stretched along y (stretched further per instance).
    geo = new THREE.OctahedronGeometry(1, 0);
  } else {
    geo = new THREE.IcosahedronGeometry(1, resource === 'gases' ? 1 : 0);
    // Push each corner in or out (the same corner moves the same way on every face it is on).
    const rng = new Rng(seed);
    const bumps = Array.from({ length: 8 }, () => rng.range(0.7, 1.3));
    const pos = geo.getAttribute('position') as THREE.BufferAttribute;
    const v = new THREE.Vector3();
    const amount = resource === 'gases' ? 0.6 : 1;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      const k = Math.abs(Math.round(v.x * 7) * 3 + Math.round(v.y * 7) * 5 + Math.round(v.z * 7) * 11) % bumps.length;
      v.multiplyScalar(1 + (bumps[k] - 1) * amount);
      pos.setXYZ(i, v.x, v.y, v.z);
    }
  }
  const flat = geo.index ? geo.toNonIndexed() : geo;
  flat.deleteAttribute('normal');
  flat.deleteAttribute('uv');
  flat.computeVertexNormals();
  makeOutward(flat);
  return flat;
}

/** A field and what it holds now, as the game reports it. */
export interface BeltField {
  readonly field: AsteroidField;
  readonly left: number;
}

export class AsteroidBelt {
  readonly object3d = new THREE.Group();
  /** The belt's centre radius (ly). */
  readonly radius: number;
  readonly field: AsteroidField;
  private readonly rocks: THREE.InstancedMesh;
  private readonly tails: THREE.InstancedMesh | null = null;
  private readonly materials: THREE.ShaderMaterial[] = [];
  private readonly dust: THREE.ShaderMaterial;
  private readonly max: number;
  private readonly dustAlpha: number;

  constructor(field: AsteroidField, place: BeltPlace, starLight: THREE.Color) {
    this.field = field;
    const look = LOOKS[field.resource];
    const seed = hashSeed(field.id, 'belt');
    const rng = new Rng(seed);
    this.max = maxRocks(field.resource, field.capacity);
    const n = this.max;

    // Each rock: where it orbits, how it tumbles, its tint, and a resting rotation and shape.
    const orbit = new Float32Array(n * 4);
    const spin = new Float32Array(n * 4);
    const tint = new Float32Array(n * 3);
    const geo = rockGeometry(field.resource, hashSeed(field.id, 'rock-shape'));
    const rocks = new THREE.InstancedMesh(geo, undefined, n);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), e = new THREE.Euler();
    const ca = new THREE.Color(look.tints[0]), cb = new THREE.Color(look.tints[1]), c = new THREE.Color();
    const axis = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      // Thicker in the middle of the belt, thinning to its edges.
      const across = (rng.next() + rng.next() + rng.next() - 1.5) / 1.5;
      orbit[i * 4] = place.radius + across * place.halfWidth;
      orbit[i * 4 + 1] = rng.range(0, Math.PI * 2);
      orbit[i * 4 + 2] = rng.range(-1, 1) * place.halfWidth * 0.18;
      orbit[i * 4 + 3] = rng.next();
      axis.set(rng.range(-1, 1), rng.range(-1, 1), rng.range(-1, 1));
      if (axis.lengthSq() < 1e-4) axis.set(0, 1, 0);
      axis.normalize();
      spin[i * 4] = axis.x; spin[i * 4 + 1] = axis.y; spin[i * 4 + 2] = axis.z;
      spin[i * 4 + 3] = rng.range(0.15, 0.8) * (rng.chance(0.5) ? 1 : -1);
      c.copy(ca).lerp(cb, rng.next()).multiplyScalar(rng.range(0.8, 1.15));
      tint.set([c.r, c.g, c.b], i * 3);
      // Many small rocks, a few big ones.
      const size = look.size[0] + (look.size[1] - look.size[0]) * Math.pow(rng.next(), 2.2);
      const long = 1 + (look.stretch - 1) * rng.range(0.5, 1);
      if (field.resource === 'crystals') s.set(size * 0.45, size * long * 0.6, size * 0.45);
      else s.set(size * long, size * rng.range(0.7, 1), size * rng.range(0.75, 1.05));
      e.set(rng.range(0, Math.PI * 2), rng.range(0, Math.PI * 2), rng.range(0, Math.PI * 2));
      q.setFromEuler(e);
      m.compose(new THREE.Vector3(), q, s);
      rocks.setMatrixAt(i, m);
    }
    const orbitAttr = new THREE.InstancedBufferAttribute(orbit, 4);
    geo.setAttribute('aOrbit', orbitAttr);
    geo.setAttribute('aSpin', new THREE.InstancedBufferAttribute(spin, 4));
    geo.setAttribute('aTint', new THREE.InstancedBufferAttribute(tint, 3));
    const rockMat = new THREE.ShaderMaterial({
      vertexShader: ROCK_VERT,
      fragmentShader: ROCK_FRAG,
      uniforms: {
        uTime: { value: 0 },
        uRate: { value: ORBIT_RATE },
        uCam: { value: new THREE.Vector3() },
        uStar: { value: starLight.clone() },
        uGlow: { value: new THREE.Color(look.glow) },
        uGlowAmount: { value: look.glowAmount },
        uShine: { value: look.shine },
        uSpecular: { value: look.specular },
        uTwinkle: { value: look.twinkle },
      },
    });
    rocks.material = rockMat;
    this.materials.push(rockMat);
    // Rocks move in the shader: the bounding sphere would only cover their resting shapes.
    rocks.frustumCulled = false;
    rocks.raycast = () => {};
    const cam = new THREE.Vector3();
    rocks.onBeforeRender = (_r, _s, camera) => {
      rockMat.uniforms.uCam.value.copy(rocks.worldToLocal(camera.getWorldPosition(cam)));
    };
    this.rocks = rocks;
    this.object3d.add(rocks);

    if (field.resource === 'gases') {
      const tailGeo = new THREE.PlaneGeometry(1, 1, 4, 1);
      tailGeo.setAttribute('aOrbit', orbitAttr);
      const tailMat = new THREE.ShaderMaterial({
        vertexShader: TAIL_VERT,
        fragmentShader: TAIL_FRAG,
        uniforms: { uTime: { value: 0 }, uRate: { value: ORBIT_RATE }, uLength: { value: 0.02 }, uColor: { value: new THREE.Color('#bfe6ff') }, uOpacity: { value: 0.7 } },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      });
      const tails = new THREE.InstancedMesh(tailGeo, tailMat, n);
      tails.frustumCulled = false;
      tails.raycast = () => {};
      tails.renderOrder = 2;
      this.materials.push(tailMat);
      this.tails = tails;
      this.object3d.add(tails);
    }

    // The dust band: a faint glow along the belt, so it reads as a belt from far out.
    const width = place.halfWidth * 2.2;
    this.dustAlpha = look.dustAlpha;
    this.dust = new THREE.ShaderMaterial({
      vertexShader: DUST_VERT,
      fragmentShader: DUST_FRAG,
      uniforms: {
        uColor: { value: new THREE.Color(look.dust) },
        uRadius: { value: place.radius },
        uHalf: { value: place.halfWidth },
        uAlpha: { value: look.dustAlpha },
        uSeed: { value: (seed % 1000) / 100 },
        uTime: { value: 0 },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    this.materials.push(this.dust);
    const band = new THREE.Mesh(new THREE.RingGeometry(place.radius - width, place.radius + width, 192, 1), this.dust);
    band.rotation.x = -Math.PI / 2;
    band.raycast = () => {};
    band.renderOrder = 1;
    this.object3d.add(band);

    this.radius = place.radius;
  }

  /** Where the belt's label goes (in the star's frame): on its near edge, along `toward` (unit, in the plane). */
  labelAt(toward: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
    return out.copy(toward).multiplyScalar(this.radius);
  }

  /** Show what the field has left: the rock count (and dust) follow it. */
  setLeft(left: number): void {
    const count = visibleRocks(left, this.field.capacity, this.max);
    this.rocks.count = count;
    if (this.tails) this.tails.count = count;
    this.dust.uniforms.uAlpha.value = this.dustAlpha * (0.3 + 0.7 * fullness(left, this.field.capacity));
  }

  /** Rocks shown now (for tests and debugging). */
  get shown(): number {
    return this.rocks.count;
  }

  update(time: number): void {
    for (const m of this.materials) m.uniforms.uTime.value = time;
  }

  dispose(): void {
    this.rocks.dispose();
    this.tails?.dispose();
  }
}
