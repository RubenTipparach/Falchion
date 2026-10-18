import * as THREE from 'three';
import { ball, cyl, hull, lathe, mat, obox, Prop, prism, ring, ROLES } from '../propKit';

/**
 * Thumbnail props for the Hulls & Drives research nodes: one distinct prop per node id, built with
 * propKit (the `thumbnails` skill). Each stands on y = 0 at about unit size; the studio adds the
 * branch-coloured plinth and frames it.
 */

type V3 = readonly [number, number, number];
const UP = new THREE.Vector3(0, 1, 0);

/** A round rod from `a` to `b`: a cylinder that lies along the segment. */
function rod(a: V3, b: V3, r: number, n = 6): THREE.BufferGeometry {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
  const d = B.clone().sub(A);
  const g = cyl(r, r, d.length(), n);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, d.normalize()));
  return g.translate((A.x + B.x) / 2, (A.y + B.y) / 2, (A.z + B.z) / 2);
}

/** The outline of an arch (a half-ellipse band) centred on `cx`, for a rib profile. */
function arch(cx: number, halfW: number, h: number, t: number, n = 8): [number, number][] {
  const outer: [number, number][] = [], inner: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI;
    outer.push([cx + halfW * Math.cos(a), h * Math.sin(a)]);
    inner.push([cx + (halfW - t) * Math.cos(a), (h - t) * Math.sin(a)]);
  }
  return [...outer, ...inner.reverse()];
}

/** A translucent additive halo, drawn both sides (a sheet with no inside). */
const glow = (c: string): THREE.Material => Object.assign(mat(c, 'glow'), { side: THREE.DoubleSide });
/** A flat matte sheet, drawn both sides (sails, panels). */
const sheet = (c: string): THREE.Material => Object.assign(mat(c, 'matte'), { side: THREE.DoubleSide });

/** Grown Hulls: a cultured pod on a root base, ribs showing through, a bud of light at its crown. */
const grownHulls = (): THREE.Group => {
  const p = new Prop();
  p.add(lathe([[0, 0], [0.42, 0.02], [0.52, 0.25], [0.5, 0.55], [0.36, 0.8], [0.16, 0.96], [0, 1.0]], 10), mat('#8fd9a0', 'matte'));
  p.add(lathe([[0, 0], [0.56, 0], [0.5, 0.07], [0, 0.07]], 10), mat('#6b8f4e', 'matte'));
  for (const [y, r] of [[0.3, 0.53], [0.52, 0.51], [0.72, 0.45]] as const) p.add(ring(r, 0.03, 14), mat('#5c8a3a', 'matte'), { y });
  p.add(rod([0.4, 0.07, 0.1], [0.62, 0.26, 0.28], 0.035), mat('#6b8f4e', 'matte'));
  p.add(rod([-0.4, 0.07, -0.1], [-0.6, 0.3, -0.26], 0.035), mat('#6b8f4e', 'matte'));
  p.add(ball(0.07, 0), mat('#b8ff7a', 'emissive'), { y: 1.02 });
  return p.group;
};

/** Regenerative Tissue: a low mound of healing cells, a green heart pulsing at its centre. */
const regenerativeTissue = (): THREE.Group => {
  const p = new Prop();
  p.add(ball(0.42, 1).scale(1.25, 0.5, 1), mat('#7bc98a', 'matte'), { y: 0.2 });
  p.add(ball(0.2, 1), mat('#8fd9a0', 'matte'), { x: -0.3, y: 0.24, z: 0.1 });
  p.add(ball(0.2, 1), mat('#8fd9a0', 'matte'), { x: 0.28, y: 0.22, z: -0.12 });
  p.add(ball(0.2, 1), mat('#8fd9a0', 'matte'), { x: 0.02, y: 0.28, z: 0.22 });
  p.add(ball(0.18, 1), glow('#b8ff7a'), { y: 0.36 });
  p.add(ball(0.1, 1), mat('#b8ff7a', 'emissive'), { y: 0.36 });
  return p.group;
};

/** Neural Lattice: a spine with nerve threads wired out to nodes, one bright node at the crown. */
const neuralLattice = (): THREE.Group => {
  const p = new Prop();
  const nodes: V3[] = [[0.22, 0.2, 0.1], [-0.24, 0.42, -0.08], [0.26, 0.64, 0.06], [-0.2, 0.84, 0.12], [0.1, 1.04, -0.08]];
  p.add(lathe([[0, 0], [0.18, 0], [0.2, 0.05], [0, 0.05]], 10), mat(ROLES.trim));
  p.add(rod([0, 0, 0], [0, 1.1, 0], 0.04), mat('#4fb8a8', 'matte'));
  for (const n of nodes) p.add(rod([0, n[1], 0], n, 0.03), mat('#4fb8a8', 'matte'));
  nodes.slice(0, 4).forEach((n) => p.add(ball(0.09, 1), mat('#7fe0c8', 'matte'), { x: n[0], y: n[1], z: n[2] }));
  p.add(ball(0.1, 1), mat('#b8ff7a', 'emissive'), { x: nodes[4][0], y: nodes[4][1], z: nodes[4][2] });
  return p.group;
};

/** Composite Alloys: a light cube frame of bonded struts, a cyan core lit from within. */
const compositeAlloys = (): THREE.Group => {
  const p = new Prop();
  const h = 0.4, cy = 0.5;
  const corners: V3[] = [];
  for (const y of [-h, h]) for (const x of [-h, h]) for (const z of [-h, h]) corners.push([x, y + cy, z]);
  for (let i = 0; i < corners.length; i++) {
    for (let j = i + 1; j < corners.length; j++) {
      const a = corners[i], b = corners[j];
      const diff = (a[0] !== b[0] ? 1 : 0) + (a[1] !== b[1] ? 1 : 0) + (a[2] !== b[2] ? 1 : 0);
      if (diff === 1) p.add(rod(a, b, 0.04), mat(ROLES.hull));
    }
  }
  p.add(obox(0.3, 0.1, 0.3, 0.02), mat(ROLES.trim), { y: 0.05 });
  p.add(ball(0.13, 1), mat('#6fe3ff', 'emissive'), { y: cy });
  return p.group;
};

/** Warp Lane Theory: a tall ring gate on two posts, a lane of light running through it. */
const warpLaneTheory = (): THREE.Group => {
  const p = new Prop();
  p.add(ring(0.45, 0.05, 28), mat(ROLES.hull), { y: 0.72, rx: Math.PI / 2 });
  const field = glow('#6fe3ff') as THREE.MeshBasicMaterial;
  field.opacity = 0.4;
  p.add(new THREE.CircleGeometry(0.4, 28), field, { y: 0.72 });
  for (const x of [-0.45, 0.45]) p.add(obox(0.08, 0.72, 0.08, 0.02), mat(ROLES.trim), { x, y: 0.36 });
  p.add(obox(0.3, 0.03, 1.2), mat('#6fe3ff', 'emissive'), { y: 0.015 });
  return p.group;
};

/** Capital Spines: a keel a kilometre long, arched ribs rising from it, a drive glow astern. */
const capitalSpines = (): THREE.Group => {
  const p = new Prop();
  p.add(obox(0.9, 0.08, 0.14, 0.02), mat(ROLES.trim), { y: 0.04 });
  for (const x of [-0.3, 0, 0.3]) p.add(prism(arch(0, 0.13, 0.5, 0.045), 0.07), mat(ROLES.hull), { x, y: 0.08 });
  p.add(hull([[0, 0, -0.07], [0, 0, 0.07], [0, 0.1, 0], [0.2, 0.02, 0]]), mat(ROLES.hull), { x: 0.45 });
  p.add(ball(0.07, 1), mat('#6fe3ff', 'emissive'), { x: -0.45, y: 0.06 });
  return p.group;
};

/** Mobile Shipyards: a tracked gantry crane with a hazard-yellow boom, lifting a hull block. */
const mobileShipyards = (): THREE.Group => {
  const p = new Prop();
  p.add(obox(0.9, 0.16, 0.5, 0.03), mat(ROLES.trim), { y: 0.08 });
  for (const z of [-0.28, 0.28]) p.add(obox(0.9, 0.1, 0.12), mat(ROLES.dark, 'matte'), { y: 0.05, z });
  for (const x of [-0.32, 0.32]) p.add(obox(0.1, 0.92, 0.12), mat(ROLES.gold), { x, y: 0.62 });
  p.add(obox(1.0, 0.09, 0.14, 0.02), mat(ROLES.gold), { x: 0.05, y: 1.04 });
  p.add(rod([0.3, 0.99, 0], [0.3, 0.78, 0], 0.022), mat(ROLES.trim));
  p.add(obox(0.34, 0.22, 0.26, 0.04), mat(ROLES.hull), { x: 0.3, y: 0.67 });
  p.add(ball(0.06, 0), mat('#ffd27a', 'emissive'), { x: 0.55, y: 1.1 });
  return p.group;
};

/** Titan Frames: a girder of heavy I-section on a base plate, bolted, a hazard band down its web. */
const titanFrames = (): THREE.Group => {
  const p = new Prop();
  const girder: [number, number][] = [
    [-0.44, 0], [0.44, 0], [0.44, 0.16], [0.1, 0.16], [0.1, 0.84], [0.44, 0.84],
    [0.44, 1.0], [-0.44, 1.0], [-0.44, 0.84], [-0.1, 0.84], [-0.1, 0.16], [-0.44, 0.16],
  ];
  p.add(obox(0.98, 0.06, 0.5, 0.02), mat(ROLES.trim), { y: 0.03 });
  p.add(prism(girder, 0.36), mat(ROLES.hull), { y: 0.06 });
  // Bolt heads on the flanges (global y: 0.06 + the flange's local centre).
  for (const x of [-0.3, 0.3]) for (const y of [0.14, 1.0]) {
    p.add(cyl(0.04, 0.04, 0.04, 6), mat('#c0c8d4'), { x, y, z: 0.2, rx: Math.PI / 2 });
  }
  p.add(obox(0.16, 0.56, 0.02), mat(ROLES.gold), { y: 0.56, z: 0.19 });
  return p.group;
};

/** Prismatic Frames: pure triangular prisms, no wasted volume, a glint at the apex. */
const prismaticFrames = (): THREE.Group => {
  const p = new Prop();
  const tri = (s: number) => prism([[-0.5 * s, 0], [0.5 * s, 0], [0, 0.866 * s]], 0.5 * s);
  p.add(tri(1), mat('#a193f0', 'matte'));
  p.add(tri(0.45), mat('#8a7bd6', 'matte'), { x: -0.62 });
  p.add(tri(0.45), mat('#8a7bd6', 'matte'), { x: 0.62 });
  p.add(ball(0.06, 0), mat('#e0d4ff', 'emissive'), { y: 0.9 });
  return p.group;
};

/** Gyroscopic Cores: three rings in three planes round a glowing core on a stand. */
const gyroscopicCores = (): THREE.Group => {
  const p = new Prop();
  const y = 0.72;
  p.add(lathe([[0, 0], [0.26, 0], [0.28, 0.04], [0.2, 0.1], [0.06, 0.12], [0, 0.12]], 12), mat(ROLES.trim));
  p.add(cyl(0.04, 0.05, 0.56, 8), mat(ROLES.trim), { y: 0.4 });
  p.add(ring(0.42, 0.035, 28), mat('#b49cff'), { y, rx: Math.PI / 2 });
  p.add(ring(0.42, 0.035, 28), mat('#b49cff'), { y, rz: Math.PI / 2 });
  p.add(ring(0.42, 0.035, 28), mat('#b49cff'), { y, rz: -Math.PI / 4 });
  p.add(ball(0.14, 1), mat('#d7c4ff', 'emissive'), { y });
  return p.group;
};

/** Spherical Doctrine: a single great sphere held in a three-legged cradle, a gold equator. */
const sphericalDoctrine = (): THREE.Group => {
  const p = new Prop();
  p.add(lathe([[0, 0], [0.3, 0], [0.34, 0.06], [0.28, 0.12], [0, 0.12]], 12), mat(ROLES.trim));
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    p.add(rod([0.3 * Math.cos(a), 0.12, 0.3 * Math.sin(a)], [0.395 * Math.cos(a), 0.384, 0.395 * Math.sin(a)], 0.035), mat(ROLES.trim));
  }
  p.add(ball(0.45, 1), mat('#b3a0f5', 'matte'), { y: 0.6 });
  p.add(ring(0.47, 0.025, 32), mat(ROLES.gold), { y: 0.6 });
  return p.group;
};

/** Spike Doctrine: a violet core bristling with blades on every side, on a short stalk. */
const spikeDoctrine = (): THREE.Group => {
  const p = new Prop();
  p.add(lathe([[0, 0], [0.2, 0], [0.2, 0.05], [0.06, 0.22], [0, 0.22]], 10), mat(ROLES.trim));
  p.add(ball(0.3, 1), mat('#b59cff', 'emissive'), { y: 0.5 });
  const n = 14;
  for (let i = 0; i < n; i++) {
    const y = 1 - (i + 0.5) / n;
    if (y < 0.15) continue;
    const r = Math.sqrt(1 - y * y), a = i * 2.39996;
    const d = new THREE.Vector3(r * Math.cos(a), y, r * Math.sin(a));
    const spike = lathe([[0, 0], [0.07, 0], [0, 0.36]], 5).applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, d));
    p.add(spike.translate(d.x * 0.26, 0.5 + d.y * 0.26, d.z * 0.26), mat('#d6ccff', 'matte'));
  }
  return p.group;
};

/** Ellipsoid Doctrine: a long stretched pod on two pylons, a dorsal fin, a nose light. */
const ellipsoidDoctrine = (): THREE.Group => {
  const p = new Prop();
  p.add(ball(0.4, 1).scale(1.2, 0.55, 0.55), mat('#9a8ae8', 'matte'), { y: 0.36 });
  for (const x of [-0.3, 0.3]) p.add(cyl(0.05, 0.07, 0.22, 8), mat(ROLES.trim), { x, y: 0.11 });
  p.add(prism([[-0.16, -0.04], [0.1, -0.04], [0.02, 0.24], [-0.16, 0.2]], 0.04), mat('#b8a9ff'), { x: -0.32, y: 0.36 });
  p.add(ball(0.05, 0), mat('#ffe9a8', 'emissive'), { x: 0.48, y: 0.36 });
  return p.group;
};

/** Shard Doctrine: a cluster of angular shards, the tallest one lit from within. */
const shardDoctrine = (): THREE.Group => {
  const p = new Prop();
  const shard = (cx: number, cz: number, r: number, apex: V3) =>
    hull([[cx - r, 0, cz], [cx, 0, cz - r], [cx + r, 0, cz], [cx, 0, cz + r], apex]);
  p.add(shard(-0.26, 0.08, 0.14, [-0.36, 0.62, 0.05]), mat('#a894e8', 'matte'));
  p.add(shard(0.25, -0.1, 0.13, [0.36, 0.55, -0.12]), mat('#a894e8', 'matte'));
  p.add(shard(0.1, 0.27, 0.1, [0.2, 0.42, 0.3]), mat('#b8a6f0', 'matte'));
  p.add(shard(-0.12, -0.26, 0.1, [-0.2, 0.34, -0.3]), mat('#b8a6f0', 'matte'));
  p.add(shard(0, 0, 0.2, [0.05, 1.0, -0.03]), mat('#c9a7ff', 'emissive'));
  return p.group;
};

/** Heritage Shipwrights: a rose-hulled ship with a curved sheer, a gold spire and a finial. */
const heritageShipwrights = (): THREE.Group => {
  const p = new Prop();
  const sheer: [number, number][] = [
    [-0.42, 0.12], [-0.1, 0], [0.3, 0.02], [0.5, 0.2], [0.6, 0.36],
    [0.42, 0.28], [0.2, 0.2], [-0.2, 0.2], [-0.5, 0.36],
  ];
  p.add(prism(sheer, 0.22), mat('#e7b9c4', 'matte'), { x: -0.05 });
  p.add(obox(0.36, 0.03, 0.25), mat(ROLES.gold), { y: 0.215 });
  const spire = (h: number) => lathe([[0, 0], [0.06, 0], [0.045, 0.06], [0.02, h * 0.7], [0, h]], 8);
  p.add(spire(0.8), mat(ROLES.gold), { y: 0.2 });
  p.add(spire(0.5), mat(ROLES.gold), { x: -0.3, y: 0.2 });
  p.add(ball(0.05, 0), mat('#ffe39a', 'emissive'), { y: 1.02 });
  return p.group;
};

/** Solar Sail Yachts: a slim pale hull, a mast with two broad sails, a gold boom and a light at the top. */
const solarSailYachts = (): THREE.Group => {
  const p = new Prop();
  p.add(prism([[-0.5, 0.12], [0.5, 0.12], [0.34, 0], [-0.34, 0]], 0.14), mat('#c7d7ea', 'matte'));
  p.add(cyl(0.02, 0.02, 1.0, 6), mat(ROLES.trim), { y: 0.62 });
  p.add(prism([[0, 0], [0, 0.9], [0.42, 0]], 0.012), sheet('#f4efe6'), { y: 0.16 });
  p.add(prism([[0, 0], [0, 0.8], [-0.36, 0]], 0.012), sheet('#fbf7ef'), { y: 0.16, z: 0.07 });
  p.add(cyl(0.012, 0.012, 0.42, 6), mat(ROLES.gold), { x: 0.21, y: 0.16, rz: Math.PI / 2 });
  p.add(ball(0.05, 0), mat(ROLES.gold, 'emissive'), { y: 1.14 });
  return p.group;
};

/** Grand Halls: a rose-domed colonnade on a stone platform, gold capitals, a lantern on the dome. */
const grandHalls = (): THREE.Group => {
  const p = new Prop();
  p.add(obox(0.96, 0.1, 0.7, 0.03), mat('#efe3cf', 'matte'), { y: 0.05 });
  for (const x of [-0.36, 0.36]) for (const z of [-0.2, 0.2]) {
    p.add(cyl(0.05, 0.055, 0.5, 10), mat('#f4e9da', 'matte'), { x, y: 0.35, z });
    p.add(obox(0.15, 0.05, 0.15, 0.01), mat(ROLES.gold), { x, y: 0.625, z });
  }
  p.add(obox(0.92, 0.08, 0.6, 0.02), mat('#e8b4bc', 'matte'), { y: 0.69 });
  p.add(lathe([[0, 0], [0.3, 0], [0.31, 0.03], [0.26, 0.1], [0.18, 0.2], [0.08, 0.28], [0, 0.31]], 14), mat('#e8b4bc', 'matte'), { y: 0.73 });
  p.add(cyl(0.01, 0.02, 0.1, 6), mat(ROLES.gold), { y: 1.08 });
  p.add(ball(0.05, 0), mat(ROLES.gold, 'emissive'), { y: 1.14 });
  return p.group;
};

/** Sacred Geometry: a hexagram of gold-edged violet, a glowing octahedron held in its heart. */
const sacredGeometry = (): THREE.Group => {
  const p = new Prop();
  const y = 0.62;
  const star: [number, number][] = [];
  const tips: [number, number][] = [];
  for (let k = 0; k < 12; k++) {
    const a = Math.PI / 2 + (k * Math.PI) / 6;
    const r = k % 2 === 0 ? 0.5 : 0.29;
    star.push([Math.cos(a) * r, Math.sin(a) * r]);
    if (k % 2 === 0) tips.push([Math.cos(a) * 0.5, Math.sin(a) * 0.5]);
  }
  p.add(lathe([[0, 0], [0.26, 0], [0.26, 0.05], [0.12, 0.1], [0, 0.1]], 8), mat(ROLES.gold));
  p.add(prism(star, 0.06), mat('#9b82e6', 'matte'), { y });
  p.add(hull([[0.2, 0, 0], [-0.2, 0, 0], [0, 0.2, 0], [0, -0.2, 0], [0, 0, 0.2], [0, 0, -0.2]]), mat('#ffd27a', 'emissive'), { y });
  p.add(ring(0.6, 0.015, 40), mat(ROLES.gold), { y, rx: Math.PI / 2 });
  for (const [x, ty] of tips) p.add(ball(0.05, 0), mat(ROLES.gold), { x, y: y + ty });
  return p.group;
};

export const HULLS_NODE_PROPS: Readonly<Record<string, () => THREE.Group>> = {
  'o-grown-hulls': grownHulls,
  'o-regeneration': regenerativeTissue,
  'o-neural-lattice': neuralLattice,
  't-alloys': compositeAlloys,
  't-warp-lanes': warpLaneTheory,
  't-capital-spines': capitalSpines,
  'u-shipyards': mobileShipyards,
  'u-titan-frames': titanFrames,
  'g-prism': prismaticFrames,
  'g-gyroscopic': gyroscopicCores,
  'g-sphere': sphericalDoctrine,
  'g-spike': spikeDoctrine,
  'g-ellipsoid': ellipsoidDoctrine,
  'g-shard-hulls': shardDoctrine,
  'a-heritage': heritageShipwrights,
  'a-sail-yachts': solarSailYachts,
  'a-grand-halls': grandHalls,
  'x-sacred-geometry': sacredGeometry,
};
