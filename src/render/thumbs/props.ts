import * as THREE from 'three';
import type { Resource } from '../../content/resources';
import { RESOURCES } from '../../content/resources';
import { ball, crystal, cyl, hull, lathe, mat, obox, Prop, prism, ring, ROLES } from './propKit';

/**
 * Hand-made thumbnail props: one per resource, encounter kind, research domain emblem and ship
 * part. Each is built from propKit primitives at about unit size, standing on y = 0 (the studio
 * frames by bounds). Keep silhouettes readable at 48 px: leave out anything smaller than a
 * twentieth of the prop.
 */
export type PropBuilder = () => THREE.Group;

const colorOf = (r: Resource) => RESOURCES.find((x) => x.id === r)!.color;

/** A short stack of coins, chamfered rims. */
function coinStack(p: Prop, n: number, x: number, z: number, color: string): void {
  const coin = () => lathe([[0, 0], [0.2, 0], [0.22, 0.02], [0.22, 0.05], [0.2, 0.07], [0, 0.07]], 14);
  for (let i = 0; i < n; i++) p.add(coin(), mat(color), { x: x + Math.sin(i * 2.3) * 0.015, y: i * 0.072, z, ry: i * 0.4 });
}

const resourceProps: Record<Resource, PropBuilder> = {
  credits: () => {
    const p = new Prop(), c = colorOf('credits');
    coinStack(p, 6, -0.22, 0, c);
    coinStack(p, 4, 0.24, 0.1, c);
    coinStack(p, 2, 0.02, 0.32, c);
    p.add(lathe([[0, 0], [0.2, 0], [0.22, 0.02], [0.22, 0.05], [0.2, 0.07], [0, 0.07]], 14), mat(c), { x: 0.3, y: 0.32, z: -0.22, rx: 1.1, rz: 0.3 });
    return p.group;
  },
  influence: () => {
    const p = new Prop(), c = colorOf('influence');
    p.add(lathe([[0, 0], [0.32, 0], [0.32, 0.06], [0.24, 0.1], [0.24, 0.14], [0, 0.14]], 8), mat(ROLES.trim));
    p.add(cyl(0.025, 0.025, 1.3, 8), mat(ROLES.gold), { y: 0.75 });
    p.add(ball(0.06, 0), mat(ROLES.gold), { y: 1.42 });
    // The banner: a swallowtail cloth, thin, hung from a cross-bar.
    p.add(cyl(0.02, 0.02, 0.62, 6), mat(ROLES.gold), { y: 1.3, x: 0.31, rz: Math.PI / 2 });
    p.add(prism([[0, 0], [0.6, 0], [0.6, -0.7], [0.3, -0.52], [0, -0.7]], 0.03), mat(c, 'matte'), { y: 1.29, x: 0.01 });
    p.add(prism([[0, 0.09], [0.09, 0], [0, -0.09], [-0.09, 0]], 0.05), mat(ROLES.gold), { y: 1.0, x: 0.31 });
    return p.group;
  },
  faith: () => {
    const p = new Prop(), c = colorOf('faith');
    p.add(obox(0.8, 0.12, 0.8, 0.03), mat(ROLES.hull, 'matte'), { y: 0.06 });
    p.add(obox(0.56, 0.12, 0.56, 0.03), mat(ROLES.hull, 'matte'), { y: 0.17 });
    p.add(hull([[-0.13, 0, -0.13], [0.13, 0, -0.13], [0.13, 0, 0.13], [-0.13, 0, 0.13], [-0.08, 0.95, -0.08], [0.08, 0.95, -0.08], [0.08, 0.95, 0.08], [-0.08, 0.95, 0.08], [0, 1.08, 0]]), mat('#d8d2c4', 'matte'), { y: 0.22 });
    p.add(ball(0.13, 1), mat(c, 'emissive'), { y: 1.48 });
    p.add(ball(0.24, 1), mat(c, 'glow'), { y: 1.48 });
    return p.group;
  },
  food: () => {
    const p = new Prop(), c = colorOf('food');
    p.add(obox(1.1, 0.2, 0.5, 0.04), mat(ROLES.trim), { y: 0.1 });
    p.add(obox(1.0, 0.04, 0.42), mat('#4a3a2a', 'matte'), { y: 0.21 });
    for (const [x, h, s] of [[-0.34, 0.5, 1], [0, 0.66, 1.15], [0.34, 0.44, 0.9]] as const) {
      p.add(cyl(0.02, 0.025, h, 5), mat('#5c8a3a', 'matte'), { x, y: 0.22 + h / 2 });
      for (let k = 0; k < 3; k++) p.add(ball(0.11 * s, 0), mat(k === 2 ? c : '#6aa84f', 'matte'), { x: x + Math.sin(k * 2.1) * 0.07, y: 0.24 + h * (0.55 + k * 0.22), z: Math.cos(k * 2.1) * 0.07, ry: k });
    }
    p.add(ball(0.07, 0), mat('#ff8a5c', 'matte'), { x: 0.07, y: 0.62, z: 0.1 });
    return p.group;
  },
  goods: () => {
    const p = new Prop(), c = colorOf('goods');
    const crate = (x: number, y: number, z: number, ry: number, s = 1) => {
      p.add(obox(0.5 * s, 0.5 * s, 0.5 * s, 0.04 * s), mat(c, 'matte'), { x, y: y + 0.25 * s, z, ry });
      p.add(obox(0.52 * s, 0.07 * s, 0.52 * s), mat(ROLES.trim), { x, y: y + 0.15 * s, z, ry });
      p.add(obox(0.52 * s, 0.07 * s, 0.52 * s), mat(ROLES.trim), { x, y: y + 0.38 * s, z, ry });
    };
    crate(-0.3, 0, 0, 0.1);
    crate(0.27, 0, 0.06, -0.15);
    crate(-0.02, 0.5, 0.02, 0.35, 0.9);
    return p.group;
  },
  metals: () => {
    const p = new Prop(), c = colorOf('metals');
    // An ingot: a trapezoid profile, wider at the foot.
    const ingot = () => prism([[-0.3, 0], [0.3, 0], [0.24, 0.16], [-0.24, 0.16]], 0.22);
    const rows: [number, number, number, number][] = [[-0.32, 0, -0.14, 0], [0.32, 0, -0.14, 0], [-0.32, 0, 0.14, 0], [0.32, 0, 0.14, 0]];
    rows.forEach(([x, y, z, ry]) => p.add(ingot(), mat(c), { x, y, z, ry }));
    p.add(ingot(), mat(c), { x: -0.15, y: 0.16, z: 0, ry: Math.PI / 2 });
    p.add(ingot(), mat(c), { x: 0.15, y: 0.16, z: 0, ry: Math.PI / 2 });
    p.add(ingot(), mat('#d6dde8'), { x: 0, y: 0.32, z: 0 });
    return p.group;
  },
  gases: () => {
    const p = new Prop(), c = colorOf('gases');
    const tank = (x: number, z: number, h: number, r: number) => {
      p.add(lathe([[0, 0], [r * 0.8, 0], [r, r * 0.25], [r, h - r * 0.5], [r * 0.6, h - r * 0.1], [r * 0.3, h], [0, h]], 12), mat(ROLES.hull), { x, z });
      p.add(cyl(r * 1.04, r * 1.04, h * 0.12, 12), mat(c, 'emissive'), { x, y: h * 0.55, z });
      p.add(cyl(r * 0.2, r * 0.2, r * 0.4, 8), mat(ROLES.trim), { x, y: h + r * 0.15, z });
    };
    tank(-0.18, 0, 1.0, 0.26);
    tank(0.3, 0.12, 0.7, 0.2);
    p.add(ball(0.18, 1), mat(c, 'glow'), { x: 0.05, y: 1.15, z: 0.05 });
    return p.group;
  },
  crystals: () => {
    const p = new Prop(), c = colorOf('crystals');
    p.add(hull([[-0.45, 0, -0.3], [0.45, 0, -0.35], [0.5, 0, 0.3], [-0.4, 0, 0.35], [-0.2, 0.18, 0], [0.2, 0.16, 0.05]]), mat(ROLES.dark, 'matte'));
    const spikes: [number, number, number, number, number, number][] = [[0, 0.8, 0.13, 0, 0, 0], [-0.22, 0.5, 0.09, 0.4, 0, 0.1], [0.24, 0.55, 0.1, -0.35, 0, -0.05], [0.05, 0.35, 0.07, 0.2, 0, 0.25], [-0.1, 0.3, 0.06, -0.1, 0, -0.22]];
    for (const [x, h, r, rz, , z] of spikes) p.add(crystal(r, h), mat(c, 'emissive'), { x, y: 0.1, z, rz, rx: z });
    return p.group;
  },
};

const eventProps: Record<string, PropBuilder> = {
  /** A floating bazaar: a spindle with a docking ring and containers. */
  trade: () => {
    const p = new Prop();
    p.add(lathe([[0, -0.6], [0.12, -0.5], [0.16, -0.1], [0.24, 0], [0.16, 0.1], [0.12, 0.5], [0, 0.6]], 10), mat(ROLES.hull));
    p.add(ring(0.62, 0.05, 20), mat(ROLES.trim));
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      p.add(cyl(0.02, 0.02, 0.5, 5), mat(ROLES.trim), { x: Math.cos(a) * 0.38, z: Math.sin(a) * 0.38, rz: Math.PI / 2, ry: -a });
      p.add(obox(0.2, 0.2, 0.32, 0.03), mat(colorOf('goods'), 'matte'), { x: Math.cos(a) * 0.62, y: -0.1, z: Math.sin(a) * 0.62, ry: -a });
    }
    p.add(ball(0.08, 0), mat('#ffd27a', 'emissive'), { y: 0.66 });
    return p.group;
  },
  /** A gun turret firing: armoured base, twin barrels, muzzle flash. */
  battle: () => turret('#ff5d5d'),
  /** An envoy's beacon: a comms dish on a mast, hailing. */
  relations: () => {
    const p = new Prop();
    p.add(lathe([[0, 0], [0.34, 0], [0.34, 0.06], [0.2, 0.12], [0, 0.12]], 8), mat(ROLES.trim));
    p.add(cyl(0.04, 0.05, 0.7, 6), mat(ROLES.hull), { y: 0.45 });
    p.add(lathe([[0.02, 0], [0.2, 0.03], [0.36, 0.1], [0.44, 0.2], [0.42, 0.21], [0.34, 0.12], [0.18, 0.06], [0, 0.03]], 14), Object.assign(mat('#d8dee8'), { side: THREE.DoubleSide }), { y: 0.9, rx: -0.9 });
    p.add(cyl(0.012, 0.012, 0.36, 5), mat(ROLES.trim), { y: 1.0, z: 0.12, rx: -0.9 });
    for (const [r, o] of [[0.22, 0.9], [0.36, 0.6], [0.5, 0.35]] as const) {
      const m = mat('#ff8fa3', 'glow') as THREE.MeshBasicMaterial;
      m.opacity = o;
      p.add(ring(r, 0.012, 24), m, { y: 1.18 + r * 0.6, z: 0.3 + r * 0.7, rx: -0.9 });
    }
    return p.group;
  },
  /** A rift: two tilted rings round a glowing core. */
  anomaly: () => {
    const p = new Prop();
    p.add(ball(0.18, 1), mat('#e0f6ff', 'emissive'), { y: 0.6 });
    p.add(ball(0.34, 1), mat('#9fe3ff', 'glow'), { y: 0.6 });
    p.add(ring(0.55, 0.035, 28), mat('#c792ea', 'emissive'), { y: 0.6, rx: 0.5, rz: 0.3 });
    p.add(ring(0.42, 0.03, 24), mat('#5ec8ff', 'emissive'), { y: 0.6, rx: -0.7, rz: -0.6 });
    for (let i = 0; i < 5; i++) {
      const a = i * 1.3;
      p.add(hull([[0, 0, 0], [0.08, 0.02, 0], [0.03, 0.09, 0.02], [0.02, 0.02, 0.08]]), mat(ROLES.dark, 'matte'), { x: Math.cos(a) * 0.78, y: 0.6 + Math.sin(a * 1.7) * 0.25, z: Math.sin(a) * 0.5 });
    }
    return p.group;
  },
  /** A broken hull: the forward half of a ship, sheared off, with drifting wreckage. */
  derelict: () => {
    const p = new Prop(), rust = ROLES.rust;
    p.add(hull([[-0.22, -0.16, -0.3], [0.22, -0.16, -0.3], [0.24, 0.16, -0.25], [-0.24, 0.16, -0.25], [0, 0.04, 0.75], [-0.1, -0.08, 0.5], [0.12, 0.1, 0.45]]), mat(rust), { y: 0.5 });
    // The sheared face, jagged: a dark hull just behind.
    p.add(hull([[-0.2, -0.14, -0.32], [0.2, -0.14, -0.33], [0.22, 0.14, -0.28], [-0.22, 0.14, -0.3], [0.05, 0.02, -0.46], [-0.08, -0.05, -0.42]]), mat(ROLES.dark, 'matte'), { y: 0.5 });
    p.add(obox(0.5, 0.06, 0.12), mat(ROLES.trim), { y: 0.62, z: -0.05, rz: 0.2 });
    p.add(hull([[0, 0, 0], [0.2, 0.05, 0.02], [0.1, 0.16, -0.04], [0.04, 0.03, 0.15]]), mat(rust), { x: 0.26, y: 0.32, z: -0.5, rz: 0.6 });
    p.add(hull([[0, 0, 0], [0.14, 0.04, 0.02], [0.06, 0.1, -0.03], [0.03, 0.02, 0.1]]), mat(ROLES.dark, 'matte'), { x: -0.26, y: 0.78, z: -0.56 });
    p.add(ball(0.04, 0), mat('#ff7a3a', 'emissive'), { x: 0.05, y: 0.56, z: -0.36 });
    // Side on to the camera, nose down a little: the shear and the wreckage read.
    p.group.rotation.set(0, -1.15, -0.15);
    return p.group;
  },
};

/** A turret: the battle event and the weapons emblem. */
function turret(flash: string): THREE.Group {
  const p = new Prop();
  p.add(lathe([[0, 0], [0.5, 0], [0.5, 0.08], [0.42, 0.16], [0, 0.16]], 8), mat(ROLES.trim));
  p.add(hull([[-0.3, 0.14, -0.3], [0.3, 0.14, -0.3], [0.3, 0.14, 0.24], [-0.3, 0.14, 0.24], [-0.22, 0.5, -0.24], [0.22, 0.5, -0.24], [0.2, 0.42, 0.22], [-0.2, 0.42, 0.22]]), mat(ROLES.hull));
  for (const x of [-0.1, 0.1]) {
    p.add(cyl(0.045, 0.055, 0.7, 8), mat(ROLES.dark), { x, y: 0.36, z: 0.5, rx: Math.PI / 2 });
    p.add(cyl(0.065, 0.065, 0.08, 8), mat(ROLES.trim), { x, y: 0.36, z: 0.82, rx: Math.PI / 2 });
    p.add(ball(0.09, 1), mat(flash, 'glow'), { x, y: 0.36, z: 0.92 });
  }
  return p.group;
}

/** Emblems for research that grants a bonus: one per domain. */
const domainProps: Record<string, PropBuilder> = {
  /** A hull block: an arrowhead profile with chamfered shoulders and a keel. */
  hulls: () => {
    const p = new Prop();
    p.add(prism([[-0.3, 0], [0.3, 0], [0.36, 0.14], [0.2, 0.3], [-0.2, 0.3], [-0.36, 0.14]], 1.1), mat(ROLES.hull), { y: 0.1 });
    p.add(hull([[-0.2, 0.3, -0.5], [0.2, 0.3, -0.5], [0, 0.3, 0.75], [0, 0.42, 0.1], [-0.12, 0.38, -0.3], [0.12, 0.38, -0.3]]), mat(ROLES.trim), { y: 0.1 });
    p.add(obox(0.1, 0.1, 0.9), mat(ROLES.dark), { y: 0.06 });
    for (const x of [-0.16, 0.16]) p.add(cyl(0.08, 0.1, 0.1, 8), mat('#5ec8ff', 'emissive'), { x, y: 0.25, z: -0.57, rx: Math.PI / 2 });
    return p.group;
  },
  weapons: () => turret('#ffd27a'),
  /** A shield generator under its dome. */
  defense: () => {
    const p = new Prop();
    p.add(prism(hexProfile(0.5), 0.16), mat(ROLES.trim), { rx: -Math.PI / 2, y: 0 });
    p.add(lathe([[0, 0], [0.16, 0], [0.12, 0.3], [0.06, 0.34], [0, 0.34]], 8), mat(ROLES.hull), { y: 0.16 });
    p.add(ball(0.07, 0), mat('#5ec8ff', 'emissive'), { y: 0.52 });
    const dome = new THREE.SphereGeometry(0.62, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
    p.add(dome, Object.assign(mat('#5ec8ff', 'glow'), { opacity: 0.35 }), { y: 0.14 });
    return p.group;
  },
  /** A gear on a drill: industry. */
  industry: () => {
    const p = new Prop();
    p.add(prism(gearProfile(0.5, 0.38, 10), 0.16), mat(ROLES.gold), { y: 0.62, rx: 0, rz: 0 });
    p.add(cyl(0.12, 0.12, 0.24, 10), mat(ROLES.trim), { y: 0.62, rx: Math.PI / 2 });
    p.add(lathe([[0, 0], [0.16, 0.25], [0.12, 0.3], [0, 0.3]], 8), mat(ROLES.hull), { y: -0.22, s: 1 });
    p.add(cyl(0.03, 0.03, 0.22, 6), mat(ROLES.trim), { y: 0.06 });
    return p.group;
  },
  /** A domed hall: society. */
  society: () => {
    const p = new Prop();
    p.add(obox(1.0, 0.1, 0.7, 0.03), mat('#cfc8b8', 'matte'), { y: 0.05 });
    for (let i = 0; i < 6; i++) p.add(cyl(0.04, 0.04, 0.42, 6), mat('#e8e2d4', 'matte'), { x: -0.38 + i * 0.152, y: 0.31, z: 0.26 });
    p.add(obox(0.9, 0.5, 0.4), mat('#d8d2c4', 'matte'), { y: 0.35, z: -0.05 });
    p.add(obox(1.0, 0.08, 0.66), mat('#cfc8b8', 'matte'), { y: 0.56 });
    p.add(lathe([[0.3, 0], [0.3, 0.06], [0.26, 0.18], [0.16, 0.28], [0, 0.31]], 12), mat('#a98bff'), { y: 0.6 });
    p.add(ball(0.04, 0), mat(ROLES.gold), { y: 0.93 });
    return p.group;
  },
  /** A spy satellite: body, panels, antenna. */
  intel: () => {
    const p = new Prop();
    p.add(prism(hexProfile(0.16), 0.5), mat(ROLES.gold), { y: 0.5 });
    for (const x of [-1, 1]) {
      p.add(cyl(0.015, 0.015, 0.2, 5), mat(ROLES.trim), { x: x * 0.25, y: 0.5, rz: Math.PI / 2 });
      p.add(obox(0.5, 0.02, 0.3), mat('#2f4a7a'), { x: x * 0.6, y: 0.5 });
    }
    p.add(lathe([[0.02, 0], [0.12, 0.03], [0.18, 0.08], [0.16, 0.09], [0.1, 0.05], [0, 0.02]], 10), mat('#d8dee8'), { y: 0.5, z: 0.27, rx: Math.PI / 2 });
    p.add(ball(0.04, 0), mat('#ff5d5d', 'emissive'), { y: 0.5, z: 0.36 });
    return p.group;
  },
  /** A colony pod landing on its legs. */
  colonies: () => {
    const p = new Prop();
    p.add(lathe([[0, 0.12], [0.3, 0.14], [0.36, 0.3], [0.32, 0.55], [0.18, 0.72], [0, 0.76]], 10), mat(ROLES.hull));
    p.add(cyl(0.37, 0.37, 0.06, 10), mat('#7bd88f', 'emissive'), { y: 0.36 });
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 0.5;
      p.add(cyl(0.02, 0.02, 0.4, 5), mat(ROLES.trim), { x: Math.cos(a) * 0.38, y: 0.14, z: Math.sin(a) * 0.38, rz: Math.cos(a) * 0.5, rx: -Math.sin(a) * 0.5 });
      p.add(cyl(0.07, 0.07, 0.025, 8), mat(ROLES.trim), { x: Math.cos(a) * 0.48, y: 0.0, z: Math.sin(a) * 0.48 });
    }
    p.add(lathe([[0, 0], [0.16, 0.08], [0.1, 0.14], [0, 0.14]], 8), mat(ROLES.dark), { y: 0.0 });
    return p.group;
  },
};

/** Ship parts that research and loot grant. */
const partProps: Record<string, PropBuilder> = {
  'spore-drive': () => {
    const p = new Prop();
    p.add(lathe([[0, 0], [0.24, 0.05], [0.36, 0.28], [0.32, 0.55], [0.16, 0.72], [0, 0.76]], 9), mat('#6a8a52', 'matte'));
    for (let i = 0; i < 6; i++) {
      const a = i * 1.05;
      p.add(ball(0.09, 0), mat('#b8ff7a', 'emissive'), { x: Math.cos(a) * 0.36, y: 0.3 + (i % 2) * 0.2, z: Math.sin(a) * 0.36 });
    }
    p.add(ball(0.42, 1), Object.assign(mat('#7bd88f', 'glow'), { opacity: 0.25 }), { y: 0.4 });
    return p.group;
  },
  'fusion-torch': () => {
    const p = new Prop();
    p.add(lathe([[0, 0.9], [0.18, 0.88], [0.22, 0.6], [0.16, 0.5], [0.2, 0.36], [0.4, 0.04], [0.36, 0], [0.12, 0.3], [0, 0.3]], 12), mat(ROLES.hull));
    p.add(cyl(0.24, 0.24, 0.06, 12), mat(ROLES.trim), { y: 0.62 });
    p.add(lathe([[0, 0.3], [0.3, 0.05], [0.1, -0.5], [0, -0.6]], 12), mat('#4fd1ff', 'glow'), { y: 0 });
    return p.group;
  },
  'phased-laser': () => {
    const p = new Prop();
    p.add(obox(0.36, 0.26, 0.5, 0.05), mat(ROLES.hull), { y: 0.13 });
    p.add(cyl(0.06, 0.08, 0.9, 8), mat(ROLES.trim), { y: 0.2, z: 0.6, rx: Math.PI / 2 });
    for (let i = 0; i < 3; i++) p.add(cyl(0.1, 0.1, 0.04, 8), mat('#ff5d5d', 'emissive'), { y: 0.2, z: 0.35 + i * 0.22, rx: Math.PI / 2 });
    p.add(cyl(0.03, 0.03, 0.8, 6), mat('#ff5d5d', 'glow'), { y: 0.2, z: 1.4, rx: Math.PI / 2 });
    return p.group;
  },
  'acid-spitter': () => {
    const p = new Prop();
    p.add(ball(0.32, 1), mat('#6a8a52', 'matte'), { y: 0.34 });
    p.add(lathe([[0.14, 0], [0.12, 0.3], [0.07, 0.5], [0.09, 0.55], [0, 0.55]], 8), mat('#4f6a3d', 'matte'), { y: 0.45, z: 0.12, rx: 1.1 });
    p.add(ball(0.08, 0), mat('#c6ff3a', 'emissive'), { y: 0.68, z: 0.62 });
    p.add(ball(0.06, 0), mat('#c6ff3a', 'emissive'), { y: 0.62, z: 0.86 });
    return p.group;
  },
  fabricator: () => {
    const p = new Prop();
    p.add(lathe([[0, 0], [0.36, 0], [0.36, 0.08], [0.24, 0.14], [0, 0.14]], 10), mat(ROLES.trim));
    p.add(obox(0.12, 0.6, 0.12), mat(ROLES.gold), { y: 0.42, rz: -0.25 });
    p.add(ball(0.09, 0), mat(ROLES.dark), { x: 0.17, y: 0.72 });
    p.add(obox(0.1, 0.5, 0.1), mat(ROLES.gold), { x: 0.37, y: 0.8, rz: -1.2 });
    p.add(cyl(0.06, 0.02, 0.14, 6), mat('#ffd27a', 'emissive'), { x: 0.62, y: 0.8, rz: Math.PI / 2 });
    p.add(obox(0.3, 0.16, 0.3, 0.03), mat(ROLES.hull), { x: 0.55, y: 0.08 });
    return p.group;
  },
  'tractor-beam': () => {
    const p = new Prop();
    p.add(lathe([[0, 0.7], [0.14, 0.7], [0.24, 0.5], [0.3, 0.42], [0, 0.42]], 10), mat(ROLES.hull));
    const cone = lathe([[0.28, 0.42], [0.55, -0.4], [0, -0.4]], 14);
    p.add(cone, Object.assign(mat('#9fe3ff', 'glow'), { opacity: 0.3 }));
    p.add(obox(0.24, 0.24, 0.24, 0.03), mat(colorOf('goods'), 'matte'), { y: -0.3, ry: 0.5 });
    return p.group;
  },
  'cloak-field': () => {
    const p = new Prop();
    p.add(prism(hexProfile(0.24), 0.2), mat(ROLES.dark), { rx: -Math.PI / 2 });
    p.add(lathe([[0, 0], [0.1, 0], [0.04, 0.5], [0, 0.52]], 6), mat(ROLES.trim), { y: 0.1 });
    p.add(ball(0.06, 0), mat('#c792ea', 'emissive'), { y: 0.62 });
    for (const [r, y] of [[0.3, 0.35], [0.46, 0.25], [0.62, 0.15]] as const) p.add(ring(r, 0.015, 24), mat('#c792ea', 'glow'), { y });
    p.add(ball(0.7, 1), Object.assign(mat('#c792ea', 'glass'), { opacity: 0.15 }), { y: 0.25 });
    return p.group;
  },
};

/** Props that say what a research bonus does, beyond its domain's emblem. */
const bonusProps: Record<string, PropBuilder> = {
  /** A mining drill: a tripod over a fluted bit. */
  drill: () => {
    const p = new Prop();
    p.add(lathe([[0, 0], [0.2, 0.35], [0.24, 0.42], [0.24, 0.6], [0, 0.6]], 8), mat(ROLES.dark));
    for (let i = 0; i < 3; i++) p.add(ring(0.17 - i * 0.05, 0.025, 8), mat(ROLES.gold), { y: 0.3 - i * 0.1 });
    p.add(obox(0.36, 0.34, 0.36, 0.04), mat(ROLES.gold), { y: 0.77 });
    p.add(cyl(0.05, 0.05, 0.3, 6), mat(ROLES.trim), { y: 1.08 });
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 0.3;
      p.add(cyl(0.025, 0.03, 1.1, 5), mat(ROLES.trim), { x: Math.cos(a) * 0.3, y: 0.55, z: Math.sin(a) * 0.3, rz: Math.cos(a) * 0.5, rx: -Math.sin(a) * 0.5 });
    }
    p.add(hull([[-0.5, 0, -0.3], [0.5, 0, -0.4], [0.4, 0, 0.4], [-0.4, 0, 0.35], [0.1, 0.12, 0.1]]), mat(colorOf('metals'), 'matte'), { y: -0.05 });
    return p.group;
  },
  /** A missile rack: a box of tubes, two missiles leaving. */
  missiles: () => {
    const p = new Prop();
    p.add(obox(0.7, 0.4, 0.6, 0.05), mat(ROLES.hull), { y: 0.2 });
    for (let i = 0; i < 6; i++) p.add(cyl(0.07, 0.07, 0.04, 8), mat(ROLES.dark), { x: -0.2 + (i % 3) * 0.2, y: 0.12 + Math.floor(i / 3) * 0.17, z: 0.3, rx: Math.PI / 2 });
    for (const [x, y, z] of [[-0.1, 0.65, 0.55], [0.22, 0.85, 0.35]] as const) {
      p.add(lathe([[0, 0.32], [0.045, 0.24], [0.045, 0], [0, 0]], 6), mat('#e8e2d4'), { x, y, z, rx: 0.9 });
      p.add(ball(0.08, 0), mat('#ffb074', 'glow'), { x, y: y - 0.04, z: z - 0.04 });
    }
    return p.group;
  },
  /** A siege gun: one huge barrel on a heavy mount. */
  siege: () => {
    const p = new Prop();
    p.add(prism([[-0.55, 0], [0.55, 0], [0.45, 0.2], [-0.45, 0.2]], 0.7), mat(ROLES.trim), { ry: Math.PI / 2 });
    p.add(hull([[-0.25, 0.2, -0.35], [0.25, 0.2, -0.35], [0.25, 0.2, 0.25], [-0.25, 0.2, 0.25], [-0.2, 0.55, -0.3], [0.2, 0.55, -0.3], [0.18, 0.5, 0.2], [-0.18, 0.5, 0.2]]), mat(ROLES.hull));
    p.add(cyl(0.09, 0.12, 1.2, 10), mat(ROLES.dark), { y: 0.62, z: 0.6, rx: Math.PI / 2 - 0.35 });
    p.add(cyl(0.13, 0.13, 0.12, 10), mat(ROLES.trim), { y: 0.82, z: 1.15, rx: Math.PI / 2 - 0.35 });
    p.add(ball(0.16, 1), mat('#ff8a5c', 'glow'), { y: 0.88, z: 1.27 });
    return p.group;
  },
  /** A repair wrench over a hull plate. */
  repair: () => {
    const p = new Prop();
    p.add(obox(0.9, 0.08, 0.6, 0.03), mat(ROLES.hull), { y: 0.04 });
    const open: [number, number][] = [[-0.12, -0.12], [0.12, -0.12], [0.12, 0.05], [0.05, 0.05], [0.05, -0.04], [-0.05, -0.04], [-0.05, 0.05], [-0.12, 0.05]];
    p.add(prism(open.map(([x, y]) => [x * 1.4, y * 1.4]), 0.06), mat(ROLES.gold), { y: 0.74, x: 0.28, rz: -0.7 });
    p.add(obox(0.08, 0.7, 0.06), mat(ROLES.gold), { y: 0.42, x: 0.02, rz: -0.7 });
    p.add(ball(0.06, 0), mat('#7bd88f', 'emissive'), { x: -0.25, y: 0.12, z: 0.15 });
    p.add(ball(0.05, 0), mat('#7bd88f', 'emissive'), { x: -0.1, y: 0.12, z: -0.18 });
    return p.group;
  },
  /** An atom: science. */
  science: () => {
    const p = new Prop();
    p.add(ball(0.16, 1), mat('#5ec8ff', 'emissive'), { y: 0.6 });
    for (const [rx, rz] of [[1.2, 0], [1.2, 1.05], [1.2, -1.05]] as const) {
      p.add(ring(0.48, 0.02, 28), mat('#c792ea', 'emissive'), { y: 0.6, rx: rx - Math.PI / 2, rz });
    }
    p.add(ball(0.05, 0), mat('#ffd27a', 'emissive'), { x: 0.48, y: 0.6 });
    p.add(ball(0.05, 0), mat('#ffd27a', 'emissive'), { x: -0.2, y: 0.95, z: 0.1 });
    return p.group;
  },
};

function hexProfile(r: number): [number, number][] {
  return Array.from({ length: 6 }, (_, i) => [Math.cos((i / 6) * Math.PI * 2) * r, Math.sin((i / 6) * Math.PI * 2) * r] as [number, number]);
}

function gearProfile(outer: number, inner: number, teeth: number): [number, number][] {
  const pts: [number, number][] = [];
  for (let i = 0; i < teeth; i++) {
    const a = (i / teeth) * Math.PI * 2, w = Math.PI / teeth;
    for (const [da, r] of [[-w * 0.5, inner], [-w * 0.3, outer], [w * 0.3, outer], [w * 0.5, inner]] as const) pts.push([Math.cos(a + da) * r, Math.sin(a + da) * r]);
  }
  return pts;
}

export const RESOURCE_PROPS: Readonly<Record<Resource, PropBuilder>> = resourceProps;
export const EVENT_PROPS: Readonly<Record<string, PropBuilder>> = eventProps;
export const DOMAIN_PROPS: Readonly<Record<string, PropBuilder>> = domainProps;
export const PART_PROPS: Readonly<Record<string, PropBuilder>> = partProps;

/** A research bonus's stat to the prop that shows it (stats not here show the domain emblem). */
export const STAT_PROPS: Readonly<Record<string, PropBuilder>> = {
  hull: domainProps.hulls, speed: partProps['fusion-torch'], build: partProps.fabricator, repair: bonusProps.repair, salvage: eventProps.derelict,
  long: partProps['phased-laser'], accuracy: partProps['phased-laser'], short: domainProps.weapons, barrage: bonusProps.missiles, siege: bonusProps.siege,
  capture: partProps['tractor-beam'], troops: domainProps.colonies, planetDefense: domainProps.defense, vsLong: domainProps.defense, vsBarrage: domainProps.defense, suppression: partProps['cloak-field'],
  mining: bonusProps.drill, crystals: resourceProps.crystals, cargo: resourceProps.goods, trade: eventProps.trade, credits: resourceProps.credits,
  influence: resourceProps.influence, faith: resourceProps.faith, spread: resourceProps.faith, science: bonusProps.science,
  spies: domainProps.intel, espionage: domainProps.intel, counterIntel: partProps['cloak-field'], observation: eventProps.relations,
  stability: domainProps.society, policies: domainProps.society, morale: domainProps.society,
};
