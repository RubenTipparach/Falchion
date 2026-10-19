import * as THREE from 'three';
import { MEGA_BY_ID, type MegaType } from '../../content/megastructures';
import { Rng, hashSeed } from '../../core/rng/Rng';

/**
 * Megastructures in the system view (change megastructures): one builder per type, each a group
 * centred on its star (the structure is drawn in the star's frame, light years). Hulls share one
 * shader lit by the star; glows (beams, plasma, circuitry) are additive. Everything is built from
 * the structure's seed, so everyone sees the same one.
 */
export interface MegaVisual {
  readonly object3d: THREE.Group;
  /** How far out the structure reaches (ly): for picking, the label and framing. */
  readonly extent: number;
  /** Animate: `time` in seconds. (Lighting follows the group: its origin is the star.) */
  update(time: number): void;
  dispose(): void;
}

export interface MegaOptions {
  readonly seed: number;
  /** The star's light colour. */
  readonly light: THREE.Color;
  /** How far the star (and its glow, companions or disc) reaches (ly). */
  readonly clearance: number;
}

// ── Shared materials ──────────────────────────────────────────────────

const HULL_VERT = /* glsl */ `
  varying vec3 vW;
  varying vec3 vN;
  varying vec3 vObj;
  varying vec2 vUv;
  void main() {
    vec4 p = vec4(position, 1.0);
    vec3 n = normal;
  #ifdef USE_INSTANCING
    p = instanceMatrix * p;
    n = mat3(instanceMatrix) * n;
  #endif
    vObj = p.xyz;
    vUv = uv;
    vec4 w = modelMatrix * p;
    vW = w.xyz;
    vN = normalize(mat3(modelMatrix) * n);
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;

interface HullOptions {
  readonly front: string;
  readonly back?: string;
  readonly emit?: string;
  /** GLSL that may change `base` and `emit` (vObj, vUv, uTime, vnoise available). */
  readonly pattern?: string;
  readonly side?: THREE.Side;
  /** Choose front or back by which side of the shell (round the star) the camera sees, not by winding. */
  readonly radial?: boolean;
}

/** A hull lit by the star: `front` and `back` faces' colours; `pattern` may change base and emit. */
function hullMaterial(o: HullOptions & { light: THREE.Color; seed: number }): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    side: o.side ?? THREE.FrontSide,
    defines: o.radial ? { RADIAL: '' } : {},
    uniforms: {
      uStar: { value: new THREE.Vector3() },
      uLight: { value: o.light.clone() },
      uFront: { value: new THREE.Color(o.front) },
      uBack: { value: new THREE.Color(o.back ?? o.front) },
      uEmit: { value: new THREE.Color(o.emit ?? '#000000') },
      uTime: { value: 0 },
      uSeed: { value: (o.seed % 1000) / 37 },
    },
    vertexShader: HULL_VERT,
    fragmentShader: /* glsl */ `
      uniform vec3 uStar;
      uniform vec3 uLight;
      uniform vec3 uFront;
      uniform vec3 uBack;
      uniform vec3 uEmit;
      uniform float uTime;
      uniform float uSeed;
      varying vec3 vW;
      varying vec3 vN;
      varying vec3 vObj;
      varying vec2 vUv;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7)) + uSeed) * 43758.5453); }
      float vnoise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0)), u.x), u.y);
      }
      void main() {
        vec3 N = normalize(vN);
        if (!gl_FrontFacing) N = -N;
        vec3 L = normalize(uStar - vW);
        float lit = max(dot(N, L), 0.0);
        // Which side is seen: the face's own winding, or (RADIAL) whether it faces away from the star.
      #ifdef RADIAL
        bool outer = dot(vW - uStar, cameraPosition - vW) > 0.0;
        N = normalize(vW - uStar) * (outer ? 1.0 : -1.0);
        lit = max(dot(N, L), 0.0);
      #else
        bool outer = gl_FrontFacing;
      #endif
        vec3 base = outer ? uFront : uBack;
        vec3 emit = uEmit;
        ${o.pattern ?? ''}
        gl_FragColor = vec4(base * (0.05 + 0.95 * lit) * uLight + emit, 1.0);
      }
    `,
  });
}

/** An additive glow: colour times a fragment `alpha` expression (vUv, vObj and uTime available). */
function glowMaterial(color: string, alpha: string, side: THREE.Side = THREE.DoubleSide): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side,
    uniforms: { uColor: { value: new THREE.Color(color) }, uTime: { value: 0 } },
    vertexShader: HULL_VERT,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uTime;
      varying vec3 vW;
      varying vec3 vN;
      varying vec3 vObj;
      varying vec2 vUv;
      void main() {
        float a = ${alpha};
        gl_FragColor = vec4(uColor * a, a);
      }
    `,
  });
}

/** Collects materials so the visual can light and animate them all. */
class Kit {
  readonly group = new THREE.Group();
  readonly hulls: THREE.ShaderMaterial[] = [];
  readonly glows: THREE.ShaderMaterial[] = [];
  /** Turning parts: each turns about its own axis from the orientation it was built in. */
  readonly spinners: Array<{ o: THREE.Object3D; axis: THREE.Vector3; rate: number; base?: THREE.Quaternion }> = [];
  constructor(readonly o: MegaOptions, readonly rng: Rng) {}
  hull(m: HullOptions): THREE.ShaderMaterial {
    const mat = hullMaterial({ ...m, light: this.o.light, seed: this.o.seed });
    this.hulls.push(mat);
    return mat;
  }
  glow(color: string, alpha: string, side?: THREE.Side): THREE.ShaderMaterial {
    const mat = glowMaterial(color, alpha, side);
    this.glows.push(mat);
    return mat;
  }
  add<T extends THREE.Object3D>(o: T, parent: THREE.Object3D = this.group): T {
    o.raycast = () => {};
    parent.add(o);
    return o;
  }
  spin(o: THREE.Object3D, rate: number, axis = new THREE.Vector3(0, 1, 0)): void {
    this.spinners.push({ o, axis, rate });
  }
  finish(extent: number): MegaVisual {
    const q = new THREE.Quaternion();
    for (const s of this.spinners) s.base = s.o.quaternion.clone();
    // The star is the group's origin, wherever the group is drawn (the system view, a thumbnail).
    const star = new THREE.Vector3();
    const light = (): void => {
      this.group.getWorldPosition(star);
      for (const m of this.hulls) m.uniforms.uStar.value.copy(star);
    };
    this.group.traverse((x) => { if (x instanceof THREE.Mesh) x.onBeforeRender = light; });
    return {
      object3d: this.group,
      extent,
      update: (time) => {
        for (const m of this.hulls) m.uniforms.uTime.value = time;
        for (const m of this.glows) m.uniforms.uTime.value = time;
        for (const s of this.spinners) s.o.quaternion.copy(s.base!).multiply(q.setFromAxisAngle(s.axis, time * s.rate));
      },
      dispose: () => {
        this.group.traverse((x) => {
          if (x instanceof THREE.Mesh || x instanceof THREE.Line || x instanceof THREE.Points) x.geometry.dispose();
        });
        for (const m of [...this.hulls, ...this.glows]) m.dispose();
      },
    };
  }
}

// ── The builders ──────────────────────────────────────────────────────

type Builder = (k: Kit) => MegaVisual;

/** A ring round the star: a continent on its inner face, rim walls, and shadow squares closer in. */
const ringworld: Builder = (k) => {
  const R = Math.max(0.15, k.o.clearance * 5);
  const w = R * 0.11;
  const tilt = new THREE.Group();
  tilt.rotation.set(0.42, 0, 0.12);
  k.add(tilt);
  const land = k.hull({
    front: '#2a2e36', back: '#4c8a4a', side: THREE.DoubleSide,
    pattern: /* glsl */ `
      if (!gl_FrontFacing) {
        // The inner face: seas, plains and mountains, banded across the width, lit from inside.
        float a = atan(vObj.z, vObj.x);
        vec2 q = vec2(a * 60.0, vUv.y * 6.0);
        float n = vnoise(q) * 0.6 + vnoise(q * 3.1) * 0.3 + vnoise(q * 9.0) * 0.1;
        vec3 sea = vec3(0.08, 0.22, 0.42), plain = vec3(0.3, 0.5, 0.24), hill = vec3(0.55, 0.5, 0.38);
        base = n < 0.45 ? sea : mix(plain, hill, smoothstep(0.55, 0.85, n));
        base = mix(base, vec3(0.9), smoothstep(0.82, 0.95, vnoise(q * 0.7 + 30.0)) * 0.5);
        float edge = smoothstep(0.0, 0.06, vUv.y) * smoothstep(1.0, 0.94, vUv.y);
        base = mix(vec3(0.35, 0.33, 0.3), base, edge);
      } else {
        // The hull: dark plating seams.
        base *= 0.8 + 0.2 * step(0.5, fract(atan(vObj.z, vObj.x) * 80.0));
      }
    `,
  });
  k.add(new THREE.Mesh(new THREE.CylinderGeometry(R, R, w, 512, 1, true), land), tilt);
  // Rim walls, reaching in from each edge.
  const wall = k.hull({ front: '#5a5d66', side: THREE.DoubleSide });
  for (const y of [-w / 2, w / 2]) {
    const rim = k.add(new THREE.Mesh(new THREE.RingGeometry(R * 0.985, R, 256), wall), tilt);
    rim.rotation.x = -Math.PI / 2;
    rim.position.y = y;
  }
  // Shadow squares: a ring of dark panels that makes the night as they pass.
  const squares = new THREE.Group();
  k.add(squares, tilt);
  const panel = k.hull({ front: '#14161c', side: THREE.DoubleSide });
  const r2 = Math.max(k.o.clearance * 2.2, R * 0.35);
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const m = k.add(new THREE.Mesh(new THREE.PlaneGeometry(r2 * 0.4, w * 0.8), panel), squares);
    m.position.set(Math.cos(a) * r2, 0, Math.sin(a) * r2);
    m.lookAt(0, 0, 0);
  }
  k.spin(squares, 0.05);
  return k.finish(R * 1.05);
};

/** Collectors on many crossing orbits. */
function swarmRings(k: Kit, inner: number, outer: number, rings: number, perRing: number, color: string): void {
  const plate = new THREE.CircleGeometry(1, 6);
  // Each plate's front faces away from the star: its back is the collector, its front the radiator.
  const mat = k.hull({ front: '#8a7a5a', back: color, side: THREE.DoubleSide,
    pattern: 'emit = outer ? uFront * 0.22 : uBack * 0.15;' });
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  const look = new THREE.Matrix4();
  for (let r = 0; r < rings; r++) {
    const radius = inner + (outer - inner) * (rings === 1 ? 0.5 : r / (rings - 1));
    const orbit = new THREE.Group();
    orbit.rotation.set(k.rng.range(-1.2, 1.2), k.rng.range(0, Math.PI), k.rng.range(-0.6, 0.6));
    const spinner = new THREE.Group();
    orbit.add(spinner);
    const inst = new THREE.InstancedMesh(plate, mat, perRing);
    for (let i = 0; i < perRing; i++) {
      const a = (i / perRing) * Math.PI * 2 + k.rng.range(-0.02, 0.02);
      const rr = radius * k.rng.range(0.97, 1.03);
      p.set(Math.cos(a) * rr, k.rng.range(-1, 1) * radius * 0.015, Math.sin(a) * rr);
      // Each collector faces the star.
      look.lookAt(p, new THREE.Vector3(), new THREE.Vector3(0, 1, 0));
      q.setFromRotationMatrix(look);
      const size = radius * k.rng.range(0.012, 0.022);
      s.set(size, size, size);
      m.compose(p, q, s);
      inst.setMatrixAt(i, m);
    }
    inst.frustumCulled = false;
    k.add(inst, spinner);
    k.add(orbit);
    k.spin(spinner, 0.04 / Math.pow(radius * 12, 1.5) * (r % 2 ? 1 : 1.3));
  }
}

const dysonSwarm: Builder = (k) => {
  const inner = Math.max(0.05, k.o.clearance * 2.2), outer = inner * 2.1;
  swarmRings(k, inner, outer, 9, 360, '#e8b850');
  return k.finish(outer * 1.05);
};

/** A closed shell of plates, a few missing so the star shows through; it glows in the infrared. */
const dysonSphere: Builder = (k) => {
  const R = Math.max(0.07, k.o.clearance * 3);
  const src = new THREE.IcosahedronGeometry(R, 14);
  const pos = src.getAttribute('position');
  const keep: number[] = [];
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), centre = new THREE.Vector3();
  for (let i = 0; i < pos.count; i += 3) {
    // Every face rolls, kept or not, so the gaps stay where they are.
    if (k.rng.chance(0.03)) continue;
    a.fromBufferAttribute(pos, i); b.fromBufferAttribute(pos, i + 1); c.fromBufferAttribute(pos, i + 2);
    centre.copy(a).add(b).add(c).divideScalar(3);
    for (const v of [a, b, c]) { v.lerp(centre, 0.07); keep.push(v.x, v.y, v.z); }
  }
  src.dispose();
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(keep, 3));
  geo.computeVertexNormals();
  const mat = k.hull({ front: '#3a3c44', back: '#7a5430', side: THREE.DoubleSide, radial: true,
    pattern: /* glsl */ `
      // Waste heat: a dull red glow over the shell, brighter in bands; its inner face blazes.
      float band = 0.5 + 0.5 * sin(vObj.y * ${(600 / R).toFixed(1)} + uTime * 0.3);
      emit = outer ? vec3(0.16, 0.03, 0.01) * (0.6 + 0.4 * band) : uBack * 0.3;
    ` });
  const shell = k.add(new THREE.Mesh(geo, mat));
  k.spin(shell, 0.01);
  return k.finish(R * 1.02);
};

/** A Shkadov thruster: a vast curved mirror on one side, the star's pushed light streaming out the other. */
const stellarEngine: Builder = (k) => {
  const R = Math.max(0.09, k.o.clearance * 4);
  const mirror = k.hull({ front: '#6a7282', back: '#e8f0ff', side: THREE.DoubleSide,
    pattern: /* glsl */ `
      // A mirror of panels: its star side blazes with reflected light, its back is lit girders.
      vec2 g = vec2(vUv.x * 90.0, vUv.y * 24.0);
      float seam = min(step(0.9, fract(g.x)) + step(0.9, fract(g.y)), 1.0);
      if (outer) emit = vec3(0.2, 0.23, 0.28) * (1.0 - seam) + vec3(0.4, 0.5, 0.65) * seam * 0.7;
      else emit = uLight * (0.7 - 0.4 * seam);
    ` });
  // A spherical cap facing the star along +x (opening angle about 45°).
  const cap = new THREE.SphereGeometry(R, 96, 48, 0, Math.PI * 2, 0, 0.8);
  const m = k.add(new THREE.Mesh(cap, mirror));
  m.rotation.z = -Math.PI / 2;
  // The jet: the star's light and wind pushed out the far side.
  const len = R * 4.5;
  const jet = new THREE.CylinderGeometry(k.o.clearance * 0.6, k.o.clearance * 1.8, len, 48, 24, true);
  jet.translate(0, -len / 2 - k.o.clearance, 0);
  const plume = k.add(new THREE.Mesh(jet, k.glow('#9fd8ff', /* glsl */ `
    smoothstep(0.0, 0.15, vUv.y) * pow(vUv.y, 1.6) * (0.55 + 0.45 * sin(vUv.y * 40.0 + uTime * 3.0)) * 0.6
  `)));
  plume.rotation.z = -Math.PI / 2;
  return k.finish(R * 1.1);
};

/** Nested shells of computers, each glowing with the waste heat of the one inside. */
const matrioshka: Builder = (k) => {
  const base = Math.max(0.045, k.o.clearance * 2.2);
  const shells = [1, 1.45, 1.95];
  shells.forEach((f, i) => {
    const R = base * f;
    const mat = k.glow(['#ff9adf', '#d47bff', '#8a5aff'][i], /* glsl */ `
      (0.05 + 0.6 * (step(0.93, fract(vUv.x * ${(60 + i * 30).toFixed(1)})) + step(0.93, fract(vUv.y * ${(30 + i * 14).toFixed(1)}))) * (0.4 + 0.6 * step(0.6, fract(sin(floor(vUv.x * ${(60 + i * 30).toFixed(1)}) * 12.9 + floor(vUv.y * ${(30 + i * 14).toFixed(1)}) * 78.2) * 437.5)))
        + 0.5 * pow(0.5 + 0.5 * sin(vUv.x * 300.0 - uTime * ${(1.5 - i * 0.3).toFixed(2)} + vUv.y * 40.0), 30.0)) * ${(0.9 - i * 0.2).toFixed(2)}
    `);
    const shell = k.add(new THREE.Mesh(new THREE.SphereGeometry(R, 96, 64), mat));
    k.spin(shell, (i % 2 ? -1 : 1) * (0.03 - i * 0.008));
  });
  return k.finish(base * 2);
};

/** A flat disc reaching far out from the star, which sits in a hole at its centre. */
const aldersonDisk: Builder = (k) => {
  const inner = Math.max(0.03, k.o.clearance * 1.6), outer = Math.max(0.3, inner * 8);
  const mat = k.hull({ front: '#3a6a3a', back: '#3a3a40', side: THREE.DoubleSide,
    pattern: /* glsl */ `
      float r = length(vObj.xy);
      float a = atan(vObj.y, vObj.x);
      vec2 q = vec2(a * 40.0, r * 160.0);
      float n = vnoise(q) * 0.6 + vnoise(q * 3.0) * 0.3 + vnoise(q * 8.0) * 0.1;
      // Scorched and molten near the star, temperate further out, frozen at the rim.
      float t = smoothstep(${inner.toFixed(4)}, ${outer.toFixed(4)}, r);
      vec3 hot = vec3(0.45, 0.2, 0.1), mild = n < 0.45 ? vec3(0.1, 0.25, 0.45) : vec3(0.32, 0.48, 0.24), cold = vec3(0.8, 0.85, 0.9);
      base = t < 0.12 ? mix(hot, mild, smoothstep(0.04, 0.12, t)) : mix(mild, cold, smoothstep(0.6, 0.95, t));
      base *= 0.85 + 0.15 * step(0.5, fract(r * 120.0));
      // The star's light grazes it: day all over, brightest near the star.
      emit = base * (1.1 - 0.8 * t);
      base *= 0.0;
    ` });
  const disc = k.add(new THREE.Mesh(new THREE.RingGeometry(inner, outer, 256, 12), mat));
  disc.rotation.x = -Math.PI / 2 + 0.3;
  disc.rotation.y = 0.2;
  // Its rim, a wall thousands of km high.
  const rim = k.add(new THREE.Mesh(new THREE.CylinderGeometry(outer, outer, outer * 0.012, 256, 1, true), k.hull({ front: '#4a4a52', side: THREE.DoubleSide })), disc);
  rim.rotation.x = Math.PI / 2;
  return k.finish(outer);
};

/** Accelerator rings over the poles drawing plasma off the star in streams. */
const starLifter: Builder = (k) => {
  const c = k.o.clearance;
  const metal = k.hull({ front: '#8a8e98', emit: '#000000' });
  const plasma = k.glow('#ff7a4a', 'pow(sin(vUv.x * 3.14159), 2.0) * (0.35 + 0.35 * sin(vUv.x * 60.0 - uTime * 4.0))');
  for (const side of [1, -1]) {
    const y = side * c * 2.6;
    for (let i = 0; i < 3; i++) {
      const ring = k.add(new THREE.Mesh(new THREE.TorusGeometry(c * (0.9 + i * 0.35), c * 0.05, 12, 128), metal));
      ring.rotation.x = Math.PI / 2;
      ring.position.y = y + side * i * c * 0.35;
    }
    // Streams curling up from the star's surface into the rings.
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + k.rng.range(-0.2, 0.2);
      const pts = Array.from({ length: 12 }, (_, j) => {
        const t = j / 11;
        const r = c * (0.95 + 0.4 * Math.sin(t * Math.PI)) * (1 - 0.35 * t);
        const tw = a + t * 1.4 * side;
        return new THREE.Vector3(Math.cos(tw) * r, side * (c * 0.4 + t * c * 2.3), Math.sin(tw) * r);
      });
      k.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 48, c * 0.07, 8), plasma));
    }
  }
  // Collector stations round the equator.
  const station = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.4, 0.6), metal, 24);
  const m = new THREE.Matrix4();
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    m.makeRotationY(-a).setPosition(Math.cos(a) * c * 3.2, 0, Math.sin(a) * c * 3.2);
    m.scale(new THREE.Vector3(c * 0.25, c * 0.25, c * 0.25));
    station.setMatrixAt(i, m);
  }
  station.frustumCulled = false;
  const belt = k.add(new THREE.Group());
  k.add(station, belt);
  k.spin(belt, 0.03);
  return k.finish(c * 3.6);
};

/** A swarm focused into one beam, lancing out of the system. */
const nicollDyson: Builder = (k) => {
  const inner = Math.max(0.05, k.o.clearance * 2.2);
  swarmRings(k, inner, inner * 1.6, 5, 300, '#f0f4ff');
  // The emitter: a lens ring, and the beam leaving through it.
  const dir = new THREE.Group();
  dir.rotation.set(0, 0.6, 0.18);
  k.add(dir);
  const lens = k.add(new THREE.Mesh(new THREE.TorusGeometry(inner * 0.5, inner * 0.04, 16, 128), k.hull({ front: '#d0d8f0', emit: '#203060' })), dir);
  lens.position.x = inner * 1.9;
  lens.rotation.y = Math.PI / 2;
  const len = 3;
  const beam = new THREE.CylinderGeometry(inner * 0.08, inner * 0.08, len, 24, 1, true);
  beam.translate(0, len / 2, 0);
  const b = k.add(new THREE.Mesh(beam, k.glow('#e8f4ff', '0.9 * (0.75 + 0.25 * sin(vUv.y * 400.0 - uTime * 8.0)) * (1.0 - vUv.y * 0.6)')), dir);
  b.rotation.z = -Math.PI / 2;
  b.position.x = inner * 1.9;
  const core = new THREE.CylinderGeometry(inner * 0.25, inner * 0.25, len, 24, 1, true);
  core.translate(0, len / 2, 0);
  const halo = k.add(new THREE.Mesh(core, k.glow('#7ab0ff', '0.18 * (1.0 - vUv.y)')), dir);
  halo.rotation.z = -Math.PI / 2;
  halo.position.x = inner * 1.9;
  return k.finish(inner * 2.2);
};

/** A lattice round a black hole, firing matter into it and catching the energy back. */
const penroseSphere: Builder = (k) => {
  const R = Math.max(0.06, k.o.clearance * 1.6);
  const edges = new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(R, 2));
  const lineMat = new THREE.LineBasicMaterial({ color: '#ffb36b', transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false });
  const lattice = k.add(new THREE.LineSegments(edges, lineMat));
  k.spin(lattice, 0.02, new THREE.Vector3(0.2, 1, 0).normalize());
  // Collector nodes at the lattice's vertices.
  const ico = new THREE.IcosahedronGeometry(R, 0);
  const verts = ico.getAttribute('position');
  const node = k.hull({ front: '#b0a090', emit: '#ff8a30' });
  const seen = new Set<string>();
  for (let i = 0; i < verts.count; i++) {
    const v = new THREE.Vector3().fromBufferAttribute(verts, i);
    const key = v.toArray().map((x) => x.toFixed(4)).join();
    if (seen.has(key)) continue;
    seen.add(key);
    const n = k.add(new THREE.Mesh(new THREE.OctahedronGeometry(R * 0.06), node), lattice);
    n.position.copy(v);
  }
  ico.dispose();
  // Matter spiralling in.
  const pts: number[] = [];
  for (let i = 0; i < 1200; i++) {
    const t = i / 1200, a = t * 40 + k.rng.range(-0.1, 0.1), r = R * (1 - t * 0.85);
    pts.push(Math.cos(a) * r, k.rng.range(-1, 1) * R * 0.04 * (1 - t), Math.sin(a) * r);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  const spiral = k.add(new THREE.Points(g, new THREE.PointsMaterial({ color: '#ffd090', size: R * 0.015, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false })));
  k.spin(spiral, 0.4);
  const visual = k.finish(R * 1.05);
  const dispose = visual.dispose;
  return { ...visual, dispose: () => { dispose(); lineMat.dispose(); (spiral.material as THREE.Material).dispose(); } };
};

/** A cage of tethers round a neutron star, cutting matter from its crust. */
const neutronForge: Builder = (k) => {
  const R = Math.max(0.05, k.o.clearance * 4);
  const metal = k.hull({ front: '#9aa4b8', emit: '#0a1a2a' });
  const cage = k.add(new THREE.Group());
  for (let i = 0; i < 3; i++) {
    const ring = k.add(new THREE.Mesh(new THREE.TorusGeometry(R, R * 0.025, 12, 160), metal), cage);
    ring.rotation.set(i === 0 ? Math.PI / 2 : 0, i === 1 ? Math.PI / 2 : 0, i === 2 ? Math.PI / 3 : 0);
  }
  // Tethers from the cage down to the star, and forge platforms where they meet the cage.
  const tether = k.glow('#9fe8ff', '0.35 + 0.35 * pow(0.5 + 0.5 * sin(vUv.y * 30.0 + uTime * 5.0), 4.0)');
  const ico = new THREE.IcosahedronGeometry(1, 0);
  const dirs = ico.getAttribute('position');
  const seen = new Set<string>();
  for (let i = 0; i < dirs.count; i++) {
    const d = new THREE.Vector3().fromBufferAttribute(dirs, i).normalize();
    const key = d.toArray().map((x) => x.toFixed(3)).join();
    if (seen.has(key)) continue;
    seen.add(key);
    const len = R - k.o.clearance * 1.2;
    const t = k.add(new THREE.Mesh(new THREE.CylinderGeometry(R * 0.006, R * 0.006, len, 6, 1, true), tether), cage);
    t.position.copy(d).multiplyScalar(k.o.clearance * 1.2 + len / 2);
    t.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d);
    const p = k.add(new THREE.Mesh(new THREE.BoxGeometry(R * 0.12, R * 0.05, R * 0.12), metal), cage);
    p.position.copy(d).multiplyScalar(R);
    p.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d);
  }
  ico.dispose();
  k.spin(cage, 0.05, new THREE.Vector3(0.3, 1, 0.1).normalize());
  return k.finish(R * 1.08);
};

/** A habitat tube looping round its star again and again, knotted like a garland. */
const topopolis: Builder = (k) => {
  const R = Math.max(0.08, k.o.clearance * 4);
  const mat = k.hull({ front: '#a0a8b8', emit: '#000000',
    pattern: /* glsl */ `
      // Windows along the tube, and a lit strip of its habitat side.
      float strip = smoothstep(0.46, 0.5, vUv.y) * smoothstep(0.62, 0.58, vUv.y);
      float win = step(0.6, fract(vUv.x * 2400.0)) * step(0.3, fract(vUv.y * 8.0)) * step(fract(vUv.y * 8.0), 0.7);
      base = mix(base, vec3(0.3, 0.55, 0.3), strip);
      emit = vec3(1.0, 0.85, 0.55) * win * 0.5 + vec3(0.2, 0.5, 0.45) * strip * 0.3 + base * 0.12;
    ` });
  const knot = new THREE.TorusKnotGeometry(R, R * 0.05, 1400, 12, 7, 3);
  const mesh = k.add(new THREE.Mesh(knot, mat));
  mesh.rotation.x = Math.PI / 2;
  mesh.scale.set(1, 1, 0.35);
  k.spin(mesh, 0.01, new THREE.Vector3(0, 0, 1));
  return k.finish(R * 1.6);
};

const BUILDERS: Readonly<Record<MegaType, Builder>> = {
  ringworld, 'dyson-swarm': dysonSwarm, 'dyson-sphere': dysonSphere, 'stellar-engine': stellarEngine,
  'matrioshka-brain': matrioshka, 'alderson-disk': aldersonDisk, 'star-lifter': starLifter,
  'nicoll-dyson-beam': nicollDyson, 'penrose-sphere': penroseSphere, 'neutron-forge': neutronForge, topopolis,
};

/** Build a megastructure round its star. */
export function createMegaVisual(type: MegaType, o: MegaOptions): MegaVisual {
  const k = new Kit(o, new Rng(hashSeed(o.seed, 'mega', type)));
  k.group.name = MEGA_BY_ID[type].name;
  return BUILDERS[type](k);
}
