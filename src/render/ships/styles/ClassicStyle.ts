import type { ShipKit } from '../ShipKit';
import type { ShipStyleGenerator } from '../ShipStyleGenerator';
import { classicAccent } from './accents';

/** Aesthetic/classic silhouettes: saucer cruisers, finned rockets and sleek yachts. */
export const ClassicStyle: ShipStyleGenerator = {
  id: 'classic',
  name: 'Aesthetic / Classic',
  description: 'Saucer cruisers, retro rockets and elegant yachts.',
  accent: classicAccent,
  build(kit: ShipKit) {
    const variant = kit.rng.pick(['saucer', 'rocket', 'yacht'] as const);
    if (variant === 'saucer') buildSaucer(kit);
    else if (variant === 'rocket') buildRocket(kit);
    else buildYacht(kit);
  },
};

function buildSaucer(kit: ShipKit): void {
  const { L, B, rng, mat } = kit;
  const R = B * rng.range(0.9, 1.2);
  const saucer = kit.lathe([[0, B * 0.12], [R * 0.4, B * 0.11], [R, 0.0], [R * 0.95, -B * 0.06], [R * 0.3, -B * 0.1], [0, -B * 0.12]], mat.hull, 40);
  saucer.rotation.x = -Math.PI / 2; // lathe is along z; make the disc horizontal
  kit.add(saucer, 'hull', 0, B * 0.3, L * 0.2);
  kit.add(kit.sphere(R * 0.18, mat.accent, 1, 0.4, 1), 'detail', 0, B * 0.43, L * 0.2);
  const neck = kit.box(B * 0.12, B * 0.35, L * 0.12, mat.hull);
  neck.rotation.x = -0.6;
  kit.add(neck, 'hull', 0, B * 0.1, L * 0.02);
  kit.add(kit.lathe([[0, L * 0.18], [B * 0.22, L * 0.12], [B * 0.25, -L * 0.15], [B * 0.15, -L * 0.25]], mat.hull, 20), 'hull', 0, -B * 0.05, -L * 0.1);
  const nx = B * rng.range(0.55, 0.85), ny = B * rng.range(0.35, 0.6);
  kit.addMirrored(() => kit.cyl(B * 0.1, B * 0.09, L * 0.5, mat.hull, 14), 'wing', nx, ny, -L * 0.2);
  kit.addMirrored(() => kit.sphere(B * 0.1, mat.accent, 1, 1, 0.8), 'detail', nx, ny, L * 0.05);
  kit.addMirrored(() => {
    const p = kit.box(B * 0.06, ny * 1.1, L * 0.1, mat.hull);
    p.rotation.z = -Math.atan2(nx, ny);
    return p;
  }, 'detail', nx / 2, ny / 2, -L * 0.2);
  for (const x of kit.symmetricSlots(kit.design.engines, B * 0.12)) kit.engine(x, -B * 0.05, -L * 0.36, B * 0.08);
  for (let i = 0; i < kit.design.weapons; i++) {
    const a = (i / kit.design.weapons) * Math.PI * 2;
    kit.turret(Math.cos(a) * R * 0.65, B * 0.4, L * 0.2 + Math.sin(a) * R * 0.65, B * 0.06);
  }
}

function buildRocket(kit: ShipKit): void {
  const { L, B, rng, mat } = kit;
  const profile: Array<[number, number]> = [];
  for (let i = 0; i <= 16; i++) {
    const t = i / 16;
    profile.push([B * 0.38 * Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.15)), 0.6) + 0.001, -L / 2 + t * L]);
  }
  kit.add(kit.lathe(profile, mat.hull, 28), 'hull');
  const fins = rng.int(3, 4);
  for (let i = 0; i < fins; i++) {
    const a = (i / fins) * Math.PI * 2 + Math.PI / 2;
    const fin = kit.box(B * 0.04, B * 0.6, L * 0.28, mat.detail);
    fin.rotation.z = a - Math.PI / 2;
    kit.add(fin, 'wing', Math.cos(a) * B * 0.38, Math.sin(a) * B * 0.38, -L * 0.33);
  }
  for (let i = 0; i < 5; i++) kit.add(kit.sphere(B * 0.05, mat.accent), 'detail', 0, B * 0.33, L * (0.2 - i * 0.07));
  kit.add(kit.lathe([[B * 0.39, -0.01], [B * 0.4, 0], [B * 0.39, 0.01]], mat.gold, 28), 'detail', 0, 0, L * 0.05);
  for (const [x, y] of kit.ringSlots(kit.design.engines, B * 0.16)) kit.engine(x, y, -L * 0.5, B * 0.1);
  for (let i = 0; i < kit.design.weapons; i++) {
    const a = (i / Math.max(1, kit.design.weapons)) * Math.PI * 2;
    kit.turret(Math.cos(a) * B * 0.3, Math.sin(a) * B * 0.3, L * 0.1, B * 0.06, Math.sin(a) >= 0 ? 1 : -1);
  }
}

function buildYacht(kit: ShipKit): void {
  const { L, B, rng, mat } = kit;
  const body = kit.lathe([[0.001, L * 0.5], [B * 0.25, L * 0.25], [B * 0.32, -L * 0.1], [B * 0.18, -L * 0.45]], mat.hull, 24);
  body.scale.y = 0.6;
  kit.add(body, 'hull');
  const canopy = kit.sphere(B * 0.18, mat.accent, 1, 0.6, 2.2);
  kit.add(canopy, 'detail', 0, B * 0.14, L * 0.18);
  const sweep = rng.range(0.6, 1.0);
  kit.addMirrored(() => {
    const w = kit.sphere(B * 0.9, mat.hull, 1, 0.06, 0.35);
    w.rotation.y = sweep;
    return w;
  }, 'wing', B * 0.55, 0, -L * 0.15);
  kit.addMirrored(() => kit.cyl(B * 0.012, B * 0.012, L * 0.4, mat.gold, 6), 'detail', B * 0.3, B * 0.06, -L * 0.05);
  for (const x of kit.symmetricSlots(kit.design.engines, B * 0.15)) kit.engine(x, 0, -L * 0.47, B * 0.07);
  for (let i = 0; i < kit.design.weapons; i++) {
    const side = i % 2 === 0 ? 1 : -1;
    kit.turret(side * B * (0.7 + 0.15 * Math.floor(i / 2)), -B * 0.02, -L * 0.18, B * 0.05, -1);
  }
}
