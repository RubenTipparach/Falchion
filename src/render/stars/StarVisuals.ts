import * as THREE from 'three';
import { STAR_KINDS } from '../../content/stars';
import { SPECTRAL_COLORS, SpectralClass, StarKind, StarSystem, kindOf } from '../../core/galaxy/GalaxyModel';
import { Rng, hashSeed } from '../../core/rng/Rng';
import { NOISE_GLSL } from '../planets/noise.glsl';

/**
 * How each kind of star is drawn in the system view (change worlds-and-stars): main-sequence
 * stars by class, giants, white and brown dwarfs, neutron stars, pulsars with sweeping beams,
 * black holes with a photon ring and a Doppler-brightened accretion disc, the galaxy's central
 * supermassive black hole with jets, and binary or triple companions on small orbits.
 */

/** Radius (ly) of a class G main-sequence star in the system view. */
export const STAR_RADIUS = 0.014;
/** Main-sequence size by class, relative to class G. */
export const CLASS_SCALE: Readonly<Record<SpectralClass, number>> = { O: 1.8, B: 1.5, A: 1.25, F: 1.1, G: 1, K: 0.9, M: 0.75 };
/** Rough masses (suns) for placing a binary's barycentre. */
const CLASS_MASS: Readonly<Record<SpectralClass, number>> = { O: 30, B: 8, A: 2.2, F: 1.4, G: 1, K: 0.75, M: 0.35 };
const KIND_MASS: Partial<Record<StarKind, number>> = { giant: 1.3, 'white-dwarf': 0.6, 'brown-dwarf': 0.06 };

export interface StarVisual {
  readonly object3d: THREE.Group;
  /** Radius of the primary's body (ly). */
  readonly radius: number;
  /** How far from the system's centre the star's parts reach (companions, disc): planets orbit outside it. */
  readonly clearance: number;
  /** Colour (and brightness) of the light the star casts on its planets. */
  readonly light: THREE.Color;
  /** How far above the star its label sits (ly). */
  readonly labelOffset: number;
  update(time: number): void;
  dispose(): void;
}

/** Drawn radius (ly) of a star's primary body. Remnants and dwarfs ignore their class. */
export function starRadius(star: Pick<StarSystem, 'kind' | 'spectral'>): number {
  const kind = kindOf(star);
  if (kind === 'main') return STAR_RADIUS * CLASS_SCALE[star.spectral];
  if (kind === 'giant') return STAR_RADIUS * CLASS_SCALE[star.spectral] * STAR_KINDS.giant.scale;
  return STAR_RADIUS * STAR_KINDS[kind].scale;
}

/** The colour a star is drawn in: its class's for main-sequence stars, its kind's otherwise. */
export function starColor(star: Pick<StarSystem, 'kind' | 'spectral'>): string {
  return STAR_KINDS[kindOf(star)].color ?? SPECTRAL_COLORS[star.spectral];
}

/** Builds the star of a system: its body (or shadow and disc), glow, beams and companions. */
export function createStarVisual(star: StarSystem): StarVisual {
  const kind = kindOf(star);
  const b = new VisualBuilder(new Rng(hashSeed(star.id, 'star-visual')), hashSeed(star.id, 'star'));
  const color = starColor(star);
  const r = starRadius(star);
  let light = new THREE.Color(color).lerp(WHITE, 0.6);
  let clearance = r;
  let labelOffset = r * 2.4;

  // The primary lives in a holder so a binary can swing it round the barycentre.
  const primary = new THREE.Group();
  b.group.add(primary);
  switch (kind) {
    case 'main':
      primary.add(b.body(color, r, MAIN_STYLE));
      primary.add(b.glow(color, r * 9, 0.75, 0.08));
      break;
    case 'giant': {
      const deep = color;
      primary.add(b.body(deep, r, GIANT_STYLE));
      primary.add(b.glow('#ff8a48', r * 5.5, 0.85, 0.05));
      primary.add(b.glow('#ff5a2a', r * 10, 0.28, 0.03));
      light = new THREE.Color(deep).lerp(WHITE, 0.45);
      break;
    }
    case 'white-dwarf':
      primary.add(b.body(color, r, DWARF_STYLE));
      primary.add(b.glow('#dfe9ff', r * 5, 1, 0.04));
      primary.add(b.glow('#b9d0ff', r * 16, 0.45, 0.04));
      primary.add(b.flare('#e8f0ff', r * 26, 0.35));
      break;
    case 'brown-dwarf':
      primary.add(b.body(color, r, BROWN_STYLE));
      primary.add(b.glow('#b03a6e', r * 6, 0.5, 0.06));
      light = new THREE.Color(color).lerp(WHITE, 0.35).multiplyScalar(0.6);
      labelOffset = r * 3;
      break;
    case 'neutron':
      b.compact(primary, color, r);
      labelOffset = r * 8;
      break;
    case 'pulsar': {
      const core = b.compact(primary, color, r);
      b.pulsar(primary, r, core);
      labelOffset = r * 8;
      break;
    }
    case 'black-hole':
      clearance = b.blackHole(primary, r, false);
      light = new THREE.Color(color).lerp(WHITE, 0.15).multiplyScalar(0.55);
      labelOffset = clearance * 1.05;
      break;
    case 'smbh':
      clearance = b.blackHole(primary, r, true);
      light = new THREE.Color(color).lerp(WHITE, 0.15).multiplyScalar(0.55);
      labelOffset = clearance * 0.75;
      break;
  }
  const companions = star.companions ?? [];
  if (companions.length) {
    const mass = KIND_MASS[kind] ?? CLASS_MASS[star.spectral];
    clearance = Math.max(clearance, b.companions(primary, r, mass, companions));
    labelOffset = Math.max(labelOffset, clearance * 1.25);
  }
  return {
    object3d: b.group,
    radius: r,
    clearance,
    light,
    labelOffset,
    update: (t) => b.update(t),
    dispose: () => b.dispose(),
  };
}

// ── Building blocks ────────────────────────────────────────────────

const WHITE = new THREE.Color('#ffffff');

interface SurfaceStyle {
  /** Noise frequency of the granulation (or turbulence for banded dwarfs). */
  readonly gran: number;
  /** Drift speed of the pattern. */
  readonly speed: number;
  /** Star spots, 0..1. */
  readonly spots: number;
  /** Limb darkening exponent (higher: darker edge). */
  readonly limb: number;
  /** How far the bright cells go toward the hot colour, 0..1. */
  readonly hot: number;
  /** The hot colour (default white). */
  readonly hotColor?: string;
  readonly gain: number;
  /** Banded like a cool gas giant (brown dwarfs). */
  readonly bands?: boolean;
  /** Edge turns deep red (giants' cool, extended atmosphere). */
  readonly redLimb?: number;
  /** Turns once per this many seconds (0: still). */
  readonly spin?: number;
}

const MAIN_STYLE: SurfaceStyle = { gran: 6, speed: 0.05, spots: 0.6, limb: 0.45, hot: 0.55, gain: 1.25 };
const GIANT_STYLE: SurfaceStyle = { gran: 2.4, speed: 0.012, spots: 0.3, limb: 0.9, hot: 0.55, hotColor: '#ffcf70', gain: 1.2, redLimb: 0.9, spin: 900 };
const DWARF_STYLE: SurfaceStyle = { gran: 9, speed: 0.08, spots: 0, limb: 0.2, hot: 0.85, gain: 1.6 };
const BROWN_STYLE: SurfaceStyle = { gran: 1.6, speed: 0.02, spots: 0, limb: 0.6, hot: 0.5, gain: 0.85, bands: true, spin: 240 };

const BODY_VERT = /* glsl */ `
varying vec3 vObj; varying vec3 vNormalV; varying vec3 vPosV;
void main() {
  vObj = normalize(position);
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vPosV = mv.xyz;
  vNormalV = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * mv;
}`;

const BODY_FRAG = /* glsl */ `
uniform vec3 uColor; uniform vec3 uHotColor; uniform float uTime; uniform vec3 uSeed;
uniform float uGran; uniform float uSpeed; uniform float uSpots; uniform float uLimb; uniform float uHot;
uniform float uGain; uniform float uBands; uniform float uRedLimb;
varying vec3 vObj; varying vec3 vNormalV; varying vec3 vPosV;
${NOISE_GLSL}
void main() {
  vec3 V = normalize(-vPosV);
  float mu = max(dot(normalize(vNormalV), V), 0.0);
  vec3 p = vObj;
  float t = uTime * uSpeed;
  vec3 col;
  if (uBands > 0.5) {
    // A cool, banded atmosphere: latitude bands warped by turbulence, a few dark storms.
    float warp = fbm(vec3(p.x * uGran, p.y * uGran * 4.0, p.z * uGran) + uSeed + vec3(t, 0.0, t * 0.5));
    float lat = p.y + warp * 0.08;
    float b1 = 0.5 + 0.5 * sin(lat * 11.0 + uSeed.x);
    float b2 = 0.5 + 0.5 * sin(lat * 27.0 + uSeed.y + warp * 1.5);
    vec3 dark = uColor * vec3(0.42, 0.28, 0.36);
    vec3 light = mix(uColor, vec3(0.95, 0.55, 0.62), 0.35);
    col = mix(dark, light, smoothstep(0.15, 0.85, b1 * 0.65 + b2 * 0.35));
    // One or two soft dark storms.
    float storm = smoothstep(0.3, 0.45, snoise(p * 2.2 + uSeed.zyx + vec3(0.0, 0.0, t)));
    col = mix(col, dark * 0.7, storm * 0.45);
    col *= 0.45 + 0.75 * pow(mu, uLimb);
    // Faint heat glow round the limb.
    col += uColor * 0.35 * pow(1.0 - mu, 2.0);
  } else {
    float gran = fbm(p * uGran + uSeed + vec3(t, t * 0.6, 0.0));
    float cells = ridged(p * uGran * 0.5 + uSeed.yzx - vec3(0.0, t * 0.7, 0.0));
    float spots = smoothstep(0.55, 0.8, fbm(p * 2.0 + uSeed.zyx - vec3(0.0, t * 0.4, 0.0))) * uSpots;
    vec3 hot = mix(uColor, uHotColor, uHot);
    col = mix(uColor * 0.82, hot, clamp(0.5 + 0.9 * gran, 0.0, 1.0));
    col *= 0.8 + 0.35 * cells;
    col = mix(col, uColor * 0.4, spots * 0.6);
    col *= 0.5 + 0.62 * pow(mu, uLimb);
    col = mix(col, col * vec3(1.0, 0.45, 0.25), uRedLimb * pow(1.0 - mu, 1.5));
  }
  gl_FragColor = vec4(col * uGain, 1.0);
}`;

const BEAM_VERT = /* glsl */ `
uniform float uLength;
varying vec3 vNormalV; varying vec3 vPosV; varying float vS;
void main() {
  vS = length(position) / uLength;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vPosV = mv.xyz;
  vNormalV = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * mv;
}`;

/** Soft, additive beam or jet: bright along its axis, fading toward the tip; optional knots travelling outward. */
const BEAM_FRAG = /* glsl */ `
uniform vec3 uColor; uniform float uIntensity; uniform float uTime; uniform float uKnots; uniform float uFadePow;
varying vec3 vNormalV; varying vec3 vPosV; varying float vS;
void main() {
  float facing = abs(dot(normalize(vNormalV), normalize(-vPosV)));
  float core = pow(facing, 2.5);
  float along = pow(max(0.0, 1.0 - vS), uFadePow) * smoothstep(0.0, 0.04, vS);
  float knots = mix(1.0, 0.65 + 0.35 * sin(vS * 46.0 - uTime * 2.4) * sin(vS * 17.0 - uTime * 1.1 + 1.3), uKnots);
  float a = core * along * knots * uIntensity;
  gl_FragColor = vec4(mix(uColor, vec3(1.0), core * 0.5 * along), a);
}`;

const DISC_VERT = /* glsl */ `
varying vec2 vP; varying vec3 vPosV; varying vec3 vVelV;
void main() {
  vP = position.xz;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vPosV = mv.xyz;
  // Orbital velocity: counter-clockwise round +y.
  vVelV = mat3(modelViewMatrix) * vec3(position.z, 0.0, -position.x);
  gl_Position = projectionMatrix * mv;
}`;

/**
 * Accretion disc: hot white inside, orange then red outside, streaked by turbulence that orbits
 * faster further in, and Doppler-beamed: the side coming toward the camera is far brighter and
 * bluer, the side going away dimmer and redder.
 */
const DISC_FRAG = /* glsl */ `
uniform float uIn; uniform float uOut; uniform float uTime; uniform vec3 uSeed; uniform float uGain; uniform float uBeaming;
varying vec2 vP; varying vec3 vPosV; varying vec3 vVelV;
${NOISE_GLSL}
void main() {
  float r = length(vP);
  float x = clamp((r - uIn) / (uOut - uIn), 0.0, 1.0);
  float a = atan(vP.y, vP.x);
  float rr = r / uIn;
  float ang = a + uTime * 0.5 * pow(1.0 / rr, 1.5);
  vec2 dir = vec2(cos(ang), sin(ang));
  float streak = fbm(vec3(dir * 1.4, rr * 2.6) + uSeed);
  float fine = snoise(vec3(dir * 3.0, rr * 7.0) + uSeed.zyx);
  float temp = pow(1.0 - x, 1.7);
  vec3 col = mix(vec3(0.5, 0.08, 0.02), vec3(1.0, 0.45, 0.12), smoothstep(0.0, 0.45, temp));
  col = mix(col, vec3(1.0, 0.92, 0.78), smoothstep(0.45, 1.0, temp));
  float doppler = dot(normalize(vVelV), normalize(-vPosV));
  float beam = pow(1.0 + uBeaming * doppler, 3.0);
  col = mix(col, col * vec3(1.15, 0.6, 0.45), clamp(-doppler, 0.0, 1.0) * 0.6);
  col = mix(col, vec3(0.92, 0.95, 1.0), clamp(doppler, 0.0, 1.0) * 0.35 * temp);
  float edge = smoothstep(0.0, 0.05, x) * (1.0 - smoothstep(0.45, 1.0, x));
  float bright = edge * (0.45 + 0.85 * clamp(0.5 + streak, 0.0, 1.2) + 0.15 * fine) * (0.3 + 1.3 * temp) * beam;
  gl_FragColor = vec4(col * bright * uGain, 1.0);
}`;

const HALO_VERT = /* glsl */ `
varying vec2 vC;
void main() {
  vC = position.xy;
  vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  mv.xy += position.xy;
  gl_Position = projectionMatrix * mv;
}`;

/**
 * Seen round the shadow (a camera-facing quad, in units of the shadow's radius): the thin photon
 * ring, and the far side of the disc lensed up over the top of the hole (weaker underneath),
 * brighter on the side that comes toward the camera.
 */
const HALO_FRAG = /* glsl */ `
uniform float uR; uniform vec2 uFar; uniform vec2 uApproach; uniform float uTime; uniform vec3 uSeed; uniform float uLens;
varying vec2 vC;
${NOISE_GLSL}
void main() {
  vec2 c = vC / uR;
  float d = length(c);
  vec2 n = c / max(d, 1e-4);
  float ring = exp(-pow((d - 1.06) / 0.035, 2.0));
  float far = dot(n, uFar);
  float side = dot(n, uApproach);
  float beam = pow(1.0 + 0.5 * side, 3.0);
  float a = atan(n.y, n.x);
  float swirl = fbm(vec3(n * 1.5, d * 4.0 - uTime * 0.25) + uSeed);
  float band = smoothstep(1.08, 1.16, d) * (1.0 - smoothstep(1.2, 1.6, d));
  float lens = band * smoothstep(-0.2, 0.85, far) * (0.7 + 0.6 * swirl) * uLens;
  vec3 lensCol = mix(vec3(1.0, 0.5, 0.16), vec3(1.0, 0.9, 0.72), smoothstep(1.45, 1.12, d));
  vec3 col = vec3(1.0, 0.86, 0.66) * ring * 1.6 + lensCol * lens;
  col *= beam;
  gl_FragColor = vec4(col, 1.0);
}`;

class VisualBuilder {
  readonly group = new THREE.Group();
  private readonly updates: Array<(t: number) => void> = [];
  private readonly sprites: THREE.SpriteMaterial[] = [];

  constructor(private readonly rng: Rng, private readonly seed: number) {}

  update(t: number): void {
    for (const u of this.updates) u(t);
  }

  dispose(): void {
    this.group.traverse((o) => {
      if (o instanceof THREE.Mesh || o instanceof THREE.Line) {
        o.geometry.dispose();
        (o.material as THREE.Material).dispose();
      }
    });
    for (const m of this.sprites) m.dispose();
  }

  /** A shaded star body (sphere), animated. */
  body(color: string, radius: number, style: SurfaceStyle, seed = this.seed): THREE.Mesh {
    const rng = new Rng(seed);
    const material = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color(color) }, uHotColor: { value: new THREE.Color(style.hotColor ?? '#ffffff') }, uTime: { value: 0 },
        uSeed: { value: new THREE.Vector3(rng.range(0, 40), rng.range(0, 40), rng.range(0, 40)) },
        uGran: { value: style.gran }, uSpeed: { value: style.speed }, uSpots: { value: style.spots },
        uLimb: { value: style.limb }, uHot: { value: style.hot }, uGain: { value: style.gain },
        uBands: { value: style.bands ? 1 : 0 }, uRedLimb: { value: style.redLimb ?? 0 },
      },
      vertexShader: BODY_VERT,
      fragmentShader: BODY_FRAG,
    });
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 48, 32), material);
    mesh.rotation.z = style.bands ? rng.range(-0.25, 0.25) : 0;
    const spin = style.spin ?? 0;
    this.updates.push((t) => {
      material.uniforms.uTime.value = t;
      if (spin) mesh.rotation.y = (t / spin) * Math.PI * 2;
    });
    return mesh;
  }

  /** Additive glow sprite; `flicker` is how much its opacity breathes. */
  glow(color: string, size: number, opacity: number, flicker: number, texture = glowTexture()): THREE.Sprite {
    const material = new THREE.SpriteMaterial({ map: texture, color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending });
    this.sprites.push(material);
    const sprite = new THREE.Sprite(material);
    sprite.scale.setScalar(size);
    if (flicker) {
      const phase = this.rng.range(0, 6);
      this.updates.push((t) => (material.opacity = opacity * (1 - flicker + flicker * Math.sin(t * 1.3 + phase))));
    }
    return sprite;
  }

  /** Four-pointed diffraction spikes round a compact, blinding source. */
  flare(color: string, size: number, opacity: number): THREE.Sprite {
    const s = this.glow(color, size, opacity, 0, flareTexture());
    s.material.rotation = this.rng.range(0, Math.PI / 2);
    return s;
  }

  /** A tiny blinding remnant: white-hot core, blue-white glow and spikes. Returns the glow to pulse. */
  compact(parent: THREE.Object3D, color: string, r: number): THREE.Sprite[] {
    const coreMat = new THREE.MeshBasicMaterial({ color: '#f4f9ff' });
    parent.add(new THREE.Mesh(new THREE.SphereGeometry(r, 24, 16), coreMat));
    const inner = this.glow('#eef6ff', r * 9, 1, 0);
    const outer = this.glow(color, r * 24, 0.4, 0.05);
    const spikes = this.flare(color, r * 44, 0.35);
    parent.add(inner, outer, spikes);
    return [inner, outer, spikes];
  }

  /**
   * Pulsar: two opposite beams along the magnetic axis, tilted from the spin axis, sweeping round
   * it; dipole field lines (the magnetosphere) turn with them. The glow flares as a beam crosses
   * the line of sight.
   */
  pulsar(parent: THREE.Object3D, r: number, glows: THREE.Sprite[]): void {
    const spin = new THREE.Group();
    spin.rotation.set(this.rng.range(-0.25, 0.25), 0, this.rng.range(-0.25, 0.25));
    const mag = new THREE.Group();
    mag.rotation.z = this.rng.range(0.45, 0.7);
    spin.add(mag);
    parent.add(spin);

    const length = r * 70;
    const beamGeo = (width: number) => {
      // Open cone, apex at the star, opening along +y.
      const g = new THREE.ConeGeometry(length * width, length, 32, 1, true);
      g.translate(0, -length / 2, 0);
      g.rotateX(Math.PI);
      return g;
    };
    const beamMat = (color: string, intensity: number) => new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(color) }, uIntensity: { value: intensity }, uTime: { value: 0 }, uKnots: { value: 0 }, uFadePow: { value: 1.4 }, uLength: { value: length } },
      vertexShader: BEAM_VERT, fragmentShader: BEAM_FRAG,
      transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    });
    for (const sign of [1, -1]) {
      const outer = new THREE.Mesh(beamGeo(0.13), beamMat('#7fc4ff', 0.55));
      const inner = new THREE.Mesh(beamGeo(0.045), beamMat('#d8ecff', 0.9));
      for (const m of [outer, inner]) {
        m.scale.y = sign;
        m.renderOrder = 2;
        mag.add(m);
      }
    }
    // Dipole field lines r = L sin²θ, in planes round the magnetic axis.
    const lineMat = new THREE.LineBasicMaterial({ color: '#6fa8ff', transparent: true, opacity: 0.16, depthWrite: false, blending: THREE.AdditiveBlending });
    for (const shell of [r * 6, r * 11]) {
      for (let k = 0; k < 6; k++) {
        const phi = (k / 6) * Math.PI * 2;
        const pts: THREE.Vector3[] = [];
        for (let i = 0; i <= 48; i++) {
          const th = 0.12 + (i / 48) * (Math.PI - 0.24);
          const rr = shell * Math.sin(th) ** 2;
          pts.push(new THREE.Vector3(rr * Math.sin(th) * Math.cos(phi), rr * Math.cos(th), rr * Math.sin(th) * Math.sin(phi)));
        }
        mag.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), lineMat.clone()));
      }
    }
    lineMat.dispose();
    const faint = this.glow('#4f7fff', r * 22, 0.18, 0);
    parent.add(faint);

    const period = this.rng.range(3.2, 4.4);
    const base = glows.map((g) => ({ g, opacity: g.material.opacity, scale: g.scale.x }));
    const axis = new THREE.Vector3(), toCam = new THREE.Vector3();
    let flash = 0;
    // The beam's direction against the camera's, once per frame as it is drawn.
    const firstBeam = mag.children[1] as THREE.Mesh;
    firstBeam.onBeforeRender = (_r, _s, camera) => {
      axis.set(0, 1, 0).transformDirection(mag.matrixWorld);
      firstBeam.getWorldPosition(toCam);
      toCam.subVectors(camera.position, toCam).normalize();
      flash = Math.pow(Math.abs(axis.dot(toCam)), 24);
    };
    this.updates.push((t) => {
      spin.rotation.y = (t / period) * Math.PI * 2;
      for (const b of base) {
        b.g.material.opacity = b.opacity * (1 + 1.6 * flash);
        b.g.scale.setScalar(b.scale * (1 + 0.6 * flash));
      }
    });
  }

  /**
   * Black hole: a pure black shadow, its photon ring and lensed halo, and a tilted accretion disc.
   * The supermassive one is larger, with a wider disc and two relativistic jets. Returns how far
   * it reaches (the disc's outer edge).
   */
  blackHole(parent: THREE.Object3D, r: number, supermassive: boolean): number {
    parent.add(new THREE.Mesh(new THREE.SphereGeometry(r, 48, 32), new THREE.MeshBasicMaterial({ color: '#000000' })));
    const inner = r * 1.55, outer = r * (supermassive ? 6.5 : 4.2);

    const axis = new THREE.Group();
    if (supermassive) axis.rotation.set(0.12, 0.35, -1.05);
    else axis.rotation.set(this.rng.range(0.45, 0.8) * (this.rng.chance(0.5) ? 1 : -1), this.rng.range(0, Math.PI * 2), this.rng.range(-0.3, 0.3));
    parent.add(axis);

    const seed = new Rng(hashSeed(this.seed, 'disc'));
    const uSeed = new THREE.Vector3(seed.range(0, 40), seed.range(0, 40), seed.range(0, 40));
    const discGeo = new THREE.RingGeometry(inner, outer, 160, 12);
    discGeo.rotateX(-Math.PI / 2);
    const discMat = new THREE.ShaderMaterial({
      uniforms: { uIn: { value: inner }, uOut: { value: outer }, uTime: { value: 0 }, uSeed: { value: uSeed }, uGain: { value: supermassive ? 0.6 : 1 }, uBeaming: { value: supermassive ? 0.42 : 0.55 } },
      vertexShader: DISC_VERT, fragmentShader: DISC_FRAG,
      transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    });
    const disc = new THREE.Mesh(discGeo, discMat);
    disc.renderOrder = 1;
    axis.add(disc);

    // Photon ring and lensed far side, facing the camera.
    const size = r * 2.2;
    const haloMat = new THREE.ShaderMaterial({
      uniforms: {
        uR: { value: r }, uFar: { value: new THREE.Vector2(0, 1) }, uApproach: { value: new THREE.Vector2(1, 0) },
        uTime: { value: 0 }, uSeed: { value: uSeed }, uLens: { value: supermassive ? 1.1 : 0.9 },
      },
      vertexShader: HALO_VERT, fragmentShader: HALO_FRAG,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const halo = new THREE.Mesh(new THREE.PlaneGeometry(size * 2, size * 2), haloMat);
    halo.frustumCulled = false;
    halo.renderOrder = 2;
    parent.add(halo);
    const n = new THREE.Vector3(), u = new THREE.Vector3(), v = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    const q = new THREE.Quaternion(), view = new THREE.Matrix4();
    halo.onBeforeRender = (_r, _s, camera) => {
      // The disc's axis in view space, then the far side and the approaching side on screen.
      view.multiplyMatrices(camera.matrixWorldInverse, axis.matrixWorld);
      q.setFromRotationMatrix(view);
      n.copy(up).applyQuaternion(q).normalize();
      let farZ = Infinity, appZ = -Infinity;
      for (let i = 0; i < 32; i++) {
        const a = (i / 32) * Math.PI * 2;
        u.set(Math.cos(a), 0, Math.sin(a)).applyQuaternion(q);
        v.crossVectors(n, u);
        if (u.z < farZ && Math.hypot(u.x, u.y) > 1e-3) { farZ = u.z; haloMat.uniforms.uFar.value.set(u.x, u.y).normalize(); }
        if (v.z > appZ && Math.hypot(u.x, u.y) > 1e-3) { appZ = v.z; haloMat.uniforms.uApproach.value.set(u.x, u.y).normalize(); }
      }
    };
    parent.add(this.glow('#ff9a50', r * (supermassive ? 16 : 11), supermassive ? 0.3 : 0.22, 0.04));
    if (supermassive) parent.add(this.glow('#ffcf90', r * 40, 0.12, 0));

    if (supermassive) {
      const length = r * 26;
      const jetMat = (color: string, intensity: number) => new THREE.ShaderMaterial({
        uniforms: { uColor: { value: new THREE.Color(color) }, uIntensity: { value: intensity }, uTime: { value: 0 }, uKnots: { value: 1 }, uFadePow: { value: 1.2 }, uLength: { value: length } },
        vertexShader: BEAM_VERT, fragmentShader: BEAM_FRAG,
        transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
      });
      const jetGeo = (base: number, tip: number) => {
        const g = new THREE.CylinderGeometry(tip, base, length, 24, 1, true);
        g.translate(0, length / 2, 0);
        return g;
      };
      const mats: THREE.ShaderMaterial[] = [];
      for (const sign of [1, -1]) {
        for (const [g, m] of [[jetGeo(r * 0.14, r * 0.8), jetMat('#8fb8ff', 0.4)], [jetGeo(r * 0.05, r * 0.25), jetMat('#e4eeff', 0.7)]] as const) {
          const jet = new THREE.Mesh(g, m);
          jet.scale.y = sign;
          jet.renderOrder = 2;
          axis.add(jet);
          mats.push(m);
        }
      }
      this.updates.push((t) => mats.forEach((m) => (m.uniforms.uTime.value = t)));
    }
    this.updates.push((t) => {
      discMat.uniforms.uTime.value = t;
      haloMat.uniforms.uTime.value = t;
    });
    return outer;
  }

  /**
   * Companions on small orbits: the first pairs with the primary round their barycentre, a second
   * circles the pair further out. Returns how far the system reaches.
   */
  companions(primary: THREE.Object3D, r0: number, m0: number, classes: readonly SpectralClass[]): number {
    const tilt = new THREE.Group();
    tilt.rotation.set(this.rng.range(-0.12, 0.12), 0, this.rng.range(-0.12, 0.12));
    this.group.add(tilt);
    tilt.attach(primary);
    let reach = r0;
    classes.forEach((cls, i) => {
      const rc = STAR_RADIUS * CLASS_SCALE[cls] * 0.85;
      const mc = CLASS_MASS[cls];
      const color = SPECTRAL_COLORS[cls];
      const body = new THREE.Group();
      body.add(this.body(color, rc, MAIN_STYLE, hashSeed(this.seed, 'companion', i)));
      body.add(this.glow(color, rc * 8, 0.6, 0.08));
      const pivot = new THREE.Group();
      const phase = this.rng.range(0, Math.PI * 2);
      let rate: number;
      if (i === 0) {
        const a = r0 + rc + Math.max(0.006, (r0 + rc) * 0.45);
        const d0 = (a * mc) / (m0 + mc), d1 = a - d0;
        primary.position.set(-d0, 0, 0);
        body.position.set(d1, 0, 0);
        pivot.add(primary, body);
        reach = Math.max(d0 + r0, d1 + rc);
        rate = 0.3;
      } else {
        const a = reach + rc + Math.max(0.008, rc * 1.2);
        body.position.set(a, 0, 0);
        pivot.add(body);
        reach = a + rc;
        rate = 0.11;
      }
      tilt.add(pivot);
      this.updates.push((t) => (pivot.rotation.y = phase + t * rate));
    });
    return reach;
  }
}

// ── Textures (generated, no DOM) ───────────────────────────────────

let GLOW: THREE.Texture | null = null;
let FLARE: THREE.Texture | null = null;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** A square texture from a function of (x, y) in [-1, 1]: alpha alone (white), or [r, g, b, a] in 0..1. */
function dataTexture(size: number, pixel: (x: number, y: number) => number | readonly [number, number, number, number]): THREE.Texture {
  const data = new Uint8Array(size * size * 4);
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const x = ((i + 0.5) / size) * 2 - 1, y = ((j + 0.5) / size) * 2 - 1;
      const o = (j * size + i) * 4;
      const p = pixel(x, y);
      const [r, g, bl, a] = typeof p === 'number' ? [1, 1, 1, p] : p;
      data[o] = Math.round(255 * clamp01(r));
      data[o + 1] = Math.round(255 * clamp01(g));
      data[o + 2] = Math.round(255 * clamp01(bl));
      data[o + 3] = Math.round(255 * clamp01(a));
    }
  }
  const tex = new THREE.DataTexture(data, size, size);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}

/** Soft radial glow (bright core, long falloff). */
export function glowTexture(): THREE.Texture {
  GLOW ??= dataTexture(128, (x, y) => {
    const d = Math.hypot(x, y);
    if (d >= 1) return 0;
    if (d < 0.12) return 1 - (d / 0.12) * 0.2;
    if (d < 0.3) return 0.8 - ((d - 0.12) / 0.18) * 0.55;
    return 0.25 * (1 - (d - 0.3) / 0.7) ** 1.5;
  });
  return GLOW;
}

/** Thin four-pointed spikes with a small core. */
function flareTexture(): THREE.Texture {
  FLARE ??= dataTexture(128, (x, y) => {
    const d = Math.hypot(x, y);
    if (d >= 1) return 0;
    const spike = Math.exp(-Math.abs(y) * 70) * (1 - Math.abs(x)) ** 2 + Math.exp(-Math.abs(x) * 70) * (1 - Math.abs(y)) ** 2;
    return spike * 0.9 + Math.exp(-d * 9) * 0.6;
  });
  return FLARE;
}

let MAW: THREE.Texture | null = null;

/**
 * Map marker of the central black hole (normal blending): a black shadow ringed by a thin photon
 * ring, inside a tilted disc that is brighter on its approaching (left) side and passes in front
 * of the shadow below, behind it above; a warm haze round it all.
 */
export function centralBlackHoleTexture(): THREE.Texture {
  MAW ??= dataTexture(128, (x, y) => {
    // Texture rows run bottom to top: y > 0 is the top of the sprite.
    const d = Math.hypot(x, y);
    const shadow = 1 - smooth(0.26, 0.295, d);
    const ring = Math.exp(-(((d - 0.31) / 0.03) ** 2));
    const e = Math.hypot(x / 0.96, y / 0.3);
    const disc = smooth(0.38, 0.46, e) * (1 - smooth(0.75, 1, e)) * (0.6 + 0.4 * -x) * (1.5 - 0.7 * e);
    const haze = Math.exp(-d * 3) * 0.5 * (1 - shadow);
    const front = y < 0 ? disc : 0;
    const back = y < 0 ? 0 : disc * (1 - shadow);
    const light = Math.max(ring * (1 - shadow * 0.2), front, back) + haze;
    const a = clamp01(Math.max(shadow * 0.96, light));
    const hot = clamp01(ring + (1 - e) * 0.8);
    // Warm orange, toward white where hottest; black in the shadow.
    const k = light / Math.max(a, 1e-3);
    return [k, k * (0.55 + 0.4 * hot), k * (0.22 + 0.55 * hot), a];
  });
  MAW.colorSpace = THREE.SRGBColorSpace;
  return MAW;
}

function smooth(e0: number, e1: number, x: number): number {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
}
