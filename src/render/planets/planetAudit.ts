import * as THREE from 'three';
import { BIOMES } from '../../content/biomes';
import { PLANET_LOOKS } from '../../content/planetLooks';
import { hashSeed } from '../../core/rng/Rng';
import { surfaceLookOf } from '../../core/surface/Terrain';
import { createPlanetMaterial } from './PlanetMaterial';
import { FULL_QUALITY, SurfaceTerrain } from './surface/SurfaceTerrain';
import { MEGASTRUCTURES } from '../../content/megastructures';
import type { StarSystem } from '../../core/galaxy/GalaxyModel';
import { createMegaVisual } from '../megastructures/MegaVisuals';
import { createStarVisual } from '../stars/StarVisuals';
import { PlanetThumbnails } from './PlanetThumbnails';
import { Flora } from './surface/Flora';

/**
 * Planet type audit (tools/planets/audit.html, `npm run planets`): every planet type four ways side
 * by side, so the system view and the surface close-up can be compared: the system-view sphere,
 * the surface terrain from orbit (2.6 radii), from mid range (1.25 radii, looking down at about 45
 * degrees) and close to the ground on the day side looking toward the terminator. A fixed seed per
 * type keeps runs comparable. `?ids=eyeball,ocean` limits it; `?px=` sets the tile size.
 */
const PX_DEFAULT = 300;
/** The star, off to one side (planet frame and view space alike: the camera looks down -z from +z). */
const SUN = new THREE.Vector3(1, 0.25, 0.35).normalize();

export async function planetAudit(root: HTMLElement): Promise<void> {
  const params = new URLSearchParams(location.search);
  const px = Number(params.get('px')) || PX_DEFAULT;
  const ids = params.get('ids')?.split(',');
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(px, px, false);
  renderer.setClearColor(0x05070c, 1);
  const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 100);
  const shot = (scene: THREE.Scene): string => {
    renderer.render(scene, camera);
    return renderer.domElement.toDataURL('image/png');
  };
  const header = document.createElement('div');
  header.className = 'row head';
  header.append(cell('Type'), cell('System view'), cell('Surface · orbit 2.6 R'), cell('Surface · mid 1.25 R'), cell('Surface · close'), cell('Ground · flora'));
  root.append(header);

  for (const biome of BIOMES.filter((b) => !b.megastructure && (!ids || ids.includes(b.id)))) {
    const look = PLANET_LOOKS[biome.id] ?? PLANET_LOOKS.barren;
    const seed = hashSeed(`audit:${biome.id}`, 'surface');
    const row = document.createElement('div');
    row.className = 'row';
    const name = cell('');
    name.innerHTML = `<b>${biome.name}</b><small>${biome.id}${PLANET_LOOKS[biome.id] ? '' : ' (no look: barren)'}</small>`;
    row.append(name);
    root.append(row);
    const images: string[] = [];
    try {
      images.push(systemView(look, seed, camera, shot));
      images.push(...await surfaceViews(look, seed, camera, shot, biome.id, renderer));
    } catch (e) {
      console.warn('audit', biome.id, e);
    }
    for (let i = 0; i < 5; i++) {
      const img = document.createElement('img');
      img.width = img.height = px;
      if (images[i]) img.src = images[i];
      else img.className = 'missing';
      row.append(img);
    }
    // Let the page paint between types.
    await new Promise((r) => setTimeout(r, 0));
  }
  await megaRows(root, ids, px, camera, shot);
  renderer.dispose();
  (window as unknown as { AUDIT_READY: boolean }).AUDIT_READY = true;
}

/**
 * Megastructures (change megastructures): each round a star it can host, as the system view's
 * camera sees it (from above at an angle), close up, edge on, and its card thumbnail.
 */
async function megaRows(root: HTMLElement, ids: string[] | undefined, px: number, camera: THREE.PerspectiveCamera, shot: (s: THREE.Scene) => string): Promise<void> {
  const types = MEGASTRUCTURES.filter((m) => !ids || ids.includes(m.id));
  if (!types.length) return;
  const header = document.createElement('div');
  header.className = 'row head';
  header.append(cell('Megastructure'), cell('System view'), cell('Close'), cell('Edge on'), cell('Thumbnail'));
  root.append(header);
  const thumbs = new PlanetThumbnails(px / 2);
  for (const m of types) {
    const kind = m.hosts[0];
    const star: StarSystem = { id: `audit-${m.id}`, hex: { q: 0, r: 0 }, name: 'Audit', spectral: m.classes?.[0] ?? 'G', planetCount: 1, kind, companions: [], position: { x: 0, y: 0, z: 0 }, megastructure: m.id };
    const scene = new THREE.Scene();
    const visual = createStarVisual(star);
    scene.add(visual.object3d);
    const mega = createMegaVisual(m.id, { seed: hashSeed(`${star.id}/0`, 'mega'), light: visual.light, clearance: visual.clearance });
    scene.add(mega.object3d);
    const row = document.createElement('div');
    row.className = 'row';
    const name = cell('');
    name.innerHTML = `<b>${m.name}</b><small>${m.id} · round a ${kind}${kind === 'main' ? ` ${star.spectral}` : ''}</small>`;
    row.append(name);
    root.append(row);
    const views: Array<[number, number]> = [[2.4, 0.95], [1.15, 0.45], [1.6, 0.06]];
    for (const [dist, elev] of views) {
      const d = mega.extent * dist;
      camera.near = d * 0.01;
      camera.far = d * 40;
      camera.position.set(Math.cos(elev) * d * 0.5, Math.sin(elev) * d, Math.cos(elev) * d * 0.866);
      camera.lookAt(0, 0, 0);
      camera.updateProjectionMatrix();
      camera.updateMatrixWorld();
      visual.update(5);
      mega.update(5);
      const img = document.createElement('img');
      img.width = img.height = px;
      img.src = shot(scene);
      row.append(img);
    }
    const thumb = document.createElement('img');
    thumb.width = thumb.height = px;
    thumb.src = thumbs.url({ id: `${star.id}/0`, starId: star.id, index: 0, name: m.name, biome: m.id, size: 5 });
    row.append(thumb);
    mega.dispose();
    visual.dispose();
    await new Promise((r) => setTimeout(r, 0));
  }
}

function cell(text: string): HTMLElement {
  const d = document.createElement('div');
  d.className = 'name';
  d.textContent = text;
  return d;
}

/** The system view's planet: the planet shader on a sphere, the star off to one side. */
function systemView(look: typeof PLANET_LOOKS[string], seed: number, camera: THREE.PerspectiveCamera, shot: (s: THREE.Scene) => string): string {
  const scene = new THREE.Scene();
  const material = createPlanetMaterial(look, seed);
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 64), material);
  scene.add(mesh);
  camera.near = 0.01;
  camera.far = 100;
  camera.position.set(0, 0, 2.6);
  camera.up.set(0, 1, 0);
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
  const starWorld = SUN.clone().multiplyScalar(500);
  mesh.onBeforeRender = (_r, _s, cam) => {
    material.uniforms.uStarPos.value.copy(starWorld).applyMatrix4(cam.matrixWorldInverse);
  };
  material.uniforms.uTime.value = 0;
  const url = shot(scene);
  mesh.geometry.dispose();
  material.dispose();
  return url;
}

/** The surface terrain (the close-up's globe and detail patch) from orbit, mid range and the ground. */
async function surfaceViews(look: typeof PLANET_LOOKS[string], seed: number, camera: THREE.PerspectiveCamera, shot: (s: THREE.Scene) => string, biome: string, renderer: THREE.WebGLRenderer): Promise<string[]> {
  const terrain = new SurfaceTerrain(surfaceLookOf(look, seed), [], FULL_QUALITY, null);
  while (!terrain.bakeStep()) await new Promise((r) => setTimeout(r, 0));
  const scene = new THREE.Scene();
  const flora = new Flora(biome, terrain, false);
  scene.add(terrain.group, flora.group);
  const ground = (d: THREE.Vector3) => terrain.surfaceRadius(d.clone().normalize());
  const pose = (cam: THREE.Vector3, target: THREE.Vector3, up: THREE.Vector3): string => {
    camera.position.copy(cam);
    camera.up.copy(up);
    camera.lookAt(target);
    const alt = Math.max(cam.length() - ground(cam), 0);
    const L = cam.length();
    // As the close-up's lens (SurfaceLayer.copyLens): planet-scale clipping.
    camera.near = Math.max(0.00004, Math.min(alt * 0.2, 0.5));
    camera.far = Math.sqrt(Math.max(L * L - 1, 0)) + 1.3;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    const focus = target.clone();
    terrain.update({ cam: camera.position, focus, d: cam.distanceTo(focus), alt, sun: SUN, time: 0, fade: 1 });
    flora.update(cam.distanceTo(focus), renderer);
    return shot(scene);
  };
  const out: string[] = [];
  // Orbit: the planet's centre in view, as the system view.
  out.push(pose(new THREE.Vector3(0, 0, 2.6), new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 1, 0)));
  // Ground points on the day side: P well lit (mid range looks down on it), Q nearer the terminator.
  const view = new THREE.Vector3(0, 0, 1);
  const P = SUN.clone().add(view).normalize();
  const tP = SUN.clone().negate().projectOnPlane(P).normalize();
  // Mid range: 1.25 R from the centre over P, looking ahead (toward the terminator) at about 45 degrees.
  const midCam = P.clone().multiplyScalar(1.25);
  const midTarget = P.clone().add(tP.clone().multiplyScalar(0.27)).normalize().multiplyScalar(ground(P.clone().add(tP.clone().multiplyScalar(0.27))));
  out.push(pose(midCam, midTarget, P));
  // Close: a little above the ground where the sun is about 35 degrees up, looking across toward the terminator.
  // A locked world's life is in the band between its sunward sea and the ice: look there.
  const lockedAt = look.locked;
  const Q = lockedAt !== undefined
    ? new THREE.Vector3(lockedAt - 0.14, 0.1, Math.sqrt(Math.max(1 - (lockedAt - 0.14) ** 2 - 0.01, 0))).normalize()
    : SUN.clone().multiplyScalar(0.57).add(new THREE.Vector3(0, 0.15, 1).projectOnPlane(SUN).normalize().multiplyScalar(0.82)).normalize();
  const tQ = SUN.clone().negate().projectOnPlane(Q).normalize();
  const rq = ground(Q);
  const closeCam = Q.clone().multiplyScalar(rq + 0.006);
  const ahead = Q.clone().add(tQ.clone().multiplyScalar(0.05)).normalize();
  const closeTarget = ahead.clone().multiplyScalar(ground(ahead));
  out.push(pose(closeCam, closeTarget, Q));
  // On the ground: just above it, looking a little ahead, where grass and stones show.
  const groundCam = Q.clone().multiplyScalar(rq + 0.0012);
  const near = Q.clone().add(tQ.clone().multiplyScalar(0.008)).normalize();
  out.push(pose(groundCam, near.clone().multiplyScalar(ground(near)), Q));
  flora.dispose();
  terrain.dispose();
  return out;
}
