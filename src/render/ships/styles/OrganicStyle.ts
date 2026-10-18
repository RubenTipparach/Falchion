import * as THREE from 'three';
import type { PartType, ShipKit } from '../ShipKit';
import type { ShipStyleGenerator } from '../ShipStyleGenerator';
import { makeOutward } from '../../geometry/orientation';
import { organicAccent } from './accents';

/**
 * Organic: living ships, grown rather than built. Each seed picks one body plan: a squid with
 * trailing tendrils, a manta with wide wings, a beetle under a plated shell, or a long serpent of
 * many segments. All four share one vocabulary: lathed bodies, overlapping segments, tapered
 * tendrils and mandible prongs at the bow, spines along the back and glowing sacs. The design's
 * size sets how much grows: a few of each on a darting larva, many on a leviathan.
 */

type Vec3 = [number, number, number];
type Plan = 'squid' | 'manta' | 'beetle' | 'serpent';

/** What the shared build needs from a body plan. */
interface Body {
  /** Height of the outer surface above the centreline at z (turrets sit on it). */
  top(z: number): number;
  /** Half-width of the body at z (side turrets sit on it). */
  half(z: number): number;
  /** Nozzle centres for n engines at the stern. */
  engines(n: number, nozzle: number): Vec3[];
}

/** A dome-shaped segment, used to find the surface under a point along the body. */
interface Dome {
  zc: number;
  half: number;
  R: number;
  /** Height of the dome relative to its radius (a flattened carapace is below 1). */
  k: number;
  /** Height of its centre. */
  y: number;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** A whole number that grows from lo (a larva) to hi (a leviathan) as t goes 0 to 1. */
const grow = (lo: number, hi: number, t: number) => Math.round(lerp(lo, hi, t));

/** Lathe profile samples [radius, z] from z0 to z1; shape(u) gives the radius at fraction u. */
function profile(z0: number, z1: number, n: number, shape: (u: number) => number): Array<[number, number]> {
  return Array.from({ length: n + 1 }, (_, i) => {
    const u = i / n;
    return [Math.max(0, shape(u)), lerp(z0, z1, u)] as [number, number];
  });
}

/**
 * A segment of length len, radius r and height k*r (a lathe scaled from a unit profile). `blunt`
 * below 0.5 gives a flat-sided plate with rounded ends; 0.5 gives an egg.
 */
function capsule(kit: ShipKit, len: number, r: number, k: number, material: THREE.Material, segments = 12, blunt = 0.5): THREE.Mesh {
  const m = kit.lathe(profile(-len / 2, len / 2, 6, (u) => Math.pow(Math.sin(Math.PI * u), blunt)), material, segments);
  m.scale.set(r, r * k, 1);
  return m;
}

/**
 * A tube along a CatmullRom curve that tapers from r0 at its first point to r1 at its last:
 * tendrils, mandibles and horns. Built here (not with kit.tube) so it can taper with few faces.
 */
function taper(kit: ShipKit, pts: Vec3[], r0: number, r1: number, material: THREE.Material, type: PartType): void {
  const curve = new THREE.CatmullRomCurve3(pts.map(([x, y, z]) => new THREE.Vector3(x, y, z)));
  const SEG = 12, RAD = 5;
  const frames = curve.computeFrenetFrames(SEG, false);
  const pos: number[] = [];
  for (let i = 0; i <= SEG; i++) {
    const t = i / SEG;
    const c = curve.getPointAt(t), n = frames.normals[i], b = frames.binormals[i];
    const r = lerp(r0, r1, t);
    for (let j = 0; j <= RAD; j++) {
      const a = (j / RAD) * Math.PI * 2, ca = Math.cos(a) * r, sa = Math.sin(a) * r;
      pos.push(c.x + n.x * ca + b.x * sa, c.y + n.y * ca + b.y * sa, c.z + n.z * ca + b.z * sa);
    }
  }
  const idx: number[] = [];
  for (let i = 0; i < SEG; i++) {
    for (let j = 0; j < RAD; j++) {
      const a = i * (RAD + 1) + j, b = a + RAD + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  makeOutward(geo);
  kit.add(new THREE.Mesh(geo, material), type);
}

/** A cone spine standing on (x, y, z) and leaning back by `tilt` radians. */
function spike(kit: ShipKit, x: number, y: number, z: number, r: number, len: number, tilt: number, material: THREE.Material): void {
  const m = kit.cyl(r, r * 0.1, len, material, 6);
  m.rotation.x = tilt;
  // The cone's tip points along (0, sin tilt, -cos tilt); its centre sits half a length out from the base.
  const d = len * 0.45;
  kit.add(m, 'detail', x, y + Math.sin(tilt) * d, z - Math.cos(tilt) * d);
}

/** A bioluminescent sac: an accent sphere that breathes. */
function sac(kit: ShipKit, x: number, y: number, z: number, r: number, stretch: Vec3): void {
  const [sx, sy, sz] = stretch;
  const m = kit.sphere(r, kit.mat.accent, sx, sy, sz, 8);
  kit.add(m, 'detail', x, y, z);
  const ph = kit.rng.next() * 6;
  kit.onAnimate((t) => {
    const k = 1 + 0.12 * Math.sin(t * 2.2 + ph);
    m.scale.set(sx * k, sy * k, sz * k);
  });
}

/** Engine nozzles on a ring behind the stern, wide enough that their nozzles do not touch. */
function ringAt(kit: ShipKit, n: number, nozzle: number, z: number, cx = 0, cy = 0): Vec3[] {
  const radius = Math.max(kit.B * 0.16, (nozzle * n * 1.4) / Math.PI);
  return kit.ringSlots(n, radius).map(([x, y]): Vec3 => [cx + x, cy + y, z]);
}

/** The surface of a chain of domes at z: its height (top) or its half-width. */
function surface(domes: Dome[], z: number, key: 'top' | 'half'): number {
  let best = 0;
  for (const d of domes) {
    const v = (z - d.zc) / d.half;
    if (Math.abs(v) >= 1) continue;
    const s = Math.sqrt(1 - v * v);
    best = Math.max(best, key === 'top' ? d.y + d.R * d.k * s : d.R * s);
  }
  return best;
}

/** Squid: a bulbous mantle full at the bow, a flat diamond fin at the stern, tendrils trailing from under the head. */
function squid(kit: ShipKit, t: number): Body {
  const { L, B, rng, mat } = kit;
  const h = L / 2;
  const R = (z: number) => B * 0.52 * Math.pow(Math.sin(Math.PI * Math.pow(clamp01((z + h) / L), 0.85)), 0.55);
  kit.add(kit.lathe(profile(-h, h, 20, (u) => R(lerp(-h, h, u))), mat.hull, 16), 'hull');

  // Mandible prongs at the bow, hooking in.
  for (const s of [1, -1]) {
    taper(kit, [
      [s * 0.08 * B, -0.04 * B, h - 0.14 * L],
      [s * 0.1 * B, -0.08 * B, h - 0.03 * L],
      [s * 0.07 * B, -0.1 * B, h + 0.08 * B],
      [s * 0.01 * B, -0.09 * B, h + 0.2 * B],
    ], 0.05 * B, 0.01 * B, mat.hull, 'detail');
  }

  // Tendrils trailing back from under the mantle, in mirrored pairs.
  for (let i = 0; i < grow(2, 3, t); i++) {
    const z0 = -h + L * rng.range(0.4, 0.7), len = L * rng.range(0.5, 0.85);
    const r0 = R(z0), droop = B * rng.range(0.3, 0.6), sway = B * rng.range(0.2, 0.5), ph = rng.range(0, 6);
    for (const s of [1, -1]) {
      const pts = [0, 0.25, 0.5, 0.75, 1].map((u): Vec3 => [
        s * (r0 * 0.5 + sway * u * u),
        -r0 * 0.5 - droop * u + Math.sin(u * 6 + ph) * 0.03 * B,
        z0 - len * u,
      ]);
      taper(kit, pts, 0.045 * B, 0.006 * B, mat.detail, 'detail');
    }
  }

  // Tail fin: a flat diamond of plate, spread wide and thin.
  const fin = kit.lathe(profile(-h + 0.1 * L, -h + 0.4 * L, 12, (u) => Math.pow(1 - Math.abs(2 * u - 1), 0.7)), mat.detail, 16);
  fin.scale.set(0.75 * B, 0.1 * B, 1);
  kit.add(fin, 'wing');

  // Dorsal spines along the mantle, leaning back.
  const spines = grow(3, 8, t);
  for (let i = 0; i < spines; i++) {
    const z = lerp(-h + 0.3 * L, h - 0.25 * L, (i + 0.5) / spines);
    spike(kit, 0, R(z) * 0.92, z, 0.05 * B, B * lerp(0.35, 0.55, t), 0.6, mat.detail);
  }

  // Glowing sacs along the flanks, and one on the head.
  for (let i = 0; i < grow(1, 3, t); i++) {
    const z = -h + L * (0.45 + 0.12 * i), s = i % 2 ? 1 : -1;
    sac(kit, s * R(z) * 0.85, 0, z, 0.09 * B, [1, 0.9, 1.4]);
  }
  sac(kit, 0, R(h - 0.2 * L) * 0.95, h - 0.2 * L, 0.11 * B, [1, 0.8, 1.2]);

  return {
    top: (z) => R(z) * 0.92,
    half: (z) => R(z),
    engines: (n, nozzle) => ringAt(kit, n, nozzle, -h + 0.02 * L, 0, -0.04 * B),
  };
}

/** Manta: a flat wide disc with cephalic lobes curling in at the bow and a long whip behind. */
function manta(kit: ShipKit, t: number): Body {
  const { L, B, rng, mat } = kit;
  const h = L / 2;
  const W = B * lerp(0.8, 1.0, t), T = B * 0.13;
  const shape = (u: number) => Math.pow(Math.sin(Math.PI * Math.pow(clamp01(u), 0.7)), 0.6);
  // The unit disc is stretched to the width and the thickness: a flat plan shaped by the profile.
  const disc = kit.lathe(profile(-h, h, 16, shape), mat.hull, 16);
  disc.scale.set(W, T, 1);
  kit.add(disc, 'hull');

  // Swept wings: a long flattened lobe on each side, its tip out and back, so the span dominates.
  const a = 0.9 * W;
  for (const s of [1, -1]) {
    const wing = kit.lathe(profile(-a, a, 10, (u) => Math.pow(Math.sin(Math.PI * u), 0.6)), mat.hull, 12);
    wing.scale.set(0.7 * W, T * 1.6, 1);
    wing.rotation.y = s * (Math.PI - 1.0);
    kit.add(wing, 'wing', s * 0.9 * W, 0, -h + 0.5 * L);
  }

  // Cephalic lobes: mandible-like prongs curling in at the bow.
  const zc = -h + 0.8 * L, wc = W * shape(0.8);
  for (const s of [1, -1]) {
    taper(kit, [
      [s * wc * 0.9, 0, zc],
      [s * wc * 1.05, -0.02 * B, zc + 0.1 * L],
      [s * wc * 0.7, -0.03 * B, zc + 0.15 * L],
      [s * wc * 0.25, -0.02 * B, zc + 0.18 * L],
    ], 0.06 * B, 0.012 * B, mat.hull, 'detail');
  }

  // A long whip trailing from the stern.
  const sway = 0.03 * B * Math.sin(rng.range(0, 6)), len = L * rng.range(0.5, 0.8);
  taper(kit, [
    [0, 0, -h + 0.05 * L],
    [0.03 * B, 0, -h - len * 0.3],
    [-0.02 * B, 0.01 * B, -h - len * 0.65],
    [sway, 0, -h - len],
  ], 0.035 * B, 0.004 * B, mat.detail, 'detail');

  // Glowing sacs on the upper wing, alternating sides.
  const sacs = grow(2, 5, t);
  for (let i = 0; i < sacs; i++) {
    const u = lerp(0.3, 0.8, (i + 0.5) / sacs), s = i % 2 ? 1 : -1;
    sac(kit, s * W * shape(u) * 0.55, T * shape(u) * 0.9, lerp(-h, h, u), 0.08 * B, [1, 0.5, 1.2]);
  }

  // Engines spread across the trailing edge.
  const zE = -h + 0.12 * L, wE = W * shape(0.12) * 0.7;
  return {
    top: (z) => T * shape((z + h) / L) * 0.95,
    half: (z) => W * shape((z + h) / L),
    engines: (n) => kit.symmetricSlots(n, wE).map((x): Vec3 => [x, -T * 0.4, zE]),
  };
}

/** Beetle: a domed carapace of overlapping plates, smaller toward the stern, under a horned head. */
function beetle(kit: ShipKit, t: number): Body {
  const { L, B, mat } = kit;
  const h = L / 2;
  const plates = grow(3, 6, t);
  const start = h - 0.2 * L, span = start + h;
  const domes: Dome[] = [];
  for (let i = 0; i < plates; i++) {
    const seg = span / plates, len = seg * 1.4;
    const zc = start - (i + 0.5) * seg;
    const R = B * lerp(0.62, 0.3, i / Math.max(1, plates - 1));
    kit.add(capsule(kit, len, R, 0.55, mat.hull, 12), 'hull', 0, 0.02 * B, zc);
    domes.push({ zc, half: len / 2, R, k: 0.55, y: 0.02 * B });
  }

  // The head: a rounded bulb with two mandible prongs and eyes.
  const headR = B * 0.34, headLen = 0.24 * L, zh = h - headLen / 2;
  kit.add(capsule(kit, headLen, headR, 0.8, mat.hull, 12), 'hull', 0, 0, zh);
  domes.push({ zc: zh, half: headLen / 2, R: headR, k: 0.8, y: 0 });
  for (const s of [1, -1]) {
    taper(kit, [
      [s * 0.12 * B, 0.02 * B, h - 0.1 * L],
      [s * 0.22 * B, 0.04 * B, h - 0.02 * L],
      [s * 0.22 * B, 0.02 * B, h + 0.1 * B],
      [s * 0.08 * B, 0, h + 0.2 * B],
    ], 0.06 * B, 0.012 * B, mat.detail, 'detail');
    sac(kit, s * 0.14 * B, 0.1 * B, h - 0.14 * L, 0.05 * B, [1, 1, 1]);
  }

  return {
    top: (z) => surface(domes, z, 'top'),
    half: (z) => surface(domes, z, 'half'),
    engines: (n, nozzle) => ringAt(kit, n, nozzle, -h + 0.04 * L, 0, -0.02 * B),
  };
}

/** Serpent: a long chain of overlapping segments that slither, shrinking to the tail, spined along the back. */
function serpent(kit: ShipKit, t: number): Body {
  const { L, B, rng, mat } = kit;
  const h = L / 2;
  const n = grow(4, 10, t), seg = L / n, phase = rng.range(0, 6);
  const domes: Dome[] = [];
  const segs: Array<{ x: number; y: number; zc: number; R: number; len: number }> = [];
  for (let i = 0; i < n; i++) {
    const f = i / Math.max(1, n - 1);
    // Segments overlap heavily so the body reads as one continuous form, tapering smoothly.
    const len = seg * 2.8, zc = h - (i + 0.5) * seg;
    const R = i === 0 ? B * 0.5 : B * lerp(0.4, 0.2, f);
    const x = i === 0 ? 0 : B * 0.06 * Math.sin(i * 0.9 + phase);
    const y = B * 0.03 * Math.sin(i * 0.6 + phase);
    kit.add(capsule(kit, len, R, 0.8, mat.hull, 6, 0.3), 'hull', x, y, zc);
    domes.push({ zc, half: len / 2, R, k: 0.8, y });
    segs.push({ x, y, zc, R, len });
  }

  // A continuous dorsal ridge running the length of the body, tapering to the tail.
  const ridge = segs.map((s): Vec3 => [s.x, s.y + s.R * 0.7, s.zc]);
  taper(kit, ridge, 0.06 * B, 0.012 * B, mat.detail, 'detail');
  // Spines on the ridge, every other segment.
  segs.forEach((s, i) => {
    if (i % 2 === 0) spike(kit, s.x, s.y + s.R * 0.8, s.zc, 0.03 * B, s.R * 1.1, 0.6, mat.detail);
  });

  // Mandible prongs at the head, and eyes.
  const head = segs[0], zf = head.zc + head.len / 2;
  for (const s of [1, -1]) {
    taper(kit, [
      [s * 0.12 * B, head.y - 0.03 * B, zf - 0.25 * B],
      [s * 0.2 * B, head.y - 0.05 * B, zf + 0.1 * B],
      [s * 0.12 * B, head.y - 0.07 * B, zf + 0.4 * B],
      [s * 0.02 * B, head.y - 0.07 * B, zf + 0.55 * B],
    ], 0.06 * B, 0.012 * B, mat.hull, 'detail');
    sac(kit, s * 0.22 * B, head.y + 0.1 * B, zf - 0.3 * B, 0.07 * B, [1, 1, 1]);
  }

  // Glowing sacs down the flanks.
  for (let i = 0; i < grow(1, 4, t); i++) {
    const g = segs[Math.min(n - 1, 2 + 2 * i)], s = i % 2 ? 1 : -1;
    sac(kit, g.x + s * g.R * 0.85, g.y, g.zc, 0.09 * B, [0.8, 0.8, 1.3]);
  }

  const tail = segs[n - 1];
  return {
    top: (z) => surface(domes, z, 'top'),
    half: (z) => surface(domes, z, 'half'),
    engines: (k, nozzle) => ringAt(kit, k, nozzle, -h + 0.04 * L, tail.x, tail.y),
  };
}

export const OrganicStyle: ShipStyleGenerator = {
  id: 'organic',
  name: 'Organic',
  description: 'Grown, not built: a squid, ray, beetle or serpent with tendrils, plated segments, spines and glowing sacs.',
  accent: organicAccent,
  build(kit: ShipKit) {
    const { L, B, rng } = kit;
    const h = L / 2;
    // 0 for a small larva, 1 for a leviathan: how much grows.
    const t = clamp01(((kit.design.length + kit.design.bulk) / 2 - 0.5) / 1.5);
    // Larvae are mostly squid and serpents; leviathans mostly rays and beetles.
    const plan = rng.weighted<Plan>([
      ['squid', lerp(4, 2, t)],
      ['serpent', 1.5],
      ['manta', lerp(1, 3, t)],
      ['beetle', lerp(0.5, 2.5, t)],
    ]);
    const body =
      plan === 'squid' ? squid(kit, t)
        : plan === 'manta' ? manta(kit, t)
          : plan === 'beetle' ? beetle(kit, t)
            : serpent(kit, t);

    // Spore cannons along the back and flanks, alternating, from bow to stern.
    const weapons = kit.design.weapons;
    for (let i = 0; i < weapons; i++) {
      const z = lerp(0.6 * h, -0.6 * h, (i + 0.5) / weapons);
      const onTop = i % 2 === 0;
      const x = onTop ? 0 : (i % 4 === 1 ? 1 : -1) * body.half(z) * 0.7;
      kit.turret(x, onTop ? body.top(z) : body.top(z) * 0.4, z, B * 0.13, 1);
    }

    // Engines: round nozzles at the stern, as many as the design asks for.
    const nozzle = B * 0.085;
    for (const [x, y, z] of body.engines(kit.design.engines, nozzle)) kit.engine(x, y, z, nozzle);
  },
};
